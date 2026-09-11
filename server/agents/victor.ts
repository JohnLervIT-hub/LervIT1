/**
 * Victor Nash (DISPATCH) — orchestrator for the mover dispatch pipeline.
 *
 * Actions:
 *   - `dispatch`             : run initial dispatch for a booking by delegating to
 *                              server/dispatch.ts::dispatchBooking().
 *   - `escalate_no_movers`   : called when redispatchIfAllExpired hits its wave
 *                              cap without finding a mover — forwards a
 *                              high-severity escalation through Xavier so John
 *                              gets an SMS.
 *
 * Design notes (see Phase 4 audit):
 *   - Victor does NOT own the 5/10-min re-dispatch loop. That lives in
 *     server/background-jobs.ts::redispatchIfAllExpired which already fires a
 *     fresh wave when the 10-min notification TTL expires, capped at 3 waves.
 *     Duplicating it here would race with the existing job and produce
 *     phantom escalations while movers are still being pinged.
 *   - Victor is invoked (a) from the admin trigger endpoint and (b) from the
 *     cap-reached branch of redispatchIfAllExpired for the escalation hook.
 *     The 5 existing dispatchBooking() call sites in routes.ts are left alone
 *     in this first pass.
 */

import { eq, isNull } from 'drizzle-orm';
import { BaseAgent } from './base';
import { db } from '../db';
import { bookings, users, businessEvents, BOOKING_STATUSES } from '@shared/schema';
import { and, gte } from 'drizzle-orm';
import { dispatchBooking } from '../dispatch';
import { emitEvent } from '../events';
import { xavier } from './xavier';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';

interface DispatchInput {
  bookingId: string;
}

interface EscalateNoMoversInput {
  bookingId: string;
  notificationCount?: number;
}

export class VictorAgent extends BaseAgent {
  name = 'Victor Nash';
  code = 'dispatch';

  protected async execute(action: string, input: Record<string, any>): Promise<any> {
    switch (action) {
      case 'dispatch':
        return this.dispatch(input as DispatchInput);
      case 'escalate_no_movers':
        return this.escalateNoMovers(input as EscalateNoMoversInput);
      case 'dispatch_pending':
        return this.dispatchAllPending();
      default:
        throw new Error(`Victor: unknown action "${action}"`);
    }
  }

  private async dispatchAllPending() {
    const pending = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(
        eq(bookings.status, BOOKING_STATUSES.PENDING),
        eq(bookings.paymentStatus, 'paid'),
        isNull(bookings.moverId),
      ));

    const pendingCount = pending.length;
    if (pendingCount === 0) {
      return { pendingCount: 0, queued: false, reason: 'no pending bookings' };
    }

    const queue = createAgentQueue(QUEUE_NAMES.DISPATCH);
    if (!queue) {
      logger.warn('Victor.dispatchAllPending: DISPATCH queue unavailable — REDIS_URL not set');
      return { pendingCount, queued: false, reason: 'queue unavailable' };
    }

    let queued = 0;
    for (const b of pending) {
      try {
        await queue.add('dispatch', { bookingId: b.id });
        queued++;
      } catch (err) {
        logger.error({ err, bookingId: b.id }, 'Victor.dispatchAllPending: enqueue failed');
      }
    }

    await emitEvent('dispatch.bulk_triggered', 'agent', this.code, {
      agentName: this.name,
      pendingCount,
      queued,
    });

    return { pendingCount, queued: true, jobsEnqueued: queued };
  }

  private async dispatch({ bookingId }: DispatchInput) {
    if (!bookingId) throw new Error('Victor.dispatch: bookingId required');

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) return { skipped: true, reason: 'booking not found', bookingId };

    if (booking.status !== BOOKING_STATUSES.PENDING) {
      return { skipped: true, reason: `booking status is ${booking.status}`, bookingId };
    }
    if (booking.moverId) {
      return { skipped: true, reason: 'mover already assigned', bookingId };
    }

    await dispatchBooking(booking as any);

    await emitEvent('dispatch.dispatched', 'booking', bookingId, {
      agentName: this.name,
      preSelected: !!booking.preSelectedMoverId,
      pickupAddress: booking.pickupAddress,
      dropoffAddress: booking.dropoffAddress,
    });

    return { success: true, bookingId, preSelected: !!booking.preSelectedMoverId };
  }

  private async escalateNoMovers({ bookingId, notificationCount }: EscalateNoMoversInput) {
    if (!bookingId) throw new Error('Victor.escalateNoMovers: bookingId required');

    // Dedup: don't re-escalate the same booking within 6h.
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const prior = await db
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(
        and(
          eq(businessEvents.eventType, 'dispatch.escalated_no_movers'),
          eq(businessEvents.entityId, bookingId),
          gte(businessEvents.createdAt, sixHoursAgo),
        ),
      )
      .limit(1);
    if (prior.length > 0) {
      return { skipped: true, reason: 'already escalated in last 6h', bookingId };
    }

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) return { skipped: true, reason: 'booking not found', bookingId };

    const [customer] = await db
      .select({ name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.id, booking.customerId))
      .limit(1);

    const issue = `No mover found for booking ${bookingId} after ${notificationCount ?? 'multiple'} notifications. Booking is scheduled ${booking.preferredDate?.toISOString?.() ?? 'soon'} — customer ${customer?.name ?? 'unknown'} may need manual assignment.`;

    let xavierResult: any = null;
    try {
      xavierResult = await xavier.run('escalate', {
        issue,
        severity: 'high',
        agentName: this.name,
        data: {
          bookingId,
          customerName: customer?.name ?? null,
          customerEmail: customer?.email ?? null,
          pickupAddress: booking.pickupAddress,
          dropoffAddress: booking.dropoffAddress,
          preferredDate: booking.preferredDate,
          loadSize: booking.loadSize,
          notificationCount: notificationCount ?? null,
        },
      });
    } catch (err) {
      logger.error({ err, bookingId }, 'Victor: Xavier escalate failed');
    }

    await emitEvent('dispatch.escalated_no_movers', 'booking', bookingId, {
      agentName: this.name,
      notificationCount: notificationCount ?? null,
      xavierSmsSent: !!xavierResult?.smsSent,
    });

    return { success: true, bookingId, xavierResult };
  }
}

export const victor = new VictorAgent();
