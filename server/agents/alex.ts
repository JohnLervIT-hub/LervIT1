/**
 * Alex Morgan (CLOSER-D) — lead conversion + abandoned-booking recovery.
 *
 * Actions:
 *   - `convert_lead`      : first touch on a new lead + schedule touches 2/3/4
 *                           on the closer-d BullMQ queue with 24/48/72h delays.
 *   - `send_touch`        : execute one delayed touch (2/3/4). Marks cold at 4.
 *   - `recover_abandoned` : one-off recovery email for an abandoned booking.
 *   - `cancellation_recovery`     : win-back email the moment a customer cancels,
 *                           + a follow-up SMS scheduled 48h out on closer-d.
 *   - `cancellation_recovery_sms` : the delayed half of the above.
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
import { notificationService, sendResendEmail, formatCalgaryDate, EMAIL_SENDERS } from '../notifications';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';
import { hasSmsConsent } from '../lib/smsConsent';
import { wasContactedToday, wasEverSmsed } from './dedupe';

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

// Post-cancellation SMS lands two days out: long enough that it doesn't read as
// a pitch stapled to the cancellation email, short enough to catch a move that
// got rescheduled rather than called off.
const CANCELLATION_SMS_DELAY_MS = 48 * 60 * 60 * 1000;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Trimmed street/city string suitable for prompt injection ("71 Cityside Terrace NE").
type QuoteAddresses = {
  pickupAddress: string | null;
  dropoffAddress: string | null;
  shortId: string | null;
  vehicleType: string | null;
};

// quotes.vehicleType stores the raw tier key the quote form derived from the
// vision result ('car' | 'pickup' | 'van' | 'truck') — NOT Nova's A/B/C/E
// vehicle classes, so these labels can't be shared with nova.ts. Nullable in
// the DB (legacy quotes, and item-less quotes post null), so every read needs
// a fallback.
const QUOTE_VEHICLE_LABELS: Record<string, string> = {
  car: 'SUV',
  pickup: 'Pickup Truck',
  van: 'Cargo Van',
  truck: 'Moving Truck',
};

async function fetchQuoteAddresses(quoteId: string | null | undefined): Promise<QuoteAddresses | null> {
  if (!quoteId) return null;
  try {
    const [row] = await db
      .select({
        pickupAddress: quotes.pickupAddress,
        dropoffAddress: quotes.dropoffAddress,
        shortId: quotes.shortId,
        vehicleType: quotes.vehicleType,
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

// users has no firstName column — only `name` — so every greeting derives from it.
function firstNameOf(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'there';
}

/**
 * The `Quote:` line in lead.notes, and whether it is a real price or a bracket.
 *
 * POST /api/leads/capture writes one of two forms, because a price computed
 * before the photos is the load-size bucket's price rather than the move's:
 *   confirmed -> "Quote: $124.79 CAD (confirmed by photo analysis)"
 *   estimate  -> "Quote: Est. $48–$193 depending on load (photos not yet reviewed)"
 *
 * Outreach must never state an unconfirmed figure as a quote — that is how a
 * $124.79 email turned into a $54.68 invoice.
 */
type QuoteNote =
  /** Vision measured the load; this figure is safe to call a quote. */
  | { kind: 'confirmed'; display: string }
  /** Not measured. `display` is a bracket to show, or null when the note holds
   *  only a bare figure we must not restate at all. */
  | { kind: 'estimate'; display: string | null };

