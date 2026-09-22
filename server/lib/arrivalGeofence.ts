/**
 * Arrival detection for the live-tracking GPS stream.
 *
 * Evaluated on every POST /api/bookings/:id/location ping (~1 per 3s while a
 * trip is running), so the gates run cheapest first:
 *
 *   1. leg + coordinate validity — free
 *   2. straight-line distance    — free, in memory
 *   3. in-process "already fired" — free
 *   4. business_events lookup     — one indexed query, only inside the radius
 *
 * Fires once per (booking, leg), which is also the hysteresis: without it a
 * mover sitting just inside the radius would re-trigger on every ping, and GPS
 * noise in a parkade or downtown canyon would flap in and out of 200m.
 *
 * Detection only — the status machine is untouched. `en_route_to_pickup ->
 * loading` means loading has STARTED, which stamps loadingStartedAt and starts
 * the clock Mark's overtime check reads; firing that while the mover is still
 * looking for parking would corrupt duration metrics. The mover still taps
 * "Arrived - Start Loading" themselves.
 *
 * bookings.arrivedAtPickupAt is therefore not the same field as
 * moverPerformance.arrivedAtPickupAt: this one is measured, that one is stamped
 * from the button tap and records when the mover SAID they had arrived.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { bookings, users, businessEvents, BOOKING_STATUSES } from '@shared/schema';
import { haversineMeters } from '../utils/distance';
import { emitEvent } from '../events';
import { notificationService } from '../notifications';
import { moverWebSocket } from '../websocket';
import { logger } from '../logger';

const ARRIVAL_RADIUS_M = 200;

type ArrivalLeg = 'pickup' | 'dropoff';

interface LegPlan {
  leg: ArrivalLeg;
  destLat: number | null;
  destLng: number | null;
  eventType: string;
  /** null when the leg should not text the customer. */
  customerSms: string | null;
  moverPrompt: string;
}

// Fast path for the window between arriving and tapping the button, where every
// 3s ping is still inside the radius. Lost on restart, which just falls back to
// the business_events query — the durable dedup lives there.
const firedThisProcess = new Set<string>();
const MAX_FIRED_KEYS = 5000;

// The set has no timestamps to sweep by, and entries for completed bookings are
// never revisited. Dropping the whole thing is safe — business_events is the
// durable dedup, so the only cost is one extra query per booking afterwards.
function rememberFired(key: string): void {
  if (firedThisProcess.size >= MAX_FIRED_KEYS) firedThisProcess.clear();
  firedThisProcess.add(key);
}

function planFor(booking: typeof bookings.$inferSelect): LegPlan | null {
  // `in_transit` is the legacy spelling of en_route_to_pickup.
  if (booking.status === BOOKING_STATUSES.EN_ROUTE_TO_PICKUP || booking.status === 'in_transit') {
    return {
      leg: 'pickup',
      destLat: booking.pickupLatitude,
      destLng: booking.pickupLongitude,
      eventType: 'pulse.mover_arrived_pickup',
      customerSms:
        `Your LervIT mover has arrived! They're outside now — head down when ready 🚛`,
      moverPrompt: `You're at the pickup! Tap "Arrived - Start Loading" when ready.`,
    };
  }

  if (booking.status === BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF) {
    return {
      leg: 'dropoff',
      destLat: booking.dropoffLatitude,
      destLng: booking.dropoffLongitude,
      eventType: 'pulse.mover_arrived_dropoff',
      // No customer SMS on this leg: they are almost always standing at the
      // dropoff watching the truck pull in, so the text is noise. The event and
      // the timestamp are still recorded for ops.
      customerSms: null,
      moverPrompt: `You're at the dropoff! Tap "Arrived - Start Unloading" when ready.`,
    };
  }

  return null;
}

// pickup/dropoff lat/lng are notNull().default(0), so 0 means "never geocoded"
// rather than a real position. Measuring to 0,0 would put the destination in the
// Gulf of Guinea — far outside the radius, so it would fail silently for the
// wrong reason.
function usable(
  lat: number | null,
  lng: number | null,
): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 || lng === 0) return null;
  return { lat, lng };
}

export async function checkArrivalGeofence(input: {
  booking: typeof bookings.$inferSelect;
  moverUserId: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  const { booking, moverUserId, latitude, longitude } = input;

  try {
    // Coordinates from the deterministic mock geocoder are not a place. A
    // geofence against them fires on the wrong street or never fires at all,
    // and either way it would write an arrival timestamp nobody can trust.
    if (booking.geocodeMock) return;

    const plan = planFor(booking);
    if (!plan) return;

    const here = usable(latitude, longitude);
    const there = usable(plan.destLat, plan.destLng);
    if (!here || !there) return;

    const distanceMeters = haversineMeters(here.lat, here.lng, there.lat, there.lng);
    if (distanceMeters > ARRIVAL_RADIUS_M) return;

    const key = `${booking.id}:${plan.leg}`;
    if (firedThisProcess.has(key)) return;

    const prior = await db
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(
        and(
          eq(businessEvents.eventType, plan.eventType),
          eq(businessEvents.entityId, booking.id),
        ),
      )
      .limit(1);

    if (prior.length > 0) {
      rememberFired(key);
      return;
    }
    rememberFired(key);

    // Measured arrival, kept on the booking so it survives independently of the
    // mover remembering to tap the button.
    await db
      .update(bookings)
      .set(
        plan.leg === 'pickup'
          ? { arrivedAtPickupAt: new Date(), updatedAt: new Date() }
          : { arrivedAtDropoffAt: new Date(), updatedAt: new Date() },
      )
      .where(eq(bookings.id, booking.id));

    await emitEvent(plan.eventType, 'booking', booking.id, {
      severity: 'info',
      leg: plan.leg,
      distanceMeters: Math.round(distanceMeters),
      radiusMeters: ARRIVAL_RADIUS_M,
      status: booking.status,
    });

    const [customer] = plan.customerSms
      ? await db
          .select({ phone: users.phone })
          .from(users)
          .where(eq(users.id, booking.customerId))
          .limit(1)
      : [];

    if (plan.customerSms && customer?.phone) {
      // 'arrival_notification' is outside RATE_LIMITED_TYPES on purpose: the
      // shared 1-SMS-per-hour budget for 'booking_update' is normally already
      // spent by the arriving-soon text ~10 minutes earlier, which would drop
      // this one silently. Bounded by the once-per-leg dedup above.
      await notificationService
        .sendSMS({
          to: customer.phone,
          message: plan.customerSms,
          type: 'arrival_notification',
        })
        .catch((err) =>
          logger.warn({ err, bookingId: booking.id }, '[Geofence] Arrival SMS failed'),
        );
    }

    // notifyMover keys on the USER id, not the mover profile id.
    moverWebSocket.notifyMover(moverUserId, {
      type: 'booking_update',
      bookingId: booking.id,
      data: {
        event: plan.leg === 'pickup' ? 'geofence_arrived_pickup' : 'geofence_arrived_dropoff',
        message: plan.moverPrompt,
      },
    });

    logger.info(
      { bookingId: booking.id, leg: plan.leg, distanceMeters: Math.round(distanceMeters) },
      '[Geofence] Mover arrival detected',
    );
  } catch (err) {
    // Never fail the location ping over this.
    logger.error({ err, bookingId: input.booking.id }, '[Geofence] Arrival check failed');
  }
}
