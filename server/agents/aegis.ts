/**
 * Aegis Ford (COMPLIANCE) — verification document + dispatch-eligibility monitor.
 *
 * Actions:
 *   - `scan_expiring_documents`   : daily sweep for approved verification_items
 *                                   with expiry_date within 30 days. Sends
 *                                   30d / 14d / 7d warnings (one-shot per
 *                                   window via `reminded_*d` flags) and
 *                                   suspends the mover if the doc has expired.
 *   - `scan_dispatch_eligibility` : safety net — anyone flagged as available
 *                                   without isVerified/documentsVerified is
 *                                   forced offline and notified. Then sweeps
 *                                   movers left online with stale GPS, who
 *                                   went online and closed the app.
 *   - `suspend_mover`             : single choke-point for pilot suspension.
 *                                   Sets pilotStatus='suspended', isAvailable
 *                                   false, records the reason in pilotNotes.
 *   - `reactivate_mover`          : admin/system-initiated reversal.
 *
 * Emails are persona-branded ("Aegis Ford | LervIT <aegis.ford@lervit.com>")
 * through Resend. SMS goes through notificationService — 7-day warnings and
 * suspension notices only, to avoid noise.
 */

import { and, eq, inArray, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';
import { BaseAgent, type AgentRunOptions } from './base';
import { db } from '../db';
import { movers, users, verificationItems } from '@shared/schema';
import { emitEvent } from '../events';
import { notificationService, sendResendEmail } from '../notifications';
import { logger } from '../logger';
import { xavier } from './xavier';
import { escapeHtml } from '../lib/promptSanitizer';

// ─── constants ─────────────────────────────────────────────

const AEGIS_EMAIL = process.env.AEGIS_EMAIL?.trim() || 'aegis.ford@lervit.com';
const AEGIS_FROM = `Aegis Ford | LervIT <${AEGIS_EMAIL}>`;
const AEGIS_REPLY_TO = 'support@lervit.com';
const AEGIS_MODEL = 'claude-haiku-4-5-20251001';
const APP_BASE_URL = (process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim();
const DAY_MS = 24 * 60 * 60 * 1000;

// Documents that carry an expiry_date and must be re-uploaded on renewal.
// ID + VEHICLE_PHOTOS + PAYOUT_SETUP don't expire in the same way.
const EXPIRY_DOCS = [
  'DRIVERS_LICENSE',
  'INSURANCE',
  'VEHICLE_REGISTRATION',
  'BACKGROUND_CHECK',
] as const;

// A mover who goes online and closes the app stays in the dispatch pool
// forever: nothing but the toggle ever wrote `is_available`. Dispatch already
// treats a GPS ping older than 2h as "not on an active trip" (AC-11), so 4h of
// silence is a comfortable margin past that before we call them gone.
const STALE_LOCATION_MS = 4 * 60 * 60 * 1000;

const SUSPENSION_THRESHOLD_DAYS = 0;
const WARNING_7_DAYS = 7;
const WARNING_14_DAYS = 14;
const WARNING_30_DAYS = 30;

const DOC_LABELS: Record<string, string> = {
  DRIVERS_LICENSE: "Driver's License",
  INSURANCE: 'Vehicle Insurance',
  VEHICLE_REGISTRATION: 'Vehicle Registration',
  BACKGROUND_CHECK: 'Background Check',
};

// ─── input / result types ──────────────────────────────────

interface SuspendInput {
  moverId: string;
  reason: string;
}

interface ReactivateInput {
  moverId: string;
}

interface ExpiringRow {
  id: string;
  moverId: string;
  type: string;
  expiryDate: Date | null;
  reminded30d: boolean;
  reminded14d: boolean;
  reminded7d: boolean;
  moverName: string | null;
  moverEmail: string | null;
  moverPhone: string | null;
}

interface ScanExpiringResult {
  totalChecked: number;
  expired: number;
  warned7d: number;
  warned14d: number;
  warned30d: number;
  suspended: number;
  dryRun?: boolean;
}

interface ScanEligibilityResult {
  total: number;
  corrected: number;
  staleOffline: number;
  dryRun?: boolean;
  violations?: Array<{ moverId: string; name: string | null; isVerified: boolean }>;
  stale?: Array<{ moverId: string; name: string | null; lastLocationUpdate: Date | null }>;
}

// ─── agent ─────────────────────────────────────────────────

export class AegisAgent extends BaseAgent {
  name = 'Aegis Ford';
  code = 'aegis';
  readonly model = AEGIS_MODEL;

  protected async execute(
    action: string,
    input: Record<string, any>,
    options: AgentRunOptions = {},
  ): Promise<any> {
    switch (action) {
      case 'scan_expiring_documents':
        return this.scanExpiringDocuments(options);
      case 'scan_dispatch_eligibility':
        return this.scanDispatchEligibility(options);
      case 'suspend_mover':
        return this.suspendMover(input as SuspendInput, options);
      case 'reactivate_mover':
        return this.reactivateMover(input as ReactivateInput, options);
      default:
        throw new Error(`Aegis: unknown action "${action}"`);
    }
  }

  // ─── scan expiring documents ─────────────────────────────

  private async scanExpiringDocuments(options: AgentRunOptions = {}): Promise<ScanExpiringResult> {
    const now = new Date();
    const in30Days = new Date(now.getTime() + WARNING_30_DAYS * DAY_MS);

    const rows: ExpiringRow[] = await db
      .select({
        id: verificationItems.id,
        moverId: verificationItems.moverId,
        type: verificationItems.type,
        expiryDate: verificationItems.expiryDate,
        reminded30d: verificationItems.reminded30d,
        reminded14d: verificationItems.reminded14d,
        reminded7d: verificationItems.reminded7d,
        moverName: users.name,
        moverEmail: users.email,
        moverPhone: users.phone,
      })
      .from(verificationItems)
      .innerJoin(movers, eq(movers.id, verificationItems.moverId))
      .innerJoin(users, eq(users.id, movers.userId))
      .where(
        and(
          eq(verificationItems.status, 'approved'),
          isNotNull(verificationItems.expiryDate),
          lte(verificationItems.expiryDate, in30Days),
          inArray(verificationItems.type, EXPIRY_DOCS as unknown as string[]),
        ),
      );

    const result: ScanExpiringResult = {
      totalChecked: rows.length,
      expired: 0,
      warned7d: 0,
      warned14d: 0,
      warned30d: 0,
      suspended: 0,
    };

    for (const item of rows) {
      if (!item.expiryDate) continue;

      const daysUntilExpiry = Math.floor(
        (item.expiryDate.getTime() - now.getTime()) / DAY_MS,
      );

      if (options.dryRun) {
        logger.info(
          { moverId: item.moverId, type: item.type, daysUntilExpiry },
          '[Aegis DRY RUN] would process expiry',
        );
        continue;
      }

      // EXPIRED — suspend and email
      if (daysUntilExpiry <= SUSPENSION_THRESHOLD_DAYS) {
        await this.suspendMover(
          {
            moverId: item.moverId,
            reason: `${item.type} expired on ${item.expiryDate.toDateString()}`,
          },
          {},
        );
        await this.sendExpiredEmail(item);
        await db
          .update(verificationItems)
          .set({ status: 'expired' })
          .where(eq(verificationItems.id, item.id));
        result.expired++;
        result.suspended++;
        continue;
      }

      // 7-day warning (also drives an SMS)
      if (daysUntilExpiry <= WARNING_7_DAYS && !item.reminded7d) {
        await this.sendExpiryWarning(item, WARNING_7_DAYS, daysUntilExpiry);
        await db
          .update(verificationItems)
          .set({ reminded7d: true })
          .where(eq(verificationItems.id, item.id));
        result.warned7d++;
        continue;
      }

      // 14-day warning
      if (daysUntilExpiry <= WARNING_14_DAYS && !item.reminded14d) {
        await this.sendExpiryWarning(item, WARNING_14_DAYS, daysUntilExpiry);
        await db
          .update(verificationItems)
          .set({ reminded14d: true })
          .where(eq(verificationItems.id, item.id));
        result.warned14d++;
        continue;
      }

      // 30-day warning
      if (daysUntilExpiry <= WARNING_30_DAYS && !item.reminded30d) {
        await this.sendExpiryWarning(item, WARNING_30_DAYS, daysUntilExpiry);
        await db
          .update(verificationItems)
          .set({ reminded30d: true })
          .where(eq(verificationItems.id, item.id));
        result.warned30d++;
      }
    }

    // Escalate to Xavier if we auto-suspended anyone this run.
    if (!options.dryRun && result.suspended > 0) {
      try {
        await xavier.run('escalate', {
          issue: `Aegis suspended ${result.suspended} mover(s) for expired documents`,
          severity: 'high',
          agentName: 'Aegis Ford',
          data: { suspended: result.suspended, expired: result.expired },
        });
      } catch (err) {
        logger.error({ err }, '[Aegis] xavier escalation failed');
      }
    }

    if (!options.dryRun) {
      await emitEvent(
        'aegis.scan_complete',
        'agent',
        this.code,
        { ...result },
        'agent',
      );
    }

    if (options.dryRun) result.dryRun = true;
    return result;
  }

  // ─── scan dispatch eligibility ───────────────────────────

  private async scanDispatchEligibility(options: AgentRunOptions = {}): Promise<ScanEligibilityResult> {
    const violations = await db
      .select({
        id: movers.id,
        userId: movers.userId,
        isVerified: movers.isVerified,
        documentsVerified: movers.documentsVerified,
        pilotStatus: movers.pilotStatus,
        name: users.name,
        email: users.email,
      })
      .from(movers)
      .innerJoin(users, eq(users.id, movers.userId))
      .where(
        and(
          eq(movers.isAvailable, true),
          or(
            eq(movers.isVerified, false),
            eq(movers.documentsVerified, false),
          ),
        ),
      );

    if (options.dryRun) {
      const staleDry = await this.findStaleOnlineMovers();
      return {
        total: violations.length,
        corrected: 0,
        staleOffline: 0,
        dryRun: true,
        violations: violations.map((v) => ({
          moverId: v.id,
          name: v.name,
          isVerified: v.isVerified,
        })),
        stale: staleDry,
      };
    }

    let corrected = 0;
    for (const m of violations) {
      await db
        .update(movers)
        .set({ isAvailable: false })
        .where(eq(movers.id, m.id));

      if (m.email) {
        try {
          await sendResendEmail({
            from: AEGIS_FROM,
            to: m.email,
            replyTo: AEGIS_REPLY_TO,
            subject: 'Your availability has been turned off',
            html: `
              <p>Hi ${escapeHtml(m.name ?? 'there')},</p>
              <p>Your availability has been turned off because your account verification is not yet complete.</p>
              <p>Complete your verification to go online and start accepting jobs:</p>
              <p><a href="${APP_BASE_URL}/mover/verification">Complete verification →</a></p>
              <p>Aegis Ford<br/>LervIT Compliance</p>
            `,
            listUnsubscribeUrl: `${APP_BASE_URL}/mover/preferences`,
          });
        } catch (err) {
          logger.error({ err, moverId: m.id }, '[Aegis] eligibility email failed');
        }
      }

      await emitEvent(
        'aegis.availability_corrected',
        'mover',
        m.id,
        { reason: 'unverified' },
        'agent',
      );
      corrected++;
    }

    // Stale-GPS sweep runs after the correction above, so movers already forced
    // offline for missing verification are out of the candidate set and are not
    // counted or logged twice.
    const staleOffline = await this.sweepStaleOnlineMovers();

    return { total: violations.length, corrected, staleOffline };
  }

  // ─── stale-location sweep ────────────────────────────────

  /**
   * Movers who are online but whose last GPS ping is older than
   * STALE_LOCATION_MS. `auto_offline_booking_id IS NULL` skips anyone the
   * dispatch pipeline is already holding for a job, so this never fights that
   * bookkeeping (see server/dispatch.ts).
   *
   * A NULL `last_location_update` is deliberately not stale. There is no record
   * of when a mover went online, so a null cannot be told apart from someone who
   * toggled on seconds ago and has not reported a fix yet — and going online
   * with an address on file geocodes and stamps the column anyway. Movers with
   * no coordinates at all are already excluded from dispatch.
   */
  private async findStaleOnlineMovers() {
    const cutoff = new Date(Date.now() - STALE_LOCATION_MS);

    return db
      .select({
        moverId: movers.id,
        name: users.name,
        lastLocationUpdate: movers.lastLocationUpdate,
      })
      .from(movers)
      .innerJoin(users, eq(users.id, movers.userId))
      .where(
        and(
          eq(movers.isAvailable, true),
          isNull(movers.autoOfflineBookingId),
          isNotNull(movers.lastLocationUpdate),
          lt(movers.lastLocationUpdate, cutoff),
        ),
      );
  }

  private async sweepStaleOnlineMovers(): Promise<number> {
    const stale = await this.findStaleOnlineMovers();
    if (stale.length === 0) return 0;

    let sweptCount = 0;
    for (const m of stale) {
      // Re-check the conditions in the UPDATE itself: the sweep is not the only
      // writer of this flag, and a mover who came back or accepted a job since
      // the SELECT must not be knocked offline by a stale read.
      const swept = await db
        .update(movers)
        .set({ isAvailable: false })
        .where(
          and(
            eq(movers.id, m.moverId),
            eq(movers.isAvailable, true),
            isNull(movers.autoOfflineBookingId),
          ),
        )
        .returning({ id: movers.id });

      if (swept.length === 0) continue;

      logger.info(
        {
          event: 'aegis_stale_location_offline',
          moverId: m.moverId,
          name: m.name,
          lastLocationUpdate: m.lastLocationUpdate,
        },
        `[Aegis] Forced ${m.name ?? m.moverId} offline — no GPS for over ${STALE_LOCATION_MS / 3600000}h`,
      );

      await emitEvent(
        'aegis.availability_corrected',
        'mover',
        m.moverId,
        { reason: 'stale_location', lastLocationUpdate: m.lastLocationUpdate },
        'agent',
      );
      sweptCount++;
    }

    return sweptCount;
  }

  // ─── suspend / reactivate ────────────────────────────────

  private async suspendMover(input: SuspendInput, options: AgentRunOptions = {}) {
    if (!input?.moverId) throw new Error('Aegis.suspendMover: moverId required');
    if (options.dryRun) return { dryRun: true, moverId: input.moverId };

    await db
      .update(movers)
      .set({
        isAvailable: false,
        pilotStatus: 'suspended',
        pilotNotes: input.reason,
      })
      .where(eq(movers.id, input.moverId));

    await emitEvent(
      'aegis.mover_suspended',
      'mover',
      input.moverId,
      { reason: input.reason, suspendedBy: 'aegis' },
      'agent',
    );

    logger.warn({ moverId: input.moverId, reason: input.reason }, '[Aegis] mover suspended');
    return { suspended: true, moverId: input.moverId };
  }

  private async reactivateMover(input: ReactivateInput, options: AgentRunOptions = {}) {
    if (!input?.moverId) throw new Error('Aegis.reactivateMover: moverId required');
    if (options.dryRun) return { dryRun: true, moverId: input.moverId };

    await db
      .update(movers)
      .set({
        pilotStatus: 'approved',
        pilotNotes: null,
      })
      .where(eq(movers.id, input.moverId));

    const [moverRow] = await db
      .select({ name: users.name, email: users.email })
      .from(movers)
      .innerJoin(users, eq(users.id, movers.userId))
      .where(eq(movers.id, input.moverId))
      .limit(1);

    if (moverRow?.email) {
      try {
        await sendResendEmail({
          from: AEGIS_FROM,
          to: moverRow.email,
          replyTo: AEGIS_REPLY_TO,
          subject: 'Your LervIT account has been reactivated',
          html: `
            <p>Hi ${escapeHtml(moverRow.name ?? 'there')},</p>
            <p>Your account has been reactivated. You can now go available and start accepting jobs again.</p>
            <p><a href="${APP_BASE_URL}/mover/dashboard">Go to dashboard →</a></p>
            <p>Aegis Ford<br/>LervIT Compliance</p>
          `,
          listUnsubscribeUrl: `${APP_BASE_URL}/mover/preferences`,
        });
      } catch (err) {
        logger.error({ err, moverId: input.moverId }, '[Aegis] reactivation email failed');
      }
    }

    await emitEvent(
      'aegis.mover_reactivated',
      'mover',
      input.moverId,
      {},
      'agent',
    );

    return { reactivated: true, moverId: input.moverId };
  }

  // ─── outbound helpers ────────────────────────────────────

  private async sendExpiryWarning(
    item: ExpiringRow,
    warningDays: number,
    daysUntilExpiry: number,
  ): Promise<void> {
    if (!item.moverEmail || !item.expiryDate) return;

    const docLabel = DOC_LABELS[item.type] ?? item.type;
    const urgency = warningDays <= 7 ? 'URGENT: ' : '';

    try {
      await sendResendEmail({
        from: AEGIS_FROM,
        to: item.moverEmail,
        replyTo: AEGIS_REPLY_TO,
        subject: `${urgency}${docLabel} expires in ${daysUntilExpiry} days`,
        html: `
          <p>Hi ${escapeHtml(item.moverName ?? 'there')},</p>
          <p>Your <strong>${docLabel}</strong> expires on
          <strong>${item.expiryDate.toDateString()}</strong> — ${daysUntilExpiry} days from now.</p>
          <p>Please upload your renewed document to keep your account active:</p>
          <p><a href="${APP_BASE_URL}/mover/documents"
             style="background:#1e3a5f;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">
            Upload renewed document →
          </a></p>
          <p style="margin-top:16px;color:#64748b;font-size:13px;">
            If your document expires, your account will be temporarily suspended until the renewal is uploaded and approved.
          </p>
          <p>Aegis Ford<br/>LervIT Compliance</p>
        `,
        listUnsubscribeUrl: `${APP_BASE_URL}/mover/preferences`,
      });
    } catch (err) {
      logger.error({ err, moverId: item.moverId, type: item.type }, '[Aegis] warning email failed');
    }

    if (warningDays <= WARNING_7_DAYS && item.moverPhone) {
      try {
        await notificationService.sendSMS({
          to: item.moverPhone,
          message:
            `LervIT: Your ${docLabel} expires in ${daysUntilExpiry} days. ` +
            `Upload renewal: ${APP_BASE_URL}/mover/documents Reply STOP to opt out`,
          type: 'pilot_status',
        });
      } catch (err) {
        logger.error({ err, moverId: item.moverId }, '[Aegis] warning SMS failed');
      }
    }

    await emitEvent(
      'aegis.expiry_warning_sent',
      'mover',
      item.moverId,
      { type: item.type, daysUntilExpiry, warningDays },
      'agent',
    );
  }

  private async sendExpiredEmail(item: ExpiringRow): Promise<void> {
    if (!item.moverEmail || !item.expiryDate) return;
    const docLabel = DOC_LABELS[item.type] ?? item.type;

    try {
      await sendResendEmail({
        from: AEGIS_FROM,
        to: item.moverEmail,
        replyTo: AEGIS_REPLY_TO,
        subject: 'Account suspended — document expired',
        html: `
          <p>Hi ${escapeHtml(item.moverName ?? 'there')},</p>
          <p>Your <strong>${docLabel}</strong> expired on ${item.expiryDate.toDateString()}.
          Your account has been temporarily suspended.</p>
          <p>Upload your renewed document to reactivate your account:</p>
          <p><a href="${APP_BASE_URL}/mover/documents"
             style="background:#dc2626;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">
            Upload renewal now →
          </a></p>
          <p>Aegis Ford<br/>LervIT Compliance</p>
        `,
        listUnsubscribeUrl: `${APP_BASE_URL}/mover/preferences`,
      });
    } catch (err) {
      logger.error({ err, moverId: item.moverId }, '[Aegis] suspended-notice email failed');
    }

    if (item.moverPhone) {
      try {
        await notificationService.sendSMS({
          to: item.moverPhone,
          message:
            `LervIT: Your ${docLabel} has expired and your account is suspended. ` +
            `Upload renewal to reactivate: ${APP_BASE_URL}/mover/documents Reply STOP to opt out`,
          type: 'pilot_status',
        });
      } catch (err) {
        logger.error({ err, moverId: item.moverId }, '[Aegis] suspended-notice SMS failed');
      }
    }
  }
}

export const aegis = new AegisAgent();

// Re-export the action set so routes.ts can validate trigger payloads
// without duplicating the switch statement.
export const AEGIS_ACTIONS = new Set([
  'scan_expiring_documents',
  'scan_dispatch_eligibility',
  'suspend_mover',
  'reactivate_mover',
]);
