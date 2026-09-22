/**
 * Mark Shaw (PULSE) — active-trip watchdog.
 *
 * Runs on a 5-min cron from server/background-jobs.ts. For every booking in
 * an active status (see SCAN_STATUSES), Mark evaluates four independent
 * checks. Each fires at most once per hour per (booking, checkType) via
 * business_events dedup.
 *
 *   - gps_silent          : bookings.locationUpdatedAt is >10 min stale
 *                           while the trip is in progress. High severity —
 *                           Xavier SMS to John.
 *   - overtime            : now > tripStart + estimatedDurationMinutes + 30min,
 *                           where tripStart is bookings.startedAt and falls back
 *                           to preferredDate on pre-startedAt bookings.
 *                           Medium severity — dashboard flag only.
 *   - no_start            : status is 'confirmed' or 'en_route_to_pickup' and
 *                           now > preferredDate + 15min. High severity —
 *                           Xavier SMS to John.
 *   - customer_uninformed : overtime or no_start fired AND we haven't texted the
 *                           customer about a delay in the past 60min. Mark sends
 *                           the customer SMS himself and emits an event so a
 *                           later scan won't repeat.
 *   - geofence_missed_pickup : the booking reached 'loading' with no
 *                           pulse.mover_arrived_pickup on file, i.e. the mover
 *                           tapped "Arrived" but their GPS never came within
 *                           the 200m radius. Usually means location sharing was
 *                           not running. Dedups forever, like the check below.
 *   - mover_arriving_soon : the live ETA to the pickup is <= 10 min while the
 *                           mover is en route. Texts the customer once so they
 *                           can be at the door. Unlike the four checks above
 *                           this one dedups FOREVER, not hourly — "they're 10
 *                           minutes away" is only true once per booking.
 *
 * Actions:
 *   - `scan_active_trips` : sweep every active booking; run all four checks.
 *   - `check_booking`     : per-booking sweep (admin manual trigger).
 *
 * Dashboard integration piggybacks on `businessEvents` with `eventType`
 * prefixed `pulse.*`, matching Xavier's `apex.daily_brief` pattern.
 */

import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { BaseAgent } from './base';
import { db } from '../db';
import { bookings, users, businessEvents, bookingMetrics, BOOKING_STATUSES } from '@shared/schema';
import { emitEvent } from '../events';
import { xavier } from './xavier';
import { notificationService } from '../notifications';
import { resolveTripEta } from '../lib/tripEta';
import { haversineMeters } from '../utils/distance';
import { getBaseUrl } from '../utils/urls';
import { logger } from '../logger';

const IN_PROGRESS_STATUSES = [
  BOOKING_STATUSES.EN_ROUTE_TO_PICKUP,
  BOOKING_STATUSES.LOADING,
  BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF,
  BOOKING_STATUSES.UNLOADING,
] as const;

// `en_route_to_pickup` is also in IN_PROGRESS_STATUSES; keeping it here lets
// no_start fire when the mover flipped the status but never actually left.
const SHOULD_HAVE_STARTED_STATUSES = [
  BOOKING_STATUSES.CONFIRMED,
  BOOKING_STATUSES.EN_ROUTE_TO_PICKUP,
] as const;

const SCAN_STATUSES: string[] = Array.from(
  new Set<string>([...IN_PROGRESS_STATUSES, ...SHOULD_HAVE_STARTED_STATUSES]),
);

const GPS_STALE_MS = 10 * 60 * 1000;
const NO_START_GRACE_MS = 15 * 60 * 1000;
const OVERTIME_GRACE_MS = 30 * 60 * 1000;
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

// How close the mover has to be before the customer is told to get ready.
const ARRIVING_SOON_MINUTES = 10;

// Straight-line pre-filter, checked before anything that costs money. Ten
// minutes of Calgary driving covers roughly 5-8km of road, and road distance is
// always >= the straight line, so a mover more than this far away cannot be
// within ARRIVING_SOON_MINUTES and does not need a Distance Matrix lookup.
// Generous on purpose: this only has to be a cheap upper bound, and the real
// decision is still made on the routed ETA.
const ARRIVING_SOON_PREFILTER_M = 8000;

const CUSTOMER_DELAY_SMS =
  'Hi! Your mover is running a bit late. We apologize for the delay and will keep you updated. — LervIT Team';

