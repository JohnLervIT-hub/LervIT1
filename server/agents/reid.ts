/**
 * Reid Calloway (DOCOPS) — document intelligence, audit, and compliance
 * verification for mover uploads.
 *
 * Actions:
 *   - `review_document`         : entry point on upload — creates an audit row,
 *                                 sends receipt to mover, notifies John, then
 *                                 runs the audit.
 *   - `run_document_audit`      : Claude-driven check against the requirements
 *                                 list for the document type. Scores each
 *                                 failed check; routes to auto_approve /
 *                                 request_clarification / escalate.
 *   - `approve_document`        : John or system approves an escalated audit;
 *                                 flips mover.documentsVerified and emails.
 *   - `reject_document`         : John rejects an audit with a stated reason;
 *                                 mover is notified with the reason.
 *   - `escalate_document`       : force-escalate an existing audit.
 *   - `generate_audit_report`   : per-audit summary bundle.
 *   - `get_kpi_report`          : rolling KPI dashboard (auto-approval rate,
 *                                 escalation rate, avg irregularity score).
 *   - `daily_audit_sweep`       : nudges John on stale pending reviews,
 *                                 escalates stale clarifications, sends the
 *                                 daily KPI summary.
 *
 * Escalation threshold: irregularityScore > 4 → Xavier alert to John.
 * 1–4 → clarification email to mover. 0 → auto-approve.
 */

import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { BaseAgent, type AgentRunOptions } from './base';
import { db } from '../db';
import {
  documentAudits,
  documentIrregularities,
  movers,
  users,
  verificationItems,
} from '@shared/schema';
import { emitEvent } from '../events';
import { sendResendEmail } from '../notifications';
import { logger } from '../logger';
import { xavier } from './xavier';

const REID_MODEL = 'claude-sonnet-4-6';
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.lervit.com';

const REID_PERSONA = `
You are Reid Calloway, LervIT's Document Operations agent. You are precise,
methodical, and detail-oriented. You review mover documents against
industry standards for Calgary, Alberta.

Your job:
- Audit uploaded documents for validity
- Detect inconsistencies and irregularities
- Communicate clearly with movers
- Escalate only when score > 4
- Protect LervIT and its customers

TONE:
- Professional but human
- Clear and specific in feedback
- Never accusatory — assume good faith
- Explain exactly what's needed
`.trim();

const DOCUMENT_REQUIREMENTS: Record<string, string[]> = {
  insurance: [
    'Document is a commercial auto or cargo insurance certificate',
    'Named insured matches mover name or company name on profile',
    'Alberta jurisdiction or nationwide',
    'Expiry date is in the future',
    'Policy number is present and legible',
    'Issuing insurance company is recognizable',
    'Document is not blurry or cropped',
    'Document appears unaltered',
  ],
  drivers_license: [
    'Class 5 or higher license',
    'Alberta license (or valid Canadian)',
    'Not expired',
    'Name matches mover profile',
    'Photo is clear and legible',
    'License number is present',
  ],
  vehicle_registration: [
    'Vehicle matches profile description',
    'Registration is current year',
    'Owner name matches mover profile',
    'Alberta registration',
    'VIN is present',
  ],
  background_check: [
    'Issued within the last 6 months',
    'Name matches mover profile',
    'From an accredited provider',
    'No serious criminal flags noted',
    'Document is official and complete',
  ],
  wcb: [
    'Workers Compensation Board certificate',
    'Coverage is current/active',
    'Account in good standing',
    'Name or company matches profile',
  ],
  business_license: [
    'Business license is current',
    'Issued for the correct jurisdiction (Alberta / Calgary)',
    'Business name matches mover profile',
    'License number is present and legible',
  ],
  cvor: [
    'Commercial Vehicle Operator Registration is current',
    'Owner/operator matches mover profile',
    'Rating is satisfactory',
  ],
  default: [
    'Document is legible and complete',
    'Name matches mover profile',
    'Document appears unaltered',
    'Relevant dates are valid',
  ],
};

// ─── input types ───────────────────────────────────────────

interface ReviewDocumentInput {
  moverId: string;
  documentType: string;
  documentUrl?: string;
  documentText?: string;
  verificationItemId?: string;
}

