/**
 * Jordan Hayes (VETTER) — mover recruitment / vetting agent.
 *
 * Runs on the `vetter` BullMQ queue. Ryan Brooks (HUNTER-S) hands off
 * high-intent supply-side leads; Jordan does the first personalised touch
 * and schedules 3 follow-ups at +24h / +48h / +72h. Structure mirrors
 * Alex Morgan (CLOSER-D), which is the demand-side conversion counterpart.
 *
 * Emails are persona-branded ("Jordan Hayes | LervIT <jordan.hayes@lervit.com>")
 * so we call Resend directly rather than notificationService.sendEmail
 * (which forces the generic "LervIT <support@lervit.com>" sender). SMS
 * still goes through notificationService — that handles E.164 normalisation
 * and the dev-mode block.
 */

import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { BaseAgent, type AgentRunOptions } from './base';
import { db } from '../db';
import { leads } from '@shared/schema';
import { emitEvent } from '../events';
import { notificationService, sendResendEmail, EMAIL_SENDERS } from '../notifications';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';
import { wasContactedToday, wasEverSmsed } from './dedupe';
import { JAILBREAK_PREAMBLE, sanitizeForPrompt } from '../lib/promptSanitizer';
import { hasSmsConsent } from '../lib/smsConsent';

const JORDAN_EMAIL_MODEL = 'claude-sonnet-4-6';
const JORDAN_SMS_MODEL = 'claude-haiku-4-5-20251001';
const JORDAN_EMAIL = process.env.JORDAN_EMAIL?.trim() || 'jordan.hayes@lervit.com';
const JORDAN_FROM = `Jordan Hayes | LervIT <${JORDAN_EMAIL}>`;
const JORDAN_REPLY_TO = 'support@lervit.com';