// Fallback duration when booking_metrics.estimated_duration_minutes hasn't
// been populated. Values are rough proxies keyed off booking.loadSize.
function estimateDurationFromLoadSize(loadSize: string | null): number {
  const estimates: Record<string, number> = {
    boxes: 45,
    small: 60,
    medium: 90,
    large: 150,
    apartment: 180,
  };
  return estimates[loadSize ?? 'medium'] ?? 90;
}

type CheckType =
  | 'gps_silent'
  | 'overtime'
  | 'no_start'
  | 'customer_uninformed'
  | 'mover_arriving_soon'
  | 'geofence_missed_pickup';

interface CheckBookingInput {
  bookingId: string;
}

interface ScanSummary {
  scanned: number;
  gpsSilent: number;
  overtime: number;
  noStart: number;
  customerUninformed: number;
  arrivingSoon: number;
  geofenceMissed: number;
  skipped: number;
}

export class MarkAgent extends BaseAgent {
  name = 'Mark Shaw';
  code = 'pulse';

  protected async execute(action: string, input: Record<string, any>): Promise<any> {
    switch (action) {
      case 'scan_active_trips':
        return this.scanActiveTrips();
      case 'check_booking':
        return this.checkBooking(input as CheckBookingInput);
      default:
        throw new Error(`Mark: unknown action "${action}"`);
    }
  }

  private async scanActiveTrips(): Promise<ScanSummary> {
    const active = await db
      .select()
      .from(bookings)
      .where(inArray(bookings.status, SCAN_STATUSES));

    const summary: ScanSummary = {
      scanned: active.length,
      gpsSilent: 0,
      overtime: 0,
      noStart: 0,
      customerUninformed: 0,
      arrivingSoon: 0,
      geofenceMissed: 0,
      skipped: 0,
    };

    for (const booking of active) {
      try {
        const result = await this.evaluateBooking(booking);
        if (result.gpsSilent) summary.gpsSilent++;
        if (result.overtime) summary.overtime++;
        if (result.noStart) summary.noStart++;
        if (result.customerUninformed) summary.customerUninformed++;
        if (result.arrivingSoon) summary.arrivingSoon++;
        if (result.geofenceMissed) summary.geofenceMissed++;
        if (result.skipped) summary.skipped++;
      } catch (err) {
        logger.error({ err, bookingId: booking.id }, 'Mark: booking eval failed');
      }
    }

    return summary;
  }

