/**
 * Riley Morgan (ONBOARD) — activation specialist for newly verified movers
 * and customers.
 *
 * Actions:
 *   - `mover_verified`   : mover just cleared all 7 verification items —
 *                          congratulations email (LLM-drafted) + SMS + schedule
 *                          three follow-up nudges (day 3 / 7 / 14) that skip
 *                          themselves once the mover accepts any job.
 *   - `stripe_connected` : Stripe Connect webhook says charges + payouts are
 *                          live — quick SMS confirming payouts are enabled.
 *   - `customer_verified`: customer just verified their email — schedule three
 *                          discount-code nudges (day 1 / 3 / 7) that skip
 *                          themselves once the customer creates a booking.
 *   - `mover_nudge`      : delayed touch 2/3/4 for a still-inactive mover.
 *   - `customer_nudge`   : delayed touch 1/2/3 for a still-un-booked customer.
 *
 * Emails are persona-branded ("Riley Morgan | LervIT <riley.morgan@lervit.com>")
 * via Resend directly, matching Alex's pattern. SMS goes through
 * notificationService.
 */

import { and, eq, ne, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import { BaseAgent, type AgentRunOptions } from './base';
import { db } from '../db';
import { users, movers, bookings } from '@shared/schema';
import { emitEvent } from '../events';
import { notificationService, sendResendEmail, EMAIL_SENDERS } from '../notifications';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';
import { wasContactedWithinDays } from './dedupe';

const RILEY_EMAIL = process.env.RILEY_EMAIL?.trim() || 'riley.morgan@lervit.com';
const RILEY_FROM = `Riley Morgan | LervIT <${RILEY_EMAIL}>`;
const RILEY_REPLY_TO = 'support@lervit.com';
const RILEY_MODEL = 'claude-sonnet-4-6';
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.lervit.com';

const DAY_MS = 24 * 60 * 60 * 1000;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface MoverVerifiedInput {
  moverId: string;
  userId: string;
}
interface StripeConnectedInput {
  moverId: string;
}
interface CustomerVerifiedInput {
  userId: string;
}
interface MoverNudgeInput {
  moverId: string;
  userId: string;
  touchNumber: number;
}
interface CustomerNudgeInput {
  userId: string;
  touchNumber: number;
}

export class RileyAgent extends BaseAgent {
  name = 'Riley Morgan';
  code = 'onboard';
  readonly model = RILEY_MODEL;

  protected async execute(
    action: string,
    input: Record<string, any>,
    options: AgentRunOptions = {},
  ): Promise<any> {
    // Dev/test dry-run: admin dashboard "Test Mover" uses moverId/userId = 'test'.
    // Short-circuit so no real DB lookups or emails fire.
    if (input?.moverId === 'test' || input?.userId === 'test') {
      return { skipped: true, reason: 'test dry run', action };
    }
    switch (action) {
      case 'mover_verified':
        return this.onMoverVerified(input as MoverVerifiedInput);
      case 'stripe_connected':
        return this.onStripeConnected(input as StripeConnectedInput);
      case 'customer_verified':
        return this.onCustomerVerified(input as CustomerVerifiedInput);
      case 'mover_nudge':
        return this.sendMoverNudge(input as MoverNudgeInput, options);
      case 'customer_nudge':
        return this.sendCustomerNudge(input as CustomerNudgeInput, options);
      case 'scan_inactive_movers':
        return this.scanInactiveMovers();
      default:
        throw new Error(`Riley: unknown action "${action}"`);
    }
  }

  // ─── ONBOARD SCAN (verified <30d, no accepted jobs) ─────────
  //
  // Sibling to Kai.scanInactiveMovers (which handles verified movers 30d+ old).
  // Riley owns the newly-verified window so the two agents don't double-SMS.

  private async scanInactiveMovers() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);
    const nudgeCooldown = new Date(Date.now() - 7 * DAY_MS);

    const rows = await db.execute(sql`
      SELECT m.id AS "moverId", m.user_id AS "userId"
      FROM movers m
      WHERE m.is_verified = true
        AND m.created_at >= ${thirtyDaysAgo}
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.mover_id = m.id AND b.status <> 'cancelled'
        )
        AND NOT EXISTS (
          SELECT 1 FROM business_events be
          WHERE be.entity_id = m.id
            AND be.event_type = 'riley.mover_nudge'
            AND be.created_at >= ${nudgeCooldown}
        )
      LIMIT 25
    `);

    const candidates = (rows.rows ?? []) as Array<{ moverId: string; userId: string }>;

    const queue = createAgentQueue(QUEUE_NAMES.ONBOARD);
    if (!queue) {
      logger.warn('Riley.scanInactiveMovers: ONBOARD queue unavailable');
      return { scanned: candidates.length, queued: 0, reason: 'queue unavailable' };
    }

    let queued = 0;
    for (const c of candidates) {
      try {
        await queue.add('mover_nudge', { moverId: c.moverId, userId: c.userId, touchNumber: 2 });
        queued++;
      } catch (err) {
        logger.error({ err, moverId: c.moverId }, 'Riley.scanInactiveMovers: enqueue failed');
      }
    }

    await emitEvent('riley.scan_inactive_movers', 'agent', 'onboard', {
      agentName: this.name,
      scanned: candidates.length,
      queued,
    });

    return { scanned: candidates.length, queued };
  }

  // ─── MOVER TRACK ────────────────────────────────────────────

  private async onMoverVerified({ moverId, userId }: MoverVerifiedInput) {
    const [mover] = await db.select().from(movers).where(eq(movers.id, moverId)).limit(1);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!mover || !user) {
      logger.warn({ moverId, userId }, 'Riley: mover/user not found for mover_verified');
      return { skipped: true, reason: 'mover or user not found' };
    }

    let emailSent = false;
    if (user.email) {
      const raw = await this.callClaude(
        `You are Riley Morgan, the onboarding specialist at LervIT Calgary.
Write a warm congratulations email to a mover who just got fully verified.
Tone: celebratory, warm, actionable.
Length: 3-4 short paragraphs.
Include:
  1. Congratulations on full verification.
  2. How to accept their first job: open ${APP_BASE_URL}/mover-dashboard, enable availability toggle, wait for job notifications.
  3. Payment info: same-day Stripe payouts, they keep 85% of every job.
  4. Tips for first move: arrive 5 min early, confirm items with customer, take photos before/after.
  5. CTA: go to the dashboard now.
Sign as: Riley Morgan, LervIT Onboarding.
Format: first line MUST be "SUBJECT: <subject line>", then a blank line, then the body.`,
        `Mover name: ${user.name}
Vehicle: ${mover.vehicleType || 'vehicle'}
Location: ${mover.location || 'Calgary'}
Dashboard: ${APP_BASE_URL}/mover-dashboard`,
        RILEY_MODEL,
        700,
      );
      const { subject, body } = parseSubjectAndBody(
        raw,
        "Your LervIT mover account is approved",
      );
      emailSent = await sendRileyEmail(user.email, subject, body);
    }

    let smsSent = false;
    if (user.phone) {
      const firstName = user.name?.split(' ')[0] || 'there';
      const smsText = `Hi ${firstName}! Riley from LervIT here — you're approved! Open the app to accept your first job: ${APP_BASE_URL}/mover-dashboard`;
      smsSent = await notificationService.sendSMS({
        to: user.phone,
        message: smsText.slice(0, 160),
        type: 'booking_update',
      });
    }

    await emitEvent('riley.mover_verified', 'agent', moverId, {
      agentName: this.name,
      email: emailSent,
      sms: smsSent,
    });

    // Schedule follow-up nudges at day 3, 7, 14. Each nudge skips itself if
    // the mover has accepted a job by then.
    const queue = createAgentQueue(QUEUE_NAMES.ONBOARD);
    if (queue) {
      const nudges: Array<{ touch: number; delayMs: number }> = [
        { touch: 2, delayMs: 3 * DAY_MS },
        { touch: 3, delayMs: 7 * DAY_MS },
        { touch: 4, delayMs: 14 * DAY_MS },
      ];
      for (const { touch, delayMs } of nudges) {
        try {
          await queue.add(
            'mover_nudge',
            { moverId, userId, touchNumber: touch },
            { delay: delayMs },
          );
        } catch (err) {
          logger.error({ err, moverId, touch }, 'Riley: failed to schedule mover nudge');
        }
      }
    } else {
      logger.warn({ moverId }, 'Riley: ONBOARD queue unavailable — mover nudges not scheduled');
    }

    return { success: true, track: 'mover', touch: 1, email: emailSent, sms: smsSent };
  }

  private async onStripeConnected({ moverId }: StripeConnectedInput) {
    const [mover] = await db.select().from(movers).where(eq(movers.id, moverId)).limit(1);
    if (!mover) return { skipped: true, reason: 'mover not found' };

    const [user] = await db.select().from(users).where(eq(users.id, mover.userId)).limit(1);
    if (!user?.phone) return { skipped: true, reason: 'no phone on file' };

    const firstName = user.name?.split(' ')[0] || 'there';
    const smsText = `Hi ${firstName}! Riley from LervIT. Your Stripe account is connected — same-day payouts after each job. Start accepting jobs: ${APP_BASE_URL}/mover-dashboard`;
    const smsSent = await notificationService.sendSMS({
      to: user.phone,
      message: smsText.slice(0, 160),
      type: 'booking_update',
    });

    await emitEvent('riley.stripe_connected', 'agent', moverId, {
      agentName: this.name,
      sms: smsSent,
    });

    return { success: true, track: 'mover', event: 'stripe_connected', sms: smsSent };
  }

  private async sendMoverNudge({ moverId, userId, touchNumber }: MoverNudgeInput, options: AgentRunOptions = {}) {
    if (touchNumber < 2 || touchNumber > 4) {
      throw new Error(`Riley.sendMoverNudge: invalid touchNumber ${touchNumber}`);
    }

    // Skip if the mover has accepted any non-cancelled job.
    const [jobs] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.moverId, moverId), ne(bookings.status, 'cancelled')));
    if ((jobs?.n ?? 0) > 0) {
      return { skipped: true, reason: 'mover active', touchNumber };
    }

    // Dedupe: at most one Riley mover nudge per 7 days.
    const dedupe = await wasContactedWithinDays({
      entityId: moverId,
      eventTypes: ['riley.mover_nudge'],
      days: 7,
    });
    if (dedupe.contacted) {
      return { skipped: true, reason: 'already_nudged_within_7d', lastEvent: dedupe.lastEvent, daysAgo: dedupe.daysAgo };
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return { skipped: true, reason: 'user not found' };

    const firstName = user.name?.split(' ')[0] || 'there';
    let emailSent = false;
    let smsSent = false;

    if (touchNumber === 2 && user.email) {
      const subject = 'Have you accepted your first job yet?';
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [moverId], preview: { to: user.email, channel: 'email', subject, touchNumber } };
      }
      const body =
        `Hi ${firstName},\n\n` +
        `I noticed you haven't accepted your first LervIT job yet. Jobs are waiting in your area!\n\n` +
        `Here's how to get started:\n` +
        `1. Open your dashboard\n` +
        `2. Enable your availability toggle\n` +
        `3. Turn on push notifications\n` +
        `4. Jobs will appear automatically\n\n` +
        ctaHtml('Open Dashboard →', `${APP_BASE_URL}/mover-dashboard`) +
        `Questions? Reply to this email anytime.\n\n` +
        `Riley Morgan\nLervIT Onboarding`;
      emailSent = await sendRileyEmail(user.email, subject, body);
    } else if (touchNumber === 3 && user.phone) {
      const smsText = `Hi ${firstName}, Riley from LervIT. Jobs are waiting in your area — open the app to start earning: ${APP_BASE_URL}/mover-dashboard`;
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [moverId], preview: { to: user.phone, channel: 'sms', body: smsText.slice(0, 160), touchNumber } };
      }
      smsSent = await notificationService.sendSMS({
        to: user.phone,
        message: smsText.slice(0, 160),
        type: 'booking_update',
      });
    } else if (touchNumber === 4 && user.email) {
      const subject = 'Is everything okay with your LervIT account?';
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [moverId], preview: { to: user.email, channel: 'email', subject, touchNumber } };
      }
      const body =
        `Hi ${firstName},\n\n` +
        `It's been two weeks since you were approved and I want to make sure everything is okay with your account.\n\n` +
        `If you're having any trouble getting started, reply to this email and I'll personally help you accept your first job.\n\n` +
        `LervIT movers in Calgary are currently earning $500–$2,000/week. We'd love to have you active.\n\n` +
        ctaHtml('Get Started →', `${APP_BASE_URL}/mover-dashboard`) +
        `Riley Morgan\nLervIT Onboarding\n${RILEY_EMAIL}`;
      emailSent = await sendRileyEmail(user.email, subject, body);
    } else {
      return { skipped: true, reason: 'no reachable channel for this touch', touchNumber };
    }

    await emitEvent('riley.mover_nudge', 'agent', moverId, {
      agentName: this.name,
      touchNumber,
      email: emailSent,
      sms: smsSent,
    });

    return { success: true, track: 'mover', touch: touchNumber, email: emailSent, sms: smsSent };
  }

  // ─── CUSTOMER TRACK ──────────────────────────────────────────

  private async onCustomerVerified({ userId }: CustomerVerifiedInput) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return { skipped: true, reason: 'user not found' };

    // Skip if the customer has already booked. This can happen if the verify
    // event fires after the booking flow completes.
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(eq(bookings.customerId, userId));
    if ((count?.n ?? 0) > 0) {
      return { skipped: true, reason: 'customer already booked' };
    }

    const queue = createAgentQueue(QUEUE_NAMES.ONBOARD);
    if (!queue) {
      logger.warn({ userId }, 'Riley: ONBOARD queue unavailable — customer nudges not scheduled');
      await emitEvent('riley.customer_verified', 'agent', userId, {
        agentName: this.name,
        nudgesScheduled: 0,
        reason: 'queue unavailable',
      });
      return { success: true, track: 'customer', nudgesScheduled: 0 };
    }

    const nudges: Array<{ touch: number; delayMs: number }> = [
      { touch: 1, delayMs: 1 * DAY_MS },
      { touch: 2, delayMs: 3 * DAY_MS },
      { touch: 3, delayMs: 7 * DAY_MS },
    ];
    let scheduled = 0;
    for (const { touch, delayMs } of nudges) {
      try {
        await queue.add(
          'customer_nudge',
          { userId, touchNumber: touch },
          { delay: delayMs },
        );
        scheduled++;
      } catch (err) {
        logger.error({ err, userId, touch }, 'Riley: failed to schedule customer nudge');
      }
    }

    await emitEvent('riley.customer_verified', 'agent', userId, {
      agentName: this.name,
      nudgesScheduled: scheduled,
    });

    return { success: true, track: 'customer', nudgesScheduled: scheduled };
  }

  private async sendCustomerNudge({ userId, touchNumber }: CustomerNudgeInput, options: AgentRunOptions = {}) {
    if (touchNumber < 1 || touchNumber > 3) {
      throw new Error(`Riley.sendCustomerNudge: invalid touchNumber ${touchNumber}`);
    }

    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(eq(bookings.customerId, userId));
    if ((count?.n ?? 0) > 0) {
      return { skipped: true, reason: 'customer booked', touchNumber };
    }

    // Dedupe: at most one Riley customer nudge per 7 days.
    const dedupe = await wasContactedWithinDays({
      entityId: userId,
      eventTypes: ['riley.customer_nudge'],
      days: 7,
    });
    if (dedupe.contacted) {
      return { skipped: true, reason: 'already_nudged_within_7d', lastEvent: dedupe.lastEvent, daysAgo: dedupe.daysAgo };
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return { skipped: true, reason: 'user not found' };

    const firstName = user.name?.split(' ')[0] || 'there';
    let emailSent = false;
    let smsSent = false;

    if (touchNumber === 1 && user.email) {
      const subject = 'Your first move quote takes 30 seconds';
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [userId], preview: { to: user.email, channel: 'email', subject, touchNumber } };
      }
      const body =
        `Hi ${firstName},\n\n` +
        `Getting a moving quote with LervIT takes just 30 seconds:\n\n` +
        `Snap a photo of your item\n` +
        `AI identifies it instantly\n` +
        `See your exact price\n` +
        `Book in one tap\n\n` +
        `No phone calls. No waiting. No hidden fees.\n\n` +
        `And as a new customer, use code <strong>LERVIT10</strong> for 10% off your first move.\n\n` +
        ctaHtml('Get My Instant Quote →', `${APP_BASE_URL}/request-move`) +
        `Riley Morgan\nLervIT Team`;
      emailSent = await sendRileyEmail(user.email, subject, body);
    } else if (touchNumber === 2 && user.phone) {
      const smsText = `Hi ${firstName}, Riley from LervIT! Your 10% discount code LERVIT10 is waiting. Book your first move in 30 sec: ${APP_BASE_URL}/request-move`;
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [userId], preview: { to: user.phone, channel: 'sms', body: smsText.slice(0, 160), touchNumber } };
      }
      smsSent = await notificationService.sendSMS({
        to: user.phone,
        message: smsText.slice(0, 160),
        type: 'booking_update',
      });
    } else if (touchNumber === 3 && user.email) {
      const subject = 'Your LervIT first-move quote is ready';
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [userId], preview: { to: user.email, channel: 'email', subject, touchNumber } };
      }
      const body =
        `Hi ${firstName},\n\n` +
        `This is your last reminder about your 10% welcome discount with LervIT.\n\n` +
        `Use code <strong>LERVIT10</strong> at checkout for 10% off your first move.\n\n` +
        `Calgary's fastest moving platform — instant AI quotes, verified movers, transparent pricing.\n\n` +
        ctaHtml('Book My Move →', `${APP_BASE_URL}/request-move`) +
        `Riley Morgan\nLervIT Team`;
      emailSent = await sendRileyEmail(user.email, subject, body);
    } else {
      return { skipped: true, reason: 'no reachable channel for this touch', touchNumber };
    }

    await emitEvent('riley.customer_nudge', 'agent', userId, {
      agentName: this.name,
      touchNumber,
      email: emailSent,
      sms: smsSent,
    });

    return { success: true, track: 'customer', touch: touchNumber, email: emailSent, sms: smsSent };
  }
}