export const TOUCH_DELAY_MS: Record<2 | 3 | 4, number> = {
  2: 24 * 60 * 60 * 1000,
  3: 48 * 60 * 60 * 1000,
  4: 72 * 60 * 60 * 1000,
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/** Appended to every Jordan SMS; budgeted out of the 160-char single segment. */
const SMS_STOP_SUFFIX = '\n\nReply STOP to opt out.';
const SMS_SIGNUP_LABEL = '\n\nSign up here: ';
// Prepended in code, never left to the model. CTIA/CASL both require the sender
// to be identified in the message itself, and a prompt instruction is not a
// guarantee — the model dropped the greeting often enough that Alex has always
// prepended its own. Matches SMS_PREFIX in ./alex.
const SMS_PREFIX = 'Hi, Jordan from LervIT here! ';
// Greeting the model may still emit despite being told not to; stripped so the
// message cannot introduce Jordan twice.
const MODEL_GREETING = /^\s*(?:hi|hey|hello)[,!]?\s*(?:i'?m\s+)?jordan(?:\s+hayes)?(?:\s+from\s+lervit)?\s*(?:here)?[!,.:]*\s*/i;

/**
 * The mover application page. It's a marketing-site route, not an app route, so
 * it tracks MARKETING_SITE_URL rather than APP_BASE_URL — same page Nova hands
 * DM candidates. Read at call time so env load order can't freeze a stale value.
 */
function moverApplyLink(): string {
  return `${(process.env.MARKETING_SITE_URL ?? 'https://lervit.com').trim()}/become-a-mover`;
}

/**
 * Compose a Jordan SMS from the Claude-written body plus a deterministic signup
 * link and the opt-out suffix, inside the 160-char GSM-7 single segment.
 *
 * The link is appended here instead of being left to the model so truncation can
 * never eat it: reserving both the URL line and the suffix up front is the whole
 * point. Non-GSM characters are stripped so a smart quote or emoji can't silently
 * force UCS-2 (and a 70-char segment). Mirrors buildAlexSms in ./alex.
 */
export function buildJordanSms(claudeBody: string): string {
  const signupUrl = moverApplyLink();
  const urlLine = `${SMS_SIGNUP_LABEL}${signupUrl}`;

  const cleanBody = claudeBody
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x00-\x7F]/g, '')
    // The model still inlines a link now and then; drop it so we don't send two.
    // A labelled one goes with its label, or the body ends "...sign up here".
    .replace(/[\s-]*(?:sign\s*up|apply|register|join)[^:]{0,12}:\s*https?:\/\/\S+/gi, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Tidies the "Sign up here:" the model leaves behind once its URL is gone.
    .replace(/[\s:;,.-]+$/, '')
    // Drop the greeting if the model emitted one — SMS_PREFIX supplies it.
    .replace(MODEL_GREETING, '');

  const bodyBudget = jordanBodyBudget();
  const body =
    cleanBody.length > bodyBudget
      ? cleanBody.slice(0, bodyBudget).replace(/\s+\S*$/, '').trimEnd()
      : cleanBody;

  return `${SMS_PREFIX}${body}${urlLine}${SMS_STOP_SUFFIX}`;
}

/**
 * Characters left for the model's body once the prefix, signup line and
 * opt-out suffix are reserved. Interpolated into the prompts so the budget
 * cannot drift away from the constants above.
 *
 * The suffix deliberately omits "or HELP for info": between the 29-char
 * greeting and the signup URL it left 41 characters for the message itself,
 * which truncated mid-sentence. HELP is answered by the inbound webhook
 * whether or not the outbound text advertises it.
 */
export function jordanBodyBudget(): number {
  const reserved =
    SMS_PREFIX.length +
    SMS_SIGNUP_LABEL.length +
    moverApplyLink().length +
    SMS_STOP_SUFFIX.length;
  return Math.max(0, 160 - reserved);
}

interface OnboardCandidateInput {
  leadId: string;
  channelOverride?: 'email' | 'sms';
}
interface SendTouchInput {
  leadId: string;
  touchNumber: number;
}

export class JordanAgent extends BaseAgent {
  name = 'Jordan Hayes';
  code = 'vetter';

  protected async execute(
    action: string,
    input: Record<string, any>,
    options: AgentRunOptions = {},
  ): Promise<any> {
    switch (action) {
      case 'onboard_candidate':
        return this.onboardCandidate(input as OnboardCandidateInput, options);
      case 'send_touch':
        return this.sendTouch(input as SendTouchInput, options);
      default:
        throw new Error(`Jordan: unknown action "${action}"`);
    }
  }

  private async onboardCandidate({ leadId, channelOverride }: OnboardCandidateInput, options: AgentRunOptions = {}) {
    const lead = await this.getLead(leadId);
    if (!lead) throw new Error(`Jordan: lead ${leadId} not found`);
    if (lead.status === 'converted' || lead.status === 'cold') {
      return { skipped: true, reason: `lead is ${lead.status}` };
    }

    // An inbound STOP with no email address leaves nothing we may send. The
    // send-time gate already blocks the SMS; skipping here keeps the lead from
    // being picked up, retried and logged every single day.
    if (lead.smsOptedOut && !lead.contactEmail) {
      logger.info({ leadId: leadId }, 'Jordan.onboardCandidate: lead opted out of SMS and has no email — unreachable');
      return { skipped: true, reason: 'sms_opted_out_no_email' };
    }

    if (!lead.contactEmail && !lead.contactPhone) {
      logger.info({ leadId }, 'Jordan: no contact details — skipping');
      return { skipped: true, reason: 'no_contact_details' };
    }

    // CASL: an explicit SMS override still needs consent. Without it, fall
    // through to the email flow below when we have an address to write to.
    let smsBlockedNoConsent = false;
    if (channelOverride === 'sms') {
      if (!lead.contactPhone) {
        return { skipped: true, reason: 'no_phone_for_sms_override' };
      }
      const isFirstSms = !(await wasEverSmsed({ entityId: leadId, entityType: 'lead' }));
      if (hasSmsConsent(lead, { isFirstSms }) || !lead.contactEmail) {
        return this.sendManualSms(lead, options);
      }
      smsBlockedNoConsent = true;
      logger.warn(
        { leadId, source: lead.sourceChannel },
        '[Jordan] SMS blocked — no CASL consent, trying email fallback',
      );
    }
    if (channelOverride === 'email' && !lead.contactEmail) {
      return { skipped: true, reason: 'no_email_for_email_override' };
    }

    // Dedupe: at most one Jordan touch per candidate per day.
    const dedupe = await wasContactedToday({
      entityId: leadId,
      entityType: 'lead',
      eventTypes: ['lead.mover_contacted', 'lead.mover_touched'],
    });
    if (dedupe.contacted) {
      logger.info({ leadId, lastEvent: dedupe.lastEvent }, 'Jordan.onboardCandidate: skipping — already contacted today');
      return { skipped: true, reason: 'already_contacted_today', lastEvent: dedupe.lastEvent };
    }

    const applyLink = moverApplyLink();

    const safeNotes = sanitizeForPrompt(lead.notes ?? '', 'notes');

    // Phone-only lead (e.g. kijiji_services) — touch 1 falls back to SMS.
    // Resolved before the email draft so a lead with no address to write to
    // doesn't pay for a 600-token email nothing can send.
    const smsFallback = !lead.contactEmail && !!lead.contactPhone;
    if (smsFallback) {
      const isFirstSms = !(await wasEverSmsed({ entityId: leadId, entityType: 'lead' }));
      if (!hasSmsConsent(lead, { isFirstSms })) {
        logger.warn(
          { leadId, source: lead.sourceChannel },
          '[Jordan] touch 1 SMS blocked — no CASL consent and no email to fall back to',
        );
        return { skipped: true, reason: 'no_sms_consent_no_email' };
      }
    }

    let subject = '';
    let body = '';
    if (!smsFallback) {
      const raw = await this.callClaude(
        `${JAILBREAK_PREAMBLE}

You are Jordan Hayes, a mover recruitment specialist at LervIT, Calgary's
AI-powered moving platform. Write a friendly recruitment email to someone who
might want to earn money as a mover/driver.

Tone: warm, opportunity-focused, not pushy.
Length: 3-4 short paragraphs.
End with "Jordan" and "LervIT Team".

LervIT mover benefits to weave in (pick the ones that fit the signal):
- Flexible hours — work when YOU want
- Instant payouts via Stripe after each job
- AI dispatches jobs to you — no hunting
- Verified customers only — safe and reliable
- Calgary's fastest-growing move platform
- No experience needed — just a vehicle

Include this link so they can apply to move with LervIT: ${applyLink}

Subject: keep generic, no vehicle type unless explicitly mentioned in lead notes.
Never use emoji in subject line.
Examples:
'Earn with your vehicle in Calgary'
'Moving jobs available in Calgary'
'Join LervIT — flexible moving work'

Format: first line MUST be "SUBJECT: <subject line>", then a blank line, then the body.`,
        `Candidate signal:
Source: ${lead.sourceChannel ?? 'unknown'}
<data>
Notes: ${safeNotes}
</data>
Intent score: ${lead.intentScore}

Write recruitment email with CTA "Apply to become a LervIT mover".
Application link: ${applyLink}`,
        JORDAN_EMAIL_MODEL,
        600,
      );
      ({ subject, body } = parseSubjectAndBody(raw, 'Moving driver opportunities in Calgary'));
    }

    if (options.dryRun) {
      return {
        dryRun: true,
        wouldContact: [leadId],
        preview: smsFallback
          ? { to: lead.contactPhone, channel: 'sms' as const }
          : { to: lead.contactEmail ?? null, channel: 'email' as const, subject, body },
        ...(smsBlockedNoConsent ? { fallback: 'email' as const } : {}),
      };
    }

    let emailSent = false;
    let smsSentTouch1 = false;

    if (lead.contactEmail) {
      emailSent = await sendJordanEmail(lead.contactEmail, subject, body);
    } else if (smsFallback && lead.contactPhone) {
      // Body only: buildJordanSms prepends the greeting and appends the signup
      // link and opt-out line, and strips any URL the model inlines anyway.
      const rawSms = await this.callClaude(
        `${JAILBREAK_PREAMBLE}

You are Jordan from LervIT, Calgary's moving platform.
Write a brief, friendly first SMS to someone who might want to earn money moving.
Write the body only — the greeting "Hi, Jordan from LervIT here! ", a signup
link and an opt-out line are all appended for you. Do NOT include them.
Not pushy. STRICTLY under ${jordanBodyBudget()} characters.
Return only the SMS text, nothing else.`,
        `<data>
Source: ${lead.sourceChannel ?? 'unknown'}
Candidate context: ${safeNotes || 'Calgary mover candidate'}
</data>`,
        JORDAN_SMS_MODEL,
        120,
      );
      smsSentTouch1 = await notificationService.sendSMS({
        to: lead.contactPhone,
        message: buildJordanSms(rawSms),
        type: 'job_alert',
      });
    }

    // Only a send the provider accepted counts as touch 1. Advancing on a
    // failure marked the candidate 'contacted', consumed one of the four
    // touches and scheduled three follow-ups for a message that never
    // arrived. Matches the guards in sendTouch and sendManualSms.
    if (!emailSent && !smsSentTouch1) {
      logger.warn({ leadId }, 'Jordan.onboardCandidate: no channel delivered — not advancing lead state');
      // Hand the candidate back. Ryan stamps assignedAgent when it routes and
      // its routable query needs it null, so leaving it set here is what
      // stranded the pre-fix leads: claimed by Jordan, touched by nobody.
      await db
        .update(leads)
        .set({ assignedAgent: null, updatedAt: new Date() })
        .where(eq(leads.id, leadId));
      return { skipped: true, reason: 'no_reachable_channel' };
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

    // Schedule 3 follow-up touches on the vetter queue (2/3/4 at +24/+48/+72h).
    const queue = createAgentQueue(QUEUE_NAMES.VETTER);
    if (queue) {
      for (const touchNumber of [2, 3, 4] as const) {
        try {
          await queue.add(
            'send_touch',
            { leadId, touchNumber },
            { delay: TOUCH_DELAY_MS[touchNumber] },
          );
        } catch (err) {
          logger.error({ err, leadId, touchNumber }, 'Jordan: failed to schedule touch');
        }
      }
    } else {
      logger.warn({ leadId }, 'Jordan: vetter queue unavailable — follow-ups not scheduled');
    }

    await this.scheduleNovaColdCallFollowUp(lead);

    // The channel we attempted, not the one that landed: a failed SMS logged as
    // 'email' would misattribute the touch in every downstream count.
    const channel: 'email' | 'sms' = smsFallback ? 'sms' : 'email';

    await emitEvent('lead.mover_contacted', 'lead', leadId, {
      touchNumber: 1,
      channel,
      emailSent,
      smsSentTouch1,
      agentName: this.name,
      ...(smsBlockedNoConsent ? { smsSkipped: true, fallbackReason: 'no_sms_consent' } : {}),
    });

    return {
      success: true,
      touchNumber: 1,
      channel,
      emailSent,
      smsSentTouch1,
      ...(smsBlockedNoConsent
        ? { smsSkipped: true, fallback: 'email' as const, fallbackReason: 'no_sms_consent' }
        : {}),
    };
  }

  private async sendTouch({ leadId, touchNumber }: SendTouchInput, options: AgentRunOptions = {}) {
    if (touchNumber < 2 || touchNumber > 4) {
      throw new Error(`Jordan.sendTouch: invalid touchNumber ${touchNumber}`);
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
      logger.info({ leadId: leadId }, 'Jordan.sendTouch: lead opted out of SMS and has no email — unreachable');
      return { skipped: true, reason: 'sms_opted_out_no_email' };
    }

    const dedupe = await wasContactedToday({
      entityId: leadId,
      entityType: 'lead',
      eventTypes: ['lead.mover_contacted', 'lead.mover_touched'],
    });
    if (dedupe.contacted) {
      logger.info({ leadId, touchNumber, lastEvent: dedupe.lastEvent }, 'Jordan.sendTouch: skipping — already contacted today');
      return { skipped: true, reason: 'already_contacted_today', lastEvent: dedupe.lastEvent };
    }

    const applyLink = moverApplyLink();
    let channel: 'email' | 'sms' = 'email';
    let delivered = false;

    // CASL: touch 2 texts only leads whose source implies express consent.
    // Everything else drops through to the email branch below. isFirstSms
    // carries the published-contact exemption's one-message limit.
    const isFirstSms = !(await wasEverSmsed({ entityId: lead.id, entityType: 'lead' }));
    const smsBlockedNoConsent =
      touchNumber === 2 && !!lead.contactPhone && !hasSmsConsent(lead, { isFirstSms });
    if (smsBlockedNoConsent) {
      logger.warn(
        { leadId: lead.id, source: lead.sourceChannel },
        '[Jordan] SMS blocked — no CASL consent, trying email fallback',
      );
    }

    if (touchNumber === 2 && lead.contactPhone && !smsBlockedNoConsent) {
      channel = 'sms';
      const rawSms = await this.callClaude(
        `${JAILBREAK_PREAMBLE}

You are Jordan from LervIT, Calgary's moving platform.
Write a brief, friendly SMS follow-up to
someone who might want to earn money moving.
Write the body only — the greeting "Hi, Jordan from LervIT here! ", a signup
link and an opt-out line are all appended for you. Do NOT include them.
Not pushy. STRICTLY under ${jordanBodyBudget()} characters.
Return only the SMS text, nothing else.`,
        `<data>
Follow up for: ${sanitizeForPrompt(lead.notes ?? 'Calgary mover candidate', 'notes')}
</data>`,
        JORDAN_SMS_MODEL,
        120,
      );
      const smsBody = buildJordanSms(rawSms);
      if (options.dryRun) {
        return {
          dryRun: true,
          wouldContact: [leadId],
          preview: { to: lead.contactPhone, channel: 'sms', body: smsBody },
        };
      }
      delivered = await notificationService.sendSMS({
        to: lead.contactPhone,
        message: smsBody,
        type: 'job_alert',
      });
    } else if (lead.contactEmail) {
      channel = 'email';
      const isLast = touchNumber === 4;
      const raw = await this.callClaude(
        `${JAILBREAK_PREAMBLE}

You are Jordan Hayes from LervIT Calgary — mover recruitment.
Write a ${isLast ? 'final' : 'follow-up'} recruitment email.
${isLast ? 'Create gentle urgency — this is the last outreach.' : 'Use a different angle from the first email.'}
Warm, brief, not pushy. 2-3 paragraphs.

Subject: keep generic, no vehicle type unless explicitly mentioned in lead notes.
Never use emoji in subject line.
Examples:
'Earn with your vehicle in Calgary'
'Moving jobs available in Calgary'
'Join LervIT — flexible moving work'

Format: first line "SUBJECT: <subject>", blank line, then the body.`,
        `<data>
Candidate context: ${sanitizeForPrompt(lead.notes ?? 'Calgary mover candidate', 'notes')}
</data>
Touch number: ${touchNumber} of 4
Application link: ${applyLink}`,
        JORDAN_EMAIL_MODEL,
        500,
      );
      const { subject, body } = parseSubjectAndBody(
        raw,
        isLast ? 'Following up on the LervIT driver opportunity' : 'Still interested in driving with LervIT?',
      );
      if (options.dryRun) {
        return {
          dryRun: true,
          wouldContact: [leadId],
          preview: { to: lead.contactEmail, channel: 'email', subject, body },
        };
      }
      delivered = await sendJordanEmail(lead.contactEmail, subject, body);
    } else {
      return {
        skipped: true,
        reason: smsBlockedNoConsent ? 'no_sms_consent_no_email' : 'no reachable channel',
        touchNumber,
      };
    }

    // Only a send the provider accepted counts as a touch. Advancing on a
    // failure marked the candidate 'contacted' and consumed one of the four
    // touches for a message that never arrived.
    if (!delivered) {
      logger.warn(
        { leadId, channel, touchNumber, source: lead.sourceChannel },
        '[Jordan] send failed — leaving lead state unchanged',
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

    await emitEvent('lead.mover_touched', 'lead', leadId, {
      touchNumber,
      channel,
      delivered,
      agentName: this.name,
      ...(smsBlockedNoConsent ? { smsSkipped: true, fallbackReason: 'no_sms_consent' } : {}),
    });

    return {
      success: true,
      touchNumber,
      channel,
      delivered,
      ...(smsBlockedNoConsent
        ? { smsSkipped: true, fallback: 'email' as const, fallbackReason: 'no_sms_consent' }
        : {}),
    };
  }

  private async sendManualSms(lead: typeof leads.$inferSelect, options: AgentRunOptions = {}) {
    if (!lead.contactPhone) return { skipped: true, reason: 'no_contact_phone' };
    const isFirstSms = !(await wasEverSmsed({ entityId: lead.id, entityType: 'lead' }));
    if (!hasSmsConsent(lead, { isFirstSms })) {
      logger.warn(
        { leadId: lead.id, source: lead.sourceChannel },
        '[Jordan] Skipping SMS — no CASL consent and no email to fall back to',
      );
      return { skipped: true, reason: 'no_sms_consent_no_email' };
    }

    const dedupe = await wasContactedToday({
      entityId: lead.id,
      entityType: 'lead',
      eventTypes: ['lead.mover_contacted', 'lead.mover_touched'],
    });
    if (dedupe.contacted) {
      logger.info({ leadId: lead.id, lastEvent: dedupe.lastEvent }, 'Jordan.sendManualSms: skipping — already contacted today');
      return { skipped: true, reason: 'already_contacted_today', lastEvent: dedupe.lastEvent };
    }

    const raw = await this.callClaude(
      `${JAILBREAK_PREAMBLE}

You are Jordan from LervIT, Calgary's moving platform.
Write a brief, friendly SMS to someone who might want to earn money moving.
Write the body only — the greeting "Hi, Jordan from LervIT here! ", a signup
link and an opt-out line are all appended for you. Do NOT include them.
Personalize from the candidate context.
Not pushy. STRICTLY under ${jordanBodyBudget()} characters.
Return only the SMS text, nothing else.`,
      `<data>
Candidate context: ${sanitizeForPrompt(lead.notes ?? 'Calgary mover candidate', 'notes')}
</data>`,
      JORDAN_SMS_MODEL,
      120,
    );
    const message = buildJordanSms(raw);

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
      type: 'job_alert',
    });

    if (!delivered) {
      logger.warn(
        { leadId: lead.id, source: lead.sourceChannel },
        '[Jordan] manual SMS failed — leaving lead state unchanged',
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

      await this.scheduleNovaColdCallFollowUp(lead);
    }

    await emitEvent('lead.mover_touched', 'lead', lead.id, {
      touchNumber: (lead.touchpoints ?? 0) + 1,
      channel: 'sms',
      delivered,
      agentName: this.name,
      manual: true,
    });

    return { success: true, channel: 'sms', delivered };
  }

  /**
   * After Touch 1, queue Nova for a mover cold-call at +24h if the lead has
   * a phone and is either b2b or came in via one of the Kijiji supply
   * channels. BullMQ jobId dedupes so a repeat schedule for the same lead
   * is a no-op.
   */
  private async scheduleNovaColdCallFollowUp(lead: typeof leads.$inferSelect) {
    if (!lead.contactPhone) return;
    const isMoverCandidate =
      lead.utmCampaign === 'ryan-brooks' ||
      lead.sourceChannel === 'kijiji_services' ||
      lead.sourceChannel === 'kijiji_jobs';
    if (!isMoverCandidate) return;

    const novaQueue = createAgentQueue(QUEUE_NAMES.VOICE_AGENT);
    if (!novaQueue) {
      logger.warn({ leadId: lead.id }, '[Jordan] voice-agent queue unavailable — Nova cold call not scheduled');
      return;
    }

    try {
      await novaQueue.add(
        'call_mover_cold',
        {
          leadId: lead.id,
          phone: lead.contactPhone,
          name: lead.contactName,
          sourceChannel: lead.sourceChannel,
        },
        {
          delay: 24 * 60 * 60 * 1000,
          jobId: `nova_cold_${lead.id}`,
        },
      );
      logger.info(
        { leadId: lead.id, phone: lead.contactPhone },
        '[Jordan] Nova cold call scheduled for 24hrs',
      );
    } catch (err) {
      logger.error({ err, leadId: lead.id }, '[Jordan] failed to schedule Nova cold call');
    }
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

async function sendJordanEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') {
    logger.info({ to, subject, bodyPreview: body.slice(0, 120) }, 'Jordan: dev mode — email not sent');
    return false;
  }
  if (!resend) {
    logger.warn('Jordan: RESEND_API_KEY not set — email skipped');
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
        <img src="${appBase}/avatars/jordan-hayes.png" width="44" height="44" style="border-radius:50%;object-fit:cover;display:block;" alt="Jordan Hayes" />
      </td>
      <td valign="middle" style="padding-left:12px;">
        <div style="font-weight:600;font-size:15px;color:#1a1a1a;line-height:1.2;">Jordan Hayes</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">Mover Recruitment · LervIT Calgary</div>
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
      replyTo: JORDAN_REPLY_TO,
      subject,
      html,
      listUnsubscribeUrl: `${appBase}/unsubscribe`,
    });
    logger.info({ to, subject }, 'Jordan: email sent');
    return true;
  } catch (err) {
    logger.error({ err }, 'Jordan: Resend threw');
    return false;
  }
}

export const jordan = new JordanAgent();