  private async checkBooking({ bookingId }: CheckBookingInput) {
    if (!bookingId) throw new Error('Mark.checkBooking: bookingId required');
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) return { skipped: true, reason: 'booking not found', bookingId };
    return this.evaluateBooking(booking);
  }

  private async evaluateBooking(booking: typeof bookings.$inferSelect) {
    const now = Date.now();
    const scheduled = booking.preferredDate ? new Date(booking.preferredDate).getTime() : null;

    const inProgress = (IN_PROGRESS_STATUSES as readonly string[]).includes(booking.status);
    const shouldHaveStarted = (SHOULD_HAVE_STARTED_STATUSES as readonly string[]).includes(booking.status);

    let gpsSilent = false;
    let overtime = false;
    let noStart = false;
    let customerUninformed = false;

    // 1. GPS silence — only meaningful while the trip is in progress.
    if (inProgress) {
      const lastPing = booking.locationUpdatedAt ? new Date(booking.locationUpdatedAt).getTime() : 0;
      const stale = lastPing === 0 || now - lastPing > GPS_STALE_MS;
      if (stale && (await this.shouldFire(booking.id, 'gps_silent'))) {
        const staleMinutes = lastPing === 0 ? null : Math.round((now - lastPing) / 60000);
        gpsSilent = true;
        await this.fireHighSeverity(booking, 'gps_silent', {
          lastLocationUpdate: booking.locationUpdatedAt ?? null,
          staleMinutes,
        });
      }
    }

    // 2. Overtime — prefer bookingMetrics.estimatedDurationMinutes, fall back
    //    to a load-size proxy so we still fire when metrics are missing.
    //    Measured from when the mover actually rolled: preferredDate is when
    //    the customer asked for the move, so a trip that started 45min late
    //    used to burn its whole estimate before the first wheel turned.
    const startedAtMs = booking.startedAt ? new Date(booking.startedAt).getTime() : null;
    const tripStart = startedAtMs ?? scheduled;
    if (inProgress && tripStart !== null) {
      const [metrics] = await db
        .select({ estimatedDurationMinutes: bookingMetrics.estimatedDurationMinutes })
        .from(bookingMetrics)
        .where(eq(bookingMetrics.bookingId, booking.id))
        .limit(1);
      const estMinutes =
        metrics?.estimatedDurationMinutes ?? estimateDurationFromLoadSize(booking.loadSize);
      const durationSource = metrics?.estimatedDurationMinutes ? 'booking_metrics' : 'load_size_fallback';
      if (now > tripStart + estMinutes * 60000 + OVERTIME_GRACE_MS) {
        if (await this.shouldFire(booking.id, 'overtime')) {
          const overMinutes = Math.round((now - tripStart - estMinutes * 60000) / 60000);
          overtime = true;
          await this.fireMediumSeverity(booking, 'overtime', {
            estimatedDurationMinutes: estMinutes,
            durationSource,
            overMinutes,
            preferredDate: booking.preferredDate,
            startedAt: booking.startedAt ?? null,
            startSource: startedAtMs !== null ? 'actual_start' : 'preferred_date',
          });
        }
      }
    }

    // 3. No start — confirmed or en_route_to_pickup booking is >15min past scheduled pickup.
    if (shouldHaveStarted && scheduled !== null && now > scheduled + NO_START_GRACE_MS) {
      if (await this.shouldFire(booking.id, 'no_start')) {
        const lateMinutes = Math.round((now - scheduled) / 60000);
        noStart = true;
        await this.fireHighSeverity(booking, 'no_start', {
          preferredDate: booking.preferredDate,
          lateMinutes,
          moverId: booking.moverId,
        });
      }
    }

    // 4. Customer uninformed — if any delay-type alert is live and we haven't
    //    texted the customer yet this hour, send the delay SMS and mark done.
    const delayDetected = overtime || noStart;
    if (delayDetected && (await this.shouldFire(booking.id, 'customer_uninformed'))) {
      customerUninformed = await this.notifyCustomerOfDelay(booking);
    }

    // 5. Arriving soon — heads-up to the customer once the mover is within
    //    ARRIVING_SOON_MINUTES of the pickup. Runs after the delay checks so a
    //    late trip leads with the apology rather than a cheerful "get ready".
    let arrivingSoon = false;
    if (booking.status === BOOKING_STATUSES.EN_ROUTE_TO_PICKUP || booking.status === 'in_transit') {
      arrivingSoon = await this.notifyArrivingSoon(booking);
    }

    // 6. Geofence miss — the mover tapped "Arrived - Start Loading" but their
    //    GPS never came within the arrival radius, so we have no measured
    //    arrival for this booking. Almost always means location sharing was not
    //    running: the trip is proceeding blind and the customer's map is frozen.
    //    Records only; the trip itself is fine, so no escalation.
    let geofenceMissed = false;
    if (booking.status === BOOKING_STATUSES.LOADING) {
      geofenceMissed = await this.flagMissedPickupGeofence(booking);
    }

    const skipped =
      !gpsSilent &&
      !overtime &&
      !noStart &&
      !customerUninformed &&
      !arrivingSoon &&
      !geofenceMissed;
    return {
      gpsSilent,
      overtime,
      noStart,
      customerUninformed,
      arrivingSoon,
      geofenceMissed,
      skipped,
    };
  }

  /**
   * One-shot record that a booking reached 'loading' with no geofenced arrival.
   *
   * Dedups forever rather than through shouldFire()'s hourly window: the
   * condition is permanent once the status has moved on, so an hourly window
   * would re-emit for the whole loading phase.
   *
   * Skipped when the booking's coordinates came from the mock geocoder — the
   * geofence deliberately does not run on those, so its absence says nothing
   * about whether GPS was working.
   */
  private async flagMissedPickupGeofence(
    booking: typeof bookings.$inferSelect,
  ): Promise<boolean> {
    if (booking.geocodeMock) return false;
    if (await this.hasEverFired(booking.id, 'geofence_missed_pickup')) return false;

    const [arrived] = await db
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(
        and(
          eq(businessEvents.eventType, 'pulse.mover_arrived_pickup'),
          eq(businessEvents.entityId, booking.id),
        ),
      )
      .limit(1);

    if (arrived) return false;

    await emitEvent('pulse.geofence_missed_pickup', 'booking', booking.id, {
      agentName: this.name,
      severity: 'low',
      reason: 'no_gps_ping_in_radius',
      moverId: booking.moverId,
      lastLocationUpdate: booking.locationUpdatedAt ?? null,
      arrivedAtPickupAt: booking.arrivedAtPickupAt ?? null,
    });

    logger.info(
      { bookingId: booking.id, moverId: booking.moverId },
      '[Mark] Booking reached loading with no geofenced arrival',
    );
    return true;
  }

  /**
   * One-shot "your mover is ~N minutes away" text.
   *
   * Three gates, cheapest first, because Mark scans every 5 minutes and the
   * ETA cache TTL is also 5 minutes — without the first gate every in-flight
   * pickup would spend a billed Distance Matrix call on every scan for the
   * whole leg, most of them on movers still half an hour out:
   *
   *   1. straight-line distance  — free, in memory
   *   2. "already texted?"       — one indexed business_events lookup
   *   3. routed ETA              — may spend a Distance Matrix call
   *
   * resolveTripEta shares its cache with GET /api/bookings/:id/location, so
   * step 3 often reads a result the customer's own polling already paid for.
   *
   * Only fires on an `accurate` ETA. When Distance Matrix is unavailable that
   * function returns a straight line over a flat 40km/h, and texting someone to
   * come to the door on the strength of that is worse than staying quiet.
   */
  private async notifyArrivingSoon(booking: typeof bookings.$inferSelect): Promise<boolean> {
    const { currentLatitude: moverLat, currentLongitude: moverLng } = booking;
    const { pickupLatitude: pickupLat, pickupLongitude: pickupLng } = booking;

    // pickup coords are notNull().default(0), so 0 means "never geocoded"
    // rather than "on the prime meridian".
    if (moverLat == null || moverLng == null || moverLat === 0 || moverLng === 0) return false;
    if (pickupLat === 0 || pickupLng === 0) return false;

    // 1. Free gate. Road distance is never shorter than the straight line, so
    //    anything beyond the pre-filter cannot be ~10 minutes out.
    if (haversineMeters(moverLat, moverLng, pickupLat, pickupLng) > ARRIVING_SOON_PREFILTER_M) {
      return false;
    }

    // 2. Deliberately not shouldFire(): that window is an hour, and this text
    //    must never arrive twice for one booking.
    if (await this.hasEverFired(booking.id, 'mover_arriving_soon')) return false;

    // 3. The only step that can cost a Distance Matrix call.
    const eta = await resolveTripEta({
      bookingId: booking.id,
      status: booking.status,
      moverLat: booking.currentLatitude,
      moverLng: booking.currentLongitude,
      pickupLat: booking.pickupLatitude,
      pickupLng: booking.pickupLongitude,
      dropoffLat: booking.dropoffLatitude,
      dropoffLng: booking.dropoffLongitude,
    }).catch((err) => {
      logger.warn({ err, bookingId: booking.id }, '[Mark] Arriving-soon ETA lookup failed');
      return null;
    });

    if (!eta?.accurate || eta.destination !== 'pickup') return false;
    if (eta.minutes === null || eta.minutes > ARRIVING_SOON_MINUTES || eta.minutes <= 0) {
      return false;
    }

    const [customer] = await db
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, booking.customerId))
      .limit(1);

    if (!customer?.phone) {
      logger.info(
        { bookingId: booking.id },
        '[Mark] Arriving-soon SMS skipped — no customer phone on file',
      );
      return false;
    }

    let smsSent = false;
    try {
      smsSent = await notificationService.sendSMS({
        to: customer.phone,
        message:
          `Your LervIT mover is ~${eta.minutes} min away! ` +
          `Get ready — they'll be there soon. 🚛\n\n` +
          `Track live: ${getBaseUrl()}/track-trip/${booking.id}`,
        type: 'booking_update',
      });
    } catch (err) {
      logger.error({ err, bookingId: booking.id }, '[Mark] Arriving-soon SMS failed');
    }

    // Emit only on a successful send, so a failed attempt is retried on the
    // next scan rather than being permanently marked as delivered.
    if (!smsSent) {
      logger.warn(
        { bookingId: booking.id },
        '[Mark] Arriving-soon SMS not sent — will retry next scan',
      );
      return false;
    }

    await emitEvent('pulse.mover_arriving_soon', 'booking', booking.id, {
      agentName: this.name,
      severity: 'info',
      etaMinutes: eta.minutes,
      arrivalTime: eta.arrivalTime,
      customerPhone: customer.phone,
    });

    return true;
  }

  private async shouldFire(bookingId: string, checkType: CheckType): Promise<boolean> {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS);
    const prior = await db
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(
        and(
          eq(businessEvents.eventType, `pulse.${checkType}`),
          eq(businessEvents.entityId, bookingId),
          gte(businessEvents.createdAt, since),
        ),
      )
      .limit(1);
    return prior.length === 0;
  }

  /** Like shouldFire() but with no time window — true if it ever fired. */
  private async hasEverFired(bookingId: string, checkType: CheckType): Promise<boolean> {
    const prior = await db
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(
        and(
          eq(businessEvents.eventType, `pulse.${checkType}`),
          eq(businessEvents.entityId, bookingId),
        ),
      )
      .limit(1);
    return prior.length > 0;
  }

  private async fireHighSeverity(
    booking: typeof bookings.$inferSelect,
    checkType: CheckType,
    data: Record<string, any>,
  ) {
    await emitEvent(`pulse.${checkType}`, 'booking', booking.id, {
      agentName: this.name,
      severity: 'high',
      ...data,
    });

    try {
      await xavier.run('escalate', {
        issue: this.issueText(checkType, booking, data),
        severity: 'high',
        agentName: this.name,
        data: { bookingId: booking.id, checkType, ...data },
      });
    } catch (err) {
      logger.error({ err, bookingId: booking.id, checkType }, 'Mark: Xavier escalate failed');
    }
  }

  private async fireMediumSeverity(
    booking: typeof bookings.$inferSelect,
    checkType: CheckType,
    data: Record<string, any>,
  ) {
    await emitEvent(`pulse.${checkType}`, 'booking', booking.id, {
      agentName: this.name,
      severity: 'medium',
      ...data,
    });
  }

  private issueText(
    checkType: CheckType,
    booking: typeof bookings.$inferSelect,
    data: Record<string, any>,
  ): string {
    switch (checkType) {
      case 'gps_silent':
        return `Mover GPS silent for booking ${booking.id} — no location update in ${data.staleMinutes ?? '10+'}min while trip is ${booking.status}.`;
      case 'no_start':
        return `Booking ${booking.id} has not started ${data.lateMinutes}min after scheduled pickup. Status: ${booking.status}, moverId: ${booking.moverId ?? 'unassigned'}.`;
      case 'overtime':
        return `Booking ${booking.id} is running ${data.overMinutes}min past its estimated ${data.estimatedDurationMinutes}min duration.`;
      default:
        return `Pulse alert on booking ${booking.id}: ${checkType}`;
    }
  }

  private async notifyCustomerOfDelay(booking: typeof bookings.$inferSelect): Promise<boolean> {
    const [customer] = await db
      .select({ id: users.id, name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, booking.customerId))
      .limit(1);

    if (!customer?.phone) {
      // No phone → emit failure event, not customer_uninformed, so dedup
      // doesn't block a future retry once a phone is on file.
      await emitEvent('pulse.customer_notify_failed', 'booking', booking.id, {
        agentName: this.name,
        severity: 'medium',
        smsSent: false,
        reason: 'no customer phone on file',
      });
      logger.warn({ bookingId: booking.id }, '[Mark] Customer SMS skipped — no phone on file');
      return false;
    }

    let smsSent = false;
    try {
      smsSent = await notificationService.sendSMS({
        to: customer.phone,
        message: CUSTOMER_DELAY_SMS,
        type: 'booking_update',
      });
    } catch (err) {
      logger.error({ err, bookingId: booking.id }, 'Mark: customer delay SMS failed');
    }

    if (smsSent) {
      await emitEvent('pulse.customer_uninformed', 'booking', booking.id, {
        agentName: this.name,
        severity: 'medium',
        smsSent: true,
        customerPhone: customer.phone,
      });
    } else {
      // Emit a distinct event type so shouldFire('customer_uninformed') stays
      // false on the next scan and we retry the SMS.
      await emitEvent('pulse.customer_notify_failed', 'booking', booking.id, {
        agentName: this.name,
        severity: 'medium',
        smsSent: false,
        customerPhone: customer.phone,
        reason: 'sms_send_failed',
      });
      logger.warn({ bookingId: booking.id }, '[Mark] Customer SMS failed — will retry next scan');
    }

    return smsSent;
  }
}

export const mark = new MarkAgent();