// ─── helpers ─────────────────────────────────────────────────

function parseSubjectAndBody(raw: string, fallbackSubject: string): { subject: string; body: string } {
  const lines = raw.split(/\r?\n/);
  const subjectIdx = lines.findIndex(l => l.trim().toUpperCase().startsWith('SUBJECT:'));
  if (subjectIdx === -1) {
    return { subject: fallbackSubject, body: raw.trim() };
  }
  const subject = lines[subjectIdx].replace(/^\s*SUBJECT:\s*/i, '').trim() || fallbackSubject;
  const body = lines.slice(subjectIdx + 1).join('\n').trim();
  return { subject, body: body || raw.trim() };
}

function ctaHtml(label: string, href: string): string {
  return `<p><a href="${href}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">${label}</a></p>\n`;
}

async function sendRileyEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') {
    logger.info({ to, subject, bodyPreview: body.slice(0, 120) }, 'Riley: dev mode — email not sent');
    return false;
  }
  if (!resend) {
    logger.warn('Riley: RESEND_API_KEY not set — email skipped');
    return false;
  }
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => (p.startsWith('<') ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`))
    .join('');
  const header = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f1f5f9;">
    <tr>
      <td width="52" valign="middle">
        <img src="${APP_BASE_URL}/avatars/riley-morgan.png" width="44" height="44" style="border-radius:50%;object-fit:cover;display:block;" alt="Riley Morgan" />
      </td>
      <td valign="middle" style="padding-left:12px;">
        <div style="font-weight:600;font-size:15px;color:#1a1a1a;line-height:1.2;">Riley Morgan</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">Onboarding Specialist · LervIT Calgary</div>
      </td>
    </tr>
  </table>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
    ${header}
    ${paragraphs}
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
      replyTo: RILEY_REPLY_TO,
      subject,
      html,
      listUnsubscribeUrl: `${APP_BASE_URL}/unsubscribe`,
    });
    logger.info({ to, subject }, 'Riley: email sent');
    return true;
  } catch (err) {
    logger.error({ err }, 'Riley: Resend threw');
    return false;
  }
}

export const riley = new RileyAgent();
