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
import { BaseAgent } from './base';
import { db } from '../db';
import { leads } from '@shared/schema';
import { emitEvent } from '../events';
import { notificationService } from '../notifications';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';

const JORDAN_EMAIL_MODEL = 'claude-sonnet-4-6';
const JORDAN_SMS_MODEL = 'claude-haiku-4-5-20251001';
const JORDAN_EMAIL = process.env.JORDAN_EMAIL?.trim() || 'jordan.hayes@lervit.com';
const JORDAN_FROM = `Jordan Hayes | LervIT <${JORDAN_EMAIL}>`;
const JORDAN_REPLY_TO = 'support@lervit.com';

const TOUCH_DELAY_MS: Record<2 | 3 | 4, number> = {
  2: 24 * 60 * 60 * 1000,
  3: 48 * 60 * 60 * 1000,
  4: 72 * 60 * 60 * 1000,
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface OnboardCandidateInput {
  leadId: string;
}
interface SendTouchInput {
  leadId: string;
  touchNumber: number;
}

export class JordanAgent extends BaseAgent {
  name = 'Jordan Hayes';
  code = 'vetter';

  protected async execute(action: string, input: Record<string, any>): Promise<any> {
    switch (action) {
      case 'onboard_candidate':
        return this.onboardCandidate(input as OnboardCandidateInput);
      case 'send_touch':
        return this.sendTouch(input as SendTouchInput);
      default:
        throw new Error(`Jordan: unknown action "${action}"`);
    }
  }

  private async onboardCandidate({ leadId }: OnboardCandidateInput) {
    const lead = await this.getLead(leadId);
    if (!lead) throw new Error(`Jordan: lead ${leadId} not found`);
    if (lead.status === 'converted' || lead.status === 'cold') {
      return { skipped: true, reason: `lead is ${lead.status}` };
    }
    if (!lead.contactEmail && !lead.contactPhone) {
      logger.info({ leadId }, 'Jordan: no contact details — skipping');
      return { skipped: true, reason: 'no_contact_details' };
    }

    const applyLink = `${process.env.APP_BASE_URL ?? 'https://app.lervit.com'}/become-a-mover`;

    const raw = await this.callClaude(
      `You are Jordan Hayes, a mover recruitment specialist at LervIT, Calgary's
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

Format: first line MUST be "SUBJECT: <subject line>", then a blank line, then the body.`,
      `Candidate signal:
Source: ${lead.sourceChannel ?? 'unknown'}
Notes: ${(lead.notes ?? '').slice(0, 300)}
Intent score: ${lead.intentScore}

Write recruitment email with CTA "Apply to become a LervIT mover".
Apply link: ${applyLink}`,
      JORDAN_EMAIL_MODEL,
      600,
    );

    const { subject, body } = parseSubjectAndBody(
      raw,
      'Earn money moving in Calgary — LervIT opportunity',
    );

    let emailSent = false;
    if (lead.contactEmail) {
      emailSent = await sendJordanEmail(lead.contactEmail, subject, body);
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

    await emitEvent('lead.mover_contacted', 'lead', leadId, {
      touchNumber: 1,
      channel: 'email',
      emailSent,
      agentName: this.name,
    });

    return { success: true, touchNumber: 1, channel: 'email', emailSent };
  }

  private async sendTouch({ leadId, touchNumber }: SendTouchInput) {
    if (touchNumber < 2 || touchNumber > 4) {
      throw new Error(`Jordan.sendTouch: invalid touchNumber ${touchNumber}`);
    }
    const lead = await this.getLead(leadId);
    if (!lead) return { skipped: true, reason: 'lead not found' };
    if (lead.status === 'converted' || lead.status === 'cold') {
      return { skipped: true, reason: `lead is ${lead.status}` };
    }

    const applyLink = `${process.env.APP_BASE_URL ?? 'https://app.lervit.com'}/become-a-mover`;
    let channel: 'email' | 'sms' = 'email';
    let delivered = false;

    if (touchNumber === 2 && lead.contactPhone) {
      channel = 'sms';
      const smsBody = await this.callClaude(
        `You are Jordan from LervIT, Calgary's moving platform.
Write a brief, friendly SMS follow-up to someone who might want to earn money
moving. Under 160 characters. Include the apply link. Not pushy.
Return only the SMS text — no subject, no greetings from you.`,
        `Follow up for: ${(lead.notes ?? 'Calgary mover candidate').slice(0, 100)}
Apply link: ${applyLink}`,
        JORDAN_SMS_MODEL,
        120,
      );
      delivered = await notificationService.sendSMS({
        to: lead.contactPhone,
        message: smsBody.trim().slice(0, 160),
        type: 'job_alert',
      });
    } else if (lead.contactEmail) {
      channel = 'email';
      const isLast = touchNumber === 4;
      const raw = await this.callClaude(
        `You are Jordan Hayes from LervIT Calgary — mover recruitment.
Write a ${isLast ? 'final' : 'follow-up'} recruitment email.
${isLast ? 'Create gentle urgency — this is the last outreach.' : 'Use a different angle from the first email.'}
Warm, brief, not pushy. 2-3 paragraphs.
Format: first line "SUBJECT: <subject>", blank line, then the body.`,
        `Candidate context: ${(lead.notes ?? 'Calgary mover candidate').slice(0, 200)}
Touch number: ${touchNumber} of 4
Apply link: ${applyLink}`,
        JORDAN_EMAIL_MODEL,
        500,
      );
      const { subject, body } = parseSubjectAndBody(
        raw,
        isLast ? 'Last chance to earn with LervIT' : 'Still interested in earning with LervIT?',
      );
      delivered = await sendJordanEmail(lead.contactEmail, subject, body);
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

    await emitEvent('lead.mover_touched', 'lead', leadId, {
      touchNumber,
      channel,
      delivered,
      agentName: this.name,
    });

    return { success: true, touchNumber, channel, delivered };
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
      from: JORDAN_FROM,
      to,
      replyTo: JORDAN_REPLY_TO,
      subject,
      html,
    });
    if (error) {
      logger.error({ err: error }, 'Jordan: Resend error');
      return false;
    }
    logger.info({ id: data?.id, to, subject }, 'Jordan: email sent');
    return true;
  } catch (err) {
    logger.error({ err }, 'Jordan: Resend threw');
    return false;
  }
}

export const jordan = new JordanAgent();
