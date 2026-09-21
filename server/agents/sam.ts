/**
 * Sam Carter (SALES) — B2B outbound prospecting + full fleet partner
 * onboarding.
 *
 * Actions:
 *   - `scan_b2b_prospects`         : daily Google Places sweep across five
 *                                    Calgary fleet queries. Creates up to 5
 *                                    new b2b leads per run.
 *   - `send_b2b_touch`             : one touch (T1..T4). Email-first with
 *                                    SMS fallback. T4 flips dealStage='lost'
 *                                    if still 'contacted'/'prospect'.
 *   - `scan_stuck_partners`        : daily sweep of partners stuck at
 *                                    status='invited' for 7+ days.
 *   - `send_partner_followup`      : one touch (T1..T3). T3 emits
 *                                    'sales.partner_stuck'.
 *   - `escalate_hot_lead`          : Xavier escalate (medium) when dealStage
 *                                    flips to 'warm'.
 *   - `auto_invite_partner`        : guardrailed conversion of a 'warm' b2b
 *                                    lead into a partner + partnerInvite +
 *                                    invite email. Emits sales.partner_invited
 *                                    and escalates to Xavier.
 *   - `check_onboarding_progress`  : daily 11:00 AM sweep of partners at
 *                                    status='onboarding'. Nudges the first
 *                                    incomplete step (dedup: 3 days) and
 *                                    queues onboarding_complete_alert when
 *                                    all four flags flip.
 *   - `onboarding_complete_alert`  : Xavier escalate (high) to John with
 *                                    an activation CTA. Emits
 *                                    sales.onboarding_complete.
 *
 * Emails are persona-branded ("Sam Carter | LervIT <sam.carter@lervit.com>")
 * via Resend directly, matching Alex/Riley/Kai. SMS through notificationService.
 * B2B leads created here carry sourceChannel='sam_places' and
 * assignedAgent='Sam Carter' for admin filtering.
 *
 * partnerInvites.invitedBy is null for Sam-created invites: the FK
 * references users.id and Sam isn't a real user. Sam-created partners carry
 * a marker in partners.adminNotes so admins can distinguish them.
 *
 * Corporate accounts (O&G, property mgmt, real estate) → Phase 7 corporate
 * portal. Not targeted until portal exists.
 */

import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { Resend } from 'resend';
import { BaseAgent, type AgentRunOptions } from './base';
import { db } from '../db';
import { leads, partners, partnerInvites, users, businessEvents } from '@shared/schema';
import { emitEvent } from '../events';
import { notificationService, sendResendEmail, EMAIL_SENDERS } from '../notifications';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';
import { agentEventBus } from '../lib/agentEventBus';
import { searchPlacesText, getPlaceContactDetails } from './places-crawl';
import { xavier } from './xavier';
import { wasContactedToday } from './dedupe';

const SAM_B2B_TOUCH_EVENTS = [
  'sales.b2b_touch1',
  'sales.b2b_touch2',
  'sales.b2b_touch3',
  'sales.b2b_touch4',
];
const SAM_PARTNER_FOLLOWUP_EVENTS = [
  'sales.partner_followup1',
  'sales.partner_followup2',
  'sales.partner_followup3',
  'sales.partner_followup4',
];

// ─── constants ────────────────────────────────────────────

