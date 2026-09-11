/**
 * Alex Morgan (CLOSER-D) — lead conversion + abandoned-booking recovery.
 *
 * Actions:
 *   - `convert_lead`      : first touch on a new lead + schedule touches 2/3/4
 *                           on the closer-d BullMQ queue with 24/48/72h delays.
 *   - `send_touch`        : execute one delayed touch (2/3/4). Marks cold at 4.
 *   - `recover_abandoned` : one-off recovery email for an abandoned booking.
 *
 * Emails are persona-branded ("Alex Morgan | LervIT <alex.morgan@lervit.com>") so we use
 * Resend directly rather than notificationService.sendEmail (which forces
 * "LervIT <support@lervit.com>"). SMS goes through notificationService.
 */

import { and, eq, gte, lte, ne } from 'drizzle-orm';
import { Resend } from 'resend';
import { BaseAgent } from './base';
import { db } from '../db';
import { leads, bookings, users, businessEvents } from '@shared/schema';
import { emitEvent } from '../events';
import { notificationService } from '../notifications';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';

const ALEX_EMAIL_MODEL = 'claude-sonnet-4-6';
const ALEX_SMS_MODEL = 'claude-haiku-4-5-20251001';
const ALEX_EMAIL = process.env.ALEX_EMAIL?.trim() || 'alex.morgan@lervit.com';
const ALEX_FROM = `Alex Morgan | LervIT <${ALEX_EMAIL}>`;
const ALEX_REPLY_TO = 'support@lervit.com';