interface RunDocumentAuditInput {
  auditId: string;
  moverId: string;
  documentType: string;
  documentUrl?: string;
  documentText?: string;
  moverName: string;
  moverProfile: Record<string, any>;
}

interface ApproveDocumentInput {
  auditId: string;
  reviewedBy: string;
  notes?: string;
}

interface RejectDocumentInput {
  auditId: string;
  reason: string;
  reviewedBy: string;
}

interface EscalateDocumentInput {
  auditId: string;
  reason?: string;
}

interface GenerateAuditReportInput {
  auditId: string;
}

interface KpiInput {
  days?: number;
}

// ─── agent ─────────────────────────────────────────────────

export class ReidAgent extends BaseAgent {
  name = 'Reid Calloway';
  code = 'reid';

  protected anthropic: Anthropic;

  constructor() {
    super();
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
  }

  protected async execute(
    action: string,
    input: Record<string, any>,
    options: AgentRunOptions = {},
  ): Promise<any> {
    switch (action) {
      case 'review_document':
        return this.reviewDocument(input as ReviewDocumentInput, options);
      case 'run_document_audit':
        return this.runDocumentAudit(input as RunDocumentAuditInput, options);
      case 'approve_document':
        return this.approveDocument(input as ApproveDocumentInput, options);
      case 'reject_document':
        return this.rejectDocument(input as RejectDocumentInput, options);
      case 'escalate_document':
        return this.escalateDocument(input as EscalateDocumentInput, options);
      case 'generate_audit_report':
        return this.generateAuditReport(input as GenerateAuditReportInput);
      case 'get_kpi_report':
        return this.getKpiReport(input as KpiInput);
      case 'daily_audit_sweep':
        return this.dailyAuditSweep(options);
      case 'backfill_existing_documents':
        return this.backfillExistingDocuments(input, options);
      default:
        throw new Error(`Reid: unknown action "${action}"`);
    }
  }

  // ─── review_document ─────────────────────────────────────

  private async reviewDocument(input: ReviewDocumentInput, options: AgentRunOptions = {}) {
    if (!input?.moverId || !input?.documentType) {
      throw new Error('Reid.reviewDocument: moverId and documentType required');
    }

    if (options.dryRun) {
      return { dryRun: true, input };
    }

    const [moverRow] = await db
      .select({
        id: movers.id,
        vehicleType: movers.vehicleType,
        name: users.name,
        email: users.email,
      })
      .from(movers)
      .innerJoin(users, eq(users.id, movers.userId))
      .where(eq(movers.id, input.moverId))
      .limit(1);

    if (!moverRow) {
      return { error: 'mover_not_found' };
    }

    const [audit] = await db
      .insert(documentAudits)
      .values({
        moverId: input.moverId,
        documentType: input.documentType,
        documentUrl: input.documentUrl,
        status: 'pending_review',
        auditedBy: 'reid',
      })
      .returning();

    await this.sendMoverMessage(moverRow, 'receipt', {
      documentType: input.documentType,
    });

    await xavier
      .run('escalate', {
        issue: `New document upload from ${moverRow.name ?? 'mover'}: ${input.documentType}. Pending Reid's audit.`,
        severity: 'low',
        agentName: 'Reid Calloway',
        data: {
          moverId: input.moverId,
          auditId: audit.id,
          documentType: input.documentType,
        },
      })
      .catch(() => {});

    return this.runDocumentAudit(
      {
        auditId: audit.id,
        moverId: input.moverId,
        documentType: input.documentType,
        documentUrl: input.documentUrl,
        documentText: input.documentText,
        moverName: moverRow.name ?? 'Mover',
        moverProfile: {
          name: moverRow.name,
          vehicle: moverRow.vehicleType,
          city: 'Calgary',
        },
      },
      options,
    );
  }

  // ─── run_document_audit ──────────────────────────────────

