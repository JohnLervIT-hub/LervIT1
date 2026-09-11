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
 *   - overtime            : now > preferredDate + estimatedDurationMinutes + 30min.
 *                           Medium severity — dashboard flag only.
 *   - no_start            : status is 'confirmed'/'accepted' and now > preferredDate
 *                           + 15min. High severity — Xavier SMS to John.
 *   - customer_uninformed : overtime or no_start fired AND we haven't texted the
 *                           customer about a delay in the past 60min. Mark sends
 *                           the customer SMS himself and emits an event so a
 *                           later scan won't repeat.
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
import { logger } from '../logger';

const IN_PROGRESS_STATUSES = [
  BOOKING_STATUSES.EN_ROUTE_TO_PICKUP,
  BOOKING_STATUSES.LOADING,
  BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF,
  BOOKING_STATUSES.UNLOADING,
] as const;

const SHOULD_HAVE_STARTED_STATUSES = [BOOKING_STATUSES.CONFIRMED, 'accepted'] as const;

const SCAN_STATUSES: string[] = [...IN_PROGRESS_STATUSES, ...SHOULD_HAVE_STARTED_STATUSES];

const GPS_STALE_MS = 10 * 60 * 1000;
const NO_START_GRACE_MS = 15 * 60 * 1000;
const OVERTIME_GRACE_MS = 30 * 60 * 1000;
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

const CUSTOMER_DELAY_SMS =
  'Hi! Your mover is running a bit late. We apologize for the delay and will keep you updated. — LervIT Team';

type CheckType = 'gps_silent' | 'overtime' | 'no_start' | 'customer_uninformed';

interface CheckBookingInput {
  bookingId: string;
}

interface ScanSummary {
  scanned: number;
  gpsSilent: number;
  overtime: number;
  noStart: number;
  customerUninformed: number;
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
      skipped: 0,
    };

    for (const booking of active) {
      try {
        const result = await this.evaluateBooking(booking);
        if (result.gpsSilent) summary.gpsSilent++;
        if (result.overtime) summary.overtime++;
        if (result.noStart) summary.noStart++;
        if (result.customerUninformed) summary.customerUninformed++;
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

    // 2. Overtime — needs an estimatedDurationMinutes from booking_metrics.
    if (inProgress && scheduled !== null) {
      const [metrics] = await db
        .select({ estimatedDurationMinutes: bookingMetrics.estimatedDurationMinutes })
        .from(bookingMetrics)
        .where(eq(bookingMetrics.bookingId, booking.id))
        .limit(1);
      const estMinutes = metrics?.estimatedDurationMinutes ?? null;
      if (estMinutes && now > scheduled + estMinutes * 60000 + OVERTIME_GRACE_MS) {
        if (await this.shouldFire(booking.id, 'overtime')) {
          const overMinutes = Math.round((now - scheduled - estMinutes * 60000) / 60000);
          overtime = true;
          await this.fireMediumSeverity(booking, 'overtime', {
            estimatedDurationMinutes: estMinutes,
            overMinutes,
            preferredDate: booking.preferredDate,
          });
        }
      }
    }

    // 3. No start — confirmed/accepted booking is >15min past scheduled pickup.
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

    const skipped = !gpsSilent && !overtime && !noStart && !customerUninformed;
    return { gpsSilent, overtime, noStart, customerUninformed, skipped };
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
      await emitEvent('pulse.customer_uninformed', 'booking', booking.id, {
        agentName: this.name,
        severity: 'medium',
        smsSent: false,
        reason: 'no customer phone on file',
      });
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

    await emitEvent('pulse.customer_uninformed', 'booking', booking.id, {
      agentName: this.name,
      severity: 'medium',
      smsSent,
      customerPhone: customer.phone,
    });

    return smsSent;
  }
}

export const mark = new MarkAgent();
