/**
 * Intelligent Mover Dispatch — single source of truth for all mover notification flows.
 *
 * Acceptance Criteria
 * ───────────────────
 * AC-1  Vehicle type enforcement: only movers whose vehicle type normalizes to the required
 *       tier (or one tier higher via single-tier upgrade) receive notifications. No fallback
 *       to incompatible vehicle classes regardless of mover availability.
 *
 * AC-2  Strict proximity radius: movers are ranked by driving distance to pickup, starting
 *       within 15 km and expanding in 10 km steps up to 50 km. At most 5 movers are
 *       notified per dispatch.
 *
 * AC-3  Notification de-duplication: a mover who already has any notification record
 *       (pending / expired / declined) for a booking is not notified again unless the
 *       admin explicitly re-dispatches (which first deletes old records).
 *
 * AC-4  All channels delivered per dispatch: every matched mover receives a WebSocket push,
 *       an email, and an SMS (when a phone number is on file). Silent channel failures must
 *       not abort the other channels.
 *
 * AC-5  Pre-selected mover priority: when a customer chose a specific mover, only that
 *       mover is notified. Proximity matching is not triggered until the pre-selected mover
 *       declines or their notification expires.
 *
 * AC-6  Decline triggers re-dispatch: declining the pre-selected mover clears
 *       `preSelectedMoverId` and immediately runs proximity matching for other movers,
 *       excluding the mover who declined.
 *
 * AC-7  Orphan recovery dispatches movers: when `recoverOrphanedPayments` recovers a
 *       payment, the full dispatch pipeline runs — not just the customer email.
 *
 * AC-8  Offline-mover fallback: 30-second frontend polling detects unexpired pending job
 *       notifications in the database and surfaces them even if the WebSocket push was
 *       missed while the mover was offline.
 *
 * AC-9  10-minute notification expiry: all job notifications carry an `expiresAt`
 *       timestamp. Movers cannot accept expired notifications. The cron job marks them
 *       expired. The WebSocket payload always includes `expiresAt` so the UI can show a
 *       countdown.
 *
 * AC-10 Idempotent dispatch: running the same dispatch twice (e.g. double webhook delivery)
 *       does not create duplicate notifications. DB insert uses `onConflictDoNothing()`.
 *
 * AC-11 Active trip protection: jobs are not auto-completed or auto-cancelled while a
 *       mover has updated their GPS location within the last 2 hours.
 */

import { db } from './db';
import { jobNotifications, users, movers as moversTable } from '@shared/schema';
import { eq, and, isNotNull, ne } from 'drizzle-orm';
import { moverWebSocket } from './websocket';
import { notificationService } from './notifications';
import { logEvent, logger } from './logger';
import { findNearestMovers, calculateExpiryTime, resolveVehicleForBooking } from '@shared/matching';
import { toDecimalString } from '@shared/utils';
import { storage } from './storage';
import { calculatePlatformFee } from './config/stripe';
import { getBaseUrl } from './utils/urls';

const BASE_URL = getBaseUrl();

/** Shape expected by findNearestMovers */
interface MoverData {
  moverId: string;
  userId: string;
  name: string;
  vehicleType: string;
  rating: string;
  totalMoves: number;
  isAvailable: boolean;
  latitude: number;
  longitude: number;
}

/** Minimum booking fields needed for dispatch */
interface DispatchableBooking {
  id: string;
  loadSize: string | null;
  aiRecommendedVehicle: string | null;
  pickupLatitude: string | number | null;
  pickupLongitude: string | number | null;
  dropoffLatitude: string | number | null;
  dropoffLongitude: string | number | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  price: string | null;
  preSelectedMoverId: string | null;
}

export interface DispatchResult {
  dispatched: number;
  requiredVehicle: string;
}

/**
 * Load all operational movers (online, with GPS location, with a user record).
 * Optionally excludes one mover by profile ID (e.g. the mover who just declined).
 */
async function loadOperationalMovers(excludeMoverId?: string): Promise<MoverData[]> {
  const conditions: ReturnType<typeof eq>[] = [
    eq(moversTable.isAvailable, true),
    isNotNull(moversTable.latitude),
    isNotNull(moversTable.longitude),
  ];
  if (excludeMoverId) {
    conditions.push(ne(moversTable.id, excludeMoverId));
  }

  const rows = await db
    .select({
      moverId: moversTable.id,
      userId: moversTable.userId,
      vehicleType: moversTable.vehicleType,
      rating: moversTable.rating,
      totalMoves: moversTable.totalMoves,
      isAvailable: moversTable.isAvailable,
      latitude: moversTable.latitude,
      longitude: moversTable.longitude,
      name: users.name,
    })
    .from(moversTable)
    .innerJoin(users, eq(moversTable.userId, users.id))
    .where(and(...conditions));

  return rows.map((r) => ({
    moverId: r.moverId,
    userId: r.userId,
    name: r.name,
    vehicleType: r.vehicleType ?? '',
    rating: r.rating ?? '0',
    totalMoves: r.totalMoves ?? 0,
    isAvailable: r.isAvailable ?? false,
    latitude: r.latitude as number,
    longitude: r.longitude as number,
  }));
}