  private async runDocumentAudit(input: RunDocumentAuditInput, options: AgentRunOptions = {}) {
    if (options.dryRun) {
      return { dryRun: true, auditId: input.auditId };
    }

    const requirements =
      DOCUMENT_REQUIREMENTS[input.documentType] ?? DOCUMENT_REQUIREMENTS.default;

    const systemPrompt = `${REID_PERSONA}

You are reviewing a mover document.
Return ONLY valid JSON. No markdown. No explanation.

{
  "documentClassification": "...",
  "checks": [
    { "check": "check name", "passed": true, "severity": "low|medium|high|critical", "details": "specific finding" }
  ],
  "irregularityScore": 0,
  "recommendation": "auto_approve|request_clarification|escalate",
  "summary": "one sentence summary",
  "moverMessage": "message to send mover",
  "irregularities": ["specific issue 1", "specific issue 2"]
}

SCORING:
  Each failed check adds to score:
  low = 1 point
  medium = 2 points
  high = 3 points
  critical = 4 points

THRESHOLDS:
  0 → auto_approve
  1-4 → request_clarification
  >4 → escalate`;

    const userMessage = `Review this document:

Type: ${input.documentType}
Mover: ${input.moverName}
Profile: ${JSON.stringify(input.moverProfile)}
${input.documentUrl ? `URL: ${input.documentUrl}` : ''}
${
  input.documentText
    ? `Content: ${input.documentText.slice(0, 2000)}`
    : 'No text extracted — evaluate based on document type requirements'
}

Requirements to check:
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;

    let raw = '';
    try {
      const response = await this.anthropic.messages.create({
        model: REID_MODEL,
        max_tokens: 1000,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      const first = response.content[0];
      raw = first && first.type === 'text' ? first.text : '';
    } catch (err) {
      logger.error({ err, auditId: input.auditId }, '[Reid] Claude call failed');
    }

    let auditResult: any;
    try {
      auditResult = this.parseJson(raw);
    } catch {
      auditResult = {
        irregularityScore: 0,
        recommendation: 'auto_approve',
        summary: 'Audit completed (fallback)',
        checks: [],
        irregularities: [],
      };
    }

    const score = Number(auditResult.irregularityScore ?? 0);

    let status: string;
    if (score === 0) {
      status = 'auto_approved';
    } else if (score <= 4) {
      status = 'pending_clarification';
    } else {
      status = 'escalated';
    }

    const updateSet: Record<string, any> = {
      status,
      irregularityScore: score,
      irregularities: auditResult.irregularities ?? [],
      checksRun: auditResult.checks ?? [],
      notes: auditResult.summary ?? null,
      updatedAt: new Date(),
    };
    if (status === 'auto_approved') {
      updateSet.approvedAt = new Date();
      updateSet.reviewedBy = 'reid';
    } else if (status === 'escalated') {
      updateSet.escalatedAt = new Date();
      updateSet.escalationReason = auditResult.summary ?? 'Irregularities detected';
    } else if (status === 'pending_clarification') {
      updateSet.clarificationRequested = new Date();
    }

    await db
      .update(documentAudits)
      .set(updateSet)
      .where(eq(documentAudits.id, input.auditId));

    const failedChecks = Array.isArray(auditResult.checks)
      ? auditResult.checks.filter((c: any) => c && c.passed === false)
      : [];

    if (failedChecks.length) {
      await db.insert(documentIrregularities).values(
        failedChecks.map((c: any) => ({
          auditId: input.auditId,
          moverId: input.moverId,
          checkName: String(c.check ?? 'unknown'),
          result: String(c.details ?? 'failed'),
          severity: String(c.severity ?? 'low'),
          details: c.details ? String(c.details) : null,
        })),
      );
    }

    const [moverRow] = await db
      .select({
        id: movers.id,
        name: users.name,
        email: users.email,
      })
      .from(movers)
      .innerJoin(users, eq(users.id, movers.userId))
      .where(eq(movers.id, input.moverId))
      .limit(1);

    if (status === 'auto_approved') {
      await db
        .update(movers)
        .set({ documentsVerified: true })
        .where(eq(movers.id, input.moverId));

      if (moverRow) {
        await this.sendMoverMessage(moverRow, 'approved', {
          documentType: input.documentType,
        });
      }

      await emitEvent(
        'reid.document_auto_approved',
        'mover',
        input.moverId,
        { auditId: input.auditId, documentType: input.documentType, score },
        'agent',
      );

      logger.info(
        { moverId: input.moverId, documentType: input.documentType, score },
        '[Reid] Document auto-approved',
      );
    } else if (status === 'pending_clarification') {
      if (moverRow) {
        await this.sendMoverMessage(moverRow, 'clarification', {
          documentType: input.documentType,
          irregularities: auditResult.irregularities ?? [],
          score,
        });
      }

      logger.info(
        {
          moverId: input.moverId,
          score,
          irregularities: auditResult.irregularities,
        },
        '[Reid] Clarification requested',
      );
    } else if (status === 'escalated') {
      await xavier
        .run('escalate', {
          issue: `Reid: Document escalation — ${input.moverName} (${input.documentType}). Irregularity score: ${score}/10. Issues: ${
            Array.isArray(auditResult.irregularities)
              ? auditResult.irregularities.join(', ')
              : 'See audit'
          }. Action required in APEX.`,
          severity: 'high',
          agentName: 'Reid Calloway',
          data: {
            moverId: input.moverId,
            auditId: input.auditId,
            score,
            irregularities: auditResult.irregularities,
          },
        })
        .catch(() => {});

      if (moverRow) {
        await this.sendMoverMessage(moverRow, 'under_review', {
          documentType: input.documentType,
        });
      }

      await emitEvent(
        'reid.document_escalated',
        'mover',
        input.moverId,
        {
          auditId: input.auditId,
          score,
          escalationReason: auditResult.summary,
        },
        'agent',
      );

      logger.warn({ moverId: input.moverId, score }, '[Reid] Document escalated');
    }

    return {
      auditId: input.auditId,
      status,
      score,
      recommendation: auditResult.recommendation,
      summary: auditResult.summary,
      irregularities: auditResult.irregularities,
      checksRun: Array.isArray(auditResult.checks) ? auditResult.checks.length : 0,
    };
  }

  // ─── approve_document ────────────────────────────────────

  private async approveDocument(input: ApproveDocumentInput, options: AgentRunOptions = {}) {
    if (!input?.auditId) throw new Error('Reid.approveDocument: auditId required');
    if (options.dryRun) return { dryRun: true, auditId: input.auditId };

    const [audit] = await db
      .select()
      .from(documentAudits)
      .where(eq(documentAudits.id, input.auditId))
      .limit(1);

    if (!audit) return { error: 'audit_not_found' };

    await db
      .update(documentAudits)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        reviewedBy: input.reviewedBy,
        notes: input.notes ?? audit.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(documentAudits.id, input.auditId));

    await db
      .update(movers)
      .set({ documentsVerified: true })
      .where(eq(movers.id, audit.moverId));

    const [moverRow] = await db
      .select({ id: movers.id, name: users.name, email: users.email })
      .from(movers)
      .innerJoin(users, eq(users.id, movers.userId))
      .where(eq(movers.id, audit.moverId))
      .limit(1);

    if (moverRow) {
      await this.sendMoverMessage(moverRow, 'approved', {
        documentType: audit.documentType,
      });
    }

    await emitEvent(
      'reid.document_approved',
      'mover',
      audit.moverId,
      { auditId: input.auditId, reviewedBy: input.reviewedBy },
      'agent',
    );

    return { approved: true, auditId: input.auditId, moverId: audit.moverId };
  }

  // ─── reject_document ─────────────────────────────────────

  private async rejectDocument(input: RejectDocumentInput, options: AgentRunOptions = {}) {
    if (!input?.auditId || !input?.reason) {
      throw new Error('Reid.rejectDocument: auditId and reason required');
    }
    if (options.dryRun) return { dryRun: true, auditId: input.auditId };

    const [audit] = await db
      .select()
      .from(documentAudits)
      .where(eq(documentAudits.id, input.auditId))
      .limit(1);

    if (!audit) return { error: 'audit_not_found' };

    await db
      .update(documentAudits)
      .set({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: input.reason,
        reviewedBy: input.reviewedBy,
        updatedAt: new Date(),
      })
      .where(eq(documentAudits.id, input.auditId));

    const [moverRow] = await db
      .select({ id: movers.id, name: users.name, email: users.email })
      .from(movers)
      .innerJoin(users, eq(users.id, movers.userId))
      .where(eq(movers.id, audit.moverId))
      .limit(1);

    if (moverRow) {
      await this.sendMoverMessage(moverRow, 'rejected', {
        documentType: audit.documentType,
        reason: input.reason,
      });
    }

    await emitEvent(
      'reid.document_rejected',
      'mover',
      audit.moverId,
      { auditId: input.auditId, reason: input.reason },
      'agent',
    );

    return { rejected: true, auditId: input.auditId, reason: input.reason };
  }

  // ─── escalate_document ───────────────────────────────────

  private async escalateDocument(input: EscalateDocumentInput, options: AgentRunOptions = {}) {
    if (!input?.auditId) throw new Error('Reid.escalateDocument: auditId required');
    if (options.dryRun) return { dryRun: true, auditId: input.auditId };

    const [audit] = await db
      .select()
      .from(documentAudits)
      .where(eq(documentAudits.id, input.auditId))
      .limit(1);

    if (!audit) return { error: 'audit_not_found' };

    const reason = input.reason ?? 'Manual escalation';

    await db
      .update(documentAudits)
      .set({
        status: 'escalated',
        escalatedAt: new Date(),
        escalationReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(documentAudits.id, input.auditId));

    await xavier
      .run('escalate', {
        issue: `Reid: Manual escalation of ${audit.documentType} audit ${audit.id}. Reason: ${reason}`,
        severity: 'high',
        agentName: 'Reid Calloway',
        data: { auditId: audit.id, moverId: audit.moverId, reason },
      })
      .catch(() => {});

    await emitEvent(
      'reid.document_escalated',
      'mover',
      audit.moverId,
      { auditId: audit.id, reason, manual: true },
      'agent',
    );

    return { escalated: true, auditId: audit.id, reason };
  }

  // ─── generate_audit_report ───────────────────────────────

  private async generateAuditReport(input: GenerateAuditReportInput) {
    if (!input?.auditId) throw new Error('Reid.generateAuditReport: auditId required');

    const [audit] = await db
      .select()
      .from(documentAudits)
      .where(eq(documentAudits.id, input.auditId))
      .limit(1);

    if (!audit) return { error: 'audit_not_found' };

    const irregularities = await db
      .select()
      .from(documentIrregularities)
      .where(eq(documentIrregularities.auditId, input.auditId));

    return { audit, irregularities };
  }

  // ─── get_kpi_report ──────────────────────────────────────

  private async getKpiReport(input: KpiInput) {
    const days = input?.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const audits = await db
      .select()
      .from(documentAudits)
      .where(gte(documentAudits.createdAt, since));

    const total = audits.length;
    const autoApproved = audits.filter((a) => a.status === 'auto_approved').length;
    const escalated = audits.filter((a) => a.status === 'escalated').length;
    const pending = audits.filter(
      (a) => a.status === 'pending_review' || a.status === 'pending_clarification',
    ).length;
    const rejected = audits.filter((a) => a.status === 'rejected').length;

    const autoApprovalRate = total > 0 ? Math.round((autoApproved / total) * 100) : 0;
    const escalationRate = total > 0 ? Math.round((escalated / total) * 100) : 0;

    const avgScore =
      total > 0
        ? Math.round(
            (audits.reduce((sum, a) => sum + (a.irregularityScore ?? 0), 0) / total) * 10,
          ) / 10
        : 0;

    return {
      period: `${days} days`,
      total,
      autoApproved,
      escalated,
      pending,
      rejected,
      autoApprovalRate: `${autoApprovalRate}%`,
      escalationRate: `${escalationRate}%`,
      avgIrregularityScore: avgScore,
      kpis: {
        autoApprovalTarget: '70%',
        autoApprovalMet: autoApprovalRate >= 70,
        escalationTarget: '10%',
        escalationMet: escalationRate <= 10,
      },
    };
  }

  // ─── daily_audit_sweep ───────────────────────────────────

  private async dailyAuditSweep(options: AgentRunOptions = {}) {
    if (options.dryRun) return { dryRun: true };

    const results = {
      pendingReviewed: 0,
      escalated: 0,
      nudgedJohn: 0,
    };

    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const stalePending = await db
      .select()
      .from(documentAudits)
      .where(
        and(
          eq(documentAudits.status, 'pending_review'),
          lte(documentAudits.createdAt, oneDayAgo),
        ),
      );

    if (stalePending.length > 0) {
      await xavier
        .run('escalate', {
          issue: `Reid: ${stalePending.length} document(s) pending review for over 24 hours. Please review in APEX.`,
          severity: 'low',
          agentName: 'Reid Calloway',
          data: {
            count: stalePending.length,
            auditIds: stalePending.map((a) => a.id),
          },
        })
        .catch(() => {});

      results.nudgedJohn = stalePending.length;
    }

    const twoDaysAgo = new Date();
    twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);

    const staleClarification = await db
      .select()
      .from(documentAudits)
      .where(
        and(
          eq(documentAudits.status, 'pending_clarification'),
          lte(documentAudits.clarificationRequested, twoDaysAgo),
        ),
      );

    for (const audit of staleClarification) {
      await db
        .update(documentAudits)
        .set({
          status: 'escalated',
          escalatedAt: new Date(),
          escalationReason: 'No clarification received within 48 hours',
          updatedAt: new Date(),
        })
        .where(eq(documentAudits.id, audit.id));

      results.escalated++;
    }

    const kpi = await this.getKpiReport({ days: 7 });

    await xavier
      .run('escalate', {
        issue: `Reid Daily Report (7 days):
Auto-approved: ${kpi.autoApproved}
Pending: ${kpi.pending}
Escalated: ${kpi.escalated}
Rejected: ${kpi.rejected}
Auto-approval rate: ${kpi.autoApprovalRate} (target: 70%)
Avg irregularity score: ${kpi.avgIrregularityScore}`,
        severity: 'low',
        agentName: 'Reid Calloway',
        data: kpi,
      })
      .catch(() => {});

    await emitEvent('reid.daily_sweep_complete', 'agent', this.code, { results, kpi }, 'agent');

    return { results, kpi };
  }

  // ─── backfill_existing_documents ─────────────────────────

  private async backfillExistingDocuments(
    input: { limit?: number; dryRun?: boolean },
    options?: AgentRunOptions,
  ) {
    if (input.dryRun || options?.dryRun) {
      const total = await db
        .select({ count: sql<number>`count(*)` })
        .from(verificationItems)
        .leftJoin(
          documentAudits,
          eq(documentAudits.verificationItemId, verificationItems.id),
        )
        .where(
          and(
            isNull(documentAudits.id),
            inArray(verificationItems.status, ['Approved', 'Pending', 'Under Review']),
          ),
        );

      return {
        dryRun: true,
        itemsNeedingBackfill: total[0]?.count ?? 0,
      };
    }

    const items = await db
      .select({
        id: verificationItems.id,
        moverId: verificationItems.moverId,
        type: verificationItems.type,
        status: verificationItems.status,
        fileUrls: verificationItems.fileUrls,
        expiryDate: verificationItems.expiryDate,
      })
      .from(verificationItems)
      .leftJoin(
        documentAudits,
        eq(documentAudits.verificationItemId, verificationItems.id),
      )
      .where(isNull(documentAudits.id))
      .limit(input.limit ?? 100)
      .orderBy(desc(verificationItems.createdAt));

    logger.info({ count: items.length }, '[Reid] Starting backfill');

    const results = {
      total: items.length,
      autoApproved: 0,
      needsClarification: 0,
      escalated: 0,
      skipped: 0,
      errors: 0,
    };

    for (const item of items) {
      try {
        if (!item.moverId) {
          results.skipped++;
          continue;
        }

        const docType = item.type
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace('driver', 'drivers')
          .replace("driver's_license", 'drivers_license')
          .replace('criminal_background', 'background_check')
          .replace('background_check_report', 'background_check');

        const documentUrl = item.fileUrls?.[0];

        const docContext = [
          item.status ? `Current status: ${item.status}` : '',
          item.expiryDate
            ? `Expiry date: ${new Date(item.expiryDate).toLocaleDateString()}`
            : '',
          documentUrl ? `Document URL: ${documentUrl}` : 'No document URL available',
        ]
          .filter(Boolean)
          .join('\n');

        const [audit] = await db
          .insert(documentAudits)
          .values({
            moverId: item.moverId,
            documentType: docType,
            documentUrl: documentUrl ?? null,
            verificationItemId: item.id,
            status: 'pending_review',
            auditedBy: 'reid',
          })
          .returning();

        const auditResult = await this.runDocumentAudit(
          {
            auditId: audit.id,
            moverId: item.moverId,
            documentType: docType,
            documentUrl,
            documentText: docContext,
            moverName: item.moverId,
            moverProfile: {
              name: item.moverId,
              vehicle: 'unknown',
              city: 'Calgary',
            },
          },
          options,
        );

        if (auditResult.status === 'auto_approved') {
          results.autoApproved++;
        } else if (auditResult.status === 'pending_clarification') {
          results.needsClarification++;
        } else if (auditResult.status === 'escalated') {
          results.escalated++;
        }

        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        logger.error({ err, itemId: item.id }, '[Reid] Backfill item failed');
        results.errors++;
      }
    }

    await xavier
      .run('escalate', {
        issue: `Reid Backfill Complete:
         Total reviewed: ${results.total}
         Auto-approved: ${results.autoApproved} ✅
         Needs clarification: ${results.needsClarification} ⚠️
         Escalated: ${results.escalated} 🚨
         Errors: ${results.errors}`,
        severity: 'low',
        agentName: 'Reid Calloway',
        data: results,
      })
      .catch(() => {});

    await emitEvent('reid.backfill_complete', 'agent', 'reid', results, 'agent');

    logger.info(results, '[Reid] Backfill complete ✅');

    return results;
  }

  // ─── mover comms ─────────────────────────────────────────

  private async sendMoverMessage(
    mover: { name: string | null; email: string | null },
    type: 'receipt' | 'approved' | 'clarification' | 'under_review' | 'rejected',
    data: Record<string, any>,
  ) {
    if (!mover.email) return;

    const documentsUrl = `${APP_BASE_URL}/profile/documents`;
    const dashboardUrl = `${APP_BASE_URL}/dashboard`;

    const REID_EMAIL_FOOTER = `
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="font-size:13px;color:#4b5563;margin:0 0 12px 0;">Please do not reply to this email.</p>
      <p style="font-size:13px;color:#4b5563;margin:0 0 12px 0;">
        To re-upload or update your documents:<br/>
        <a href="${documentsUrl}">${documentsUrl}</a>
      </p>
      <p style="font-size:13px;color:#4b5563;margin:0 0 12px 0;">
        Questions or concerns?<br/>
        Email: <a href="mailto:support@lervit.com">support@lervit.com</a><br/>
        Phone: 1-888-982-0885
      </p>
      <p style="font-size:13px;color:#4b5563;margin:0 0 12px 0;">
        Reid Calloway<br/>
        Document Operations Team<br/>
        LervIT Technologies Corporation<br/>
        Calgary, Alberta, Canada
      </p>
      <p style="font-size:11px;color:#9ca3af;margin:16px 0 0 0;">
        This is an automated message from LervIT's document verification system.
      </p>
    `;

    const docLabel = String(data.documentType ?? 'document').replace(/_/g, ' ');
    const firstName = (mover.name ?? 'there').split(/\s+/)[0];

    let subject = '';
    let bodyHtml = '';

    switch (type) {
      case 'receipt':
        subject = `[LervIT] Document received — ${docLabel} under review`;
        bodyHtml = `
          <p>Hi ${firstName},</p>
          <p>We've received your <strong>${docLabel}</strong> ✅</p>
          <p>Our system will review it within 4 hours and notify you of the outcome.</p>
          <p><strong>What happens next:</strong></p>
          <ol>
            <li>Reid reviews your document</li>
            <li>You receive approval or clarification request</li>
            <li>Once approved, you're eligible for dispatch</li>
          </ol>
          <p>Estimated review time: 2-4 hours</p>
          ${REID_EMAIL_FOOTER}
        `;
        break;
      case 'approved':
        subject = `[LervIT] ✅ ${docLabel} verified — you're ready for dispatch`;
        bodyHtml = `
          <p>Hi ${firstName},</p>
          <p>Great news — your <strong>${docLabel}</strong> has been verified! ✅</p>
          <p><strong>Your account status:</strong></p>
          <ul>
            <li>Document: Verified ✅</li>
            <li>Dispatch eligibility: Active ✅</li>
            <li>Jobs: Available in your area</li>
          </ul>
          <p>You can now accept jobs on LervIT. Make sure your availability is updated in the app to start receiving job offers.</p>
          <p><a href="${dashboardUrl}">${dashboardUrl}</a></p>
          ${REID_EMAIL_FOOTER}
        `;
        break;
      case 'clarification': {
        const list = Array.isArray(data.irregularities)
          ? (data.irregularities as string[])
              .map((issue) => `<li>${issue}</li>`)
              .join('')
          : '';
        subject = `[LervIT] Action required — ${docLabel} needs clarification`;
        bodyHtml = `
          <p>Hi ${firstName},</p>
          <p>Thank you for submitting your ${docLabel}. We reviewed it and need a few things clarified before we can approve it.</p>
          <p><strong>Items to address:</strong></p>
          <ol>${list}</ol>
          <p><strong>How to resolve:</strong></p>
          <ol>
            <li>Address the items above</li>
            <li>Re-upload your document at: <a href="${documentsUrl}">${documentsUrl}</a></li>
            <li>We'll review within 4 hours</li>
          </ol>
          <p>Please re-upload within 48 hours to avoid delays to your account.</p>
          ${REID_EMAIL_FOOTER}
        `;
        break;
      }
      case 'under_review':
        subject = `[LervIT] ${docLabel} under additional review`;
        bodyHtml = `
          <p>Hi ${firstName},</p>
          <p>Your ${docLabel} is currently under additional review by our compliance team.</p>
          <p><strong>Timeline:</strong></p>
          <ul>
            <li>Review completion: within 24 hours</li>
            <li>You will be notified by email</li>
            <li>No action required from you now</li>
          </ul>
          <p>We appreciate your patience.</p>
          ${REID_EMAIL_FOOTER}
        `;
        break;
      case 'rejected':
        subject = `[LervIT] ${docLabel} not accepted — action required`;
        bodyHtml = `
          <p>Hi ${firstName},</p>
          <p>After careful review, we were unable to accept your ${docLabel}.</p>
          <p><strong>Reason:</strong> ${data.reason ?? 'Document did not meet our verification requirements'}</p>
          <p><strong>Next steps:</strong></p>
          <ol>
            <li>Review the reason above</li>
            <li>Obtain a valid document</li>
            <li>Re-upload at: <a href="${documentsUrl}">${documentsUrl}</a></li>
          </ol>
          <p>If you believe this is an error or need help, contact our support team — we're happy to assist.</p>
          ${REID_EMAIL_FOOTER}
        `;
        break;
    }

    try {
      await sendResendEmail({
        from: `${process.env.REID_EMAIL_NAME ?? 'Reid at LervIT'} <${process.env.REID_EMAIL ?? 'noreply@lervit.com'}>`,
        to: mover.email,
        replyTo: process.env.REID_REPLY_TO ?? 'support@lervit.com',
        subject,
        html: bodyHtml,
        listUnsubscribeUrl: `${APP_BASE_URL}/mover/preferences`,
      });
    } catch (err) {
      logger.error({ err, type }, '[Reid] Email send failed');
    }
  }

  // ─── helpers ─────────────────────────────────────────────

  private parseJson(raw: string): any {
    let clean = raw.replace(/`{3}json\s*/gi, '').replace(/`{3}\s*/gi, '').trim();

    const objStart = clean.indexOf('{');
    if (objStart === -1) throw new Error('No JSON found');
    const end = clean.lastIndexOf('}');
    const jsonStr = end !== -1 ? clean.slice(objStart, end + 1) : clean.slice(objStart);

    try {
      return JSON.parse(jsonStr);
    } catch {
      const sanitized = jsonStr.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
      return JSON.parse(sanitized);
    }
  }
}

export const reid = new ReidAgent();
