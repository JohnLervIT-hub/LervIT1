/**
 * Kai Bennett (RETAIN) — customer + mover reactivation.
 *
 * Actions:
 *   - `scan_dormant_customers`   : daily sweep for customers whose last completed
 *                                  booking is 30/60/90+ days old. Enqueues one
 *                                  winback per customer per scan (capped).
 *   - `scan_inactive_movers`     : daily sweep for verified movers with no
 *                                  earnings row in 7/14/30+ days. Enqueues one
 *                                  reactivation per mover per scan (capped).
 *   - `send_customer_winback`    : one email/SMS touch, dedups if the customer
 *                                  booked since the scan queued the job.
 *   - `send_mover_reactivation`  : one email/SMS touch, no automatic booking-
 *                                  based skip (mover-side activity is tracked
 *                                  via mover_earnings which the scan already
 *                                  reads).
 *
 * Emails are persona-branded ("Kai Bennett | LervIT <kai.bennett@lervit.com>")
 * through Resend, matching Alex/Riley. SMS goes through notificationService.
 * Kai does NOT duplicate the immediate post-completion review request in
 * background-jobs.ts::sendPostCompletionReviewRequest — that flow is separate.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import { BaseAgent } from './base';
import { db } from '../db';
import { users, movers, bookings } from '@shared/schema';
import { emitEvent } from '../events';
import { notificationService } from '../notifications';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';

// ─── constants (tunable at deploy) ─────────────────────────

const KAI_CUSTOMER_DORMANT_DAYS_1 = 30;
const KAI_CUSTOMER_DORMANT_DAYS_2 = 60;
const KAI_CUSTOMER_DORMANT_DAYS_3 = 90;
const KAI_MOVER_INACTIVE_DAYS_1 = 7;
const KAI_MOVER_INACTIVE_DAYS_2 = 14;
const KAI_MOVER_INACTIVE_DAYS_3 = 30;
const KAI_MAX_CONTACTS_PER_RUN = 5;
const KAI_PROMO_CODE = 'KAI15';

const KAI_EMAIL = process.env.KAI_EMAIL?.trim() || 'kai.bennett@lervit.com';
const KAI_FROM = `Kai Bennett | LervIT <${KAI_EMAIL}>`;
const KAI_REPLY_TO = 'support@lervit.com';
const KAI_MODEL = 'claude-haiku-4-5-20251001';
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.lervit.com';
const DAY_MS = 24 * 60 * 60 * 1000;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ─── input types ───────────────────────────────────────────

interface CustomerWinbackInput {
  userId: string;
  touchNumber: number;
}
interface MoverReactivationInput {
  moverId: string;
  touchNumber: number;
}

interface CustomerScanResult {
  scanned: number;
  day30: number;
  day60: number;
  day90: number;
  skipped: number;
  queued: number;
}
interface MoverScanResult {
  scanned: number;
  day7: number;
  day14: number;
  day30: number;
  skipped: number;
  queued: number;
}

// ─── agent ─────────────────────────────────────────────────

export class KaiAgent extends BaseAgent {
  name = 'Kai Bennett';
  code = 'retain';
  readonly model = KAI_MODEL;

  protected async execute(action: string, input: Record<string, any>): Promise<any> {
    switch (action) {
      case 'scan_dormant_customers':
        return this.scanDormantCustomers();
      case 'scan_inactive_movers':
        return this.scanInactiveMovers();
      case 'send_customer_winback':
        return this.sendCustomerWinback(input as CustomerWinbackInput);
      case 'send_mover_reactivation':
        return this.sendMoverReactivation(input as MoverReactivationInput);
      default:
        throw new Error(`Kai: unknown action "${action}"`);
    }
  }

  // ─── CUSTOMER TRACK ──────────────────────────────────────

  private async scanDormantCustomers(): Promise<CustomerScanResult> {
    const results: CustomerScanResult = {
      scanned: 0,
      day30: 0,
      day60: 0,
      day90: 0,
      skipped: 0,
      queued: 0,
    };

    const now = Date.now();
    const day30ago = new Date(now - KAI_CUSTOMER_DORMANT_DAYS_1 * DAY_MS);

    // Dormant = last completed booking >30d ago (using updatedAt as completion
    // proxy since bookings has no completed_at column).
    const rows = await db.execute(sql`
      SELECT
        b.customer_id AS "customerId",
        MAX(b.updated_at) AS "lastCompletedAt",
        COUNT(*)::int AS "totalMoves"
      FROM bookings b
      JOIN users u ON u.id = b.customer_id
      WHERE b.status = 'completed'
        AND u.email IS NOT NULL
      GROUP BY b.customer_id
      HAVING MAX(b.updated_at) < ${day30ago}
      ORDER BY MAX(b.updated_at) ASC
      LIMIT 20
    `);

    const candidates = (rows.rows ?? []) as Array<{
      customerId: string;
      lastCompletedAt: string;
      totalMoves: number;
    }>;
    results.scanned = candidates.length;

    const queue = createAgentQueue(QUEUE_NAMES.RETAIN);
    if (!queue) {
      logger.warn('Kai: RETAIN queue unavailable — customer scan cannot enqueue');
      return results;
    }

    let contacted = 0;
    for (const c of candidates) {
      if (contacted >= KAI_MAX_CONTACTS_PER_RUN) {
        results.skipped++;
        continue;
      }

      // Dedup: skip if any winback touch for this user in the last 30 days.
      const recent = await db.execute(sql`
        SELECT id FROM business_events
        WHERE entity_type = 'customer'
          AND entity_id = ${c.customerId}
          AND event_type LIKE 'kai.customer_winback%'
          AND created_at > NOW() - INTERVAL '30 days'
        LIMIT 1
      `);
      if ((recent.rows ?? []).length > 0) {
        results.skipped++;
        continue;
      }

      const daysDormant = Math.floor((now - new Date(c.lastCompletedAt).getTime()) / DAY_MS);
      const touchNumber =
        daysDormant >= KAI_CUSTOMER_DORMANT_DAYS_3
          ? 3
          : daysDormant >= KAI_CUSTOMER_DORMANT_DAYS_2
            ? 2
            : 1;

      try {
        await queue.add('send_customer_winback', { userId: c.customerId, touchNumber });
        results.queued++;
        contacted++;
        if (touchNumber === 1) results.day30++;
        else if (touchNumber === 2) results.day60++;
        else results.day90++;
      } catch (err) {
        logger.error({ err, customerId: c.customerId, touchNumber }, 'Kai: failed to queue winback');
      }
    }

    await emitEvent('kai.customer_scan', 'agent', 'kai', results);
    logger.info({ results }, 'Kai: customer dormancy scan complete');
    return results;
  }

  private async sendCustomerWinback({ userId, touchNumber }: CustomerWinbackInput) {
    if (touchNumber < 1 || touchNumber > 3) {
      throw new Error(`Kai.sendCustomerWinback: invalid touchNumber ${touchNumber}`);
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return { skipped: true, reason: 'user not found' };

    // Skip if the customer booked since scan queued the job.
    const [rebooked] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(
        and(
          eq(bookings.customerId, userId),
          gte(bookings.createdAt, new Date(Date.now() - 30 * DAY_MS)),
        ),
      );
    if ((rebooked?.n ?? 0) > 0) {
      return { skipped: true, reason: 'recently booked', touchNumber };
    }

    const firstName = user.name?.split(' ')[0] || 'there';
    let emailSent = false;
    let smsSent = false;

    if (touchNumber === 1 && user.email) {
      const html = customerWinbackTouch1Html(firstName);
      emailSent = await sendKaiEmail(
        user.email,
        `${firstName}, we miss you! Here's 15% off your next move`,
        html,
      );
    } else if (touchNumber === 2 && user.phone) {
      const smsText = `Hi ${firstName}, Kai from LervIT. Your 15% discount code ${KAI_PROMO_CODE} is still waiting — book your next move: ${APP_BASE_URL}/request-move`;
      smsSent = await notificationService.sendSMS({
        to: user.phone,
        message: smsText.slice(0, 160),
        type: 'booking_update',
      });
    } else if (touchNumber === 3 && user.email) {
      const html = customerWinbackTouch3Html(firstName);
      emailSent = await sendKaiEmail(
        user.email,
        'Last chance — your LervIT discount expires soon',
        html,
      );
    } else {
      return { skipped: true, reason: 'no reachable channel for this touch', touchNumber };
    }

    await emitEvent(`kai.customer_winback_touch${touchNumber}`, 'customer', userId, {
      agentName: this.name,
      touchNumber,
      promoCode: KAI_PROMO_CODE,
      email: emailSent,
      sms: smsSent,
    });

    return { success: true, track: 'customer', touchNumber, email: emailSent, sms: smsSent };
  }

  // ─── MOVER TRACK ─────────────────────────────────────────

  private async scanInactiveMovers(): Promise<MoverScanResult> {
    const results: MoverScanResult = {
      scanned: 0,
      day7: 0,
      day14: 0,
      day30: 0,
      skipped: 0,
      queued: 0,
    };

    const now = Date.now();
    const day7ago = new Date(now - KAI_MOVER_INACTIVE_DAYS_1 * DAY_MS);

    // Verified, not-suspended movers with no earnings row in 7+ days
    // (or none ever). mover_earnings is the source of truth for "did work".
    // Also exclude movers whose profile is <30 days old — Riley owns the
    // day-3/7/14 nudge sequence for newly verified movers; Kai only picks
    // them up once that window has passed to prevent double-SMS.
    const rows = await db.execute(sql`
      SELECT
        m.id AS "moverId",
        m.user_id AS "userId",
        MAX(me.created_at) AS "lastJobAt"
      FROM movers m
      LEFT JOIN mover_earnings me ON me.mover_id = m.id
      WHERE m.is_verified = true
        AND (m.pilot_status IS NULL OR m.pilot_status <> 'suspended')
        AND m.created_at < NOW() - INTERVAL '30 days'
      GROUP BY m.id, m.user_id
      HAVING MAX(me.created_at) < ${day7ago}
         OR MAX(me.created_at) IS NULL
      ORDER BY MAX(me.created_at) ASC NULLS FIRST
      LIMIT 20
    `);

    const candidates = (rows.rows ?? []) as Array<{
      moverId: string;
      userId: string;
      lastJobAt: string | null;
    }>;
    results.scanned = candidates.length;

    const queue = createAgentQueue(QUEUE_NAMES.RETAIN);
    if (!queue) {
      logger.warn('Kai: RETAIN queue unavailable — mover scan cannot enqueue');
      return results;
    }

    let contacted = 0;
    for (const m of candidates) {
      if (contacted >= KAI_MAX_CONTACTS_PER_RUN) {
        results.skipped++;
        continue;
      }

      // Dedup: skip if any reactivation touch for this mover in the last 7d.
      const recent = await db.execute(sql`
        SELECT id FROM business_events
        WHERE entity_type = 'mover'
          AND entity_id = ${m.moverId}
          AND event_type LIKE 'kai.mover_reactivation%'
          AND created_at > NOW() - INTERVAL '7 days'
        LIMIT 1
      `);
      if ((recent.rows ?? []).length > 0) {
        results.skipped++;
        continue;
      }

      const daysDormant = m.lastJobAt
        ? Math.floor((now - new Date(m.lastJobAt).getTime()) / DAY_MS)
        : 999;
      const touchNumber =
        daysDormant >= KAI_MOVER_INACTIVE_DAYS_3
          ? 3
          : daysDormant >= KAI_MOVER_INACTIVE_DAYS_2
            ? 2
            : 1;

      try {
        await queue.add('send_mover_reactivation', { moverId: m.moverId, touchNumber });
        results.queued++;
        contacted++;
        if (touchNumber === 1) results.day7++;
        else if (touchNumber === 2) results.day14++;
        else results.day30++;
      } catch (err) {
        logger.error({ err, moverId: m.moverId, touchNumber }, 'Kai: failed to queue reactivation');
      }
    }

    await emitEvent('kai.mover_scan', 'agent', 'kai', results);
    logger.info({ results }, 'Kai: mover inactivity scan complete');
    return results;
  }

  private async sendMoverReactivation({ moverId, touchNumber }: MoverReactivationInput) {
    if (touchNumber < 1 || touchNumber > 3) {
      throw new Error(`Kai.sendMoverReactivation: invalid touchNumber ${touchNumber}`);
    }

    const [mover] = await db.select().from(movers).where(eq(movers.id, moverId)).limit(1);
    if (!mover) return { skipped: true, reason: 'mover not found' };

    const [user] = await db.select().from(users).where(eq(users.id, mover.userId)).limit(1);
    if (!user) return { skipped: true, reason: 'user not found' };

    const firstName = user.name?.split(' ')[0] || 'there';
    let emailSent = false;
    let smsSent = false;

    if (touchNumber === 1 && user.phone) {
      const smsText = `Hi ${firstName}, Kai from LervIT. Jobs are waiting in Calgary — open the app to start earning: ${APP_BASE_URL}/mover-dashboard`;
      smsSent = await notificationService.sendSMS({
        to: user.phone,
        message: smsText.slice(0, 160),
        type: 'booking_update',
      });
    } else if (touchNumber === 2 && user.email) {
      const html = moverReactivationTouch2Html(firstName);
      emailSent = await sendKaiEmail(
        user.email,
        'Are you still available for moves in Calgary?',
        html,
      );
    } else if (touchNumber === 3 && user.email) {
      const html = moverReactivationTouch3Html(firstName);
      emailSent = await sendKaiEmail(
        user.email,
        'We want to keep your LervIT account active',
        html,
      );
    } else {
      return { skipped: true, reason: 'no reachable channel for this touch', touchNumber };
    }

    await emitEvent(`kai.mover_reactivation_touch${touchNumber}`, 'mover', moverId, {
      agentName: this.name,
      touchNumber,
      email: emailSent,
      sms: smsSent,
    });

    return { success: true, track: 'mover', touchNumber, email: emailSent, sms: smsSent };
  }
}

// ─── HTML builders ─────────────────────────────────────────

function customerWinbackTouch1Html(firstName: string): string {
  return `<p>Hi ${firstName},</p>
    <p>It's been a while since your last move with LervIT and we'd love to have you back.</p>
    <p>As a thank you for being a LervIT customer, here's an exclusive discount just for you:</p>
    <div style="background:#f0f9ff;border:2px solid #2563eb;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
      <p style="font-size:14px;color:#666;margin:0 0 8px;">Your exclusive discount code</p>
      <p style="font-size:32px;font-weight:bold;color:#2563eb;margin:0;letter-spacing:4px;">${KAI_PROMO_CODE}</p>
      <p style="font-size:14px;color:#666;margin:8px 0 0;">15% off your next move</p>
    </div>
    <p>Book anytime — instant AI quotes, verified Calgary movers, same-day service.</p>
    <p><a href="${APP_BASE_URL}/request-move" style="background:#2563eb;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Book My Next Move →</a></p>
    <p style="font-size:12px;color:#999;">Use code ${KAI_PROMO_CODE} at checkout. One-time use, valid for 30 days.</p>
    <p>Kai Bennett<br/>LervIT Calgary</p>`;
}

function customerWinbackTouch3Html(firstName: string): string {
  return `<p>Hi ${firstName},</p>
    <p>This is your last reminder — your exclusive 15% discount code <strong>${KAI_PROMO_CODE}</strong> expires soon.</p>
    <p>LervIT makes moving easy: snap a photo for an instant AI quote, book verified Calgary movers, transparent pricing with no hidden fees, and same-day service available.</p>
    <p><a href="${APP_BASE_URL}/request-move" style="background:#2563eb;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Use ${KAI_PROMO_CODE} Before It Expires →</a></p>
    <p>Kai Bennett<br/>LervIT Calgary</p>`;
}

function moverReactivationTouch2Html(firstName: string): string {
  return `<p>Hi ${firstName},</p>
    <p>We noticed you haven't accepted a job recently and wanted to check in.</p>
    <p>Calgary customers are actively booking moves — your availability could mean $500–$2,000 this week.</p>
    <p>If you're available, just open the app and enable your availability toggle. Jobs will come to you automatically.</p>
    <p><a href="${APP_BASE_URL}/mover-dashboard" style="background:#2563eb;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">I'm Available — Show Me Jobs →</a></p>
    <p>If you're having any issues with the app, reply to this email and I'll help personally.</p>
    <p>Kai Bennett<br/>LervIT Team</p>`;
}

function moverReactivationTouch3Html(firstName: string): string {
  return `<p>Hi ${firstName},</p>
    <p>It's been 30 days since your last job with LervIT. We want to make sure your account stays active.</p>
    <p>If you're still interested in earning with LervIT, just accept one job this week to keep your account in good standing.</p>
    <p>If something isn't working or you have concerns, please reply to this email — I read every response.</p>
    <p><a href="${APP_BASE_URL}/mover-dashboard" style="background:#2563eb;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;">Accept a Job Today →</a></p>
    <p>Kai Bennett<br/>LervIT Team</p>`;
}

// ─── email helper ──────────────────────────────────────────

async function sendKaiEmail(to: string, subject: string, innerHtml: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') {
    logger.info({ to, subject }, 'Kai: dev mode — email not sent');
    return false;
  }
  if (!resend) {
    logger.warn('Kai: RESEND_API_KEY not set — email skipped');
    return false;
  }
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
    ${innerHtml}
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <p style="font-size:12px;color:#999;">
      LervIT Technologies · Calgary, AB ·
      <a href="${APP_BASE_URL}/unsubscribe">Unsubscribe</a>
    </p>
  </div>`;
  try {
    const { data, error } = await resend.emails.send({
      from: KAI_FROM,
      to,
      replyTo: KAI_REPLY_TO,
      subject,
      html,
    });
    if (error) {
      logger.error({ err: error }, 'Kai: Resend error');
      return false;
    }
    logger.info({ id: data?.id, to, subject }, 'Kai: email sent');
    return true;
  } catch (err) {
    logger.error({ err }, 'Kai: Resend threw');
    return false;
  }
}

export const kai = new KaiAgent();