/**
 * Send a single mover all four notification channels: WebSocket, in-app inbox,
 * email (if `emailJobAlerts`), SMS (if `smsJobAlerts` and phone). Each channel
 * runs independently so a single failure never aborts the others.
 */
export async function notifyMover(
  mover: MoverData & { distanceToPickup: number; estimatedEarnings: number },
  booking: DispatchableBooking,
  expiresAt: Date,
  opts: { isPriority?: boolean } = {}
): Promise<void> {
  const earningsStr = toDecimalString(mover.estimatedEarnings);

  // WebSocket (AC-9: always include expiresAt). Wrapped so a throw in the
  // pusher can't skip the other channels.
  try {
    moverWebSocket.notifyMover(mover.userId, {
      type: 'job_notification',
      bookingId: booking.id,
      pickupAddress: booking.pickupAddress ?? '',
      dropoffAddress: booking.dropoffAddress ?? '',
      price: earningsStr,
      estimatedTime: `${Math.round(mover.distanceToPickup)} km`,
      expiresAt,
      isPriority: opts.isPriority,
    });
  } catch (err) {
    logEvent.error('dispatch_ws', err, { bookingId: booking.id, moverId: mover.moverId });
  }

  // Load user once for preferences + contact info
  let moverUser: Awaited<ReturnType<typeof storage.getUser>> | null = null;
  try {
    const [row] = await db.select().from(users).where(eq(users.id, mover.userId)).limit(1);
    moverUser = row ?? null;
  } catch (err) {
    logEvent.error('dispatch_user_lookup', err, { bookingId: booking.id, moverId: mover.moverId });
  }

  // In-app inbox (AC-4). Written for every dispatch so both proximity and
  // pre-selected paths land in the mover's inbox.
  try {
    const title = opts.isPriority ? 'Priority Job Request!' : 'New Job Opportunity';
    const message = opts.isPriority
      ? `A customer specifically chose you! Earn $${earningsStr} CAD. Accept within 10 minutes.`
      : `New job ${Math.round(mover.distanceToPickup)} km away — earn $${earningsStr} CAD. Accept within 10 minutes.`;
    await storage.createNotification({
      userId: mover.userId,
      type: 'job_opportunity',
      title,
      message,
      bookingId: booking.id,
      actionUrl: '/mover-dashboard',
      isRead: false,
    });
  } catch (err) {
    logEvent.error('dispatch_inapp', err, { bookingId: booking.id, moverId: mover.moverId });
  }

  // Email — gated on user preference
  if (moverUser?.emailJobAlerts !== false) {
    try {
      if (moverUser) {
        await notificationService.sendJobAssignment(moverUser, booking as any, earningsStr);
      }
    } catch (err) {
      logEvent.error('dispatch_email', err, { bookingId: booking.id, moverId: mover.moverId });
    }
  }

  // SMS — gated on user preference AND phone on file
  if (moverUser?.phone && moverUser?.smsJobAlerts !== false) {
    try {
      const smsText = opts.isPriority
        ? `LervIT PRIORITY: A customer selected YOU! Earn $${earningsStr} CAD. Accept within 10 min: ${BASE_URL}/mover-dashboard`
        : `LervIT New Job! Earn $${earningsStr} CAD. Accept within 10 min: ${BASE_URL}/mover-dashboard`;
      await notificationService.sendSMS({ to: moverUser.phone, message: smsText, type: 'job_alert' });
    } catch (err) {
      logEvent.error('dispatch_sms', err, { bookingId: booking.id, moverId: mover.moverId });
    }
  }
}

/**
 * Dispatch proximity-matched movers for a booking.
 *
 * AC-1  Only vehicle-compatible movers are considered.
 * AC-2  Radius expansion from 15 km → 50 km, top 5.
 * AC-3  Uses onConflictDoNothing so duplicate dispatches are safe (AC-10).
 * AC-4  WebSocket + email + SMS per mover.
 *
 * @param booking    - Booking to dispatch.
 * @param options    - excludeMoverId: mover profile ID to skip (e.g. who just declined).
 */
