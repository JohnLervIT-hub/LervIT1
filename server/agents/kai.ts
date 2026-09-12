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
import { BaseAgent, type AgentRunOptions } from './base';
import { db } from '../db';
import { users, movers, bookings } from '@shared/schema';
import { emitEvent } from '../events';
import { notificationService, sendResendEmail, EMAIL_SENDERS } from '../notifications';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';
import { wasContactedWithinDays } from './dedupe';

const KAI_CUSTOMER_WINBACK_EVENTS = [
  'kai.customer_winback_touch1',
  'kai.customer_winback_touch2',
  'kai.customer_winback_touch3',
];
const KAI_MOVER_REACTIVATION_EVENTS = [
  'kai.mover_reactivation_touch1',
  'kai.mover_reactivation_touch2',
  'kai.mover_reactivation_touch3',
];

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

  protected async execute(
    action: string,
    input: Record<string, any>,
    options: AgentRunOptions = {},
  ): Promise<any> {
    switch (action) {
      case 'scan_dormant_customers':
        return this.scanDormantCustomers(options);
      case 'scan_inactive_movers':
        return this.scanInactiveMovers(options);
      case 'send_customer_winback':
        return this.sendCustomerWinback(input as CustomerWinbackInput, options);
      case 'send_mover_reactivation':
        return this.sendMoverReactivation(input as MoverReactivationInput, options);
      default:
        throw new Error(`Kai: unknown action "${action}"`);
    }
  }

  // ─── CUSTOMER TRACK ──────────────────────────────────────

  private async scanDormantCustomers(options: AgentRunOptions = {}): Promise<CustomerScanResult | { dryRun: true; wouldContact: string[]; wouldSkip: { userId: string; reason: string }[] }> {
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

    if (options.dryRun) {
      const wouldContact: string[] = [];
      const wouldSkip: { userId: string; reason: string }[] = [];
      let previewed = 0;
      for (const c of candidates) {
        if (previewed >= KAI_MAX_CONTACTS_PER_RUN) {
          wouldSkip.push({ userId: c.customerId, reason: 'daily_cap' });
          continue;
        }
        const dedupe = await wasContactedWithinDays({
          entityId: c.customerId,
          entityType: 'customer',
          eventTypes: KAI_CUSTOMER_WINBACK_EVENTS,
          days: 30,
        });
        if (dedupe.contacted) {
          wouldSkip.push({ userId: c.customerId, reason: `contacted_${dedupe.daysAgo}d_ago` });
          continue;
        }
        wouldContact.push(c.customerId);
        previewed++;
      }
      return { dryRun: true, wouldContact, wouldSkip };
    }

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
      const dedupe = await wasContactedWithinDays({
        entityId: c.customerId,
        entityType: 'customer',
        eventTypes: KAI_CUSTOMER_WINBACK_EVENTS,
        days: 30,
      });
      if (dedupe.contacted) {
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

  private async sendCustomerWinback({ userId, touchNumber }: CustomerWinbackInput, options: AgentRunOptions = {}) {
    if (touchNumber < 1 || touchNumber > 3) {
      throw new Error(`Kai.sendCustomerWinback: invalid touchNumber ${touchNumber}`);
    }

    // Defense-in-depth dedupe: also block at send time in case a manual + cron
    // both enqueued the same customer within the 30-day cooldown.
    const dedupe = await wasContactedWithinDays({
      entityId: userId,
      entityType: 'customer',
      eventTypes: KAI_CUSTOMER_WINBACK_EVENTS,
      days: 30,
    });
    if (dedupe.contacted) {
      return { skipped: true, reason: 'already_contacted_within_30d', lastEvent: dedupe.lastEvent, daysAgo: dedupe.daysAgo };
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
      const subject = `${firstName}, come back to LervIT`;
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [userId], preview: { to: user.email, channel: 'email', subject, touchNumber } };
      }
      const html = customerWinbackTouch1Html(firstName);
      emailSent = await sendKaiEmail(user.email, subject, html);
    } else if (touchNumber === 2 && user.phone) {
      const smsText = `Hi ${firstName}, Kai from LervIT. Your 15% discount code ${KAI_PROMO_CODE} is still waiting — book your next move: ${APP_BASE_URL}/request-move`;
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [userId], preview: { to: user.phone, channel: 'sms', body: smsText.slice(0, 160), touchNumber } };
      }
      smsSent = await notificationService.sendSMS({
        to: user.phone,
        message: smsText.slice(0, 160),
        type: 'booking_update',
      });
    } else if (touchNumber === 3 && user.email) {
      const subject = 'Following up on your LervIT account';
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [userId], preview: { to: user.email, channel: 'email', subject, touchNumber } };
      }
      const html = customerWinbackTouch3Html(firstName);
      emailSent = await sendKaiEmail(user.email, subject, html);
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

  private async scanInactiveMovers(options: AgentRunOptions = {}): Promise<MoverScanResult | { dryRun: true; wouldContact: string[]; wouldSkip: { moverId: string; reason: string }[] }> {
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

    if (options.dryRun) {
      const wouldContact: string[] = [];
      const wouldSkip: { moverId: string; reason: string }[] = [];
      let previewed = 0;
      for (const m of candidates) {
        if (previewed >= KAI_MAX_CONTACTS_PER_RUN) {
          wouldSkip.push({ moverId: m.moverId, reason: 'daily_cap' });
          continue;
        }
        const dedupe = await wasContactedWithinDays({
          entityId: m.moverId,
          entityType: 'mover',
          eventTypes: KAI_MOVER_REACTIVATION_EVENTS,
          days: 14,
        });
        if (dedupe.contacted) {
          wouldSkip.push({ moverId: m.moverId, reason: `contacted_${dedupe.daysAgo}d_ago` });
          continue;
        }
        wouldContact.push(m.moverId);
        previewed++;
      }
      return { dryRun: true, wouldContact, wouldSkip };
    }

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

      // Dedup: skip if any reactivation touch for this mover in the last 14d.
      const dedupe = await wasContactedWithinDays({
        entityId: m.moverId,
        entityType: 'mover',
        eventTypes: KAI_MOVER_REACTIVATION_EVENTS,
        days: 14,
      });
      if (dedupe.contacted) {
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

  private async sendMoverReactivation({ moverId, touchNumber }: MoverReactivationInput, options: AgentRunOptions = {}) {
    if (touchNumber < 1 || touchNumber > 3) {
      throw new Error(`Kai.sendMoverReactivation: invalid touchNumber ${touchNumber}`);
    }

    const dedupe = await wasContactedWithinDays({
      entityId: moverId,
      entityType: 'mover',
      eventTypes: KAI_MOVER_REACTIVATION_EVENTS,
      days: 14,
    });
    if (dedupe.contacted) {
      return { skipped: true, reason: 'already_contacted_within_14d', lastEvent: dedupe.lastEvent, daysAgo: dedupe.daysAgo };
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
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [moverId], preview: { to: user.phone, channel: 'sms', body: smsText.slice(0, 160), touchNumber } };
      }
      smsSent = await notificationService.sendSMS({
        to: user.phone,
        message: smsText.slice(0, 160),
        type: 'booking_update',
      });
    } else if (touchNumber === 2 && user.email) {
      const subject = 'Are you still available for moves in Calgary?';
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [moverId], preview: { to: user.email, channel: 'email', subject, touchNumber } };
      }
      const html = moverReactivationTouch2Html(firstName);
      emailSent = await sendKaiEmail(user.email, subject, html);
    } else if (touchNumber === 3 && user.email) {
      const subject = 'We want to keep your LervIT account active';
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [moverId], preview: { to: user.email, channel: 'email', subject, touchNumber } };
      }
      const html = moverReactivationTouch3Html(firstName);
      emailSent = await sendKaiEmail(user.email, subject, html);
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
  const header = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f1f5f9;">
    <tr>
      <td width="52" valign="middle">
        <img src="${APP_BASE_URL}/avatars/kai-bennett.png" width="44" height="44" style="border-radius:50%;object-fit:cover;display:block;" alt="Kai Bennett" />
      </td>
      <td valign="middle" style="padding-left:12px;">
        <div style="font-weight:600;font-size:15px;color:#1a1a1a;line-height:1.2;">Kai Bennett</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">Retention Specialist · LervIT Calgary</div>
      </td>
    </tr>
  </table>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
    ${header}
    ${innerHtml}
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <p style="font-size:12px;color:#999;">
      LervIT Technologies · Calgary, AB ·
      <a href="${APP_BASE_URL}/unsubscribe">Unsubscribe</a>
    </p>
  </div>`;
  try {
    await sendResendEmail({
      from: EMAIL_SENDERS.OUTREACH,
      to,
      replyTo: KAI_REPLY_TO,
      subject,
      html,
      listUnsubscribeUrl: `${APP_BASE_URL}/unsubscribe`,
    });
    logger.info({ to, subject }, 'Kai: email sent');
    return true;
  } catch (err) {
    logger.error({ err }, 'Kai: Resend threw');
    return false;
  }
}

export const kai = new KaiAgent();
