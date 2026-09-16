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

import { and, eq, lte, ne } from 'drizzle-orm';
import { Resend } from 'resend';
import { BaseAgent, type AgentRunOptions } from './base';
import { db } from '../db';
import { leads, bookings, users, quotes } from '@shared/schema';
import { emitEvent } from '../events';
import { notificationService, sendResendEmail, EMAIL_SENDERS } from '../notifications';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';
import { wasContactedToday } from './dedupe';

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

// Trimmed street/city string suitable for prompt injection ("71 Cityside Terrace NE").
type QuoteAddresses = {
  pickupAddress: string | null;
  dropoffAddress: string | null;
  shortId: string | null;
};

async function fetchQuoteAddresses(quoteId: string | null | undefined): Promise<QuoteAddresses | null> {
  if (!quoteId) return null;
  try {
    const [row] = await db
      .select({
        pickupAddress: quotes.pickupAddress,
        dropoffAddress: quotes.dropoffAddress,
        shortId: quotes.shortId,
      })
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
    return row ?? null;
  } catch (err) {
    logger.warn({ err, quoteId }, 'Alex: fetchQuoteAddresses failed');
    return null;
  }
}

function trimArea(address: string | null | undefined): string | null {
  if (!address) return null;
  return address.split(',')[0]?.trim() || null;
}

function bookingLinkFor(baseUrl: string, lead: { quoteId: string | null }, quoteAddresses: QuoteAddresses | null): string {
  if (quoteAddresses?.shortId) return `${baseUrl}/q/${quoteAddresses.shortId}`;
  if (lead.quoteId) return `${baseUrl}/quote/${lead.quoteId}`;
  return `${baseUrl}/request-move`;
}

// SMS consent gate. Leads sourced from web forms have implied consent; leads
// scraped from public listings (Kijiji/Craigslist/RentFaster/Google Alerts) do not.
// Explicit SMS channel override in admin UI counts as consent.
function hasSmsConsent(lead: { sourceChannel: string | null; utmSource: string | null }, channelOverride?: 'email' | 'sms'): boolean {
  if (channelOverride === 'sms') return true;
  const consentSources = new Set(['quote_form', 'manual', 'contact_form', 'signup']);
  if (lead.sourceChannel && consentSources.has(lead.sourceChannel)) return true;
  if (lead.utmSource && consentSources.has(lead.utmSource)) return true;
  return false;
}

// SMS_STOP_SUFFIX kept short (GSM-7) — CTIA A2P 10DLC requires an opt-out
// affordance on cold/marketing SMS.
const SMS_STOP_SUFFIX = ' Rply STOP to opt out';
const SMS_PREFIX = 'Hi, Alex from LervIT here! ';

// Compose an SMS from Claude-generated body + a deterministic booking link + opt-out
// suffix, respecting the 160-char GSM-7 single-segment budget. Strips non-GSM
// characters so smart quotes / em-dashes don't silently force UCS-2 encoding.
export function buildAlexSms(claudeBody: string, bookingLink: string, prefix: string = SMS_PREFIX): string {
  const cleanBody = claudeBody
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x00-\x7F]/g, '')
    .trim();

  const separator = '\n';
  const reserved = prefix.length + separator.length + bookingLink.length + SMS_STOP_SUFFIX.length;
  const bodyBudget = Math.max(0, 160 - reserved);

  let truncatedBody = cleanBody;
  if (cleanBody.length > bodyBudget) {
    truncatedBody = cleanBody.slice(0, bodyBudget).replace(/\s+\S*$/, '').trimEnd();
  }

  return `${prefix}${truncatedBody}${separator}${bookingLink}${SMS_STOP_SUFFIX}`;
}

interface ConvertLeadInput {
  leadId: string;
  channelOverride?: 'email' | 'sms';
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