export async function dispatchJobToMovers(
  booking: DispatchableBooking,
  options: { excludeMoverId?: string } = {}
): Promise<DispatchResult> {
  const pickupCoords = {
    lat: parseFloat(String(booking.pickupLatitude ?? '0')),
    lng: parseFloat(String(booking.pickupLongitude ?? '0')),
  };
  const dropoffCoords = {
    lat: parseFloat(String(booking.dropoffLatitude ?? '0')),
    lng: parseFloat(String(booking.dropoffLongitude ?? '0')),
  };

  const requiredVehicle = resolveVehicleForBooking(booking.aiRecommendedVehicle, booking.loadSize);
  const moversWithData = await loadOperationalMovers(options.excludeMoverId);

  const nearestMovers = findNearestMovers(
    pickupCoords,
    dropoffCoords,
    (booking.loadSize ?? 'medium') as 'boxes' | 'medium' | 'large' | 'apartment',
    moversWithData,
    {},
    requiredVehicle
  );

  if (nearestMovers.length === 0) {
    logger.info({ event: 'dispatch', bookingId: booking.id, requiredVehicle }, 'No matching movers found for dispatch');
    return { dispatched: 0, requiredVehicle };
  }

  const expiresAt = calculateExpiryTime(10);

  // Derive mover earnings from the actual booking price charged to the customer
  // (not from findNearestMovers' recalculated estimate), matching the admin assign-mover logic.
  const bookingPrice = parseFloat(booking.price ?? '0');
  const feeBreakdown = calculatePlatformFee(bookingPrice);
  const moverNetAmount = feeBreakdown.moverPayoutCents / 100;

  const moversWithActualEarnings = nearestMovers.map((mover) => ({
    ...mover,
    estimatedEarnings: moverNetAmount,
  }));

  // Create DB notification records (AC-10: onConflictDoNothing prevents duplicates)
  await Promise.all(
    moversWithActualEarnings.map((mover) =>
      db.insert(jobNotifications).values({
        bookingId: booking.id,
        moverId: mover.moverId,
        distanceToPickup: toDecimalString(mover.distanceToPickup),
        estimatedEarnings: toDecimalString(mover.estimatedEarnings),
        status: 'pending',
        expiresAt,
      }).onConflictDoNothing()
    )
  );

  // Notify each mover on all channels (AC-4)
  await Promise.all(
    moversWithActualEarnings.map((mover) => notifyMover(mover, booking, expiresAt))
  );

  logEvent.notification('dispatch_proximity_complete', {
    bookingId: booking.id,
    requiredVehicle,
    dispatched: nearestMovers.length,
  });

  return { dispatched: nearestMovers.length, requiredVehicle };
}

/**
 * Dispatch the pre-selected mover for a booking (priority flow).
 *
 * AC-5  Only the pre-selected mover is notified; proximity matching is NOT triggered.
 *
 * Returns true if the mover was found and notified, false if mover not found
 * (caller should clear preSelectedMoverId and fall back to dispatchJobToMovers).
 */
export async function dispatchPreSelectedMover(booking: DispatchableBooking): Promise<boolean> {
  if (!booking.preSelectedMoverId) return false;

  const preSelectedMover = await storage.getMover(booking.preSelectedMoverId);
  if (!preSelectedMover) return false;

  const bookingPrice = parseFloat(booking.price ?? '0');
  const feeBreakdown = calculatePlatformFee(bookingPrice);
  const moverNetAmount = feeBreakdown.moverPayoutCents / 100;
  const earningsStr = moverNetAmount.toFixed(2);
  const expiresAt = calculateExpiryTime(10);

  // DB record
  await storage.createJobNotification({
    bookingId: booking.id,
    moverId: booking.preSelectedMoverId,
    distanceToPickup: toDecimalString(0),
    estimatedEarnings: toDecimalString(moverNetAmount),
    status: 'pending',
    expiresAt,
  });

  // All three channels (AC-4), with priority flag (AC-5)
  const moverData: MoverData & { distanceToPickup: number; estimatedEarnings: number } = {
    moverId: preSelectedMover.id,
    userId: preSelectedMover.userId,
    name: '',
    vehicleType: preSelectedMover.vehicleType ?? '',
    rating: preSelectedMover.rating ?? '0',
    totalMoves: preSelectedMover.totalMoves ?? 0,
    isAvailable: preSelectedMover.isAvailable ?? false,
    latitude: 0,
    longitude: 0,
    distanceToPickup: 0,
    estimatedEarnings: moverNetAmount,
  };

  // notifyMover handles WebSocket + in-app + email + SMS (preference-gated).
  await notifyMover(moverData, booking, expiresAt, { isPriority: true });

  logEvent.notification('dispatch_preselected_complete', {
    bookingId: booking.id,
    moverId: booking.preSelectedMoverId,
    earnings: earningsStr,
  });

  return true;
}

/**
 * Full dispatch entry point that handles both pre-selected and proximity flows.
 * Use this in payment confirmation paths.
 *
 * AC-5  Pre-selected mover gets priority; proximity matching is skipped.
 * AC-6  If pre-selected mover not found, falls back to proximity matching.
 */
export async function dispatchBooking(booking: DispatchableBooking): Promise<void> {
  if (booking.preSelectedMoverId) {
    const ok = await dispatchPreSelectedMover(booking);
    if (!ok) {
      // Pre-selected mover not found — clear and fall back
      await storage.updateBooking(booking.id, { preSelectedMoverId: null });
      await dispatchJobToMovers(booking);
    }
  } else {
    await dispatchJobToMovers(booking);
  }
}