const TOUCH_DELAY_MS: Record<2 | 3 | 4, number> = {
  2: 24 * 60 * 60 * 1000,
  3: 48 * 60 * 60 * 1000,
  4: 72 * 60 * 60 * 1000,
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface ConvertLeadInput {
  leadId: string;
}
interface SendTouchInput {
  leadId: string;
  touchNumber: number;
}
interface RecoverAbandonedInput {
  bookingId: string;
}

export class AlexAgent extends BaseAgent {
  name = 'Alex Morgan';
  code = 'closer-d';

  protected async execute(action: string, input: Record<string, any>): Promise<any> {
    switch (action) {
      case 'convert_lead':
        return this.convertLead(input as ConvertLeadInput);
      case 'send_touch':
        return this.sendTouch(input as SendTouchInput);
      case 'recover_abandoned':
        if (!input?.bookingId) {
          return this.recoverAbandonedBulk();
        }
        return this.recoverAbandoned(input as RecoverAbandonedInput);
      default:
        throw new Error(`Alex: unknown action "${action}"`);
    }
  }

  private async recoverAbandonedBulk() {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const rows = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(
        eq(bookings.status, 'pending'),
        ne(bookings.paymentStatus, 'paid'),
        lte(bookings.createdAt, cutoff),
      ));

    const count = rows.length;
    if (count === 0) {
      return { count: 0, queued: false, reason: 'no abandoned bookings' };
    }

    const queue = createAgentQueue(QUEUE_NAMES.CLOSER_D);
    if (!queue) {
      logger.warn('Alex.recoverAbandonedBulk: CLOSER_D queue unavailable');
      return { count, queued: false, reason: 'queue unavailable' };
    }

    let queued = 0;
    for (const b of rows) {
      try {
        await queue.add('recover_abandoned', { bookingId: b.id });
        queued++;
      } catch (err) {
        logger.error({ err, bookingId: b.id }, 'Alex.recoverAbandonedBulk: enqueue failed');
      }
    }

    return { count, queued: true, jobsEnqueued: queued };
  }

  private async convertLead({ leadId }: ConvertLeadInput) {
    const lead = await this.getLead(leadId);
    if (!lead) throw new Error(`Alex: lead ${leadId} not found`);
    if (lead.status === 'converted' || lead.status === 'cold') {
      return { skipped: true, reason: `lead is ${lead.status}` };
    }

    const raw = await this.callClaude(
      `You are Alex Morgan, a warm and professional conversion specialist at LervIT,
Calgary's AI-powered moving platform.
Write a short, personalized email to convert this lead into a booking.
Be friendly, specific, and include a clear call to action.
Tone: warm, helpful, not pushy.
Length: 3-4 short paragraphs.
End with "Alex" and "LervIT Team".
Format: first line MUST be "SUBJECT: <subject line>", then a blank line, then the body.`,
      `Lead details:
Source: ${lead.sourceChannel}
Notes: ${lead.notes ?? 'Calgary area move'}
Intent score: ${lead.intentScore}

Write a conversion email. Include:
1. Personalized opening based on their signal
2. Brief mention of LervIT's AI pricing
3. Clear CTA: "Get your free instant quote"
4. Link placeholder: [QUOTE_LINK]`,
      ALEX_EMAIL_MODEL,
      600,
    );

    const { subject, body } = parseSubjectAndBody(
      raw,
      'Your Calgary move — instant quote from LervIT',
    );
    const bodyWithLink = body.replace(
      /\[QUOTE_LINK\]/g,
      `${process.env.APP_BASE_URL ?? 'https://app.lervit.com'}/request-move`,
    );

    let emailSent = false;
    if (lead.contactEmail) {
      emailSent = await sendAlexEmail(lead.contactEmail, subject, bodyWithLink);
    }

    await db
      .update(leads)
      .set({
        status: 'contacted',
        touchpoints: (lead.touchpoints ?? 0) + 1,
        lastTouchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    // Schedule follow-up touches on the closer-d queue.
    const queue = createAgentQueue(QUEUE_NAMES.CLOSER_D);
    if (queue) {
      for (const touchNumber of [2, 3, 4] as const) {
        try {
          await queue.add(
            'send_touch',
            { leadId, touchNumber },
            { delay: TOUCH_DELAY_MS[touchNumber] },
          );
        } catch (err) {
          logger.error({ err, leadId, touchNumber }, 'Alex: failed to schedule touch');
        }
      }
    } else {
      logger.warn({ leadId }, 'Alex: closer-d queue unavailable — follow-up touches not scheduled');
    }

    await emitEvent('lead.contacted', 'lead', leadId, {
      touchNumber: 1,
      channel: 'email',
      emailSent,
      agentName: this.name,
    });

    return { success: true, touchNumber: 1, channel: 'email', emailSent };
  }

  private async sendTouch({ leadId, touchNumber }: SendTouchInput) {
    if (touchNumber < 2 || touchNumber > 4) {
      throw new Error(`Alex.sendTouch: invalid touchNumber ${touchNumber}`);
    }
    const lead = await this.getLead(leadId);
    if (!lead) return { skipped: true, reason: 'lead not found' };
    if (lead.status === 'converted' || lead.status === 'cold') {
      return { skipped: true, reason: `lead is ${lead.status}` };
    }

    let channel: 'email' | 'sms' = 'email';
    let delivered = false;

    if (touchNumber === 2 && lead.contactPhone) {
      channel = 'sms';
      const smsBody = await this.callClaude(
        `You are Alex from LervIT, a Calgary moving platform.
Write a brief, friendly SMS follow-up.
Start with: 'Hi, Alex from LervIT here! '
Then add personalized follow-up based on
the lead context. Include booking link.
Not pushy. Total under 160 characters.
Return only the SMS text, nothing else.`,
        `Follow up with: ${lead.notes ?? 'Calgary mover inquiry'}
Link: ${process.env.APP_BASE_URL ?? 'https://app.lervit.com'}/request-move`,
        ALEX_SMS_MODEL,
        120,
      );
      delivered = await notificationService.sendSMS({
        to: lead.contactPhone,
        message: smsBody.trim().slice(0, 160),
        type: 'booking_update',
      });
    } else if (lead.contactEmail) {
      channel = 'email';
      const isLast = touchNumber === 4;
      const raw = await this.callClaude(
        `You are Alex Morgan from LervIT Calgary.
Write a ${isLast ? 'final' : 'follow-up'} email.
${isLast ? 'Create gentle urgency — this is the last outreach.' : 'Use a different angle from the first email.'}
Warm, brief, not pushy. 2-3 paragraphs.
Format: first line "SUBJECT: <subject>", blank line, then the body.`,
        `Lead context: ${lead.notes ?? 'Calgary move inquiry'}
Touch number: ${touchNumber} of 4
Quote link: ${process.env.APP_BASE_URL ?? 'https://app.lervit.com'}/request-move`,
        ALEX_EMAIL_MODEL,
        500,
      );
      const { subject, body } = parseSubjectAndBody(raw, 'Still thinking about your Calgary move?');
      delivered = await sendAlexEmail(lead.contactEmail, subject, body);
    } else {
      return { skipped: true, reason: 'no reachable channel', touchNumber };
    }

    const nextStatus = touchNumber >= 4 ? 'cold' : 'contacted';
    await db
      .update(leads)
      .set({
        status: nextStatus,
        touchpoints: (lead.touchpoints ?? 0) + 1,
        lastTouchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    await emitEvent('lead.touched', 'lead', leadId, {
      touchNumber,
      channel,
      delivered,
      agentName: this.name,
    });

    return { success: true, touchNumber, channel, delivered };
  }

  private async recoverAbandoned({ bookingId }: RecoverAbandonedInput) {
    // Skip if we already sent a recovery in the past 24h (dedup vs. cron re-runs
    // and vs. the existing sendAbandonedBookingReminders job).
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const priorSends = await db
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(
        and(
          eq(businessEvents.eventType, 'booking.recovery_sent'),
          eq(businessEvents.entityId, bookingId),
          gte(businessEvents.createdAt, oneDayAgo),
        ),
      )
      .limit(1);
    if (priorSends.length > 0) {
      return { skipped: true, reason: 'already recovered in last 24h' };
    }

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) return { skipped: true, reason: 'booking not found' };
    const [customer] = await db.select().from(users).where(eq(users.id, booking.customerId)).limit(1);
    if (!customer?.email) return { skipped: true, reason: 'no customer email' };

    const raw = await this.callClaude(
      `You are Alex Morgan from LervIT Calgary.
A customer started a booking but did not complete it.
Write a friendly recovery email under 200 words.
Include their booking details and a direct link to complete.
Format: first line "SUBJECT: <subject>", blank line, then the body.`,
      `Abandoned booking:
From: ${booking.pickupAddress ?? 'unknown'}
To: ${booking.dropoffAddress ?? 'unknown'}
Date: ${booking.preferredDate ?? 'unspecified'}
Complete link: ${process.env.APP_BASE_URL ?? 'https://app.lervit.com'}/payment/${bookingId}`,
      ALEX_EMAIL_MODEL,
      500,
    );
    const { subject, body } = parseSubjectAndBody(
      raw,
      'Your LervIT booking is saved — complete it here',
    );
    const delivered = await sendAlexEmail(customer.email, subject, body);

    await emitEvent('booking.recovery_sent', 'booking', bookingId, {
      agentName: this.name,
      delivered,
    });

    return { success: true, delivered };
  }

  private async getLead(leadId: string) {
    const [row] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    return row ?? null;
  }
}

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

async function sendAlexEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') {
    logger.info({ to, subject, bodyPreview: body.slice(0, 120) }, 'Alex: dev mode — email not sent');
    return false;
  }
  if (!resend) {
    logger.warn('Alex: RESEND_API_KEY not set — email skipped');
    return false;
  }
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
    ${paragraphs}
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <p style="font-size:12px;color:#999;">
      LervIT Technologies · Calgary, AB ·
      <a href="${process.env.APP_BASE_URL ?? 'https://app.lervit.com'}/unsubscribe">Unsubscribe</a>
    </p>
  </div>`;
  try {
    const { data, error } = await resend.emails.send({
      from: ALEX_FROM,
      to,
      replyTo: ALEX_REPLY_TO,
      subject,
      html,
    });
    if (error) {
      logger.error({ err: error }, 'Alex: Resend error');
      return false;
    }
    logger.info({ id: data?.id, to, subject }, 'Alex: email sent');
    return true;
  } catch (err) {
    logger.error({ err }, 'Alex: Resend threw');
    return false;
  }
}

export const alex = new AlexAgent();