export function parseQuoteNote(notes: string | null | undefined): QuoteNote | null {
  const line = notes?.match(/^Quote: (.+)$/m)?.[1]?.trim();
  if (!line) return null;

  const bracket = line.match(/\$[\d,]+\s*[–-]\s*\$[\d,]+/);
  // Collapse whitespace: the SMS path has ~60 characters to work in.
  if (bracket) return { kind: 'estimate', display: bracket[0].replace(/\s+/g, '') };

  const figure = line.match(/^\$[\d.]+(?:\s*CAD)?/);
  if (!figure) return null;
  if (/confirmed by photo analysis/i.test(line)) {
    return { kind: 'confirmed', display: figure[0] };
  }
  // Legacy note, written before provenance was recorded: a bare figure that may
  // well be a load-size fallback. Flagged as an estimate with nothing to quote,
  // so outreach drops the money rather than restating a number that may be 2x
  // the invoice. Errs cautious on the minority that were actually measured.
  return { kind: 'estimate', display: null };
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

// SMS_STOP_SUFFIX kept short (GSM-7) — CTIA A2P 10DLC requires an opt-out
// affordance on cold/marketing SMS.
const SMS_STOP_SUFFIX = ' Reply STOP to opt out or HELP for info.';
const SMS_PREFIX = 'Hi, Alex from LervIT here! ';

// Fold a message down to plain ASCII. A single non-GSM character (a smart quote,
// an em-dash, an emoji) silently flips the whole message to UCS-2, which cuts the
// per-segment budget from 153 characters to 67.
function toGsm7(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Compose an SMS from Claude-generated body + a deterministic booking link + opt-out
// suffix, respecting the 160-char GSM-7 single-segment budget. Strips non-GSM
// characters so smart quotes / em-dashes don't silently force UCS-2 encoding.
export function buildAlexSms(claudeBody: string, bookingLink: string, prefix: string = SMS_PREFIX): string {
  const cleanBody = toGsm7(claudeBody);

  const separator = '\n';
  const reserved = prefix.length + separator.length + bookingLink.length + SMS_STOP_SUFFIX.length;
  const bodyBudget = Math.max(0, 160 - reserved);

  let truncatedBody = cleanBody;
  if (cleanBody.length > bodyBudget) {
    truncatedBody = cleanBody.slice(0, bodyBudget).replace(/\s+\S*$/, '').trimEnd();
  }

  return `${prefix}${truncatedBody}${separator}${bookingLink}${SMS_STOP_SUFFIX}`;
}

/**
 * Post-cancellation win-back copy.
 *
 * Deliberately NOT Claude-generated, unlike the rest of Alex's outreach: this
 * email goes out seconds after a customer cancelled, often on a bad day (see
 * the "Personal emergency" branch). The wording is reviewed copy and stays
 * reviewed copy — a model paraphrasing sympathy here is all downside.
 */
const CANCELLATION_REASON_PARAGRAPHS: Record<string, string> = {
  'Plans changed':
    "If your plans come back together, we're here whenever you need us.",
  'Found another moving company':
    "We hope your move goes smoothly! If you ever want to compare or need a backup, we're always here.",
  'Mover is taking too long':
    "We're sorry for the wait — this isn't the experience we want for you. We're actively working to improve response times and would love to make it right if you give us another chance.",
  'Wrong move details entered':
    "If you'd like to rebook with the correct details, it only takes a moment at lervit.com.",
  'Personal emergency':
    "We hope everything is okay. When you're ready, we're here to help with your move — no rush.",
  Other:
    "We'd love to hear how we could have done better. Feel free to reply to this email anytime.",
};

const CANCELLATION_REASON_FALLBACK = CANCELLATION_REASON_PARAGRAPHS.Other;

export interface CancellationRecoveryContext {
  firstName: string;
  moveDate: string;
  cancellationReason?: string | null;
  cancellationComments?: string | null;
}

export function buildCancellationRecoveryEmail(
  ctx: CancellationRecoveryContext,
): { subject: string; body: string } {
  const reasonParagraph =
    CANCELLATION_REASON_PARAGRAPHS[(ctx.cancellationReason ?? '').trim()] ??
    CANCELLATION_REASON_FALLBACK;

  // Free-text the customer typed into the exit survey — the only untrusted input
  // that has ever reached an Alex email body, which is why sendAlexEmail now
  // HTML-escapes before wrapping paragraphs.
  const comments = ctx.cancellationComments?.trim();
  const commentsParagraph = comments
    ? `\n\nYou mentioned: '${comments}' — thank you for sharing that with us.`
    : '';

  const body = `Hi ${ctx.firstName},

We noticed you cancelled your upcoming move scheduled for ${ctx.moveDate}. We completely understand that plans change, and we want to make sure your experience with LervIT was a positive one.

${reasonParagraph}${commentsParagraph}

If you ever need moving help in the future, we'd love to be your first call. You can rebook anytime at lervit.com — it takes less than 2 minutes.

Warm regards,
The LervIT Team
Calgary's trusted moving platform`;

  return { subject: `We're sorry to see you go, ${ctx.firstName} 💙`, body };
}

// The 48h follow-up. Win-back marketing to a former customer rather than a
// transactional booking update, so it carries SMS_STOP_SUFFIX like Alex's other
// outreach. The trailing 📦 is dropped by toGsm7 — keeping it would push a
// 156-character message to three UCS-2 segments for one emoji.
//
// Unlike buildAlexSms this does not truncate: the copy is fixed, so only the
// first name varies, and a name over 9 characters spills into a second GSM-7
// segment. Two segments beats cutting somebody's name in half.
export function buildCancellationRecoverySms(firstName: string): string {
  const body =
    `Hey ${firstName}, just checking in — if your moving plans are back on, ` +
    `we're ready to help. Book in 2 minutes at lervit.com`;
  return toGsm7(body) + SMS_STOP_SUFFIX;
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
interface CancellationRecoveryInput {
  bookingId: string;
  cancellationReason?: string | null;
  cancellationComments?: string | null;
}
interface CancellationRecoverySmsInput {
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
      case 'cancellation_recovery':
        return this.cancellationRecovery(input as CancellationRecoveryInput, options);
      case 'cancellation_recovery_sms':
        return this.cancellationRecoverySms(input as CancellationRecoverySmsInput, options);
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

    // An inbound STOP with no email address leaves nothing we may send. The
    // send-time gate already blocks the SMS; skipping here keeps the lead from
    // being picked up, retried and logged every single day.
    if (lead.smsOptedOut && !lead.contactEmail) {
      logger.info({ leadId: leadId }, 'Alex.convertLead: lead opted out of SMS and has no email — unreachable');
      return { skipped: true, reason: 'sms_opted_out_no_email' };
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
    const quoteNote = parseQuoteNote(notes);
    // The one instruction in this prompt that must not be paraphrased: an
    // unmeasured price may only ever appear as a bracket, never as "your quote".
    const priceDirective = quoteNote?.kind === 'confirmed'
      ? `${quoteNote.display} — measured from their photos. You may refer to it as "your quote of ${quoteNote.display}".`
      : quoteNote?.display
        ? `NOT CONFIRMED — their photos have not been analysed yet. If you mention money at all, use this exact phrasing and nothing else: "your estimate of ${quoteNote.display} (confirmed after photo review)". Never state a single figure, and never call it a quote or a final price.`
        : `NOT CONFIRMED and no safe figure to quote. Do NOT mention any dollar amount anywhere in this email. Talk about the move itself and invite them to get their exact price after a photo review.`;
    const items = notes.match(/Items: ([^\n]+)/)?.[1];
    // Live quote wins; the notes regex covers leads captured before quoteContext
    // carried a vehicle label (and Scout-scraped leads with no quote at all).
    const vehicle =
      QUOTE_VEHICLE_LABELS[quoteAddresses?.vehicleType ?? ''] ??
      notes.match(/Vehicle: ([^\n]+)/)?.[1];
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
  Price: ${priceDirective}
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

    // An inbound STOP with no email address leaves nothing we may send. The
    // send-time gate already blocks the SMS; skipping here keeps the lead from
    // being picked up, retried and logged every single day.
    if (lead.smsOptedOut && !lead.contactEmail) {
      logger.info({ leadId: leadId }, 'Alex.sendTouch: lead opted out of SMS and has no email — unreachable');
      return { skipped: true, reason: 'sms_opted_out_no_email' };
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
    // isFirstSms carries the published-contact exemption's one-message limit.
    const isFirstSms = !(await wasEverSmsed({ entityId: leadId, entityType: 'lead' }));
    const smsAllowed =
      touchNumber === 2 && lead.contactPhone && hasSmsConsent(lead, { isFirstSms });

    if (touchNumber === 2 && lead.contactPhone && !smsAllowed) {
      logger.info({ leadId, sourceChannel: lead.sourceChannel }, 'Alex.sendTouch: SMS suppressed — no consent, falling through to email');
    }

    if (smsAllowed) {
      channel = 'sms';
      const smsQuote = parseQuoteNote(lead.notes);
      // Budget: 160 - prefix(28) - newline(1) - link(~30) - stop(40) ≈ 60
      const claudeBody = await this.callClaude(
        `Write an SMS body only (no greeting, no URL, no opt-out language).
Length: STRICTLY under 60 characters.
${smsQuote?.kind === 'confirmed'
          ? `Reference their quote of ${smsQuote.display}.`
          : smsQuote?.display
            // A bracket, not a price: "est. $48-$193" fits the budget where the
            // full "(confirmed after photo review)" caveat does not.
            ? `Their price is NOT confirmed yet. If you mention money, write exactly "est. ${smsQuote.display}" — never a single figure.`
            : 'Follow up on their move quote. Do NOT mention any dollar amount.'}
Mention promo code LERVIT10 for 10% off if it fits within the character budget.
The greeting "Hi, Alex from LervIT here! ", a booking link, and "Reply STOP to opt out or HELP for info." are appended automatically — do NOT include them.
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
      // Email only — the SMS branch above is capped at 60 chars and can't carry this.
      const touchVehicle =
        QUOTE_VEHICLE_LABELS[quoteAddresses?.vehicleType ?? ''] ??
        lead.notes?.match(/Vehicle: ([^\n]+)/)?.[1];
      const raw = await this.callClaude(
        `You are Alex Morgan from LervIT Calgary.
Write a ${isLast ? 'final' : 'follow-up'} email.
${isLast ? 'Create gentle urgency — this is the last outreach.' : 'Use a different angle from the first email.'}
Warm, brief, not pushy. 2-3 paragraphs.
Format: first line "SUBJECT: <subject>", blank line, then the body.`,
        `Lead context: ${lead.notes ?? 'Calgary move inquiry'}
Touch number: ${touchNumber} of 4
Vehicle: ${touchVehicle ?? 'appropriate vehicle'}
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

    // A lead only counts as touched when the provider accepted the message.
    // Advancing on a failed send burned the touch: status went to 'contacted',
    // touchpoints incremented, and the lead was never written to again.
    if (!delivered) {
      logger.warn(
        { leadId, channel, touchNumber, sourceChannel: lead.sourceChannel },
        'Alex.sendTouch: send failed — leaving lead state unchanged',
      );
    } else {
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
    }

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

  /**
   * Win-back email the moment a customer cancels, plus a 48h SMS follow-up
   * queued on closer-d. Triggered from the customer-cancel PATCH.
   */
  private async cancellationRecovery(
    { bookingId, cancellationReason, cancellationComments }: CancellationRecoveryInput,
    options: AgentRunOptions = {},
  ) {
    // Dedupe: one recovery per booking per day. A cancel PATCH can legitimately
    // be replayed (client retry, admin re-cancel) and each replay re-triggers us.
    const dedupe = await wasContactedToday({
      entityId: bookingId,
      entityType: 'booking',
      eventTypes: ['booking.cancellation_recovery_sent'],
    });
    if (dedupe.contacted) {
      return { skipped: true, reason: 'already_recovered_today', lastEvent: dedupe.lastEvent };
    }

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) return { skipped: true, reason: 'booking not found' };
    const [customer] = await db.select().from(users).where(eq(users.id, booking.customerId)).limit(1);
    if (!customer?.email) return { skipped: true, reason: 'no customer email' };

    const firstName = firstNameOf(customer.name);
    const { subject, body } = buildCancellationRecoveryEmail({
      firstName,
      moveDate: formatCalgaryDate(booking.preferredDate, 'your scheduled date'),
      cancellationReason,
      cancellationComments,
    });

    if (options.dryRun) {
      return {
        dryRun: true,
        wouldContact: [bookingId],
        preview: {
          to: customer.email,
          channel: 'email',
          subject,
          body,
          smsIn48h: customer.phone ? buildCancellationRecoverySms(firstName) : null,
        },
      };
    }

    const delivered = await sendAlexEmail(customer.email, subject, body);

    // Schedule the 48h SMS. No phone means no follow-up — and no queue means no
    // delay primitive at all, so log loudly rather than sending it immediately.
    let smsScheduled = false;
    if (customer.phone) {
      const queue = createAgentQueue(QUEUE_NAMES.CLOSER_D);
      if (queue) {
        try {
          await queue.add(
            'cancellation_recovery_sms',
            { bookingId },
            { delay: CANCELLATION_SMS_DELAY_MS },
          );
          smsScheduled = true;
        } catch (err) {
          logger.error({ err, bookingId }, 'Alex.cancellationRecovery: failed to schedule 48h SMS');
        }
      } else {
        logger.warn({ bookingId }, 'Alex.cancellationRecovery: closer-d queue unavailable — 48h SMS not scheduled');
      }
    }

    await emitEvent('booking.cancellation_recovery_sent', 'booking', bookingId, {
      agentName: this.name,
      customerId: booking.customerId,
      cancellationReason: cancellationReason ?? null,
      delivered,
      smsScheduled,
    });

    return { success: true, delivered, smsScheduled };
  }

  /** The delayed half of cancellation_recovery — runs 48h after the cancel. */
  private async cancellationRecoverySms(
    { bookingId }: CancellationRecoverySmsInput,
    options: AgentRunOptions = {},
  ) {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) return { skipped: true, reason: 'booking not found' };

    // Two days is long enough for the customer to have rebooked. Texting "if your
    // plans are back on" to somebody who already booked again reads as a system
    // that isn't paying attention.
    if (booking.status !== 'cancelled') {
      logger.info({ bookingId, status: booking.status }, 'Alex.cancellationRecoverySms: no longer cancelled — skipping');
      return { skipped: true, reason: `booking is ${booking.status}` };
    }

    const [customer] = await db.select().from(users).where(eq(users.id, booking.customerId)).limit(1);
    if (!customer?.phone) return { skipped: true, reason: 'no customer phone' };

    const message = buildCancellationRecoverySms(firstNameOf(customer.name));

    if (options.dryRun) {
      return {
        dryRun: true,
        wouldContact: [bookingId],
        preview: { to: customer.phone, channel: 'sms', body: message },
      };
    }

    const delivered = await notificationService.sendSMS({
      to: customer.phone,
      message,
      type: 'booking_update',
    });

    await emitEvent('booking.cancellation_recovery_sms_sent', 'booking', bookingId, {
      agentName: this.name,
      customerId: booking.customerId,
      delivered,
    });

    return { success: true, channel: 'sms', delivered };
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
    const isFirstSms = !(await wasEverSmsed({ entityId: lead.id, entityType: 'lead' }));
    if (!hasSmsConsent(lead, { isFirstSms })) {
      logger.info({ leadId: lead.id, sourceChannel: lead.sourceChannel }, 'Alex.sendManualSms: no lead consent — skipping SMS');
      return { skipped: true, reason: 'no_sms_consent' };
    }

    const baseUrl = (process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim();
    const quoteAddresses = await fetchQuoteAddresses(lead.quoteId);
    const bookingLink = bookingLinkFor(baseUrl, lead, quoteAddresses);
    const pickupArea = trimArea(quoteAddresses?.pickupAddress);
    const dropoffArea = trimArea(quoteAddresses?.dropoffAddress);
    const smsQuote = parseQuoteNote(lead.notes);

    const claudeBody = await this.callClaude(
      `Write an SMS body only (no greeting, no URL, no opt-out language).
Length: STRICTLY under 60 characters.
${smsQuote?.kind === 'confirmed'
          ? `Reference their quote of ${smsQuote.display}.`
          : smsQuote?.display
            // A bracket, not a price: "est. $48-$193" fits the budget where the
            // full "(confirmed after photo review)" caveat does not.
            ? `Their price is NOT confirmed yet. If you mention money, write exactly "est. ${smsQuote.display}" — never a single figure.`
            : 'Follow up on their move quote. Do NOT mention any dollar amount.'}
Mention promo code LERVIT10 for 10% off if it fits within the character budget.
The greeting "Hi, Alex from LervIT here! ", a booking link, and "Reply STOP to opt out or HELP for info." are appended automatically — do NOT include them.
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

    if (!delivered) {
      logger.warn(
        { leadId: lead.id, sourceChannel: lead.sourceChannel },
        'Alex.sendManualSms: send failed — leaving lead state unchanged',
      );
    } else {
      await db
        .update(leads)
        .set({
          status: 'contacted',
          touchpoints: (lead.touchpoints ?? 0) + 1,
          lastTouchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(leads.id, lead.id));
    }

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  // Bodies reaching here are plain text (Claude drafts, and the cancellation
  // template's echoed customer comment), so escape before wrapping: the comment
  // is customer-typed and must not be able to inject markup into the email.
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
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