  protected async execute(
    action: string,
    input: Record<string, any>,
    options: AgentRunOptions = {},
  ): Promise<any> {
    switch (action) {
      case 'convert_lead':
        return this.convertLead(input as ConvertLeadInput, options);
      case 'send_touch':
        return this.sendTouch(input as SendTouchInput, options);
      case 'recover_abandoned':
        if (!input?.bookingId) {
          return this.recoverAbandonedBulk(options);
        }
        return this.recoverAbandoned(input as RecoverAbandonedInput, options);
      default:
        throw new Error(`Alex: unknown action "${action}"`);
    }
  }

  private async recoverAbandonedBulk(options: AgentRunOptions = {}) {
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

    // Dry run: report which bookings would be recovered vs. already-sent-today,
    // without enqueueing anything.
    if (options.dryRun) {
      const wouldContact: string[] = [];
      const wouldSkip: { bookingId: string; reason: string }[] = [];
      for (const b of rows) {
        const { contacted } = await wasContactedToday({
          entityId: b.id,
          entityType: 'booking',
          eventTypes: ['booking.recovery_sent'],
        });
        if (contacted) wouldSkip.push({ bookingId: b.id, reason: 'already_recovered_today' });
        else wouldContact.push(b.id);
      }
      return {
        dryRun: true,
        totalCandidates: count,
        wouldContact,
        wouldSkip,
      };
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

  private async convertLead({ leadId, channelOverride }: ConvertLeadInput, options: AgentRunOptions = {}) {
    const lead = await this.getLead(leadId);
    if (!lead) throw new Error(`Alex: lead ${leadId} not found`);
    if (lead.status === 'converted' || lead.status === 'cold') {
      return { skipped: true, reason: `lead is ${lead.status}` };
    }

    if (channelOverride === 'sms') {
      if (!lead.contactPhone) {
        return { skipped: true, reason: 'no_phone_for_sms_override' };
      }
      return this.sendManualSms(lead, options);
    }
    if (channelOverride === 'email' && !lead.contactEmail) {
      return { skipped: true, reason: 'no_email_for_email_override' };
    }

    // Dedupe: one Alex touch per lead per day, regardless of touch number.
    const dedupe = await wasContactedToday({
      entityId: leadId,
      entityType: 'lead',
      eventTypes: ['lead.contacted', 'lead.touched'],
    });
    if (dedupe.contacted) {
      logger.info({ leadId, lastEvent: dedupe.lastEvent }, 'Alex.convertLead: skipping — already contacted today');
      return { skipped: true, reason: 'already_contacted_today', lastEvent: dedupe.lastEvent };
    }

    const baseUrl = (process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim();
    const quoteAddresses = await fetchQuoteAddresses(lead.quoteId);
    const bookingLink = bookingLinkFor(baseUrl, lead, quoteAddresses);
    const pickupArea = trimArea(quoteAddresses?.pickupAddress);
    const dropoffArea = trimArea(quoteAddresses?.dropoffAddress);

    const notes = lead.notes ?? '';
    const hasQuote = notes.includes('Quote:');
    const price = notes.match(/Quote: (\$[\d.]+(?:\s*CAD)?)/)?.[1];
    const items = notes.match(/Items: ([^\n]+)/)?.[1];
    const vehicle = notes.match(/Vehicle: ([^\n]+)/)?.[1];
    const movers = notes.match(/Movers: (\d+)/)?.[1];

    const raw = await this.callClaude(
      `You are Alex Morgan, a warm and professional conversion specialist at LervIT,
Calgary's AI-powered moving platform.
Write a short, personalized email to convert this lead into a booking.
Be friendly, specific, and include a clear call to action.
Tone: warm, helpful, not pushy.
End with "Alex" and "LervIT Team".
Format: first line MUST be "SUBJECT: <subject line>", then a blank line, then the body.

IMPORTANT: Only reference specific locations, neighborhoods, street names, or addresses if they are explicitly provided in the lead details below. NEVER invent or guess a location. If no address is provided, use generic language like "your Calgary move".`,
      `Lead details:
Source: ${lead.sourceChannel}
Intent score: ${lead.intentScore}
Pickup area: ${pickupArea ?? 'not available'}
Dropoff area: ${dropoffArea ?? 'not available'}
${hasQuote ? `
QUOTE DETAILS (reference these specifically):
  Price: ${price ?? 'see quote'}
  Items: ${items ?? 'household items'}
  Vehicle: ${vehicle ?? 'appropriate vehicle'}
  ${movers ? `Movers needed: ${movers}` : ''}

IMPORTANT:
  - Reference specific items being moved
  - Make customer feel you reviewed their order
  - ${pickupArea
      ? `Subject format: "Re: your move from ${pickupArea}" — use the REAL pickup area shown above, do not invent`
      : `Subject format: "Your Calgary move quote" or "Your moving quote is ready" — no location placeholders`}
  - Never include dollar amounts in the subject line
  - Keep email under 120 words
  - Sound personal not automated
` : `
  Context: ${notes || 'Calgary area move'}
  Keep email warm and general.
`}
Write a conversion email. Include:
1. Personalized opening based on their signal
2. Brief mention of LervIT's AI pricing
3. Clear CTA: "Get your free instant quote"
4. Link placeholder: [QUOTE_LINK]
   ${lead.quoteId ? '(This link reopens their exact saved quote — reference it naturally.)' : ''}`,
      ALEX_EMAIL_MODEL,
      600,
    );

    const { subject, body } = parseSubjectAndBody(
      raw,
      'Your Calgary move — instant quote from LervIT',
    );
    const bodyWithLink = body.replace(/\[QUOTE_LINK\]/g, bookingLink);

    if (options.dryRun) {
      return {
        dryRun: true,
        wouldContact: [leadId],
        preview: { to: lead.contactEmail ?? null, subject, body: bodyWithLink },
      };
    }

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

  private async sendTouch({ leadId, touchNumber }: SendTouchInput, options: AgentRunOptions = {}) {
    if (touchNumber < 2 || touchNumber > 4) {
      throw new Error(`Alex.sendTouch: invalid touchNumber ${touchNumber}`);
    }
    const lead = await this.getLead(leadId);
    if (!lead) return { skipped: true, reason: 'lead not found' };
    if (lead.status === 'converted' || lead.status === 'cold') {
      return { skipped: true, reason: `lead is ${lead.status}` };
    }

    // Dedupe: at most one Alex touch per lead per day, regardless of channel.
    const dedupe = await wasContactedToday({
      entityId: leadId,
      entityType: 'lead',
      eventTypes: ['lead.contacted', 'lead.touched'],
    });
    if (dedupe.contacted) {
      logger.info({ leadId, touchNumber, lastEvent: dedupe.lastEvent }, 'Alex.sendTouch: skipping — already contacted today');
      return { skipped: true, reason: 'already_contacted_today', lastEvent: dedupe.lastEvent };
    }

    const baseUrl = (process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim();
    const quoteAddresses = await fetchQuoteAddresses(lead.quoteId);
    const bookingLink = bookingLinkFor(baseUrl, lead, quoteAddresses);
    const pickupArea = trimArea(quoteAddresses?.pickupAddress);
    const dropoffArea = trimArea(quoteAddresses?.dropoffAddress);

    let channel: 'email' | 'sms' = 'email';
    let delivered = false;

    // Cold-lead SMS suppression: only send SMS to leads that entered via a
    // channel with implied opt-in. Scout-scraped leads fall through to email.
    const smsAllowed = touchNumber === 2 && lead.contactPhone && hasSmsConsent(lead);

    if (touchNumber === 2 && lead.contactPhone && !smsAllowed) {
      logger.info({ leadId, sourceChannel: lead.sourceChannel }, 'Alex.sendTouch: SMS suppressed — no consent, falling through to email');
    }

    if (smsAllowed) {
      channel = 'sms';
      const smsPrice = lead.notes?.match(/Quote: (\$[\d.]+(?:\s*CAD)?)/)?.[1];
      // Budget: 160 - prefix(28) - newline(1) - link(~30) - stop(~22) ≈ 79
      const claudeBody = await this.callClaude(
        `Write an SMS body only (no greeting, no URL, no opt-out language).
Length: STRICTLY under 79 characters.
${smsPrice ? `Reference their quote of ${smsPrice}.` : 'Follow up on their move quote.'}
Mention promo code LERVIT10 for 10% off if it fits within the character budget.
The greeting "Hi, Alex from LervIT here! ", a booking link, and "Rply STOP to opt out" are appended automatically — do NOT include them.
IMPORTANT: Never invent or guess neighborhood names, street names, or addresses. Only reference locations that appear below.
Return only the body text.`,
        `Follow up with: ${lead.notes ?? 'Calgary mover inquiry'}
Pickup area: ${pickupArea ?? 'not available'}
Dropoff area: ${dropoffArea ?? 'not available'}`,
        ALEX_SMS_MODEL,
        120,
      );
      const smsMessage = buildAlexSms(claudeBody, bookingLink);
      if (options.dryRun) {
        return {
          dryRun: true,
          wouldContact: [leadId],
          preview: { to: lead.contactPhone, channel: 'sms', body: smsMessage },
        };
      }
      delivered = await notificationService.sendSMS({
        to: lead.contactPhone!,
        message: smsMessage,
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
Quote link: ${bookingLink}
${lead.quoteId ? '(This link reopens their exact saved quote.)' : ''}`,
        ALEX_EMAIL_MODEL,
        500,
      );
      const { subject, body } = parseSubjectAndBody(raw, 'Still thinking about your Calgary move?');
      if (options.dryRun) {
        return {
          dryRun: true,
          wouldContact: [leadId],
          preview: { to: lead.contactEmail, channel: 'email', subject, body },
        };
      }
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

  private async recoverAbandoned({ bookingId }: RecoverAbandonedInput, options: AgentRunOptions = {}) {
    // Dedupe: one recovery per booking per day (guards cron + manual overlap).
    const dedupe = await wasContactedToday({
      entityId: bookingId,
      entityType: 'booking',
      eventTypes: ['booking.recovery_sent'],
    });
    if (dedupe.contacted) {
      return { skipped: true, reason: 'already_recovered_today', lastEvent: dedupe.lastEvent };
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
Complete link: ${(process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim()}/payment/${bookingId}`,
      ALEX_EMAIL_MODEL,
      500,
    );
    const { subject, body } = parseSubjectAndBody(
      raw,
      'Your LervIT booking is saved — complete it here',
    );
    if (options.dryRun) {
      return {
        dryRun: true,
        wouldContact: [bookingId],
        preview: { to: customer.email, channel: 'email', subject, body },
      };
    }
    const delivered = await sendAlexEmail(customer.email, subject, body);

    await emitEvent('booking.recovery_sent', 'booking', bookingId, {
      agentName: this.name,
      delivered,
    });

    return { success: true, delivered };
  }

  private async sendManualSms(lead: typeof leads.$inferSelect, options: AgentRunOptions = {}) {
    if (!lead.contactPhone) return { skipped: true, reason: 'no_contact_phone' };

    const dedupe = await wasContactedToday({
      entityId: lead.id,
      entityType: 'lead',
      eventTypes: ['lead.contacted', 'lead.touched'],
    });
    if (dedupe.contacted) {
      logger.info({ leadId: lead.id, lastEvent: dedupe.lastEvent }, 'Alex.sendManualSms: skipping — already contacted today');
      return { skipped: true, reason: 'already_contacted_today', lastEvent: dedupe.lastEvent };
    }

    // Even for admin-initiated manual sends, the LEAD must have opted in via
    // a channel with implied consent. Operator click ≠ CTIA/CRTC consent.
    if (!hasSmsConsent(lead)) {
      logger.info({ leadId: lead.id, sourceChannel: lead.sourceChannel }, 'Alex.sendManualSms: no lead consent — skipping SMS');
      return { skipped: true, reason: 'no_sms_consent' };
    }

    const baseUrl = (process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim();
    const quoteAddresses = await fetchQuoteAddresses(lead.quoteId);
    const bookingLink = bookingLinkFor(baseUrl, lead, quoteAddresses);
    const pickupArea = trimArea(quoteAddresses?.pickupAddress);
    const dropoffArea = trimArea(quoteAddresses?.dropoffAddress);
    const smsPrice = lead.notes?.match(/Quote: (\$[\d.]+(?:\s*CAD)?)/)?.[1];

    const claudeBody = await this.callClaude(
      `Write an SMS body only (no greeting, no URL, no opt-out language).
Length: STRICTLY under 79 characters.
${smsPrice ? `Reference their quote of ${smsPrice}.` : 'Follow up on their move quote.'}
Mention promo code LERVIT10 for 10% off if it fits within the character budget.
The greeting "Hi, Alex from LervIT here! ", a booking link, and "Rply STOP to opt out" are appended automatically — do NOT include them.
IMPORTANT: Never invent or guess neighborhood names, street names, or addresses. Only reference locations that appear below.
Return only the body text.`,
      `Follow up with: ${lead.notes ?? 'Calgary mover inquiry'}
Pickup area: ${pickupArea ?? 'not available'}
Dropoff area: ${dropoffArea ?? 'not available'}`,
      ALEX_SMS_MODEL,
      120,
    );
    const message = buildAlexSms(claudeBody, bookingLink);

    if (options.dryRun) {
      return {
        dryRun: true,
        wouldContact: [lead.id],
        preview: { to: lead.contactPhone, channel: 'sms', body: message },
      };
    }

    const delivered = await notificationService.sendSMS({
      to: lead.contactPhone,
      message,
      type: 'booking_update',
    });

    await db
      .update(leads)
      .set({
        status: 'contacted',
        touchpoints: (lead.touchpoints ?? 0) + 1,
        lastTouchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, lead.id));

    await emitEvent('lead.touched', 'lead', lead.id, {
      touchNumber: (lead.touchpoints ?? 0) + 1,
      channel: 'sms',
      delivered,
      agentName: this.name,
      manual: true,
    });

    return { success: true, channel: 'sms', delivered };
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
  const appBase = (process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim();
  const header = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f1f5f9;">
    <tr>
      <td width="52" valign="middle">
        <img src="${appBase}/avatars/alex-morgan.png" width="44" height="44" style="border-radius:50%;object-fit:cover;display:block;" alt="Alex Morgan" />
      </td>
      <td valign="middle" style="padding-left:12px;">
        <div style="font-weight:600;font-size:15px;color:#1a1a1a;line-height:1.2;">Alex Morgan</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">Moving Specialist · LervIT Calgary</div>
      </td>
    </tr>
  </table>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
    ${header}
    ${paragraphs}
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <p style="font-size:12px;color:#999;">
      LervIT Technologies · Calgary, AB ·
      <a href="${appBase}/unsubscribe">Unsubscribe</a>
    </p>
  </div>`;
  try {
    await sendResendEmail({
      from: EMAIL_SENDERS.OUTREACH,
      to,
      replyTo: ALEX_REPLY_TO,
      subject,
      html,
      listUnsubscribeUrl: `${appBase}/unsubscribe`,
    });
    logger.info({ to, subject }, 'Alex: email sent');
    return true;
  } catch (err) {
    logger.error({ err }, 'Alex: Resend threw');
    return false;
  }
}

export const alex = new AlexAgent();