const SAM_EMAIL = process.env.SAM_EMAIL?.trim() || 'sam.carter@lervit.com';
const SAM_FROM = `Sam Carter | LervIT <${SAM_EMAIL}>`;
const SAM_REPLY_TO = 'support@lervit.com';
const SAM_MODEL = 'claude-sonnet-4-6';
const APP_BASE_URL = (process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim();
const PARTNERS_PORTAL_URL = `${APP_BASE_URL}/partners`;
const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_NEW_PROSPECTS_PER_RUN = 5;
const MAX_STUCK_PARTNERS_PER_RUN = 5;
const PLACES_PER_QUERY = 20; // Places text search returns up to ~20 first-page

const B2B_TOUCH_DELAYS_DAYS: Record<2 | 3 | 4, number> = { 2: 3, 3: 7, 4: 14 };
const PARTNER_TOUCH_DELAYS_DAYS: Record<2 | 3, number> = { 2: 14, 3: 30 };

// Fleet partner guardrails — a lead has to clear both to auto-invite.
const AUTO_INVITE_MIN_RATING = 4.0;
const AUTO_INVITE_MIN_REVIEWS = 10;

// Prospect-scan guardrails. Companies with >200 reviews are established
// competitors, not partnership candidates — target smaller operators.
const PROSPECT_MIN_RATING = 4.0;
const PROSPECT_MIN_REVIEWS = 10;
const PROSPECT_MAX_REVIEWS = 200;
const INVITE_TOKEN_TTL_DAYS = 7;
const ONBOARDING_STALL_HOURS = 24;   // step incomplete this long → nudge
const ONBOARDING_NUDGE_DEDUP_DAYS = 3; // don't renudge same step within N days
const MAX_ONBOARDING_NUDGES_PER_RUN = 10;

type OnboardingStep = 'profile' | 'coverage' | 'compliance' | 'testBooking';
const ONBOARDING_STEP_ORDER: OnboardingStep[] = [
  'profile',
  'coverage',
  'compliance',
  'testBooking',
];

// Fleet operator queries only. Corporate accounts (property mgmt, real estate,
// O&G, student housing, insurance) require the Phase 7 corporate portal and
// are intentionally excluded until that ships.
//
// Targeted at individual operators and small fleets. Generic queries like
// "moving company calgary" return established competitors (500-1,400+ reviews),
// not partnership candidates.
const PROSPECT_QUERIES: Array<{ query: string; industry: string; source: string }> = [
  { query: 'delivery company calgary',      industry: 'delivery_company', source: 'sam_places_delivery_co' },
  { query: 'logistics company calgary',     industry: 'logistics',        source: 'sam_places_logistics' },
  { query: 'courier service calgary',       industry: 'courier',          source: 'sam_places_courier' },
  { query: 'truck rental calgary',          industry: 'logistics',        source: 'sam_places_truck_rental' },
  { query: 'man with a truck calgary',      industry: 'moving_company',   source: 'sam_places_man_with_truck' },
  { query: 'delivery driver calgary',       industry: 'delivery_company', source: 'sam_places_delivery_driver' },
  { query: 'cargo van for hire calgary',    industry: 'logistics',        source: 'sam_places_cargo_van' },
  { query: 'small moving service calgary',  industry: 'moving_company',   source: 'sam_places_small_moving' },
  { query: 'furniture delivery calgary',    industry: 'delivery_company', source: 'sam_places_furniture_delivery' },
];

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ─── input types ──────────────────────────────────────────

interface B2BTouchInput {
  leadId: string;
  touchNumber: number;
}
/**
 * Partner phone numbers are copied from Google Places listings scraped by
 * scan_b2b_prospects — there is no CASL consent behind them, so the automated
 * sweep is email-only. An admin can still force a single SMS by passing
 * channelOverride: 'sms' through /api/admin/agent/sam/trigger.
 */
const SMS_STOP_SUFFIX = '\n\nReply STOP to opt out.';
const SMS_BODY_MAX = 160 - SMS_STOP_SUFFIX.length;

interface PartnerFollowupInput {
  partnerId: string;
  touchNumber: number;
  channelOverride?: 'email' | 'sms';
}
interface EscalateHotLeadInput {
  leadId: string;
}
interface AutoInviteInput {
  leadId: string;
}
interface OnboardingCompleteAlertInput {
  partnerId: string;
}

interface ProspectScanResult {
  scanned: number;
  duplicatesSkipped: number;
  noPhoneSkipped: number;
  guardrailSkipped: number;
  created: number;
  byIndustry: Record<string, number>;
}

interface PartnerScanResult {
  scanned: number;
  queued: number;
  skipped: number;
}

// ─── agent ────────────────────────────────────────────────

export class SamAgent extends BaseAgent {
  name = 'Sam Carter';
  code = 'sales';
  readonly model = SAM_MODEL;

  protected async execute(
    action: string,
    input: Record<string, any>,
    options: AgentRunOptions = {},
  ): Promise<any> {
    switch (action) {
      case 'scan_b2b_prospects':
        return this.scanB2BProspects();
      case 'send_b2b_touch':
        return this.sendB2BTouch(input as B2BTouchInput, options);
      case 'scan_stuck_partners':
        return this.scanStuckPartners();
      case 'send_partner_followup':
        return this.sendPartnerFollowup(input as PartnerFollowupInput, options);
      case 'escalate_hot_lead':
        return this.escalateHotLead(input as EscalateHotLeadInput);
      case 'auto_invite_partner':
        return this.autoInvitePartner(input as AutoInviteInput);
      case 'check_onboarding_progress':
        return this.checkOnboardingProgress();
      case 'onboarding_complete_alert':
        return this.onboardingCompleteAlert(input as OnboardingCompleteAlertInput);
      default:
        throw new Error(`Sam: unknown action "${action}"`);
    }
  }

  // ─── B2B PROSPECTING TRACK ────────────────────────────

  private async scanB2BProspects(): Promise<ProspectScanResult> {
    const result: ProspectScanResult = {
      scanned: 0,
      duplicatesSkipped: 0,
      noPhoneSkipped: 0,
      guardrailSkipped: 0,
      created: 0,
      byIndustry: {},
    };

    // Without Redis the scan used to bail out entirely — no prospecting at
    // all. It now runs and hands each new prospect to the bus instead, where
    // 'sam.prospect_found' triggers the same T1 touch.
    const queue = createAgentQueue(QUEUE_NAMES.SALES);
    if (!queue) {
      logger.warn('Sam: SALES queue unavailable — routing prospects via event bus');
    }

    // Collect + dedupe across the five queries by place_id.
    const seenPlaceIds = new Set<string>();
    const candidates: Array<{
      placeId: string;
      name: string;
      address?: string;
      rating?: number;
      userRatingsTotal?: number;
      industry: string;
      source: string;
    }> = [];

    for (const { query, industry, source } of PROSPECT_QUERIES) {
      try {
        const places = await searchPlacesText(query, source);
        for (const p of places.slice(0, PLACES_PER_QUERY)) {
          if (seenPlaceIds.has(p.place_id)) continue;
          seenPlaceIds.add(p.place_id);
          candidates.push({
            placeId: p.place_id,
            name: p.name,
            address: p.formatted_address,
            rating: p.rating,
            userRatingsTotal: p.user_ratings_total,
            industry,
            source,
          });
        }
      } catch (err) {
        logger.error({ err, query }, 'Sam: Places text search failed');
      }
    }

    result.scanned = candidates.length;

    for (const c of candidates) {
      if (result.created >= MAX_NEW_PROSPECTS_PER_RUN) break;

      // Rating/review-count guardrail — target smaller operators. >200 reviews
      // means established competitor, not partnership candidate.
      const rating = c.rating;
      const reviews = c.userRatingsTotal ?? 0;
      if (
        typeof rating !== 'number' ||
        rating < PROSPECT_MIN_RATING ||
        reviews < PROSPECT_MIN_REVIEWS ||
        reviews > PROSPECT_MAX_REVIEWS
      ) {
        result.guardrailSkipped++;
        continue;
      }

      // Cheap DB dedup by companyName before we pay for a details call.
      const [existingByName] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.companyName, c.name))
        .limit(1);
      if (existingByName) {
        result.duplicatesSkipped++;
        continue;
      }

      // Contact-tier details call — needed for phone/website. Skip lead if
      // no phone (we need at least SMS to contact; admin can add email later).
      let phone: string | null = null;
      let website: string | null = null;
      try {
        const details = await getPlaceContactDetails(c.placeId, c.source);
        phone = details?.formatted_phone_number ?? null;
        website = details?.website ?? null;
      } catch (err) {
        logger.warn({ err, placeId: c.placeId }, 'Sam: Places details fetch failed');
      }

      if (!phone) {
        result.noPhoneSkipped++;
        continue;
      }

      // Second dedup by phone in case the same business is listed under a
      // different name in another query.
      const [existingByPhone] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.contactPhone, phone))
        .limit(1);
      if (existingByPhone) {
        result.duplicatesSkipped++;
        continue;
      }

      // Third dedup: same (companyName, sourceChannel) pair already logged as
      // a b2bp lead. Catches cases where a business is re-crawled with a new
      // phone number (VoIP re-provisioning, etc.) but should still be treated
      // as one prospect.
      const [existingByCompany] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.companyName, c.name),
            eq(leads.sourceChannel, c.source),
            eq(leads.leadType, 'b2bp'),
          ),
        )
        .limit(1);
      if (existingByCompany) {
        result.duplicatesSkipped++;
        continue;
      }

      const [inserted] = await db
        .insert(leads)
        .values({
          contactName: null,
          contactEmail: null,
          contactPhone: phone,
          companyName: c.name,
          leadType: 'b2bp',
          industry: c.industry,
          dealStage: 'prospect',
          sourceChannel: c.source,
          landingPage: website ?? null,
          status: 'new',
          intentScore: 60, // B2B outbound — inferred fit, not signaled intent
          assignedAgent: 'Sam Carter',
          notes: formatProspectNotes(c),
        })
        .returning();

      if (!inserted) continue;

      // Enqueue T1 immediately.
      try {
        if (queue) {
          await queue.add('send_b2b_touch', { leadId: inserted.id, touchNumber: 1 });
        } else {
          await agentEventBus.emit(
            'sam.prospect_found',
            {
              leadId: inserted.id,
              companyName: c.name,
              industry: c.industry,
            },
            'sam',
          );
        }
      } catch (err) {
        logger.error({ err, leadId: inserted.id }, 'Sam: failed to queue B2B T1');
      }

      result.created++;
      result.byIndustry[c.industry] = (result.byIndustry[c.industry] ?? 0) + 1;
    }

    await emitEvent('sales.b2b_scan', 'agent', 'sam', result);
    logger.info({ result }, 'Sam: B2B prospect scan complete');
    return result;
  }

  private async sendB2BTouch({ leadId, touchNumber }: B2BTouchInput, options: AgentRunOptions = {}) {
    if (touchNumber < 1 || touchNumber > 4) {
      throw new Error(`Sam.sendB2BTouch: invalid touchNumber ${touchNumber}`);
    }

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return { skipped: true, reason: 'lead not found' };

    // Stop touches if the deal has advanced past our automated cadence, or
    // has been closed/lost. Admin owns those transitions.
    const stopStages = new Set(['warm', 'meeting', 'closed', 'lost']);
    if (lead.dealStage && stopStages.has(lead.dealStage)) {
      return { skipped: true, reason: `dealStage is ${lead.dealStage}`, touchNumber };
    }

    // Dedupe: at most one Sam B2B touch per lead per day, regardless of touch number.
    const dedupe = await wasContactedToday({
      entityId: leadId,
      entityType: 'lead',
      eventTypes: SAM_B2B_TOUCH_EVENTS,
    });
    if (dedupe.contacted) {
      logger.info({ leadId, touchNumber, lastEvent: dedupe.lastEvent }, 'Sam.sendB2BTouch: skipping — already touched today');
      return { skipped: true, reason: 'already_contacted_today', lastEvent: dedupe.lastEvent };
    }

    const companyLabel = lead.companyName ?? lead.contactName ?? 'your team';
    const industry = lead.industry ?? 'other';

    // Email-only cadence. B2B numbers scraped from Google Places are almost
    // always business landlines — Telnyx rejects them (error 40021), so SMS
    // touches were a no-op that also burned quota.
    if (!lead.contactEmail) {
      return { skipped: true, reason: 'no contactEmail', touchNumber };
    }
    if (options.dryRun) {
      return {
        dryRun: true,
        wouldContact: [leadId],
        preview: { to: lead.contactEmail, channel: 'email', company: companyLabel, industry, touchNumber },
      };
    }
    const emailSent = await this.sendB2BEmail(lead.contactEmail, companyLabel, industry, touchNumber);

    // Update touch tracking + move dealStage forward on T1 or T4.
    const nextDealStage =
      touchNumber === 1 && lead.dealStage === 'prospect'
        ? 'contacted'
        : touchNumber === 4 && (lead.dealStage === 'prospect' || lead.dealStage === 'contacted')
          ? 'lost'
          : lead.dealStage;

    await db
      .update(leads)
      .set({
        touchpoints: (lead.touchpoints ?? 0) + 1,
        lastTouchedAt: new Date(),
        lastContactedAt: new Date(),
        dealStage: nextDealStage ?? lead.dealStage,
        status: touchNumber === 4 ? 'cold' : 'contacted',
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    // Schedule the next touch if we still have one left.
    if (touchNumber < 4) {
      const nextTouch = (touchNumber + 1) as 2 | 3 | 4;
      const delayDays = B2B_TOUCH_DELAYS_DAYS[nextTouch];
      const queue = createAgentQueue(QUEUE_NAMES.SALES);
      if (queue) {
        try {
          await queue.add(
            'send_b2b_touch',
            { leadId, touchNumber: nextTouch },
            { delay: delayDays * DAY_MS },
          );
        } catch (err) {
          logger.error({ err, leadId, nextTouch }, 'Sam: failed to schedule next B2B touch');
        }
      }
    }

    await emitEvent(`sales.b2b_touch${touchNumber}`, 'lead', leadId, {
      agentName: this.name,
      touchNumber,
      channel: 'email',
      email: emailSent,
      dealStage: nextDealStage,
    });

    return { success: true, touchNumber, email: emailSent, dealStage: nextDealStage };
  }

  private async sendB2BEmail(
    to: string,
    companyLabel: string,
    industry: string,
    touchNumber: number,
  ): Promise<boolean> {
    const { subject, html } = b2bEmailContent(companyLabel, industry, touchNumber);
    return sendSamEmail(to, subject, html);
  }

  // ─── STUCK-PARTNER TRACK ──────────────────────────────

  private async scanStuckPartners(): Promise<PartnerScanResult> {
    const result: PartnerScanResult = { scanned: 0, queued: 0, skipped: 0 };
    const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS);

    const stuck = await db
      .select()
      .from(partners)
      .where(and(eq(partners.status, 'invited'), sql`${partners.createdAt} < ${sevenDaysAgo}`));

    result.scanned = stuck.length;

    const queue = createAgentQueue(QUEUE_NAMES.SALES);
    if (!queue) {
      logger.warn('Sam: SALES queue unavailable — stuck-partner scan cannot enqueue');
      return result;
    }

    let contacted = 0;
    for (const p of stuck) {
      if (contacted >= MAX_STUCK_PARTNERS_PER_RUN) {
        result.skipped++;
        continue;
      }

      // Dedup: skip if any followup touch fired for this partner in the past 7 days.
      const recent = await db.execute(sql`
        SELECT id FROM business_events
        WHERE entity_type = 'partner'
          AND entity_id = ${p.id}
          AND event_type LIKE 'sales.partner_followup%'
          AND created_at > NOW() - INTERVAL '7 days'
        LIMIT 1
      `);
      if ((recent.rows ?? []).length > 0) {
        result.skipped++;
        continue;
      }

      // Assign touch number by days-since-invited: 7-13 → T1, 14-29 → T2, 30+ → T3.
      const daysSince = Math.floor((Date.now() - new Date(p.createdAt).getTime()) / DAY_MS);
      const touchNumber = daysSince >= 30 ? 3 : daysSince >= 14 ? 2 : 1;

      try {
        await queue.add('send_partner_followup', { partnerId: p.id, touchNumber });
        result.queued++;
        contacted++;
      } catch (err) {
        logger.error({ err, partnerId: p.id, touchNumber }, 'Sam: failed to queue partner followup');
      }
    }

    await emitEvent('sales.partner_scan', 'agent', 'sam', result);
    logger.info({ result }, 'Sam: stuck-partner scan complete');
    return result;
  }

  private async sendPartnerFollowup({ partnerId, touchNumber, channelOverride }: PartnerFollowupInput, options: AgentRunOptions = {}) {
    if (touchNumber < 1 || touchNumber > 3) {
      throw new Error(`Sam.sendPartnerFollowup: invalid touchNumber ${touchNumber}`);
    }

    const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId)).limit(1);
    if (!partner) return { skipped: true, reason: 'partner not found' };

    // Bail if the partner already moved past 'invited' — no need to nudge.
    if (partner.status !== 'invited') {
      return { skipped: true, reason: `partner status is ${partner.status}`, touchNumber };
    }

    // Dedupe: at most one Sam partner follow-up per partner per day.
    const dedupe = await wasContactedToday({
      entityId: partnerId,
      entityType: 'partner',
      eventTypes: SAM_PARTNER_FOLLOWUP_EVENTS,
    });
    if (dedupe.contacted) {
      return { skipped: true, reason: 'already_contacted_today', lastEvent: dedupe.lastEvent };
    }

    const contactEmail = partner.primaryOpsEmail || partner.billingEmail;
    const contactPhone = partner.primaryOpsPhone || partner.phone;
    const opsName = partner.primaryOpsContact || partner.name;

    let emailSent = false;
    let smsSent = false;

    // Touch 2 used to text every partner. Scraped number, no consent — the
    // sweep now falls through to email unless an admin explicitly asked.
    const smsRequested = channelOverride === 'sms';
    if (touchNumber === 2 && contactPhone && !smsRequested) {
      logger.info(
        { partnerId, touchNumber },
        '[Sam] Partner SMS suppressed — no CASL consent on scraped number, using email',
      );
    }

    if (touchNumber === 2 && contactPhone && smsRequested) {
      const body = `Hi ${firstName(opsName)}, Sam from LervIT. Your partner onboarding is only a few steps from live — I can walk you through it in 10 min. Reply here or log in: ${PARTNERS_PORTAL_URL}`;
      const text = body.slice(0, SMS_BODY_MAX) + SMS_STOP_SUFFIX;
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [partnerId], preview: { to: contactPhone, channel: 'sms', body: text, touchNumber } };
      }
      smsSent = await notificationService.sendSMS({
        to: contactPhone,
        message: text,
        type: 'booking_update',
      });
    } else if (contactEmail) {
      const { subject, html } = partnerFollowupEmail(partner.name, opsName ?? null, touchNumber);
      if (options.dryRun) {
        return { dryRun: true, wouldContact: [partnerId], preview: { to: contactEmail, channel: 'email', subject, touchNumber } };
      }
      emailSent = await sendSamEmail(contactEmail, subject, html);
    } else {
      return {
        skipped: true,
        reason: contactPhone ? 'no_email_and_sms_needs_admin_override' : 'no reachable channel',
        touchNumber,
      };
    }

    // T3 emits sales.partner_stuck so Xavier's daily brief picks it up.
    if (touchNumber === 3) {
      await emitEvent('sales.partner_stuck', 'partner', partnerId, {
        agentName: this.name,
        partnerName: partner.name,
        daysSinceInvited: Math.floor((Date.now() - new Date(partner.createdAt).getTime()) / DAY_MS),
        opsContact: opsName,
        opsEmail: contactEmail,
      });
    }

    await emitEvent(`sales.partner_followup${touchNumber}`, 'partner', partnerId, {
      agentName: this.name,
      touchNumber,
      email: emailSent,
      sms: smsSent,
    });

    return { success: true, touchNumber, email: emailSent, sms: smsSent };
  }

  // ─── HOT LEAD ESCALATION ──────────────────────────────

  private async escalateHotLead({ leadId }: EscalateHotLeadInput) {
    if (!leadId) throw new Error('Sam.escalateHotLead: leadId required');

    // Dedup: don't re-escalate the same lead within 24h.
    const oneDayAgo = new Date(Date.now() - DAY_MS);
    const prior = await db
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(
        and(
          eq(businessEvents.eventType, 'sales.hot_lead_escalated'),
          eq(businessEvents.entityId, leadId),
          gte(businessEvents.createdAt, oneDayAgo),
        ),
      )
      .limit(1);
    if (prior.length > 0) {
      return { skipped: true, reason: 'already escalated in last 24h', leadId };
    }

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return { skipped: true, reason: 'lead not found' };

    const company = lead.companyName ?? lead.contactName ?? '(unnamed lead)';
    const industry = lead.industry ?? 'unknown';
    const issue = `Sam has a warm B2B lead: ${company} — ${industry}. Reply to close the deal.`;

    let xavierResult: any = null;
    try {
      xavierResult = await xavier.run('escalate', {
        issue,
        severity: 'medium',
        agentName: this.name,
        data: {
          leadId,
          company,
          industry,
          contactName: lead.contactName,
          contactEmail: lead.contactEmail,
          contactPhone: lead.contactPhone,
          dealStage: lead.dealStage,
          estimatedMonthlyMoves: lead.estimatedMonthlyMoves,
          notes: lead.notes,
        },
      });
    } catch (err) {
      logger.error({ err, leadId }, 'Sam: Xavier escalate failed');
    }

    await emitEvent('sales.hot_lead_escalated', 'lead', leadId, {
      agentName: this.name,
      company,
      industry,
      xavierSmsSent: !!xavierResult?.smsSent,
    });

    return { success: true, leadId, xavierResult };
  }

  // ─── FLEET PARTNER ONBOARDING ─────────────────────────

  /**
   * Convert a 'warm' b2b lead into a fleet partner + partnerInvite. Enforces
   * rating/reviews guardrails and dedups against existing partners + invites.
   */
  private async autoInvitePartner({ leadId }: AutoInviteInput) {
    if (!leadId) throw new Error('Sam.autoInvitePartner: leadId required');

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return { skipped: true, reason: 'lead not found', leadId };

    if (lead.leadType !== 'b2bp') {
      return { skipped: true, reason: `leadType is ${lead.leadType}, need b2bp`, leadId };
    }
    if (lead.dealStage !== 'warm') {
      return { skipped: true, reason: `dealStage is ${lead.dealStage}, need warm`, leadId };
    }
    if (!lead.contactEmail) {
      return { skipped: true, reason: 'no contactEmail', leadId };
    }
    if (!lead.companyName) {
      return { skipped: true, reason: 'no companyName', leadId };
    }

    const { rating, reviewCount } = parseRatingFromNotes(lead.notes);
    if (rating === null || rating < AUTO_INVITE_MIN_RATING) {
      return {
        skipped: true,
        reason: `rating ${rating ?? 'unknown'} below ${AUTO_INVITE_MIN_RATING}`,
        leadId,
      };
    }
    if (reviewCount === null || reviewCount < AUTO_INVITE_MIN_REVIEWS) {
      return {
        skipped: true,
        reason: `reviewCount ${reviewCount ?? 'unknown'} below ${AUTO_INVITE_MIN_REVIEWS}`,
        leadId,
      };
    }

    // Dedup: existing partner with same legal name.
    const [existingPartner] = await db
      .select({ id: partners.id })
      .from(partners)
      .where(eq(partners.legalName, lead.companyName))
      .limit(1);
    if (existingPartner) {
      return { skipped: true, reason: 'partner already exists', leadId, partnerId: existingPartner.id };
    }

    // Dedup: any open invite for this email.
    const [existingInvite] = await db
      .select({ id: partnerInvites.id })
      .from(partnerInvites)
      .where(and(eq(partnerInvites.email, lead.contactEmail), isNull(partnerInvites.usedAt)))
      .limit(1);
    if (existingInvite) {
      return { skipped: true, reason: 'invite already exists for email', leadId, inviteId: existingInvite.id };
    }

    const address = parseAddressFromNotes(lead.notes);
    const adminNoteLines = [
      'Auto-invited by Sam Carter (SALES).',
      `Company: ${lead.companyName}`,
      `Rating: ${rating}★ (${reviewCount} reviews)`,
      `Industry: ${lead.industry ?? 'unknown'}`,
      `Source lead: ${lead.id}`,
    ];

    // Create the partners row (status='invited' — flips to 'onboarding' when
    // the invitee accepts).
    const [partner] = await db
      .insert(partners)
      .values({
        name: lead.companyName,
        legalName: lead.companyName,
        status: 'invited',
        primaryOpsContact: lead.contactName ?? null,
        primaryOpsEmail: lead.contactEmail,
        primaryOpsPhone: lead.contactPhone ?? null,
        phone: lead.contactPhone ?? null,
        address: address ?? null,
        adminNotes: adminNoteLines.join('\n'),
      })
      .returning();
    if (!partner) {
      return { skipped: true, reason: 'partner insert returned no row', leadId };
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * DAY_MS);

    const [invite] = await db
      .insert(partnerInvites)
      .values({
        partnerId: partner.id,
        email: lead.contactEmail,
        name: lead.contactName ?? null,
        role: 'partner_admin',
        token,
        expiresAt,
        invitedBy: null, // Sam is a system agent — no users.id row
      })
      .returning();

    const activationUrl = `${APP_BASE_URL}/partner/activate?token=${token}`;
    const { subject, html } = partnerInviteEmail({
      companyName: lead.companyName,
      contactName: lead.contactName,
      activationUrl,
    });
    const emailSent = await sendSamEmail(lead.contactEmail, subject, html);

    await db
      .update(leads)
      .set({
        dealStage: 'invited',
        status: 'contacted',
        touchpoints: (lead.touchpoints ?? 0) + 1,
        lastTouchedAt: new Date(),
        lastContactedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    await emitEvent('sales.partner_invited', 'partner', partner.id, {
      agentName: this.name,
      leadId,
      partnerId: partner.id,
      company: lead.companyName,
      rating,
      reviewCount,
      inviteEmail: lead.contactEmail,
      emailSent,
    });

    // Xavier escalation — Craft describes what happened; Claude composes the
    // outbound SMS. Severity 'medium' so we don't wake John up.
    let xavierResult: any = null;
    try {
      xavierResult = await xavier.run('escalate', {
        issue:
          `Sam invited ${lead.companyName} as fleet partner. ` +
          `Guardrails: ${rating}★, ${reviewCount} reviews. ` +
          `Activate when onboarding complete.`,
        severity: 'medium',
        agentName: this.name,
        data: {
          leadId,
          partnerId: partner.id,
          inviteId: invite?.id,
          company: lead.companyName,
          rating,
          reviewCount,
          contactName: lead.contactName,
          contactEmail: lead.contactEmail,
          contactPhone: lead.contactPhone,
        },
      });
    } catch (err) {
      logger.error({ err, leadId, partnerId: partner.id }, 'Sam: Xavier escalate (invite) failed');
    }

    logger.info(
      { leadId, partnerId: partner.id, emailSent },
      'Sam: fleet partner auto-invited',
    );

    return {
      success: true,
      leadId,
      partnerId: partner.id,
      inviteId: invite?.id,
      emailSent,
      xavierSmsSent: !!xavierResult?.smsSent,
    };
  }

  /**
   * Sweep partners at status='onboarding'. Nudge the first incomplete step
   * if it has been stalled >24h; queue onboarding_complete_alert when all
   * four flags flip. Dedups nudges per (partner, step) via businessEvents.
   */
  private async checkOnboardingProgress() {
    const result = {
      scanned: 0,
      nudged: 0,
      completed: 0,
      skipped: 0,
    };

    const onboarding = await db
      .select()
      .from(partners)
      .where(eq(partners.status, 'onboarding'));
    result.scanned = onboarding.length;

    const queue = createAgentQueue(QUEUE_NAMES.SALES);
    if (!queue && onboarding.length > 0) {
      logger.warn('Sam: SALES queue unavailable — onboarding scan cannot enqueue');
    }

    for (const p of onboarding) {
      if (result.nudged >= MAX_ONBOARDING_NUDGES_PER_RUN) {
        result.skipped++;
        continue;
      }

      const stepFlags: Record<OnboardingStep, boolean> = {
        profile: p.profileComplete,
        coverage: p.coverageComplete,
        compliance: p.complianceComplete,
        testBooking: p.testBookingComplete,
      };
      const allComplete = ONBOARDING_STEP_ORDER.every(s => stepFlags[s]);

      if (allComplete) {
        // Dedup so we only queue the alert once per partner.
        const [prior] = await db
          .select({ id: businessEvents.id })
          .from(businessEvents)
          .where(
            and(
              eq(businessEvents.eventType, 'sales.onboarding_complete'),
              eq(businessEvents.entityId, p.id),
            ),
          )
          .limit(1);
        if (prior) {
          result.skipped++;
          continue;
        }
        if (queue) {
          try {
            await queue.add('onboarding_complete_alert', { partnerId: p.id });
            result.completed++;
          } catch (err) {
            logger.error({ err, partnerId: p.id }, 'Sam: failed to queue onboarding_complete_alert');
          }
        }
        continue;
      }

      // Only nudge if the partner hasn't touched their record in >24h — a
      // rough proxy for "this step has been sitting". Reset by any admin or
      // partner update.
      const hoursSinceUpdate = (Date.now() - new Date(p.updatedAt).getTime()) / (60 * 60 * 1000);
      if (hoursSinceUpdate < ONBOARDING_STALL_HOURS) {
        result.skipped++;
        continue;
      }

      const nextStep = ONBOARDING_STEP_ORDER.find(s => !stepFlags[s]);
      if (!nextStep) {
        result.skipped++;
        continue;
      }

      // Dedup: skip if we already nudged this partner on this step recently.
      const cutoff = new Date(Date.now() - ONBOARDING_NUDGE_DEDUP_DAYS * DAY_MS);
      const recent = await db.execute(sql`
        SELECT id FROM business_events
        WHERE entity_type = 'partner'
          AND entity_id = ${p.id}
          AND event_type = 'sales.onboarding_nudge'
          AND created_at > ${cutoff}
          AND payload->>'step' = ${nextStep}
        LIMIT 1
      `);
      if ((recent.rows ?? []).length > 0) {
        result.skipped++;
        continue;
      }

      const toEmail = p.primaryOpsEmail || p.billingEmail;
      if (!toEmail) {
        result.skipped++;
        continue;
      }

      const activationLink = `${APP_BASE_URL}/partner`;
      const { subject, html } = onboardingNudgeEmail({
        partnerName: p.name,
        contactName: p.primaryOpsContact,
        step: nextStep,
        activationLink,
      });
      const emailSent = await sendSamEmail(toEmail, subject, html);

      await emitEvent('sales.onboarding_nudge', 'partner', p.id, {
        agentName: this.name,
        step: nextStep,
        emailSent,
      });
      result.nudged++;
    }

    logger.info({ result }, 'Sam: onboarding progress scan complete');
    return result;
  }

  /**
   * Fires once per partner when all four onboarding flags are set. Sends
   * a high-severity Xavier alert to John so he can activate the partner.
   */
  private async onboardingCompleteAlert({ partnerId }: OnboardingCompleteAlertInput) {
    if (!partnerId) throw new Error('Sam.onboardingCompleteAlert: partnerId required');

    const [partner] = await db
      .select()
      .from(partners)
      .where(eq(partners.id, partnerId))
      .limit(1);
    if (!partner) return { skipped: true, reason: 'partner not found', partnerId };

    // Idempotency guard — if the event already fired, don't double-alert.
    const [prior] = await db
      .select({ id: businessEvents.id })
      .from(businessEvents)
      .where(
        and(
          eq(businessEvents.eventType, 'sales.onboarding_complete'),
          eq(businessEvents.entityId, partnerId),
        ),
      )
      .limit(1);
    if (prior) {
      return { skipped: true, reason: 'already alerted', partnerId };
    }

    // Pull rating/reviews from the partner's admin notes, which Sam wrote at
    // invite time.
    const { rating, reviewCount } = parseRatingFromNotes(partner.adminNotes);
    const activateUrl = `${APP_BASE_URL}/admin/partners`;

    let xavierResult: any = null;
    try {
      xavierResult = await xavier.run('escalate', {
        issue:
          `${partner.name} completed fleet onboarding. ` +
          (rating !== null
            ? `Rating: ${rating}★ (${reviewCount ?? 0} reviews). `
            : '') +
          `Ready to activate: ${activateUrl}`,
        severity: 'high',
        agentName: this.name,
        data: {
          partnerId,
          partnerName: partner.name,
          rating,
          reviewCount,
          activateUrl,
        },
      });
    } catch (err) {
      logger.error({ err, partnerId }, 'Sam: Xavier escalate (onboarding_complete) failed');
    }

    await emitEvent('sales.onboarding_complete', 'partner', partnerId, {
      agentName: this.name,
      partnerName: partner.name,
      rating,
      reviewCount,
      xavierSmsSent: !!xavierResult?.smsSent,
    });

    return { success: true, partnerId, xavierSmsSent: !!xavierResult?.smsSent };
  }
}

// ─── copy builders ────────────────────────────────────────

function firstName(fullName: string | null | undefined): string {
  return fullName?.split(' ')[0] ?? 'there';
}

function parseRatingFromNotes(notes: string | null | undefined): {
  rating: number | null;
  reviewCount: number | null;
} {
  if (!notes) return { rating: null, reviewCount: null };
  const match = notes.match(/Rating:\s*([\d.]+)★\s*\((\d+)\s*reviews?\)/i);
  if (!match) return { rating: null, reviewCount: null };
  const rating = Number.parseFloat(match[1]);
  const reviewCount = Number.parseInt(match[2], 10);
  return {
    rating: Number.isFinite(rating) ? rating : null,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
  };
}

function parseAddressFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/^Address:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

function partnerInviteEmail(args: {
  companyName: string;
  contactName: string | null;
  activationUrl: string;
}): { subject: string; html: string } {
  const first = firstName(args.contactName);
  return {
    subject: `Your LervIT fleet partner account is ready`,
    html: `<p>Hi ${first},</p>
      <p>Welcome to LervIT — we've set up a fleet partner account for <strong>${args.companyName}</strong> and you're four steps away from receiving live booking traffic in Calgary.</p>
      <p><strong>Setup takes about 30 minutes:</strong></p>
      <ol>
        <li>Profile — company details and dispatch contacts</li>
        <li>Coverage — service zones and vehicle classes</li>
        <li>Compliance — insurance, cargo liability, business registration</li>
        <li>Test booking — one end-to-end dispatch to confirm you're ready</li>
      </ol>
      <p><strong>Once you're live:</strong></p>
      <ul>
        <li>Bring your drivers, we send the jobs</li>
        <li>85% payout per job via Stripe Connect</li>
        <li>Custom dispatch dashboard</li>
        <li>BNPL for your customers at checkout</li>
        <li>Free to join — no CapEx</li>
      </ul>
      <p style="text-align:center;margin:24px 0;">
        <a href="${args.activationUrl}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Start Setup →</a>
      </p>
      <p style="font-size:13px;color:#666;">If the button doesn't work, paste this into your browser:<br/><a href="${args.activationUrl}">${args.activationUrl}</a></p>
      <p>Reply to this email if you get stuck — I'll help personally.</p>
      <p>Sam Carter<br/>LervIT Partnerships</p>`,
  };
}

const ONBOARDING_STEP_COPY: Record<OnboardingStep, {
  index: number;
  label: string;
  todo: string;
}> = {
  profile: {
    index: 1,
    label: 'Profile',
    todo: 'company details and dispatch contacts',
  },
  coverage: {
    index: 2,
    label: 'Coverage',
    todo: 'your service zones and vehicle classes',
  },
  compliance: {
    index: 3,
    label: 'Compliance',
    todo: 'insurance certificate, cargo liability, and business registration',
  },
  testBooking: {
    index: 4,
    label: 'Test Booking',
    todo: 'one end-to-end dispatch to confirm you\'re ready to receive live jobs',
  },
};

function onboardingNudgeEmail(args: {
  partnerName: string;
  contactName: string | null;
  step: OnboardingStep;
  activationLink: string;
}): { subject: string; html: string } {
  const first = firstName(args.contactName);
  const copy = ONBOARDING_STEP_COPY[args.step];
  return {
    subject: `Step ${copy.index} of 4 — finish your LervIT ${copy.label.toLowerCase()} setup`,
    html: `<p>Hi ${first},</p>
      <p>You're on <strong>Step ${copy.index}: ${copy.label}</strong> — the last thing between ${args.partnerName} and live booking traffic on LervIT. Here's how to complete it in about 2 minutes:</p>
      <p><strong>Step ${copy.index} — ${copy.label}:</strong> add ${copy.todo}.</p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${args.activationLink}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Continue Setup →</a>
      </p>
      <p>If anything is blocking you — a doc you can't find, a coverage zone that doesn't fit — reply to this email and I'll unblock it personally.</p>
      <p>Sam Carter<br/>LervIT Partnerships</p>`,
  };
}

function formatProspectNotes(c: {
  name: string;
  industry: string;
  address?: string;
  rating?: number;
  userRatingsTotal?: number;
}): string {
  const lines = [
    `Company: ${c.name}`,
    `Industry: ${c.industry}`,
  ];
  if (c.address) lines.push(`Address: ${c.address}`);
  if (typeof c.rating === 'number') {
    const reviews = c.userRatingsTotal ?? 0;
    lines.push(`Rating: ${c.rating}★ (${reviews} reviews)`);
  }
  return lines.join('\n');
}

function industryLabel(industry: string): string {
  switch (industry) {
    case 'moving_company':   return 'moving company';
    case 'delivery_company': return 'delivery company';
    case 'logistics':        return 'logistics company';
    case 'courier':          return 'courier service';
    default:                 return 'fleet operator';
  }
}

const FLEET_PITCH_BULLETS = `<ul>
  <li>Bring your drivers, we send the jobs</li>
  <li>Custom dispatch dashboard</li>
  <li>85% payout per job</li>
  <li>BNPL for your customers</li>
  <li>Free to join</li>
</ul>`;

function b2bEmailContent(companyLabel: string, industry: string, touchNumber: number): { subject: string; html: string } {
  const first = firstName(companyLabel);
  const label = industryLabel(industry);
  switch (touchNumber) {
    case 1:
      return {
        subject: `Join LervIT as a fleet partner`,
        html: `<p>Hi ${first},</p>
          <p>I'm Sam Carter at LervIT — Calgary's AI-powered moving platform. We're looking for Calgary ${label}s to run jobs on our platform as fleet partners.</p>
          <p><strong>Join LervIT as a fleet partner:</strong></p>
          ${FLEET_PITCH_BULLETS}
          <p>Would a 15-minute call this week make sense? Reply with a time or start here: <a href="${PARTNERS_PORTAL_URL}">${PARTNERS_PORTAL_URL}</a></p>
          <p>Sam Carter<br/>LervIT Partnerships</p>`,
      };
    case 2:
      return {
        subject: `Bigger jobs at checkout — BNPL on every LervIT booking`,
        html: `<p>Hi ${first},</p>
          <p>Quick follow-up. One reason ${companyLabel} would do well on LervIT: <strong>every customer sees a Buy-Now-Pay-Later option at checkout</strong>. That's Klarna/Affirm-style financing built into our booking flow, at no cost to you.</p>
          <p><strong>What that means for your fleet:</strong></p>
          <ul>
            <li>Customers book bigger jobs — full homes instead of single-room hops</li>
            <li>You still get paid in full, up front — LervIT + our BNPL partner carry the credit risk, not you</li>
            <li>85% payout per job via Stripe Connect</li>
            <li>No CapEx, no monthly platform fee</li>
          </ul>
          <p>Worth a 15-minute call to see if the volume makes sense? Or start here: <a href="${PARTNERS_PORTAL_URL}">${PARTNERS_PORTAL_URL}</a></p>
          <p>Sam Carter<br/>LervIT Partnerships</p>`,
      };
    case 3:
      return {
        subject: `How LervIT compares — for ${companyLabel}`,
        html: `<p>Hi ${first},</p>
          <p>Circling back one more time. A few Calgary ${label}s have asked how LervIT compares to running their own bookings or listing on other platforms — here's the short version:</p>
          <ul>
            <li><strong>vs. your own site:</strong> we bring the demand — SEO, paid, and referral traffic feed straight into your dispatch</li>
            <li><strong>vs. Uber/TaskRabbit-style apps:</strong> 85% payout per job (vs. their 60-75%), and you keep control of pricing and coverage zones</li>
            <li><strong>vs. Kijiji/Facebook leads:</strong> pre-qualified, paid bookings — no chasing tire-kickers</li>
            <li><strong>Setup cost:</strong> free to join. No monthly fee, no CapEx.</li>
          </ul>
          <p>Partner portal: <a href="${PARTNERS_PORTAL_URL}">${PARTNERS_PORTAL_URL}</a> — or reply and I'll walk you through it live.</p>
          <p>Sam Carter<br/>LervIT Partnerships</p>`,
      };
    case 4:
    default:
      return {
        subject: `Closing the loop — LervIT for ${companyLabel}`,
        html: `<p>Hi ${first},</p>
          <p>I don't want to keep landing in your inbox uninvited, so this is my last note.</p>
          <p>If bringing your fleet onto a booking platform ever makes sense — bring your drivers, we send the jobs, 85% payout per job, BNPL for your customers, free to join. The partner portal (<a href="${PARTNERS_PORTAL_URL}">${PARTNERS_PORTAL_URL}</a>) has everything, and I'm at ${SAM_EMAIL} whenever it makes sense.</p>
          <p>Sam Carter<br/>LervIT Partnerships</p>`,
      };
  }
}

function partnerFollowupEmail(partnerName: string, opsName: string | null, touchNumber: number): { subject: string; html: string } {
  const first = firstName(opsName);
  switch (touchNumber) {
    case 1:
      return {
        subject: `Your LervIT partner onboarding is a few steps from live`,
        html: `<p>Hi ${first},</p>
          <p>I noticed ${partnerName}'s LervIT partner onboarding is still open. You're only a few steps away from receiving live booking traffic in Calgary.</p>
          <p>The remaining steps are: profile → coverage areas → compliance docs → dispatch config. Most partners finish in under 30 minutes.</p>
          <p><a href="${PARTNERS_PORTAL_URL}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Resume Onboarding →</a></p>
          <p>If anything is blocking you, reply here and I'll help personally.</p>
          <p>Sam Carter<br/>LervIT Partnerships</p>`,
      };
    case 2:
      return {
        subject: `Following up — LervIT fleet partnership for ${partnerName}`,
        html: `<p>Hi ${first},</p>
          <p>Circling back on the LervIT partner onboarding for ${partnerName}. I wanted to share a couple of things that seem to help other Calgary fleets get to their first live booking faster:</p>
          <ul>
            <li>Coverage areas can start narrow — you can widen them after your first week of routing.</li>
            <li>Compliance docs (insurance, WCB) upload directly in the portal; our team reviews within one business day.</li>
            <li>Dispatch config supports both auto-accept and manual review, so you can pick the workflow that matches how your ops team currently handles jobs.</li>
          </ul>
          <p><a href="${PARTNERS_PORTAL_URL}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Continue Onboarding →</a></p>
          <p>Happy to jump on a 15-minute call if it would help — just reply with a time that works.</p>
          <p>Sam Carter<br/>LervIT Partnerships</p>`,
      };
    case 3:
    default:
      return {
        subject: `Still interested in LervIT for ${partnerName}?`,
        html: `<p>Hi ${first},</p>
          <p>It's been about a month since we invited ${partnerName} into the LervIT partner program and the onboarding is still open.</p>
          <p>If this is no longer the right fit, no worries — just reply and I'll close the account. If it's something we can help unblock, let me know and I'll jump on a quick call.</p>
          <p>Partner portal: <a href="${PARTNERS_PORTAL_URL}">${PARTNERS_PORTAL_URL}</a></p>
          <p>Sam Carter<br/>LervIT Partnerships</p>`,
      };
  }
}

// ─── email helper ─────────────────────────────────────────

async function sendSamEmail(to: string, subject: string, innerHtml: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') {
    logger.info({ to, subject }, 'Sam: dev mode — email not sent');
    return false;
  }
  if (!resend) {
    logger.warn('Sam: RESEND_API_KEY not set — email skipped');
    return false;
  }
  const header = `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f1f5f9;">
    <tr>
      <td width="52" valign="middle">
        <img src="${APP_BASE_URL}/avatars/sam-carter.png" width="44" height="44" style="border-radius:50%;object-fit:cover;display:block;" alt="Sam Carter" />
      </td>
      <td valign="middle" style="padding-left:12px;">
        <div style="font-weight:600;font-size:15px;color:#1a1a1a;line-height:1.2;">Sam Carter</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">B2B Fleet Sales · LervIT Calgary</div>
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
      replyTo: SAM_REPLY_TO,
      subject,
      html,
      listUnsubscribeUrl: `${APP_BASE_URL}/unsubscribe`,
    });
    logger.info({ to, subject }, 'Sam: email sent');
    return true;
  } catch (err) {
    logger.error({ err }, 'Sam: Resend threw');
    return false;
  }
}

export const sam = new SamAgent();
