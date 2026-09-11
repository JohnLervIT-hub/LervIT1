/**
 * Sam Carter (SALES) — B2B outbound prospecting + stuck-partner follow-up.
 *
 * Actions:
 *   - `scan_b2b_prospects`     : daily Google Places sweep across five Calgary
 *                                B2B queries. Creates up to 5 new b2b leads
 *                                per run and enqueues the first touch.
 *   - `send_b2b_touch`         : one touch (T1..T4). Prefers email when the
 *                                lead has one, falls back to SMS. At T4 flips
 *                                dealStage='lost' if still at 'contacted' or
 *                                'prospect' (respects admin overrides that
 *                                advanced the deal manually).
 *   - `scan_stuck_partners`    : daily sweep of partners stuck at
 *                                status='invited' for 7+ days. Enqueues one
 *                                follow-up per partner per scan.
 *   - `send_partner_followup`  : one touch (T1..T3). T3 emits
 *                                'sales.partner_stuck' so Xavier can surface
 *                                the count in his daily brief.
 *   - `escalate_hot_lead`      : called by the admin lead-update endpoint
 *                                when dealStage transitions to 'warm', or
 *                                manually via /api/admin/agent/sam/trigger.
 *                                Fires xavier.escalate (medium severity).
 *
 * Emails are persona-branded ("Sam Carter | LervIT <sam.carter@lervit.com>")
 * via Resend directly, matching Alex/Riley/Kai. SMS through notificationService.
 * B2B leads created here carry sourceChannel='sam_places' and
 * assignedAgent='Sam Carter' for admin filtering.
 *
 * Corporate accounts (O&G, property mgmt, real estate) → Phase 7 corporate
 * portal. Not targeted until portal exists.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import { BaseAgent } from './base';
import { db } from '../db';
import { leads, partners, users, businessEvents } from '@shared/schema';
import { emitEvent } from '../events';
import { notificationService } from '../notifications';
import { logger } from '../logger';
import { createAgentQueue, QUEUE_NAMES } from './queue';
import { searchPlacesText, getPlaceContactDetails } from './places-crawl';
import { xavier } from './xavier';

// ─── constants ────────────────────────────────────────────

const SAM_EMAIL = process.env.SAM_EMAIL?.trim() || 'sam.carter@lervit.com';
const SAM_FROM = `Sam Carter | LervIT <${SAM_EMAIL}>`;
const SAM_REPLY_TO = 'support@lervit.com';
const SAM_MODEL = 'claude-sonnet-4-6';
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.lervit.com';
const PARTNERS_PORTAL_URL = `${APP_BASE_URL}/partners`;
const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_NEW_PROSPECTS_PER_RUN = 5;
const MAX_STUCK_PARTNERS_PER_RUN = 5;
const PLACES_PER_QUERY = 20; // Places text search returns up to ~20 first-page

const B2B_TOUCH_DELAYS_DAYS: Record<2 | 3 | 4, number> = { 2: 3, 3: 7, 4: 14 };
const PARTNER_TOUCH_DELAYS_DAYS: Record<2 | 3, number> = { 2: 14, 3: 30 };

// Fleet operator queries only. Corporate accounts (property mgmt, real estate,
// O&G, student housing, insurance) require the Phase 7 corporate portal and
// are intentionally excluded until that ships.
const PROSPECT_QUERIES: Array<{ query: string; industry: string; source: string }> = [
  { query: 'moving company calgary',      industry: 'moving_company',   source: 'sam_places_moving_co' },
  { query: 'delivery company calgary',    industry: 'delivery_company', source: 'sam_places_delivery_co' },
  { query: 'logistics company calgary',   industry: 'logistics',        source: 'sam_places_logistics' },
  { query: 'courier service calgary',     industry: 'courier',          source: 'sam_places_courier' },
  { query: 'truck rental calgary',        industry: 'logistics',        source: 'sam_places_truck_rental' },
];

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ─── input types ──────────────────────────────────────────

interface B2BTouchInput {
  leadId: string;
  touchNumber: number;
}
interface PartnerFollowupInput {
  partnerId: string;
  touchNumber: number;
}
interface EscalateHotLeadInput {
  leadId: string;
}

interface ProspectScanResult {
  scanned: number;
  duplicatesSkipped: number;
  noPhoneSkipped: number;
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

  protected async execute(action: string, input: Record<string, any>): Promise<any> {
    switch (action) {
      case 'scan_b2b_prospects':
        return this.scanB2BProspects();
      case 'send_b2b_touch':
        return this.sendB2BTouch(input as B2BTouchInput);
      case 'scan_stuck_partners':
        return this.scanStuckPartners();
      case 'send_partner_followup':
        return this.sendPartnerFollowup(input as PartnerFollowupInput);
      case 'escalate_hot_lead':
        return this.escalateHotLead(input as EscalateHotLeadInput);
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
      created: 0,
      byIndustry: {},
    };

    const queue = createAgentQueue(QUEUE_NAMES.SALES);
    if (!queue) {
      logger.warn('Sam: SALES queue unavailable — prospect scan cannot enqueue');
      return result;
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

      const [inserted] = await db
        .insert(leads)
        .values({
          contactName: null,
          contactEmail: null,
          contactPhone: phone,
          companyName: c.name,
          leadType: 'b2b',
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
        await queue.add('send_b2b_touch', { leadId: inserted.id, touchNumber: 1 });
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

  private async sendB2BTouch({ leadId, touchNumber }: B2BTouchInput) {
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

    const companyLabel = lead.companyName ?? lead.contactName ?? 'your team';
    const industry = lead.industry ?? 'other';

    // Channel selection: email preferred when we have one; SMS fallback.
    // T2 flips the preference — it's a short check-in that reads better as SMS.
    const preferEmail = touchNumber !== 2;
    let emailSent = false;
    let smsSent = false;

    if (preferEmail && lead.contactEmail) {
      emailSent = await this.sendB2BEmail(lead.contactEmail, companyLabel, industry, touchNumber);
    } else if (lead.contactPhone) {
      smsSent = await this.sendB2BSms(lead.contactPhone, companyLabel, industry, touchNumber);
    } else if (lead.contactEmail) {
      emailSent = await this.sendB2BEmail(lead.contactEmail, companyLabel, industry, touchNumber);
    } else {
      return { skipped: true, reason: 'no reachable channel', touchNumber };
    }

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
      channel: emailSent ? 'email' : 'sms',
      email: emailSent,
      sms: smsSent,
      dealStage: nextDealStage,
    });

    return { success: true, touchNumber, email: emailSent, sms: smsSent, dealStage: nextDealStage };
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

  private async sendB2BSms(
    to: string,
    companyLabel: string,
    industry: string,
    touchNumber: number,
  ): Promise<boolean> {
    const text = b2bSmsText(companyLabel, industry, touchNumber);
    return notificationService.sendSMS({
      to,
      message: text.slice(0, 160),
      type: 'booking_update',
    });
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

  private async sendPartnerFollowup({ partnerId, touchNumber }: PartnerFollowupInput) {
    if (touchNumber < 1 || touchNumber > 3) {
      throw new Error(`Sam.sendPartnerFollowup: invalid touchNumber ${touchNumber}`);
    }

    const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId)).limit(1);
    if (!partner) return { skipped: true, reason: 'partner not found' };

    // Bail if the partner already moved past 'invited' — no need to nudge.
    if (partner.status !== 'invited') {
      return { skipped: true, reason: `partner status is ${partner.status}`, touchNumber };
    }

    const contactEmail = partner.primaryOpsEmail || partner.billingEmail;
    const contactPhone = partner.primaryOpsPhone || partner.phone;
    const opsName = partner.primaryOpsContact || partner.name;

    let emailSent = false;
    let smsSent = false;

    if (touchNumber === 2 && contactPhone) {
      const text = `Hi ${firstName(opsName)}, Sam from LervIT. Your partner onboarding is only a few steps from live — I can walk you through it in 10 min. Reply here or log in: ${PARTNERS_PORTAL_URL}`;
      smsSent = await notificationService.sendSMS({
        to: contactPhone,
        message: text.slice(0, 160),
        type: 'booking_update',
      });
    } else if (contactEmail) {
      const { subject, html } = partnerFollowupEmail(partner.name, opsName ?? null, touchNumber);
      emailSent = await sendSamEmail(contactEmail, subject, html);
    } else {
      return { skipped: true, reason: 'no reachable channel', touchNumber };
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
}

// ─── copy builders ────────────────────────────────────────

function firstName(fullName: string | null | undefined): string {
  return fullName?.split(' ')[0] ?? 'there';
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
    case 3:
      return {
        subject: `Bookings ready for your fleet — LervIT`,
        html: `<p>Hi ${first},</p>
          <p>Circling back — LervIT sends booking jobs to Calgary fleet partners, and I still think ${companyLabel} would be a strong fit.</p>
          <p><strong>What you get as a fleet partner:</strong></p>
          ${FLEET_PITCH_BULLETS}
          <p>Partner portal: <a href="${PARTNERS_PORTAL_URL}">${PARTNERS_PORTAL_URL}</a> — or reply here and I'll walk you through it live.</p>
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

function b2bSmsText(companyLabel: string, industry: string, touchNumber: number): string {
  const first = firstName(companyLabel);
  const label = industryLabel(industry);
  switch (touchNumber) {
    case 1:
      return `Hi ${first}, Sam from LervIT. Join as a fleet partner — bring your drivers, we send jobs, 85% payout, BNPL for customers, free to join. ${PARTNERS_PORTAL_URL}`;
    case 2:
      return `Hi ${first}, Sam from LervIT following up. LervIT sends booking jobs to Calgary ${label}s — 85% payout, free to join. Interested? ${PARTNERS_PORTAL_URL}`;
    case 3:
      return `Hi ${first}, Sam from LervIT. Wrapping up — fleet partners bring drivers, we send jobs, 85% payout, BNPL at checkout. Worth a look? ${PARTNERS_PORTAL_URL}`;
    case 4:
    default:
      return `Hi ${first}, last note from Sam at LervIT. If bringing your fleet onto a booking platform makes sense: ${PARTNERS_PORTAL_URL}. Thanks.`;
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
      from: SAM_FROM,
      to,
      replyTo: SAM_REPLY_TO,
      subject,
      html,
    });
    if (error) {
      logger.error({ err: error }, 'Sam: Resend error');
      return false;
    }
    logger.info({ id: data?.id, to, subject }, 'Sam: email sent');
    return true;
  } catch (err) {
    logger.error({ err }, 'Sam: Resend threw');
    return false;
  }
}

export const sam = new SamAgent();
