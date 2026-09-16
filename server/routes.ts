/**
 * ============================================================================
 * LERVIT API ROUTES - SECURITY DOCUMENTATION
 * ============================================================================
 * 
 * SECURITY ASSUMPTIONS:
 * ---------------------
 * 1. All requests pass through session-based authentication middleware
 * 2. User IDs come from server-side session, NOT from client request body
 * 3. Payment amounts are calculated server-side from booking data
 * 4. Webhook endpoints verify Stripe signatures before processing
 * 
 * REQUIRED ENVIRONMENT VARIABLES:
 * -------------------------------
 * - STRIPE_SECRET_KEY: Server-side Stripe secret key (sk_live_... or sk_test_...)
 * - VITE_STRIPE_PUBLIC_KEY: Frontend publishable key (pk_live_... or pk_test_...)
 * - STRIPE_WEBHOOK_SECRET: Webhook endpoint signing secret (whsec_...)
 * - SESSION_SECRET: Session encryption secret
 * - DATABASE_URL: PostgreSQL connection string
 * 
 * ENDPOINT SECURITY LEVELS:
 * -------------------------
 * PUBLIC:        /api/auth/*, /health
 * PROTECTED:     /api/bookings/*, /api/movers/*, /api/customers/* (requires session)
 * STRIPE-ONLY:   /api/stripe-webhook (signature verified, no user session)
 * ADMIN-ONLY:    /api/admin/* (requires admin role)
 * 
 * PAYMENT SECURITY:
 * -----------------
 * - PaymentIntent amounts are calculated server-side from booking price
 * - Platform fees are calculated server-side (NEVER trust client amounts)
 * - Idempotency keys prevent duplicate charges/transfers
 * - Webhook signature verification prevents spoofed events
 * 
 * ============================================================================
 */

import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import type { Socket } from "net";
import { storage } from "./storage";
import { db, pool } from "./db";
import { moverWebSocket, customerWebSocket, adminVoiceWebSocket, generateWebSocketToken, generateCustomerWebSocketToken } from "./websocket";
import { WebSocketServer } from "ws";
import { createNovaBridge } from "./lib/novaBridge";
import { novaCallContextStore } from "./nova-webhook-routes";
import { registerVoiceRoutes } from "./voice-routes";
import { insertUserSchema, insertMoverSchema, insertBookingSchema, insertMessageSchema, insertReviewSchema, jobNotifications, insertSupportTicketSchema, insertSupportTicketReplySchema, supportTickets, supportTicketReplies, bookings, users as usersTable, movers as moversTable, verificationItems, insertVerificationItemSchema, identifiedItems, messages, reviews, aiRuns, aiSupportInsights, User, moverStripeAccounts, moverEarnings, moverPayouts, BOOKING_STATUSES, ACTIVE_STATUSES, isValidStatusTransition, getNextValidStatuses, BOOKING_STATUS_INFO, bookingMetrics as bookingMetricsTable, itemFeedback as itemFeedbackTable, moverPerformance as moverPerformanceTable, moverTermsAcceptance, emailCampaigns, insertEmailCampaignSchema, inAppNotifications, abandonedBookings, insertAbandonedBookingSchema, analyticsEvents, insertAnalyticsEventSchema, bookingAssignments, partnerTeamMembers, partners, partnerUsers, bookingStatusEvents, savedAddresses, feedbackSurveys, moverAvailability, referrals, partnerEarnings, stripeWebhookEvents, businessEvents, kpiTargets, moverActivityLog, leads, partnerIncidents, adminAuditLog, quotes, voiceCalls, blogPosts, gmbPosts, socialPosts, campaigns, contentItems } from "@shared/schema";
import { adminAuditMiddleware } from "./middleware/adminAudit";
import { analyzeTicket, getQuickResponses } from "./ai-support-analyzer";
import { z } from "zod";
import { eq, and, notInArray, sql, desc, inArray, lt, or, isNull, isNotNull, gte, lte, ne, ilike } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./auth";
import { calculateDistance } from "./utils/distance";
import multer from "multer";
import path from "path";
import fs from "fs";
import Stripe from "stripe";
import { notificationService, formatCalgaryDate, sendResendEmail, EMAIL_SENDERS } from "./notifications";
import { format } from "date-fns";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { logger, logEvent } from "./logger";
import { emitEvent } from "./events";
import { agentEventBus } from "./lib/agentEventBus";
import { buildReidEmail } from "./lib/reidEmailTemplates";
import { buildIntelligenceSummary } from "./intelligence";
import { computeBookingSla } from "./sla";
import { stripe, PLATFORM_COMMISSION, calculatePlatformFee } from "./config/stripe";
import { dispatchBooking, dispatchJobToMovers, dispatchPreSelectedMover, notifyMover } from "./dispatch";
import { victor } from "./agents/victor";
import { registerPartnerRoutes } from "./partnerRoutes";
import { circuitBreakers } from "./circuit-breaker";
import {
  calculatePartnerNet,
  vehicleClassFromVehicleType,
  vehicleTypeFromClass,
  VEHICLE_CAPACITY_RANGES,
} from "@shared/pricing";
import he from "he";
import { optimizeImageBuffer } from "./image-optimizer";
import { createAgentQueue, QUEUE_NAMES } from "./agents/queue";
import { riley } from "./agents/riley";
import { nova } from "./agents/nova";
import { ember } from "./agents/ember";
import { reid } from "./agents/reid";
import { documentAudits, documentIrregularities } from "@shared/schema";
import { novaWebhookRouter } from "./nova-webhook-routes";

// Middleware to parse JSON
function jsonMiddleware(req: Request, res: Response, next: Function) {
  if (req.is('json')) {
    next();
  } else {
    next();
  }
}

// Helper to validate request body with Zod
function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// Helper to format phone number for display (e.g., +18335551234 -> 1-833-555-1234)
function formatPhoneNumber(phone: string): string {
  // Remove + if present
  const cleaned = phone.replace(/^\+/, '');
  // US/Canada format: 1-XXX-XXX-XXXX
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `1-${cleaned.slice(1, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  // 10 digit format: XXX-XXX-XXXX
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

// Helper to mask full address for privacy - only show city/area
// Strips street numbers/addresses but keeps city and province
function maskAddressForPrivacy(location: string | null): string {
  if (!location) return "Calgary, AB";
  
  const parts = location.split(',').map(p => p.trim());
  
  // Helper to check if a part looks like a street address (contains numbers)
  const isStreetAddress = (part: string): boolean => /\d/.test(part);
  
  // Helper to check if a part is a province code (AB, BC, ON, etc.)
  const isProvinceCode = (part: string): boolean => /^[A-Z]{2}$/i.test(part.replace(/[A-Z]\d[A-Z]\s*\d[A-Z]\d/gi, '').trim());
  
  // Clean postal codes from any part
  const cleanPostalCode = (part: string): string => part.replace(/[A-Z]\d[A-Z]\s*\d[A-Z]\d/gi, '').trim();
  
  if (parts.length === 1) {
    // Single part - return as-is unless it has numbers (street)
    if (isStreetAddress(parts[0])) {
      return "Calgary, AB";
    }
    const cleaned = cleanPostalCode(parts[0]);
    return cleaned.toLowerCase().includes('calgary') ? "Calgary, AB" : (cleaned || "Calgary, AB");
  }
  
  if (parts.length === 2) {
    const firstPart = cleanPostalCode(parts[0]);
    const secondPart = cleanPostalCode(parts[1]);
    
    // Check if first part is a street address (has numbers)
    if (isStreetAddress(parts[0])) {
      // First part is street, second is city - return city with AB province
      if (secondPart.toLowerCase().includes('calgary')) {
        return "Calgary, AB";
      }
      return secondPart && secondPart.length > 2 ? `${secondPart}, AB` : "Calgary, AB";
    }
    
    // No street number - this is likely "City, Province" format, return as-is
    if (firstPart.toLowerCase().includes('calgary')) {
      return "Calgary, AB";
    }
    return `${firstPart}, ${secondPart}`;
  }
  
  if (parts.length >= 3) {
    // Street, City, Province format - return just City, Province
    const city = cleanPostalCode(parts[parts.length - 2]);
    const province = cleanPostalCode(parts[parts.length - 1]);
    
    if (city.toLowerCase().includes('calgary')) {
      return "Calgary, AB";
    }
    return city && city.length > 2 ? `${city}, ${province || 'AB'}` : "Calgary, AB";
  }
  
  return "Calgary, AB";
}

// Auth middleware to attach user to req (session-based)
async function authMiddleware(req: Request, res: Response, next: Function) {
  // Check session first (secure method)
  if (req.session?.userId) {
    try {
      const user = await storage.getUser(req.session.userId);
      if (user) {
        (req as any).user = user;
      }
    } catch (error) {
      // User not found, clear invalid session
      req.session.destroy(() => {});
    }
  }
  next();
}

// Auth guards
function requireUser(req: Request, res: Response): boolean {
  if (!(req as any).user) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  return true;
}

function requireAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage_multer = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage_multer,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for mobile photos
  },
  fileFilter: (req, file, cb) => {
    // Support mobile formats including HEIC/HEIF from iOS
    const allowedExtensions = /jpeg|jpg|png|gif|webp|heic|heif|avif/;
    const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    
    // Check mimetype - be lenient for mobile browsers that may send generic types
    const allowedMimeTypes = /image\/(jpeg|jpg|png|gif|webp|heic|heif|avif)/;
    const mimetypeValid = allowedMimeTypes.test(file.mimetype) || file.mimetype.startsWith('image/');
    
    if (extname || mimetypeValid) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Retry a moverEarnings update after a successful stripe.transfers.create()
// call. If the DB write ultimately fails, log — do NOT throw — because the
// transfer already succeeded, and /api/admin/reconcile-stripe-payouts will
// heal the row on the next run.
async function updateMoverEarningWithRetry(
  ctx: { id: string; stripeTransferId: string; bookingId?: string },
  patch: Partial<typeof moverEarnings.$inferInsert>,
  attempt = 1,
): Promise<void> {
  try {
    await db.update(moverEarnings)
      .set(patch)
      .where(eq(moverEarnings.id, ctx.id));
  } catch (err) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
      return updateMoverEarningWithRetry(ctx, patch, attempt + 1);
    }
    logger.error(
      { err, earningId: ctx.id, stripeTransferId: ctx.stripeTransferId, bookingId: ctx.bookingId },
      'DB update failed after transfer — reconcile will fix',
    );
  }
}

// Same shape, for the recordMoverEarnings insert path. Unlike the update
// helper, this one throws on final failure: the caller consumes the returned
// row (grossAmount/netAmount/availableAt fields), so returning null would
// crash downstream. The retry still buys resilience against transient DB
// blips; a true persistent failure surfaces as a 500 (and reconciliation can
// still find the transfer by metadata.bookingId — but the caller needs a row
// now to build its response).
async function insertMoverEarningWithRetry(
  values: typeof moverEarnings.$inferInsert,
  attempt = 1,
): Promise<typeof moverEarnings.$inferSelect> {
  try {
    const [row] = await db.insert(moverEarnings).values(values).returning();
    if (!row) throw new Error('moverEarnings insert returned no row');
    return row;
  } catch (err) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
      return insertMoverEarningWithRetry(values, attempt + 1);
    }
    logger.error(
      { err, bookingId: values.bookingId, stripeTransferId: values.stripeTransferId },
      'DB insert failed 3x after transfer — reconcile may need to create row',
    );
    throw err;
  }
}

// Single choke-point for flipping a mover to verified. Guarantees Riley's
// welcome sequence fires — either via the ONBOARD queue or inline if Redis is
// unavailable. Callers must funnel every verification through this helper.
async function setMoverVerified(moverId: string, userId: string): Promise<void> {
  await db.update(moversTable)
    .set({
      isVerified: true,
      documentsVerified: true,
    })
    .where(eq(moversTable.id, moverId));

  const rileyQueue = createAgentQueue(QUEUE_NAMES.ONBOARD);
  if (rileyQueue) {
    await rileyQueue.add('mover_verified', { moverId, userId });
    logger.info({ moverId }, '[Riley] mover_verified queued');
  } else {
    logger.warn({ moverId }, '[Riley] ONBOARD queue unavailable — running inline');
    await riley.run('mover_verified', { moverId, userId });
  }
}

// Verification-item type → Reid audit type. Dashboard items and Reid audits
// are not 1:1 (payout_setup, vehicle_photos have no Reid counterpart), so
// the mapping is explicit rather than a name transform.
const VERIF_TO_REID_TYPE: Record<string, string> = {
  id: 'drivers_license',
  drivers_license: 'drivers_license',
  vehicle_registration: 'vehicle_registration',
  vehicle_photos: 'vehicle_registration',
  insurance: 'insurance',
  background_check: 'background_check',
  payout_setup: '',
  wcb: 'wcb',
};

const REID_REQUIRED_ITEM_TYPES = [
  'INSURANCE',
  'DRIVERS_LICENSE',
  'VEHICLE_REGISTRATION',
  'BACKGROUND_CHECK',
  'ID',
];

const DASHBOARD_REQUIRED_ITEM_TYPES = [
  'ID',
  'DRIVERS_LICENSE',
  'VEHICLE_REGISTRATION',
  'VEHICLE_PHOTOS',
  'INSURANCE',
  'BACKGROUND_CHECK',
  'PAYOUT_SETUP',
];

interface ApproveVerificationItemOptions {
  reason?: string;
  notes?: string;
  suppressEmail?: boolean;
  // True when called from the Reid audit-page endpoint. Signals that the
  // pipeline should send a Reid-styled email (via buildReidEmail) instead of
  // the dashboard plain template, so email quality doesn't regress when
  // admins approve from the audit page.
  fromReid?: boolean;
  // Optional pre-known Reid audit id (from the caller that already looked it
  // up). If omitted, the pipeline finds a matching audit via VERIF_TO_REID_TYPE.
  auditId?: string;
}

interface ApproveVerificationItemResult {
  ok: boolean;
  error?: string;
  itemId: string;
  moverId?: string;
  auditSynced: boolean;
  emailSent: boolean;
  emailSkippedReason?: 'already_sent' | 'suppressed' | 'no_mover_email' | 'no_mover';
}

/**
 * Single source of truth for verification-item approval + rejection. Both the
 * dashboard PATCH endpoint and the Reid audit approve/reject endpoints funnel
 * through this. Handles:
 *   - verification_items write
 *   - mirror to document_audits (via reidMatch OR clause)
 *   - dedupe against Reid email events on business_events
 *   - one mover email (Reid template when fromReid + audit exists, dashboard
 *     template otherwise)
 *   - in-app notification
 *   - reid.all_documents_approved bus emit when all 5 Reid docs approved
 *   - setMoverVerified when all 7 dashboard docs approved
 *   - mark mover not-verified on rejection
 */
async function approveVerificationItem(
  itemId: string,
  status: 'Approved' | 'Rejected',
  actor: string,
  options: ApproveVerificationItemOptions = {},
): Promise<ApproveVerificationItemResult> {
  const [item] = await db
    .select()
    .from(verificationItems)
    .where(eq(verificationItems.id, itemId))
    .limit(1);

  if (!item) {
    return { ok: false, error: 'Verification item not found', itemId, auditSynced: false, emailSent: false };
  }

  const rejectionReason = status === 'Rejected' ? (options.reason ?? null) : null;

  await db
    .update(verificationItems)
    .set({
      status,
      rejectionReason,
      reviewedAt: new Date(),
      reviewedBy: actor,
      updatedAt: new Date(),
    })
    .where(eq(verificationItems.id, itemId));

  // ── Mirror to document_audits ──────────────────────────
  const normalizedType = item.type.toLowerCase().replace(/ /g, '_');
  const reidDocType = VERIF_TO_REID_TYPE[normalizedType] ?? normalizedType;
  const reidMatch = reidDocType
    ? or(
        eq(documentAudits.verificationItemId, itemId),
        and(
          eq(documentAudits.moverId, item.moverId),
          eq(documentAudits.documentType, reidDocType),
        ),
      )
    : eq(documentAudits.verificationItemId, itemId);

  let syncedAuditId: string | null = options.auditId ?? null;
  let auditSynced = false;

  try {
    if (status === 'Approved') {
      const updated = await db
        .update(documentAudits)
        .set({
          status: 'approved',
          approvedAt: new Date(),
          reviewedBy: actor,
          notes: options.notes ?? undefined,
          updatedAt: new Date(),
        })
        .where(reidMatch)
        .returning({ id: documentAudits.id });
      syncedAuditId = updated[0]?.id ?? syncedAuditId;
      auditSynced = updated.length > 0;
    } else {
      const updated = await db
        .update(documentAudits)
        .set({
          status: 'rejected',
          rejectedAt: new Date(),
          rejectionReason,
          reviewedBy: actor,
          updatedAt: new Date(),
        })
        .where(reidMatch)
        .returning({ id: documentAudits.id });
      syncedAuditId = updated[0]?.id ?? syncedAuditId;
      auditSynced = updated.length > 0;
    }
  } catch (syncErr) {
    logEvent.error('reid_audit_sync', syncErr, { itemId, moverId: item.moverId, status });
  }

  // ── Email ──────────────────────────────────────────────
  let emailSent = false;
  let emailSkippedReason: ApproveVerificationItemResult['emailSkippedReason'];

  if (options.suppressEmail) {
    emailSkippedReason = 'suppressed';
  } else {
    // Dedupe against prior Reid emails on this audit — either a Reid audit
    // page approve (this pipeline running fromReid=true) or Reid's own
    // sendMoverMessage (which also writes reid.email_sent.* events).
    let alreadyEmailed = false;
    if (syncedAuditId) {
      const eventTypes = status === 'Approved'
        ? ['reid.email_sent.approved', 'reid.email_sent.document_approved']
        : ['reid.email_sent.rejected'];
      const prior = await db
        .select({ id: businessEvents.id })
        .from(businessEvents)
        .where(
          and(
            eq(businessEvents.entityId, syncedAuditId),
            inArray(businessEvents.eventType, eventTypes),
          ),
        )
        .limit(1);
      alreadyEmailed = prior.length > 0;
    }

    if (alreadyEmailed) {
      emailSkippedReason = 'already_sent';
      logger.info(
        { itemId, moverId: item.moverId, auditId: syncedAuditId },
        '[Verification] Skipping email — mover already notified',
      );
    } else {
      const mover = await storage.getMover(item.moverId);
      if (!mover) {
        emailSkippedReason = 'no_mover';
      } else {
        const moverUser = await storage.getUser(mover.userId);
        if (!moverUser?.email) {
          emailSkippedReason = 'no_mover_email';
        } else {
          try {
            if (options.fromReid && syncedAuditId) {
              // Rich Reid-branded template — parity with the old audit-page
              // path. Record the reid.email_sent.* event so future dedupe
              // against this audit works from either code path.
              const emailType: 'document_approved' | 'rejected' =
                status === 'Approved' ? 'document_approved' : 'rejected';
              const firstName = (moverUser.name ?? 'there').split(/\s+/)[0];
              const docLabel = String(item.type).replace(/_/g, ' ');
              const built = buildReidEmail(emailType, {
                firstName,
                docLabel,
                reason: rejectionReason ?? undefined,
              });
              await sendResendEmail({
                from: `${process.env.REID_EMAIL_NAME ?? 'Reid at LervIT'} <${process.env.REID_EMAIL ?? 'noreply@lervit.com'}>`,
                to: moverUser.email,
                replyTo: process.env.REID_REPLY_TO ?? 'support@lervit.com',
                subject: built.subject,
                html: built.html,
                text: built.text,
                listUnsubscribeUrl: `${(process.env.APP_BASE_URL ?? 'https://app.lervit.com').trim()}/mover/preferences`,
              });
              await emitEvent(
                `reid.email_sent.${emailType}`,
                'agent',
                syncedAuditId,
                { moverId: mover.id, emailType, source: 'verification_pipeline' },
                'agent',
              );
              emailSent = true;
            } else if (status === 'Approved') {
              await notificationService.sendEmail({
                to: moverUser.email,
                subject: `Your ${item.type} has been approved`,
                body: `<p>Hi ${moverUser.name},</p><p>Your <strong>${item.type}</strong> has been approved. You're one step closer to going online!</p><p>Log in to your dashboard to check your full verification status.</p><p>The LervIT Team</p>`,
                type: 'status_update',
              });
              emailSent = true;
            } else {
              await notificationService.sendEmail({
                to: moverUser.email,
                subject: `Your ${item.type} was not approved`,
                body: `<p>Hi ${moverUser.name},</p><p>Unfortunately your <strong>${item.type}</strong> was not approved${rejectionReason ? `: ${rejectionReason}` : ''}. Please re-upload a corrected version from your dashboard.</p><p>If you have any questions, contact us at <a href="mailto:support@lervit.com">support@lervit.com</a>.</p><p>The LervIT Team</p>`,
                type: 'status_update',
              });
              emailSent = true;
            }

            // In-app notification (parity with dashboard PATCH).
            await storage.createNotification({
              userId: moverUser.id,
              type: 'verification_update',
              title: status === 'Approved' ? `${item.type} Approved` : `${item.type} Not Approved`,
              message:
                status === 'Approved'
                  ? `Your ${item.type} has been approved. You're one step closer to going online!`
                  : `One or more documents were not approved. Please re-upload.`,
              actionUrl: '/mover-verification',
              isRead: false,
            });
          } catch (notifErr) {
            logEvent.error('verification_notification', notifErr, {
              moverId: item.moverId,
              itemType: item.type,
              status,
            });
          }
        }
      }
    }
  }

  // ── Post-approval gates ────────────────────────────────
  if (status === 'Approved') {
    // Reid-required subset done → emit bus event so Riley + Aegis pick up.
    try {
      const pendingReidItems = await db
        .select({ id: verificationItems.id })
        .from(verificationItems)
        .where(
          and(
            eq(verificationItems.moverId, item.moverId),
            inArray(verificationItems.type, REID_REQUIRED_ITEM_TYPES),
            notInArray(verificationItems.status, ['Approved', 'approved']),
          ),
        );

      if (pendingReidItems.length === 0) {
        logger.info(
          { moverId: item.moverId },
          '[Verification] All Reid-required docs approved — emitting reid.all_documents_approved',
        );
        await emitEvent(
          'reid.all_documents_approved',
          'mover',
          item.moverId,
          { moverId: item.moverId, source: 'verification_pipeline' },
          'agent',
        );
      }
    } catch (gateErr) {
      logger.warn({ err: gateErr, moverId: item.moverId }, '[Verification] Reid gate check failed');
    }

    // Full 7-doc set done → flip isVerified + queue Riley welcome sequence.
    try {
      const allItems = await db
        .select()
        .from(verificationItems)
        .where(eq(verificationItems.moverId, item.moverId));
      const allApproved = DASHBOARD_REQUIRED_ITEM_TYPES.every((type) => {
        const typeItem = allItems.find((i) => i.type === type);
        return typeItem && typeItem.status === 'Approved';
      });
      if (allApproved) {
        const mover = await storage.getMover(item.moverId);
        if (mover) {
          await setMoverVerified(mover.id, mover.userId);
        }
      } else {
        const missing = DASHBOARD_REQUIRED_ITEM_TYPES.filter((type) => {
          const typeItem = allItems.find((i) => i.type === type);
          return !(typeItem && typeItem.status === 'Approved');
        });
        logger.info(
          { moverId: item.moverId, missing },
          `[Riley] Not all items approved yet — missing: ${missing.join(', ')}`,
        );
      }
    } catch (verErr) {
      logger.warn({ err: verErr, moverId: item.moverId }, 'setMoverVerified gate failed');
    }
  } else {
    // Rejected → ensure mover is not-verified.
    try {
      await storage.updateMover(item.moverId, {
        documentsVerified: false,
        isVerified: false,
      });
    } catch (unverErr) {
      logger.warn({ err: unverErr, moverId: item.moverId }, 'mark not-verified failed');
    }
  }

  return {
    ok: true,
    itemId,
    moverId: item.moverId,
    auditSynced,
    emailSent,
    emailSkippedReason,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {

  // Nova (VOICE) — Telnyx webhook + ElevenLabs tool endpoints. Mounted before
  // authMiddleware so external callers (Telnyx, ElevenLabs) aren't blocked; the
  // webhook uses `express.raw` inline so it bypasses any downstream JSON parser.
  app.use(novaWebhookRouter);

  // Register auth middleware globally
  app.use(authMiddleware);

  // Audit every mutating admin call. Mounted *after* authMiddleware so
  // req.user is populated when the res.finish handler fires.
  app.use("/api/admin", adminAuditMiddleware);

  // ===== DOCUMENT DOWNLOADS =====
  // Admin-only: internal strategic documents must not be publicly accessible
  app.get("/api/downloads/roadmap", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const filePath = path.resolve(process.cwd(), "exports", "LervIT-12-Month-Dev-Roadmap.md");
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="LervIT-12-Month-Dev-Roadmap.md"');
    res.sendFile(filePath);
  });

  app.get("/api/downloads/technical-brief", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const filePath = path.resolve(process.cwd(), "exports", "LervIT-Technical-Brief.md");
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="LervIT-Technical-Brief.md"');
    res.sendFile(filePath);
  });

  app.get("/api/downloads/technical-brief-pdf", (_req: Request, res: Response) => {
    import("./generate-brief-pdf.js").then(({ generateTechnicalBriefPdf }) => {
      generateTechnicalBriefPdf(res);
    }).catch((err) => {
      console.error("PDF generation error:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    });
  });

  // ===== PUBLIC CONFIG ROUTES (no auth required) =====
  // Expose support phone number for display on frontend
  app.get("/api/config/support-phone", (_req: Request, res: Response) => {
    const phoneNumber = process.env.TELNYX_PHONE_NUMBER || "";
    // Return formatted phone number for display
    res.json({ 
      phoneNumber: phoneNumber,
      formattedPhone: phoneNumber ? formatPhoneNumber(phoneNumber) : "1-888-982-0885"
    });
  });
  
  // Return the correct Stripe public key based on environment
  // Development uses test keys, production uses live keys
  app.get("/api/config/stripe-public-key", (_req: Request, res: Response) => {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const testKey = process.env.TESTING_VITE_STRIPE_PUBLIC_KEY;
    const liveKey = process.env.VITE_STRIPE_PUBLIC_KEY;
    const publicKey = isDevelopment && testKey ? testKey : liveKey;
    
    res.json({ 
      publicKey: publicKey || '',
      isTestMode: isDevelopment && !!testKey
    });
  });
  
  // Serve uploaded files statically with express.static (secure against path traversal)
  const express = await import('express');
  const allowedUploadOrigins = [
    'https://app.lervit.com',
    'https://www.lervit.com',
    'https://lervit1-production.up.railway.app',
    ...(process.env.APP_BASE_URL ? [process.env.APP_BASE_URL] : []),
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5000'] : []),
  ];
  app.use('/uploads', express.default.static(uploadDir, {
    setHeaders: (res, _filePath, _stat) => {
      const origin = (res as any).req?.headers?.origin;
      if (origin && allowedUploadOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    },
  }));

  // ===== OBJECT STORAGE ROUTES (Replit App Storage) =====
  // Endpoint to serve public objects from Object Storage
  app.get("/public-objects/:filePath(*)", async (req: Request, res: Response) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Endpoint to serve objects from Object Storage (uploaded images)
  app.get("/objects/:objectPath(*)", async (req: Request, res: Response) => {
    const objectStorageService = new ObjectStorageService();
    try {
      // Strip query params (e.g. ?f=jpg cache-buster) before looking up the file
      const objectPath = req.path.split("?")[0];
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error fetching object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Endpoint to get a presigned upload URL for Object Storage
  app.post("/api/objects/upload", async (req: Request, res: Response) => {
    if (!requireUser(req, res)) return;
    
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Endpoint to finalize uploaded object and set its path
  app.post("/api/objects/finalize", async (req: Request, res: Response) => {
    if (!requireUser(req, res)) return;
    
    const { uploadURL } = req.body;
    if (!uploadURL) {
      return res.status(400).json({ error: "uploadURL is required" });
    }

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ objectPath });
    } catch (error) {
      console.error("Error finalizing object:", error);
      res.status(500).json({ error: "Failed to finalize object" });
    }
  });
  
  // ===== GOOGLE PLACES API PROXY =====
  // Secure proxy for Google Places Autocomplete API
  app.get("/api/places/autocomplete", async (req: Request, res: Response) => {
    try {
      const { input, sessiontoken } = req.query;
      
      // Validate input parameters
      if (!input || typeof input !== 'string') {
        return res.status(400).json({ error: "Input parameter is required" });
      }
      
      if (input.length < 3) {
        return res.json({ predictions: [] });
      }
      
      // Sanitize input (prevent injection attacks)
      const sanitizedInput = input.trim().slice(0, 200); // Limit length
      
      // Get API key from server environment (never expose to client)
      const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error('[PLACES API] Missing Google Maps API key');
        return res.status(500).json({ error: "API configuration error" });
      }
      
      // Build Google Places Autocomplete API URL
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      url.searchParams.append('input', sanitizedInput);
      url.searchParams.append('key', apiKey);
      // No 'types' restriction so results include both street addresses and business names
      url.searchParams.append('components', 'country:ca');
      
      // Bias to Calgary
      url.searchParams.append('location', '51.0447,-114.0719');
      url.searchParams.append('radius', '50000');
      
      // Add session token if provided (for billing optimization)
      if (sessiontoken && typeof sessiontoken === 'string') {
        url.searchParams.append('sessiontoken', sessiontoken);
      }
      
      // Forward the browser's Referer/Origin so the request passes HTTP Referrer restrictions on the key
      const forwardedReferer = req.headers['referer'] || req.headers['origin'] || '';
      const fetchHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 LervIT-Server/1.0',
      };
      if (forwardedReferer) {
        fetchHeaders['Referer'] = forwardedReferer;
      }

      // Make request to Google Places API
      const response = await fetch(url.toString(), { headers: fetchHeaders });
      
      if (!response.ok) {
        console.error('[PLACES API] Google API error:', response.status);
        return res.status(500).json({ error: "Failed to fetch predictions" });
      }
      
      const data = await response.json();
      
      // Return predictions to client (without exposing API key)
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error(`[PLACES API] Google returned status: ${data.status} — error_message: ${data.error_message || 'none'} — forwarded referer: ${forwardedReferer || 'none'}`);
      }

      res.json({
        predictions: data.predictions || [],
        status: data.status
      });
      
    } catch (error) {
      console.error('[PLACES API] Error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // ===== Reverse Geocoding =====
  app.get("/api/places/reverse-geocode", async (req: Request, res: Response) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng || typeof lat !== 'string' || typeof lng !== 'string') {
        return res.status(400).json({ error: "lat and lng parameters are required" });
      }
      const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "API configuration error" });
      }

      const geocode = async (resultType?: string): Promise<string | null> => {
        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.append('latlng', `${lat},${lng}`);
        url.searchParams.append('key', apiKey!);
        url.searchParams.append('language', 'en');
        if (resultType) url.searchParams.append('result_type', resultType);
        const response = await fetch(url.toString());
        if (!response.ok) return null;
        const data = await response.json();
        if (data.status !== 'OK' || !data.results?.length) return null;
        // Prefer a result whose types include a specific address
        const preferred = data.results.find((r: any) =>
          r.types?.some((t: string) => ['street_address', 'premise', 'subpremise', 'route'].includes(t))
        );
        return (preferred ?? data.results[0]).formatted_address as string;
      }

      // Try strict filter first; fall back to all result types
      const address = (await geocode('street_address|premise')) ?? (await geocode());
      res.json({ address: address ?? null });
    } catch (error) {
      console.error('[REVERSE GEOCODE] Error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== DEV / TEST HELPERS (development-only) =====
  // These endpoints are registered ONLY when NODE_ENV === 'development'.
  // They must never be reachable in staging or production builds.
  // They exist solely to make e2e test setup deterministic without requiring
  // real phone-OTP / email verification flows.
  if (process.env.NODE_ENV === 'development') {
    /**
     * POST /api/dev/create-test-user
     * Creates a customer account that is already phone- and email-verified.
     * Body: { name, email, password, phone? }
     * Returns: { id, email, name, role }
     */
    app.post("/api/dev/create-test-user", async (req: Request, res: Response) => {
      try {
        const schema = z.object({
          name: z.string().min(1),
          email: z.string().email(),
          password: z.string().min(6),
          phone: z.string().optional(),
        });
        const { name, email, password, phone } = validateBody(schema, req.body);

        // Idempotent – return existing user if already registered
        const existing = await storage.getUserByEmail(email);
        if (existing) {
          return res.json({ id: existing.id, email: existing.email, name: existing.name, role: existing.role });
        }

        const hashedPassword = await hashPassword(password);

        // Generate referral code
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let referralCode = '';
        for (let i = 0; i < 6; i++) referralCode += chars[Math.floor(Math.random() * chars.length)];

        const user = await storage.createUser({
          name,
          email,
          password: hashedPassword,
          role: 'customer',
          phone: phone || '+14035550000',
          phoneVerified: true,
          referralCode,
        });

        // Mark email as verified immediately so payment creation is not blocked
        await db.update(usersTable)
          .set({ emailVerified: true, verificationToken: null, verificationTokenExpiry: null })
          .where(eq(usersTable.id, user.id));

        res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
      } catch (err) {
        console.error('[dev] create-test-user error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    });

    /**
     * POST /api/dev/create-test-booking
     * Creates a minimal booking owned by the authenticated user.
     * Requires a logged-in session (call /api/auth/login first).
     */
    app.post("/api/dev/create-test-booking", async (req: Request, res: Response) => {
      try {
        if (!requireUser(req, res)) return;
        const user = (req as any).user;

        const booking = await storage.createBooking({
          customerId: user.id,
          pickupAddress: '123 Test Pickup St, Calgary, AB',
          dropoffAddress: '456 Test Dropoff Ave, Calgary, AB',
          pickupLat: '51.0447',
          pickupLng: '-114.0719',
          dropoffLat: '51.0447',
          dropoffLng: '-114.0819',
          preferredDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          loadSize: 'small',
          numberOfMovers: 1,
          price: '150.00',
          status: 'pending',
          paymentStatus: 'pending',
          pickupDifficulty: 'easy',
          dropoffDifficulty: 'easy',
          heavyItem: false,
          distance: '5',
        } as any);

        res.status(201).json({ id: booking.id });
      } catch (err) {
        console.error('[dev] create-test-booking error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    });

    /**
     * GET /api/dev/payment-intent/:piId
     * Retrieves a Stripe PaymentIntent from the test-mode Stripe API.
     * Used by e2e tests to assert that payment_method_types are correctly set.
     * Requires authenticated session (the PI must belong to the user's booking).
     */
    app.get("/api/dev/payment-intent/:piId", async (req: Request, res: Response) => {
      try {
        if (!requireUser(req, res)) return;
        const { piId } = req.params;
        if (!piId || !piId.startsWith('pi_')) {
          return res.status(400).json({ error: 'Invalid payment intent id' });
        }
        const pi = await stripe.paymentIntents.retrieve(piId);
        res.json({
          id: pi.id,
          status: pi.status,
          currency: pi.currency,
          amount: pi.amount,
          payment_method_types: pi.payment_method_types,
        });
      } catch (err) {
        console.error('[dev] get payment-intent error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    });

    /**
     * POST /api/dev/confirm-test-payment-intent
     * Confirms a test-mode Stripe PaymentIntent using Stripe's built-in test
     * card payment method (pm_card_visa) so the real /confirm-payment route can
     * subsequently verify the PI is in 'succeeded' state.
     * Body: { paymentIntentId }
     * Requires authenticated session.
     */
    app.post("/api/dev/confirm-test-payment-intent", async (req: Request, res: Response) => {
      try {
        if (!requireUser(req, res)) return;
        const schema = z.object({ paymentIntentId: z.string().startsWith('pi_') });
        const { paymentIntentId } = validateBody(schema, req.body);

        // Verify that the PI is real and belongs to the test environment
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status === 'succeeded') {
          return res.json({ status: pi.status, paymentIntentId: pi.id });
        }

        // Confirm using Stripe's test card (pm_card_visa always succeeds in test mode)
        const confirmed = await stripe.paymentIntents.confirm(paymentIntentId, {
          payment_method: 'pm_card_visa',
          return_url: 'http://localhost:5000/my-bookings',
        } as any);

        res.json({ status: confirmed.status, paymentIntentId: confirmed.id });
      } catch (err) {
        console.error('[dev] confirm-test-payment-intent error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    });
  }

  // ===== AUTH ROUTES =====
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const signupSchema = insertUserSchema.extend({
        email: z.string().email("Please enter a valid email address (e.g. you@example.com)"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        phoneVerificationToken: z.string().min(1, "Phone verification required"),
      });
      const { phoneVerificationToken, ...userData } = validateBody(signupSchema, req.body);
      
      // Verify the phone verification token
      const { phoneVerificationTokens } = await import("@shared/schema");
      const tokens = await db.select().from(phoneVerificationTokens)
        .where(eq(phoneVerificationTokens.verifiedToken, phoneVerificationToken))
        .limit(1);
      
      if (tokens.length === 0) {
        return res.status(400).json({ error: "Invalid or expired phone verification. Please verify your phone number again." });
      }
      
      const phoneToken = tokens[0];
      
      if (!phoneToken.verified) {
        return res.status(400).json({ error: "Phone number not verified. Please complete phone verification." });
      }
      
      if (new Date() > new Date(phoneToken.expiresAt)) {
        return res.status(400).json({ error: "Phone verification expired. Please verify your phone number again." });
      }
      
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      // Use the verified phone number from the token
      // Strip any user-provided phone/phoneVerified to prevent bypass attempts
      const { phone: _ignoredPhone, phoneVerified: _ignoredVerified, ...safeUserData } = userData as any;
      const hashedPassword = await hashPassword(userData.password);

      // Generate a unique 6-char alphanumeric referral code
      const generateReferralCode = async (): Promise<string> => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        for (let attempts = 0; attempts < 10; attempts++) {
          const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
          const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, code)).limit(1);
          if (existing.length === 0) return code;
        }
        throw new Error("Could not generate unique referral code");
      };
      const referralCode = await generateReferralCode();

      const user = await storage.createUser({
        ...safeUserData,
        password: hashedPassword,
        phone: phoneToken.phone, // Always use phone from verified token
        phoneVerified: true, // Phone is already verified via OTP
        referralCode,
      });
      
      // Delete the used verification token
      await db.delete(phoneVerificationTokens).where(eq(phoneVerificationTokens.id, phoneToken.id));
      
      // Generate email verification token
      const { randomBytes } = await import("crypto");
      const verificationToken = randomBytes(32).toString("hex");
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      // Update user with verification token
      await db.update(usersTable)
        .set({ 
          verificationToken,
          verificationTokenExpiry,
        })
        .where(eq(usersTable.id, user.id));
      
      // Send verification email
      await notificationService.sendVerificationEmail(user.email, user.name, verificationToken);
      
      // If user signed up as a mover, automatically create a mover profile.
      // Do NOT seed fake coordinates — coords remain null until the mover pushes
      // real GPS from the mover app or geocodes from their profile address.
      if (user.role === "mover") {
        await storage.createMover({
          userId: user.id,
          vehicleType: "van", // Default vehicle type
          isAvailable: true,
          location: "Calgary, AB", // Default location
          latitude: null,
          longitude: null,
        });
      }
      
      // Regenerate session to prevent session fixation attacks
      const createdUser = { ...user, emailVerified: false };
      req.session.regenerate((err) => {
        if (err) {
          return res.status(500).json({ error: "Session error" });
        }
        
        // Set session data after regeneration
        req.session.userId = createdUser.id;
        req.session.userRole = createdUser.role;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            return res.status(500).json({ error: "Session save error" });
          }
          const { password: _, ...userWithoutPassword } = createdUser;
          res.json({ ...userWithoutPassword, verificationEmailSent: true });
        });
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const loginSchema = z.object({
        email: z.string().email(),
        password: z.string().min(1),
      });
      const { email, password } = validateBody(loginSchema, req.body);

      const user = await storage.getUserByEmail(email);
      
      if (!user || !user.password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Check if account is locked by admin
      if (user.lockedByAdmin) {
        return res.status(423).json({ 
          error: "Account suspended",
          message: user.lockReason || "Your account has been suspended. Please contact support.",
          locked: true,
          lockedByAdmin: true
        });
      }
      
      // Check if account is temporarily locked due to failed attempts
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
        return res.status(423).json({ 
          error: "Account temporarily locked",
          message: `Too many failed login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`,
          locked: true,
          lockedUntil: user.lockedUntil,
          remainingMinutes
        });
      }
      
      const isValid = await verifyPassword(password, user.password);

      // Transparently migrate legacy SHA-256 hashes to bcrypt on successful login
      if (isValid && !user.password.startsWith('$2b$') && !user.password.startsWith('$2a$')) {
        try {
          const newHash = await hashPassword(password);
          await db.update(usersTable).set({ password: newHash }).where(eq(usersTable.id, user.id));
        } catch (rehashErr) {
          logEvent.error('password_rehash', rehashErr, { userId: user.id });
        }
      }

      if (!isValid) {
        // Increment failed login attempts
        const newAttempts = (user.failedLoginAttempts || 0) + 1;
        const MAX_ATTEMPTS = 4;
        const LOCKOUT_MINUTES = 30;
        
        if (newAttempts >= MAX_ATTEMPTS) {
          // Lock the account for 30 minutes
          const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
          await db.update(usersTable)
            .set({ 
              failedLoginAttempts: newAttempts,
              lockedUntil: lockedUntil,
              lockReason: `Automatically locked after ${MAX_ATTEMPTS} failed login attempts`
            })
            .where(eq(usersTable.id, user.id));
          
          return res.status(423).json({ 
            error: "Account locked",
            message: `Too many failed login attempts. Your account has been locked for ${LOCKOUT_MINUTES} minutes.`,
            locked: true,
            lockedUntil: lockedUntil,
            remainingMinutes: LOCKOUT_MINUTES
          });
        } else {
          // Just increment the counter
          await db.update(usersTable)
            .set({ failedLoginAttempts: newAttempts })
            .where(eq(usersTable.id, user.id));
          
          const remainingAttempts = MAX_ATTEMPTS - newAttempts;
          return res.status(401).json({ 
            error: "Invalid credentials",
            message: `Invalid email or password. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining before account lockout.`,
            remainingAttempts
          });
        }
      }
      
      // Successful login - reset failed attempts counter and update last login time
      await db.update(usersTable)
        .set({ 
          failedLoginAttempts: 0,
          lockedUntil: null,
          lockReason: null,
          lastLoginAt: new Date()
        })
        .where(eq(usersTable.id, user.id));
      
      // Admin single-session enforcement: invalidate all previous sessions
      if (user.role === 'admin') {
        try {
          // Delete all existing sessions for this admin user from the session store
          // The sess column is JSONB and contains userId
          await pool.query(
            `DELETE FROM user_sessions WHERE sess->>'userId' = $1`,
            [user.id]
          );
          console.log(`[Security] Invalidated previous sessions for admin: ${user.email}`);
        } catch (sessionErr) {
          console.error('[Security] Failed to invalidate admin sessions:', sessionErr);
          // Continue with login even if session cleanup fails
        }
      }
      
      // Regenerate session to prevent session fixation attacks
      const userData = user;
      req.session.regenerate((err) => {
        if (err) {
          return res.status(500).json({ error: "Session error" });
        }

        // Set session data after regeneration
        req.session.userId = userData.id;
        req.session.userRole = userData.role;

        req.session.save((saveErr) => {
          if (saveErr) {
            return res.status(500).json({ error: "Session save error" });
          }
          const { password: _, ...userWithoutPassword } = userData;
          res.json(userWithoutPassword);
        });
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Logout route
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const userId = req.session?.userId;
    
    // Update last logout timestamp if user is logged in
    if (userId) {
      try {
        await db.update(usersTable)
          .set({ lastLogoutAt: new Date() })
          .where(eq(usersTable.id, userId));
      } catch (error) {
        console.error("Failed to update logout timestamp:", error);
      }
    }
    
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.clearCookie('lervit.sid');
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current authenticated user
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  // Update user profile
  app.patch("/api/users/profile", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const updateProfileSchema = z.object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        hasCompletedOnboarding: z.boolean().optional(),
        // Notification preferences
        smsJobAlerts: z.boolean().optional(),
        smsBookingUpdates: z.boolean().optional(),
        emailJobAlerts: z.boolean().optional(),
        emailBookingUpdates: z.boolean().optional(),
        emailEarningsReports: z.boolean().optional(),
        emailPromotions: z.boolean().optional(),
        pushNotifications: z.boolean().optional(),
      });
      
      const updates = validateBody(updateProfileSchema, req.body);
      const updatedUser = await storage.updateUser(user.id, updates);
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // If address was updated and user is a mover, geocode and update mover coordinates
      if (updates.address && user.role === 'mover') {
        console.log(`[Profile] Mover address update detected: "${updates.address}"`);
        try {
          const { geocodeAddress } = await import("./google-maps");
          const movers = await storage.getMovers({ userId: user.id });
          console.log(`[Profile] Found ${movers.length} mover profiles for user ${user.id}`);
          
          if (movers.length > 0) {
            const result = await geocodeAddress(updates.address);
            console.log(`[Profile] Geocode result:`, JSON.stringify(result));
            
            // Update coordinates even if using fallback (success: false just means mock/fallback was used)
            if (result && result.coordinates) {
              await storage.updateMover(movers[0].id, {
                location: updates.address,
                latitude: result.coordinates.lat,
                longitude: result.coordinates.lng,
              });
              console.log(`[Profile] ✓ Updated mover ${movers[0].id} coordinates: ${result.coordinates.lat}, ${result.coordinates.lng}`);
            } else {
              console.warn(`[Profile] Could not geocode address: ${updates.address}`);
            }
          }
        } catch (geocodeError) {
          console.error('[Profile] Geocoding error:', geocodeError);
          // Don't fail the request if geocoding fails - address is still saved
        }
      }
      
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error('[Profile] Update error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update profile" });
    }
  });

  // Upload user avatar
  app.post("/api/users/avatar", upload.single('avatar'), async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const file = req.file as Express.Multer.File;
      
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Read file from disk (multer saves to disk with diskStorage)
      const rawBuffer = fs.readFileSync(file.path);

      // Resize + convert to WebP (handles HEIC input)
      const optimized = await optimizeImageBuffer(
        rawBuffer,
        `avatar-${user.id}${path.extname(file.originalname)}`,
        file.mimetype,
      );

      // Upload to object storage
      const objectStorage = new ObjectStorageService();
      const avatarUrl = await objectStorage.uploadBuffer(
        optimized.buffer,
        optimized.filename,
        optimized.mimetype,
        user.id
      );
      
      // Clean up local file
      fs.unlinkSync(file.path);
      
      // Update user with avatar URL
      const updatedUser = await storage.updateUser(user.id, { avatarUrl });
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error('[Avatar] Upload error:', error);
      res.status(500).json({ error: "Failed to upload avatar" });
    }
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const forgotPasswordSchema = z.object({
        email: z.string().email(),
      });
      const { email } = validateBody(forgotPasswordSchema, req.body);
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ message: "If the email exists, a password reset link has been sent." });
      }
      
      const { randomBytes } = await import("crypto");
      const resetToken = randomBytes(32).toString("hex");
      const resetTokenExpiry = new Date(Date.now() + 3600000);
      
      await storage.updateUser(user.id, {
        resetToken,
        resetTokenExpiry,
      });
      
      const { sendPasswordResetEmail } = await import("./notifications");
      await sendPasswordResetEmail(user.email, user.name, resetToken);
      
      res.json({ message: "If the email exists, a password reset link has been sent." });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const resetPasswordSchema = z.object({
        token: z.string().min(1),
        password: z.string().min(6),
      });
      const { token, password } = validateBody(resetPasswordSchema, req.body);
      
      // Direct lookup by reset token (efficient, no pagination needed)
      const user = await storage.getUserByResetToken(token);
      
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      if (!user.resetTokenExpiry) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      const expiryDate = new Date(user.resetTokenExpiry);
      const now = new Date();
      
      if (now > expiryDate) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      const hashedPassword = await hashPassword(password);
      await storage.updateUser(user.id, {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lockReason: null,
      });
      
      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Email verification endpoint
  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const verifySchema = z.object({
        token: z.string().min(1),
      });
      const { token } = validateBody(verifySchema, req.body);
      
      // Direct lookup by verification token (efficient, no pagination needed)
      const user = await storage.getUserByVerificationToken(token);
      
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired verification token" });
      }
      
      if (!user.verificationTokenExpiry) {
        return res.status(400).json({ 
          error: "Invalid or expired verification token",
          email: user.email  // Return email for resend functionality
        });
      }
      
      const expiryDate = new Date(user.verificationTokenExpiry);
      const now = new Date();
      
      if (now > expiryDate) {
        return res.status(400).json({ 
          error: "Verification token has expired. Please request a new one.",
          email: user.email  // Return email for resend functionality
        });
      }
      
      // Mark email as verified and clear token
      await db.update(usersTable)
        .set({ 
          emailVerified: true,
          verificationToken: null,
          verificationTokenExpiry: null,
        })
        .where(eq(usersTable.id, user.id));
      
      // Send welcome email fire-and-forget — never block or fail the verification response
      notificationService.sendWelcomeEmail(user.email, user.name, user.role).catch((err) => {
        console.error("Failed to send welcome email (non-critical):", err);
      });

      // Hand off to Riley (ONBOARD) for the customer nudge sequence. Movers get
      // a separate track via mover_verified when all 7 docs are approved, so
      // gate this to role='customer' to avoid overlapping the two tracks.
      if (user.role === 'customer') {
        try {
          const rileyQueue = createAgentQueue(QUEUE_NAMES.ONBOARD);
          if (rileyQueue) {
            await rileyQueue.add('customer_verified', { userId: user.id });
          }
        } catch (qErr) {
          logger.warn({ err: qErr, userId: user.id }, 'Riley: customer_verified enqueue failed');
        }
      }

      res.json({ message: "Email verified successfully! Welcome to LervIT." });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Resend verification email endpoint
  app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
    try {
      const resendSchema = z.object({
        email: z.string().email(),
      });
      const { email } = validateBody(resendSchema, req.body);
      
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Don't reveal if email exists or not
        return res.json({ message: "If the email is registered, a verification link has been sent." });
      }
      
      if (user.emailVerified) {
        return res.status(400).json({ error: "Email is already verified" });
      }
      
      // Generate new verification token
      const { randomBytes } = await import("crypto");
      const verificationToken = randomBytes(32).toString("hex");
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      await db.update(usersTable)
        .set({ 
          verificationToken,
          verificationTokenExpiry,
        })
        .where(eq(usersTable.id, user.id));
      
      // Send verification email
      await notificationService.sendVerificationEmail(user.email, user.name, verificationToken);
      
      res.json({ message: "If the email is registered, a verification link has been sent." });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== PRE-SIGNUP PHONE VERIFICATION (Uber-style OTP flow) =====
  // These endpoints work without authentication for the signup flow
  
  // Pre-signup: Send phone verification code
  app.post("/api/auth/pre-signup/send-code", async (req: Request, res: Response) => {
    try {
      const phoneSchema = z.object({
        phone: z.string().min(10, "Invalid phone number"),
      });
      const { phone } = validateBody(phoneSchema, req.body);

      // Check if phone is already registered
      const existingUser = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
      if (existingUser.length > 0 && existingUser[0].phoneVerified) {
        return res.status(400).json({ error: "This phone number is already registered. Please login instead." });
      }

      // Generate 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Delete any existing verification tokens for this phone
      const { phoneVerificationTokens } = await import("@shared/schema");
      await db.delete(phoneVerificationTokens).where(eq(phoneVerificationTokens.phone, phone));

      // Create new verification token
      await db.insert(phoneVerificationTokens).values({
        phone,
        verificationCode,
        expiresAt: expiryTime,
        verified: false,
      });

      // Send SMS via notification service
      const smsSent = await notificationService.sendPhoneVerificationCode(phone, verificationCode);

      // Handle SMS delivery result
      const isDev = process.env.NODE_ENV === 'development';
      if (!smsSent) {
        // Never log the code or the full phone — anyone with log access could
        // bypass phone verification otherwise. Keep just the last 4 digits so
        // support can correlate with the user's report.
        const phoneTail = phone.slice(-4);
        console.log(`[SMS FAILED] Verification could not be delivered to phone ending ****${phoneTail}`);
        if (isDev) {
          // In development only, show the code for testing
          res.json({ 
            message: "SMS delivery failed. Use the code shown below.",
            devCode: verificationCode,
            smsFailed: true,
          });
        } else {
          // In production, don't expose the code - suggest contacting support
          res.json({ 
            message: "SMS could not be delivered to this number. Please try a different mobile number or contact support@lervit.com for assistance.",
            smsFailed: true,
          });
        }
      } else {
        res.json({ message: "Verification code sent to your phone" });
      }
    } catch (error) {
      logger.error({ error }, "Pre-signup phone verification send error");
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Pre-signup: Resend verification code via email (fallback when SMS fails)
  app.post("/api/auth/pre-signup/resend-via-email", async (req: Request, res: Response) => {
    try {
      const emailFallbackSchema = z.object({
        phone: z.string().min(10, "Invalid phone number"),
        email: z.string().email("Invalid email address"),
      });
      const { phone, email } = validateBody(emailFallbackSchema, req.body);

      // Find existing verification token for this phone
      const { phoneVerificationTokens } = await import("@shared/schema");
      const tokens = await db.select().from(phoneVerificationTokens)
        .where(eq(phoneVerificationTokens.phone, phone))
        .limit(1);

      if (tokens.length === 0) {
        return res.status(400).json({ error: "No verification code found. Please request a new code first." });
      }

      const token = tokens[0];

      // Check if token has expired
      if (new Date() > new Date(token.expiresAt)) {
        return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      }

      // Check if already verified
      if (token.verified) {
        return res.status(400).json({ error: "Phone already verified. Please proceed to complete signup." });
      }

      // Send OTP via email
      const emailSent = await notificationService.sendPhoneVerificationCodeByEmail(email, phone, token.verificationCode);

      if (emailSent) {
        res.json({ 
          message: "Verification code sent to your email",
          emailSent: true,
        });
      } else {
        res.status(500).json({ 
          error: "Failed to send email. Please try again or contact support@lervit.com",
          emailSent: false,
        });
      }
    } catch (error) {
      logger.error({ error }, "Pre-signup email fallback error");
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Pre-signup: Verify phone code and get signup token
  app.post("/api/auth/pre-signup/verify-code", async (req: Request, res: Response) => {
    try {
      const verifySchema = z.object({
        phone: z.string().min(10, "Invalid phone number"),
        code: z.string().length(6, "Code must be 6 digits"),
      });
      const { phone, code } = validateBody(verifySchema, req.body);

      // Find verification token
      const { phoneVerificationTokens } = await import("@shared/schema");
      const tokens = await db.select().from(phoneVerificationTokens)
        .where(eq(phoneVerificationTokens.phone, phone))
        .limit(1);

      if (tokens.length === 0) {
        return res.status(400).json({ error: "No verification code found. Please request a new one." });
      }

      const token = tokens[0];

      if (new Date() > new Date(token.expiresAt)) {
        return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      }

      if (token.verificationCode !== code) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Generate a verified token for signup
      const { randomBytes } = await import("crypto");
      const verifiedToken = randomBytes(32).toString("hex");
      const newExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes to complete signup

      // Update token as verified
      await db.update(phoneVerificationTokens)
        .set({
          verified: true,
          verifiedToken,
          expiresAt: newExpiry,
        })
        .where(eq(phoneVerificationTokens.id, token.id));

      res.json({ 
        message: "Phone verified successfully",
        verifiedToken,
        phone,
      });
    } catch (error) {
      logger.error({ error }, "Pre-signup phone verification verify error");
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== POST-LOGIN PHONE VERIFICATION (existing authenticated flow) =====
  // Phone verification - send code
  app.post("/api/auth/send-phone-verification", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const phoneSchema = z.object({
        phone: z.string().min(10, "Invalid phone number"),
      });
      const { phone } = validateBody(phoneSchema, req.body);

      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Generate 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Update user with phone number and verification code
      await db.update(usersTable)
        .set({
          phone: phone,
          phoneVerificationCode: verificationCode,
          phoneVerificationExpiry: expiryTime,
          phoneVerified: false,
        })
        .where(eq(usersTable.id, user.id));

      // Send SMS via notification service
      await notificationService.sendPhoneVerificationCode(phone, verificationCode);

      res.json({ message: "Verification code sent to your phone" });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Phone verification - verify code
  app.post("/api/auth/verify-phone", async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const verifySchema = z.object({
        code: z.string().length(6, "Code must be 6 digits"),
      });
      const { code } = validateBody(verifySchema, req.body);

      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.phoneVerificationCode || !user.phoneVerificationExpiry) {
        return res.status(400).json({ error: "No verification code found. Please request a new one." });
      }

      if (new Date() > new Date(user.phoneVerificationExpiry)) {
        return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      }

      if (user.phoneVerificationCode !== code) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Mark phone as verified and clear code
      await db.update(usersTable)
        .set({
          phoneVerified: true,
          phoneVerificationCode: null,
          phoneVerificationExpiry: null,
        })
        .where(eq(usersTable.id, user.id));

      res.json({ message: "Phone number verified successfully!" });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });
  
  // ===== USER ROUTES =====
  // Admin-only: /api/auth/signup is the real user-creation path (validates
  // role, sends verification email, etc). This route accepted an arbitrary
  // `role` from the body while unauthenticated — a privilege-escalation hole.
  app.post("/api/users", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const userData = validateBody(insertUserSchema, req.body);
      const hashedPassword = userData.password ? await hashPassword(userData.password) : null;
      const user = await storage.createUser({ ...userData, password: hashedPassword });
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Admin-only: full user directory. AdminDashboard consumes this. Anyone
  // else who needs their own profile should call /api/auth/me.
  app.get("/api/users", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      // Support pagination via query params
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await storage.getAllUsers({ limit, offset });
      const usersWithoutPasswords = result.data.map((user: any) => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });

      // Return paginated response
      res.json({
        data: usersWithoutPasswords,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Auth required. Callers may look up their own record; admins may look up
  // anyone. Blocks sequential-ID enumeration of the user table.
  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const authUser = (req as any).user as { id: string; role: string };
      if (authUser.id !== req.params.id && authUser.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden" });
      }
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin-only: email→user lookup is a classic account-enumeration vector.
  app.get("/api/users/email/:email", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const user = await storage.getUserByEmail(req.params.email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== MOVER ROUTES =====
  app.post("/api/movers", async (req: Request, res: Response) => {
    try {
      const moverData = validateBody(insertMoverSchema, req.body);
      const mover = await storage.createMover(moverData);
      res.json(mover);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ---- GOOGLE REVIEWS (public, cached 1 hour) ----
  let googleReviewsCache: { data: unknown; fetchedAt: number } | null = null;
  const GOOGLE_REVIEWS_TTL = 60 * 60 * 1000;

  app.get("/api/google-reviews", async (_req: Request, res: Response) => {
    try {
      if (googleReviewsCache && Date.now() - googleReviewsCache.fetchedAt < GOOGLE_REVIEWS_TTL) {
        return res.json(googleReviewsCache.data);
      }

      const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) return res.status(503).json({ error: "Google API key not configured" });

      // Step 1: Text search to find the Place ID
      const searchRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=LervIT+Calgary+moving&key=${apiKey}`
      );
      const searchData: any = await searchRes.json();

      if (!searchData.results?.length) {
        return res.status(404).json({ error: "Business not found on Google Maps" });
      }

      const placeId: string = searchData.results[0].place_id;

      // Step 2: Fetch place details — reviews, rating, and canonical Google Maps URL
      const detailsRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews,url&key=${apiKey}&language=en&reviews_sort=newest`
      );
      const detailsData: any = await detailsRes.json();
      const place = detailsData.result;

      if (!place) return res.status(404).json({ error: "Place details not found" });

      const payload = {
        rating: place.rating ?? null,
        totalRatings: place.user_ratings_total ?? 0,
        mapsUrl: place.url ?? "https://www.google.com/maps/search/LervIT+Calgary",
        reviews: (place.reviews ?? []).map((r: any) => ({
          authorName: r.author_name,
          rating: r.rating,
          text: r.text,
          relativeTime: r.relative_time_description,
          profilePhoto: r.profile_photo_url ?? null,
        })),
      };

      googleReviewsCache = { data: payload, fetchedAt: Date.now() };
      return res.json(payload);
    } catch (err) {
      console.error("Google Reviews fetch error:", err);
      return res.status(500).json({ error: "Failed to fetch Google reviews" });
    }
  });

  app.get("/api/movers", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string | undefined;
      let location = req.query.location as string | undefined;
      const isAvailable = req.query.isAvailable === 'true' ? true : req.query.isAvailable === 'false' ? false : undefined;
      const userLat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
      const userLng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
      
      // Normalize location for matching
      if (location) {
        location = location.toLowerCase().trim();
      }
      
      let movers = await storage.getMovers({ isAvailable });

      // Filter by date: exclude movers who explicitly marked themselves unavailable on that date
      const dateFilter = req.query.date as string | undefined;
      if (dateFilter && /^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
        const unavailableUserIds = new Set(
          (await db.select({ userId: moverAvailability.userId })
            .from(moverAvailability)
            .where(eq(moverAvailability.availableDate, dateFilter))
          ).map(r => r.userId)
        );
        // Keep movers who haven't marked any availability (no restrictions) or ARE listed for this date
        // The table stores AVAILABLE dates, so if a mover has any availability rows but not for this date, exclude them
        const moversWithAnyAvailability = new Set(
          (await db.select({ userId: moverAvailability.userId }).from(moverAvailability)).map(r => r.userId)
        );
        movers = movers.filter(m =>
          !moversWithAnyAvailability.has(m.userId) || unavailableUserIds.has(m.userId)
        );
      }

      // Filter by userId if provided
      if (userId) {
        movers = movers.filter(m => m.userId === userId);
      }
      
      // Apply location filter with case-insensitive matching
      if (location) {
        movers = movers.filter(m =>
          m.location && m.location.toLowerCase().includes(location.toLowerCase())
        );
      }

      // Optional server-side pagination (only when explicit params are provided)
      const moverTotal = movers.length;
      let moverPagination: { limit: number; offset: number } | null = null;
      if (req.query.limit !== undefined || req.query.offset !== undefined) {
        const pgLimit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const pgOffset = parseInt(req.query.offset as string) || 0;
        moverPagination = { limit: pgLimit, offset: pgOffset };
        movers = movers.slice(pgOffset, pgOffset + pgLimit);
      }

      // Calculate driving distances using Google Maps API (batch request for efficiency)
      let drivingDistances: Map<string, { distanceKm: number; durationMinutes: number }> = new Map();
      
      if (userLat && userLng) {
        const { getBatchDrivingDistances } = await import("./google-maps");

        // Straight-line pre-filter to the 10 closest movers — the Distance
        // Matrix API returns MAX_DIMENSIONS_EXCEEDED when we send too many
        // destinations in one call.
        const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
          const R = 6371;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLng = (lng2 - lng1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };

        const destinations = movers
          .filter(m => m.latitude !== null && m.longitude !== null)
          .map(m => ({
            id: m.id,
            coords: { lat: m.latitude!, lng: m.longitude! },
            straightKm: haversineKm(userLat, userLng, m.latitude!, m.longitude!),
          }))
          .sort((a, b) => a.straightKm - b.straightKm)
          .slice(0, 10)
          .map(({ id, coords }) => ({ id, coords }));

        // Get driving distances in a single API call
        drivingDistances = await getBatchDrivingDistances(
          { lat: userLat, lng: userLng },
          destinations
        );
      }
      
      // Enrich movers with user data and driving distance
      // Privacy: Mask full street addresses - only show city/area
      const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);
      
      let enrichedMovers = await Promise.all(
        movers.map(async (mover) => {
          const user = await storage.getUser(mover.userId);
          
          // Get driving distance from batch results
          const drivingData = drivingDistances.get(mover.id);
          const distance = drivingData?.distanceKm ?? null;
          const drivingMinutes = drivingData?.durationMinutes ?? null;
          
          // Check if mover has recent GPS update (within last hour) - Uber-style live location
          const isLiveLocation = mover.lastLocationUpdate 
            ? new Date(mover.lastLocationUpdate) > ONE_HOUR_AGO
            : false;
          
          // Get Stripe Connect account status for this mover (moverId references movers.id)
          const stripeAccounts = await db.select()
            .from(moverStripeAccounts)
            .where(eq(moverStripeAccounts.moverId, mover.id))
            .limit(1);
          const stripeAccount = stripeAccounts[0] || null;
          
          return {
            ...mover,
            // Mask location for privacy - only show city/area, not full street address
            location: maskAddressForPrivacy(mover.location),
            distance,
            drivingMinutes,
            isLiveLocation,
            user: user ? { name: user.name, email: user.email, phone: user.phone } : null,
            stripeConnect: stripeAccount ? {
              status: stripeAccount.onboardingStatus,
              chargesEnabled: stripeAccount.chargesEnabled,
              payoutsEnabled: stripeAccount.payoutsEnabled,
            } : null
          };
        })
      );
      
      // Sort by distance if coordinates provided
      if (userLat && userLng) {
        enrichedMovers.sort((a, b) => {
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });
      }

      if (moverPagination) {
        res.json({
          data: enrichedMovers,
          total: moverTotal,
          limit: moverPagination.limit,
          offset: moverPagination.offset,
          hasMore: moverPagination.offset + enrichedMovers.length < moverTotal,
        });
      } else {
        res.json(enrichedMovers);
      }
    } catch (error) {
      console.error('Get movers error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/movers/me - Get current user's mover profile
  app.get("/api/movers/me", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      if (user.role !== 'mover' && user.role !== 'admin') {
        return res.status(403).json({ error: "Not a mover" });
      }
      
      // Find mover profile by userId
      const movers = await storage.getMovers({});
      const mover = movers.find(m => m.userId === user.id);
      
      if (!mover) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      
      res.json(mover);
    } catch (error) {
      console.error('Get mover/me error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // GET /api/movers/me/ws-token - Get WebSocket authentication token for real-time notifications
  app.get("/api/movers/me/ws-token", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      if (user.role !== 'mover') {
        return res.status(403).json({ error: "Only movers can receive job notifications" });
      }
      
      // Find mover profile by userId
      const movers = await storage.getMovers({});
      const mover = movers.find(m => m.userId === user.id);
      
      if (!mover) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      
      // Generate short-lived token for WebSocket authentication
      const token = generateWebSocketToken(user.id, mover.id);
      
      res.json({ token, expiresIn: 300 }); // 5 minutes
    } catch (error) {
      console.error('Get WebSocket token error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/auth/ws-token/customer - WebSocket auth token for customer notifications
  app.get("/api/auth/ws-token/customer", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const token = generateCustomerWebSocketToken(user.id);
      res.json({ token, expiresIn: 300 });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/movers/me/pending-job-notifications
  // Returns active (pending, not yet expired) job notifications for the current mover.
  // Polled by the frontend every 30s so movers who were offline when a push was sent still see the job.
  app.get("/api/movers/me/pending-job-notifications", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      if (user.role !== 'mover') {
        return res.status(403).json({ error: "Only movers can access job notifications" });
      }

      const movers = await storage.getMovers({});
      const mover = movers.find((m: any) => m.userId === user.id);
      if (!mover) {
        return res.status(404).json({ error: "Mover profile not found" });
      }

      // Return notifications for this mover that are still pending and not expired
      const pendingNotifs = await db
        .select({
          id: jobNotifications.id,
          bookingId: jobNotifications.bookingId,
          estimatedEarnings: jobNotifications.estimatedEarnings,
          distanceToPickup: jobNotifications.distanceToPickup,
          expiresAt: jobNotifications.expiresAt,
          status: jobNotifications.status,
        })
        .from(jobNotifications)
        .where(
          and(
            eq(jobNotifications.moverId, mover.id),
            eq(jobNotifications.status, 'pending'),
            sql`${jobNotifications.expiresAt} > NOW()`
          )
        );

      // Enrich with booking details for display.
      // Show the full booked amount charged to the customer, not the post-commission payout.
      const enriched = await Promise.all(
        pendingNotifs.map(async (n) => {
          const booking = await storage.getBooking(n.bookingId);
          return {
            ...n,
            pickupAddress: booking?.pickupAddress || '',
            dropoffAddress: booking?.dropoffAddress || '',
            price: booking?.price || n.estimatedEarnings,
          };
        })
      );

      res.json(enriched);
    } catch (error) {
      console.error('Get pending job notifications error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/movers/:id", async (req: Request, res: Response) => {
    try {
      const mover = await storage.getMover(req.params.id);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      const user = await storage.getUser(mover.userId);
      const reviews = await storage.getReviewsByMover(mover.id);
      
      res.json({
        ...mover,
        user: user ? { name: user.name, email: user.email, phone: user.phone } : null,
        reviews
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/movers/:id", async (req: Request, res: Response) => {
    try {
      // SECURITY: Require authentication
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Verify the user is updating their own mover profile
      const mover = await storage.getMover(req.params.id);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      // Only the mover themselves or an admin can update the profile
      if (mover.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "You can only update your own profile" });
      }
      
      // isVerified and documentsVerified are set ONLY via the verification
      // item approval flow (PATCH /api/admin/verification/item/:id) so Riley's
      // welcome sequence fires on every verification. Never set directly here.
      if ('isVerified' in req.body || 'documentsVerified' in req.body) {
        return res.status(403).json({
          error: 'Verification status can only be changed via the verification approval flow',
        });
      }

      // Validate allowed update fields
      const updateSchema = insertMoverSchema.partial().pick({
        vehicleType: true,
        vehicleCapacity: true,
        licenseNumber: true,
        bio: true,
        location: true,
        latitude: true,
        longitude: true,
        isAvailable: true,
        vehicleColor: true,
        licensePlate: true,
        vehiclePhoto: true,
        moverImage: true,
        onboardingCompleted: true,
      });
      const updates = validateBody(updateSchema, req.body);

      // Auto-geocode so mover pins render on the customer map even without an
      // active GPS ping. Triggers (all respect an explicitly-provided lat/lng
      // in the same request):
      //   (a) `location` was just changed → geocode the new value
      //   (b) mover has no coords yet and has an existing location on file
      //       (onboarding: first profile save should populate real coords)
      //   (c) toggling `isAvailable = true` and lastLocationUpdate is stale (>24h)
      const explicitCoords = updates.latitude != null && updates.longitude != null;
      if (!explicitCoords) {
        const { geocodeAddress } = await import("./google-maps");
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const lastUpdate = mover.lastLocationUpdate ? new Date(mover.lastLocationUpdate).getTime() : 0;
        const hasCoords = mover.latitude != null && mover.longitude != null;
        const staleLocation = !lastUpdate || (now - lastUpdate) > TWENTY_FOUR_HOURS_MS;

        let addressToGeocode: string | null = null;
        if (typeof updates.location === "string" && updates.location.trim().length > 0) {
          addressToGeocode = updates.location.trim();
        } else if (!hasCoords) {
          const existing = (mover.location ?? "").trim();
          if (existing.length > 0) addressToGeocode = existing;
        } else if (updates.isAvailable === true && staleLocation) {
          const existing = (mover.location ?? "").trim();
          if (existing.length > 0) addressToGeocode = existing;
        }

        if (addressToGeocode) {
          const geo = await geocodeAddress(addressToGeocode);
          if (geo.success) {
            (updates as any).latitude = geo.coordinates.lat;
            (updates as any).longitude = geo.coordinates.lng;
            (updates as any).lastLocationUpdate = new Date();
          }
        }
      }

      // VERIFICATION CHECK: If trying to go online, verify all requirements are met
      // TEMPORARILY DISABLED FOR TESTING - Re-enable verification check for production
      // if (updates.isAvailable === true && user.role !== "admin") {
      //   const requiredTypes = ['ID', 'DRIVERS_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_PHOTOS', 'INSURANCE', 'BACKGROUND_CHECK', 'PAYOUT_SETUP'];
      //   const items = await db.select().from(verificationItems).where(eq(verificationItems.moverId, req.params.id));
      //   
      //   const now = new Date();
      //   const missingItems: string[] = [];
      //   const incompleteItems: { type: string; status: string }[] = [];
      //   
      //   for (const type of requiredTypes) {
      //     const item = items.find(i => i.type === type);
      //     
      //     if (!item) {
      //       missingItems.push(type);
      //       incompleteItems.push({ type, status: 'missing' });
      //     } else if (item.expiryDate && item.expiryDate < now) {
      //       incompleteItems.push({ type, status: 'expired' });
      //     } else if (item.status.toLowerCase() !== 'approved') {
      //       incompleteItems.push({ type, status: item.status });
      //     }
      //   }
      //   
      //   if (incompleteItems.length > 0) {
      //     return res.status(400).json({ 
      //       error: "VERIFICATION_INCOMPLETE",
      //       message: "You must complete all verification requirements before going online",
      //       missingItems,
      //       incompleteItems
      //     });
      //   }
      // }
      
      const updatedMover = await storage.updateMover(req.params.id, updates);

      // Emit mover online/offline transition on actual state change.
      if (updates.isAvailable !== undefined && mover.isAvailable !== updates.isAvailable) {
        await emitEvent(
          updates.isAvailable ? 'mover.online' : 'mover.offline',
          'mover',
          req.params.id,
          {
            userId: mover.userId,
            latitude: (updates as any).latitude ?? mover.latitude ?? null,
            longitude: (updates as any).longitude ?? mover.longitude ?? null,
            location: (updates as any).location ?? mover.location ?? null,
          },
        );
      }

      res.json(updatedMover);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Update mover location from GPS coordinates
  app.patch("/api/movers/me/location", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      if (user.role !== 'mover') {
        return res.status(403).json({ error: "Only movers can update their location" });
      }
      
      const locationSchema = z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      });
      
      const { latitude, longitude } = validateBody(locationSchema, req.body);
      
      // Get mover profile
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      
      const mover = movers[0];
      
      // Reverse geocode to get address from coordinates
      let locationText = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      try {
        const { reverseGeocode } = await import("./google-maps");
        const result = await reverseGeocode(latitude, longitude);
        if (result) {
          locationText = result;
        }
      } catch (geoError) {
        console.warn('[Location] Reverse geocoding failed, using coordinates:', geoError);
      }
      
      // Update mover's coordinates with timestamp
      await storage.updateMover(mover.id, {
        latitude,
        longitude,
        location: locationText,
        lastLocationUpdate: new Date(),
      });

      // Mirror the GPS timestamp onto the mover's active booking so Mark Shaw
      // (PULSE) sees fresh location pings regardless of which client endpoint
      // the mover uses. Without this, Mark false-positives gps_silent when the
      // mover only pings /movers/me/location.
      try {
        const [activeBooking] = await db
          .select({ id: bookings.id })
          .from(bookings)
          .where(
            and(
              eq(bookings.moverId, mover.id),
              inArray(bookings.status, [
                'en_route_to_pickup',
                'loading',
                'en_route_to_dropoff',
                'unloading',
                'confirmed',
              ]),
            ),
          )
          .limit(1);

        if (activeBooking) {
          await db
            .update(bookings)
            .set({ locationUpdatedAt: new Date(), updatedAt: new Date() })
            .where(eq(bookings.id, activeBooking.id));
        }
      } catch (bookingSyncErr) {
        logger.error({ err: bookingSyncErr, moverId: mover.id }, '[Location] Booking GPS mirror failed');
      }

      console.log(`[Location] Updated mover ${mover.id} GPS: ${latitude}, ${longitude} -> ${locationText}`);

      // LATE DISPATCH: Check for paid bookings with no active job notifications and notify this mover
      // This handles the case where customer paid when no movers were online
      try {
        const { findNearestMovers, calculateExpiryTime, resolveVehicleForBooking } = await import("@shared/matching");
        const { toDecimalString } = await import("@shared/utils");

        // Find bookings that are paid/pending assignment with no active notifications for this mover
        const pendingBookings = await db.select().from(bookings)
          .where(and(
            eq(bookings.paymentStatus, 'succeeded'),
            eq(bookings.status, BOOKING_STATUSES.PENDING),
            isNull(bookings.moverId)
          ))
          .orderBy(bookings.preferredDate);

        for (const pendingBooking of pendingBookings) {
          // Check if this mover already has any notification (pending/expired/declined) for this booking
          const existingNotif = await db.select({ id: jobNotifications.id })
            .from(jobNotifications)
            .where(and(
              eq(jobNotifications.bookingId, pendingBooking.id),
              eq(jobNotifications.moverId, mover.id)
            ))
            .limit(1);
          if (existingNotif.length > 0) continue;

          // Check if there are ANY active (pending, not expired) notifications for this booking
          const activeNotifs = await db.select({ id: jobNotifications.id })
            .from(jobNotifications)
            .where(and(
              eq(jobNotifications.bookingId, pendingBooking.id),
              eq(jobNotifications.status, 'pending'),
              sql`${jobNotifications.expiresAt} > NOW()`
            ))
            .limit(1);

          // Only dispatch to movers if the booking has NO currently active notifications
          if (activeNotifs.length > 0) continue;

          // Check if this mover is within range of the pickup location using proximity matching
          const pickupLat = parseFloat(String(pendingBooking.pickupLatitude || '0'));
          const pickupLng = parseFloat(String(pendingBooking.pickupLongitude || '0'));
          if (!pickupLat || !pickupLng) continue;

          const moverData = [{
            moverId: mover.id, userId: mover.userId,
            name: user.name, vehicleType: mover.vehicleType,
            rating: mover.rating || '0', totalMoves: mover.totalMoves,
            isAvailable: mover.isAvailable, latitude, longitude,
          }];

          const matched = findNearestMovers(
            { lat: pickupLat, lng: pickupLng },
            { lat: parseFloat(String(pendingBooking.dropoffLatitude || '0')), lng: parseFloat(String(pendingBooking.dropoffLongitude || '0')) },
            (pendingBooking.loadSize || 'medium') as 'boxes' | 'medium' | 'large' | 'apartment',
            moverData, {}, resolveVehicleForBooking(pendingBooking.aiRecommendedVehicle, pendingBooking.loadSize)
          );

          if (matched.length > 0) {
            const expiresAt = calculateExpiryTime(10);
            // Show the mover the full booked amount (not the post-commission payout).
            const bookedAmount = parseFloat(pendingBooking.price || '0');
            await storage.createJobNotification({
              bookingId: pendingBooking.id, moverId: mover.id,
              distanceToPickup: toDecimalString(matched[0].distanceToPickup),
              estimatedEarnings: toDecimalString(bookedAmount),
              status: 'pending', expiresAt,
            });

            // Route through shared notifyMover so channels stay symmetric with
            // the main dispatch path (WebSocket + in-app + email + SMS,
            // preference-gated). Otherwise late dispatch is quieter than
            // proximity dispatch and movers can miss the ping.
            await notifyMover(
              {
                moverId: mover.id,
                userId: mover.userId,
                name: user.name,
                vehicleType: mover.vehicleType ?? '',
                rating: mover.rating ?? '0',
                totalMoves: mover.totalMoves ?? 0,
                isAvailable: mover.isAvailable ?? false,
                latitude,
                longitude,
                distanceToPickup: matched[0].distanceToPickup,
                estimatedEarnings: bookedAmount,
              },
              {
                id: pendingBooking.id,
                loadSize: pendingBooking.loadSize,
                aiRecommendedVehicle: pendingBooking.aiRecommendedVehicle,
                pickupLatitude: pendingBooking.pickupLatitude,
                pickupLongitude: pendingBooking.pickupLongitude,
                dropoffLatitude: pendingBooking.dropoffLatitude,
                dropoffLongitude: pendingBooking.dropoffLongitude,
                pickupAddress: pendingBooking.pickupAddress,
                dropoffAddress: pendingBooking.dropoffAddress,
                price: pendingBooking.price,
                preSelectedMoverId: pendingBooking.preSelectedMoverId,
              },
              expiresAt,
            );
            console.log(`[Late Dispatch] Sent pending booking ${pendingBooking.id} to newly-online mover ${mover.id}`);
          }
        }
      } catch (dispatchErr) {
        console.error('[Late Dispatch] Error checking for pending jobs:', dispatchErr);
      }

      res.json({ 
        success: true, 
        location: locationText,
        latitude,
        longitude,
      });
    } catch (error) {
      console.error('[Location] Update error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update location" });
    }
  });

  // ===== VERIFICATION HELPER FUNCTIONS =====
  
  async function getDriverVerificationSummary(moverId: string) {
    const REQUIRED_TYPES = [
      'ID',
      'DRIVERS_LICENSE',
      'VEHICLE_REGISTRATION',
      'VEHICLE_PHOTOS',
      'INSURANCE',
      'BACKGROUND_CHECK',
      'PAYOUT_SETUP'
    ];

    const items = await db.select().from(verificationItems).where(eq(verificationItems.moverId, moverId));
    const now = new Date();

    let approvedCount = 0;
    let hasExpired = false;
    let hasRejected = false;

    for (const type of REQUIRED_TYPES) {
      const item = items.find(i => i.type === type);
      if (item) {
        if (item.status === 'Approved') {
          if (item.expiryDate && new Date(item.expiryDate) < now) {
            hasExpired = true;
          } else {
            approvedCount++;
          }
        } else if (item.status === 'Rejected') {
          hasRejected = true;
        } else if (item.expiryDate && new Date(item.expiryDate) < now) {
          hasExpired = true;
        }
      }
    }

    let overallStatus = 'INCOMPLETE';
    if (hasExpired || hasRejected) {
      overallStatus = 'ATTENTION';
    } else if (approvedCount === REQUIRED_TYPES.length) {
      overallStatus = 'APPROVED';
    }

    return {
      approvedCount,
      totalRequired: REQUIRED_TYPES.length,
      hasExpired,
      hasRejected,
      overallStatus,
      items
    };
  }
  
  // ===== VERIFICATION ROUTES =====
  
  app.get("/api/movers/:moverId/verification", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const mover = await storage.getMover(req.params.moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      if (mover.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const items = await db.select().from(verificationItems).where(eq(verificationItems.moverId, req.params.moverId));
      
      const now = new Date();
      const itemsWithExpiry = items.map(item => {
        if (item.expiryDate && item.expiryDate < now && item.status?.toLowerCase() === 'approved') {
          return { ...item, status: 'expired' };
        }
        return item;
      });
      
      res.json(itemsWithExpiry);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const uploadDocs = multer({
    storage: storage_multer,
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/pdf';
      
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error("Only images and PDF files are allowed"));
      }
    }
  });

  app.post("/api/movers/:moverId/verification/:type", uploadDocs.array('files', 10), async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const mover = await storage.getMover(req.params.moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      if (mover.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Upload to Object Storage for production persistence
      const objectStorageService = new ObjectStorageService();
      const fileUrls: string[] = [];
      
      for (const file of req.files as Express.Multer.File[]) {
        try {
          // Read the file from local disk (multer saves it temporarily)
          const fileBuffer = fs.readFileSync(file.path);
          
          // Upload to cloud storage with verification prefix
          const cloudPath = await objectStorageService.uploadBuffer(
            fileBuffer,
            `verification_${req.params.type}_${file.originalname}`,
            file.mimetype,
            user.id
          );
          
          fileUrls.push(cloudPath);
          
          // Clean up local file after successful upload
          fs.unlinkSync(file.path);
        } catch (uploadError) {
          console.error('Object Storage upload failed for verification doc, using local fallback:', uploadError);
          // Fallback to local path if Object Storage fails
          fileUrls.push(`/uploads/${file.filename}`);
        }
      }
      
      const itemData = {
        moverId: req.params.moverId,
        type: req.params.type.toUpperCase(),
        data: req.body.data || null,
        fileUrls: fileUrls.length > 0 ? fileUrls : null,
        status: 'under_review',
        submittedAt: new Date(),
        expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : null,
      };
      
      const validatedData = validateBody(insertVerificationItemSchema, itemData);
      
      const existing = await db.select().from(verificationItems)
        .where(and(
          eq(verificationItems.moverId, req.params.moverId),
          eq(verificationItems.type, req.params.type.toUpperCase())
        ))
        .limit(1);
      
      let result;
      if (existing.length > 0) {
        result = await db.update(verificationItems)
          .set({
            ...validatedData as any,
            updatedAt: new Date()
          })
          .where(eq(verificationItems.id, existing[0].id))
          .returning();
      } else {
        result = await db.insert(verificationItems)
          .values(validatedData as any)
          .returning();
      }

      // Fire Reid Calloway (DOCOPS) to audit the upload. Only for document
      // types Reid knows how to audit; other types (ID, VEHICLE_PHOTOS,
      // PAYOUT_SETUP) still go through the manual verification queue.
      const REID_TYPES: Record<string, string> = {
        INSURANCE: 'insurance',
        DRIVERS_LICENSE: 'drivers_license',
        VEHICLE_REGISTRATION: 'vehicle_registration',
        BACKGROUND_CHECK: 'background_check',
      };
      const reidType = REID_TYPES[req.params.type.toUpperCase()];
      if (reidType && result[0]) {
        // Direct call removed — now handled via agentEventBus subscription
        await agentEventBus.emit(
          'mover.document_uploaded',
          {
            moverId: req.params.moverId,
            documentType: reidType,
            documentUrl: fileUrls[0],
            verificationItemId: result[0].id,
          },
          'system',
        );
      }

      res.json(result[0]);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/movers/:moverId/verification-status", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const mover = await storage.getMover(req.params.moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      if (mover.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const requiredTypes = ['ID', 'DRIVERS_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_PHOTOS', 'INSURANCE', 'BACKGROUND_CHECK', 'PAYOUT_SETUP'];
      
      const items = await db.select().from(verificationItems).where(eq(verificationItems.moverId, req.params.moverId));
      
      const now = new Date();
      const missingItems: string[] = [];
      const incompleteItems: { type: string; status: string; reason?: string }[] = [];
      
      for (const type of requiredTypes) {
        const item = items.find(i => i.type === type);
        
        if (!item) {
          missingItems.push(type);
          incompleteItems.push({ type, status: 'missing' });
        } else if (item.expiryDate && item.expiryDate < now) {
          incompleteItems.push({ type, status: 'expired', reason: 'Document has expired' });
        } else if (item.status.toLowerCase() !== 'approved') {
          incompleteItems.push({ 
            type, 
            status: item.status, 
            reason: item.rejectionReason || undefined 
          });
        }
      }
      
      const isComplete = incompleteItems.length === 0;
      
      res.json({
        isComplete,
        requiredItems: requiredTypes,
        missingItems,
        incompleteItems,
        canGoOnline: isComplete
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/movers/:moverId/verification/:id/review", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const user = (req as any).user;
      
      const { status, rejectionReason } = req.body;
      
      const normalizedStatus = status?.toLowerCase();
      if (!['approved', 'rejected'].includes(normalizedStatus)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
      }
      
      // Capitalize status for consistency with admin endpoint
      const capitalizedStatus = normalizedStatus === 'approved' ? 'Approved' : 'Rejected';
      
      const result = await db.update(verificationItems)
        .set({
          status: capitalizedStatus,
          rejectionReason: normalizedStatus === 'rejected' ? rejectionReason : null,
          reviewedAt: new Date(),
          reviewedBy: user.id,
          updatedAt: new Date()
        })
        .where(eq(verificationItems.id, req.params.id))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "Verification item not found" });
      }
      
      res.json(result[0]);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== EARLY ACCESS MOVER TERMS ACCEPTANCE =====
  
  // GET /api/movers/terms/status - Check if mover has accepted current terms
  app.get("/api/movers/terms/status", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // Get the mover profile for this user
      const mover = await storage.getMoverByUserId(user.id);
      if (!mover) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      
      const CURRENT_TERMS_VERSION = 'EA-1.0';
      const hasAccepted = await storage.hasAcceptedCurrentTerms(mover.id);
      const latestAcceptance = await storage.getLatestMoverTermsAcceptance(mover.id);
      
      res.json({
        hasAcceptedCurrentTerms: hasAccepted,
        currentTermsVersion: CURRENT_TERMS_VERSION,
        latestAcceptance: latestAcceptance ? {
          termsVersion: latestAcceptance.termsVersion,
          acceptedAt: latestAcceptance.acceptedAt,
        } : null,
        pilotStatus: mover.pilotStatus,
        requiresTermsAcceptance: !hasAccepted,
      });
    } catch (error) {
      console.error('Terms status error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // POST /api/movers/terms/accept - Accept the Early Access terms
  app.post("/api/movers/terms/accept", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // Get the mover profile for this user
      const mover = await storage.getMoverByUserId(user.id);
      if (!mover) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      
      const CURRENT_TERMS_VERSION = 'EA-1.0';
      
      // Check if already accepted
      const existing = await storage.getMoverTermsAcceptance(mover.id, CURRENT_TERMS_VERSION);
      if (existing) {
        return res.json({ 
          message: "Terms already accepted",
          acceptance: existing
        });
      }
      
      // Record the acceptance with audit trail
      const acceptance = await storage.createMoverTermsAcceptance({
        moverId: mover.id,
        termsVersion: CURRENT_TERMS_VERSION,
        acceptedFromIp: req.ip || req.headers['x-forwarded-for']?.toString() || null,
        userAgent: req.headers['user-agent'] || null,
      });
      
      console.log(`[Terms] Mover ${mover.id} accepted Early Access terms v${CURRENT_TERMS_VERSION}`);
      
      res.json({
        message: "Early Access terms accepted successfully",
        acceptance: {
          termsVersion: acceptance.termsVersion,
          acceptedAt: acceptance.acceptedAt,
        }
      });
    } catch (error) {
      console.error('Terms acceptance error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== ADMIN VERIFICATION DASHBOARD ROUTES =====
  
  // GET /api/admin/verification/drivers - List all drivers with verification summaries
  app.get("/api/admin/verification/drivers", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { search, statusFilter, page = '1', pageSize = '20' } = req.query;
      const pageNum = parseInt(page as string);
      const pageSizeNum = parseInt(pageSize as string);
      const offset = (pageNum - 1) * pageSizeNum;

      // Get all movers with their users
      const moversQuery = await db
        .select({
          mover: moversTable,
          user: usersTable
        })
        .from(moversTable)
        .leftJoin(usersTable, eq(moversTable.userId, usersTable.id))
        .limit(pageSizeNum)
        .offset(offset);

      // Filter by search term
      let filteredMovers = moversQuery;
      if (search) {
        const searchLower = (search as string).toLowerCase();
        filteredMovers = moversQuery.filter(({ mover, user }) => 
          user?.name.toLowerCase().includes(searchLower) ||
          user?.email.toLowerCase().includes(searchLower) ||
          user?.phone?.toLowerCase().includes(searchLower) ||
          mover.id.includes(searchLower)
        );
      }

      // Reid Calloway (DOCOPS) — pre-fetch which movers currently have an
      // escalation-worthy audit (score > 4). Batch once so we don't fan out
      // one query per driver row.
      const moverIds = filteredMovers.map(({ mover }) => mover.id);
      const reidEscalatedMovers = new Set<string>();
      if (moverIds.length > 0) {
        const escalationRows = await db
          .select({ moverId: documentAudits.moverId })
          .from(documentAudits)
          .where(
            and(
              inArray(documentAudits.moverId, moverIds),
              gte(documentAudits.irregularityScore, 5),
            ),
          );
        for (const row of escalationRows) {
          reidEscalatedMovers.add(row.moverId);
        }
      }

      // Get verification summaries for each mover
      const driversWithVerification = await Promise.all(
        filteredMovers.map(async ({ mover, user }) => {
          const summary = await getDriverVerificationSummary(mover.id);
          const lastVerificationItem = summary.items.length > 0
            ? summary.items.sort((a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
              )[0]
            : null;

          // Check if mover has accepted Early Access terms
          const hasAcceptedTerms = await storage.hasAcceptedCurrentTerms(mover.id);

          return {
            driverId: mover.id,
            name: user?.name || 'Unknown',
            email: user?.email || '',
            phone: user?.phone || '',
            rating: mover.rating,
            overallStatus: summary.overallStatus,
            approvedCount: summary.approvedCount,
            totalRequired: summary.totalRequired,
            hasExpired: summary.hasExpired,
            hasRejected: summary.hasRejected,
            hasReidEscalation: reidEscalatedMovers.has(mover.id),
            isAvailable: mover.isAvailable,
            lastUpdated: lastVerificationItem?.updatedAt || mover.createdAt,
            pilotStatus: mover.pilotStatus,
            hasAcceptedTerms,
          };
        })
      );

      // Filter by status
      let finalDrivers = driversWithVerification;
      if (statusFilter && statusFilter !== 'ALL') {
        finalDrivers = driversWithVerification.filter(d => {
          if (statusFilter === 'MISSING_REQUIRED') {
            return d.approvedCount < d.totalRequired;
          }
          if (statusFilter === 'REID_ESCALATED') {
            return d.hasReidEscalation;
          }
          return d.overallStatus === statusFilter;
        });
      }

      res.json({
        drivers: finalDrivers,
        total: finalDrivers.length,
        page: pageNum,
        pageSize: pageSizeNum,
      });
    } catch (error) {
      console.error('Admin verification drivers error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/verification/driver/:driverId - Get detailed driver verification info
  app.get("/api/admin/verification/driver/:driverId", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { driverId } = req.params;

      // Get mover and user info
      const mover = await storage.getMover(driverId);
      if (!mover) {
        return res.status(404).json({ error: "Driver not found" });
      }

      const user = await storage.getUser(mover.userId);
      const summary = await getDriverVerificationSummary(driverId);

      // Reid Calloway (DOCOPS) — pull the latest audit per verification item
      // so the dashboard can render Reid's findings inline with each doc.
      const typeToReidKey = (t: string) => t.toLowerCase().replace(/ /g, '_');
      const auditMap = new Map<string, typeof documentAudits.$inferSelect>();

      if (summary.items.length > 0) {
        const itemIds = summary.items.map(i => i.id);
        const reidTypes = summary.items.map(i => typeToReidKey(i.type));

        const auditRows = await db.select()
          .from(documentAudits)
          .where(
            or(
              inArray(documentAudits.verificationItemId, itemIds),
              and(
                eq(documentAudits.moverId, driverId),
                inArray(documentAudits.documentType, reidTypes),
              ),
            ),
          )
          .orderBy(desc(documentAudits.createdAt));

        for (const audit of auditRows) {
          const key = audit.verificationItemId ?? audit.documentType;
          if (key && !auditMap.has(key)) {
            auditMap.set(key, audit);
          }
        }
      }

      const itemsWithReid = summary.items.map(item => {
        const audit = auditMap.get(item.id) ?? auditMap.get(typeToReidKey(item.type));
        const score = audit?.irregularityScore ?? 0;
        return {
          ...item,
          reid: audit
            ? {
                auditId: audit.id,
                status: audit.status,
                score,
                irregularities: (audit.irregularities as any[]) ?? [],
                checksRun: (audit.checksRun as any[]) ?? [],
                recommendation:
                  score === 0 ? 'approve' : score <= 4 ? 'clarification' : 'escalate',
                notes: audit.notes,
                auditedAt: audit.createdAt,
              }
            : null,
        };
      });

      res.json({
        driver: {
          id: mover.id,
          userId: mover.userId,
          name: user?.name || 'Unknown',
          email: user?.email || '',
          phone: user?.phone || '',
          moverImage: mover.moverImage,
          bio: mover.bio,
          rating: mover.rating,
          totalMoves: mover.totalMoves,
          isAvailable: mover.isAvailable,
          vehicleType: mover.vehicleType,
          vehicleColor: mover.vehicleColor,
          licensePlate: mover.licensePlate,
          vehiclePhoto: mover.vehiclePhoto,
          profileVerified: mover.profileVerified,
          documentsVerified: mover.documentsVerified,
          pilotStatus: mover.pilotStatus,
          pilotNotes: mover.pilotNotes,
          pilotExpiresAt: mover.pilotExpiresAt,
          pilotApprovedAt: mover.pilotApprovedAt,
        },
        verificationSummary: {
          overallStatus: summary.overallStatus,
          approvedCount: summary.approvedCount,
          totalRequired: summary.totalRequired,
          hasExpired: summary.hasExpired,
          hasRejected: summary.hasRejected,
        },
        verificationItems: itemsWithReid,
      });
    } catch (error) {
      console.error('Admin driver detail error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/admin/verification/item/:id - Approve/reject verification item.
  //
  // Thin wrapper over approveVerificationItem — the shared pipeline that also
  // backs the Reid audit approve/reject endpoints, so one email fires per
  // approval regardless of which UI the admin used.
  app.patch("/api/admin/verification/item/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const user = (req as any).user;

      const { status, rejectionReason, notes } = req.body;

      if (status === 'Under Review') {
        // Legacy "unset" case — only mutates verification_items, no email or
        // audit sync. Left inline so the pipeline stays focused on Approve/Reject.
        const result = await db
          .update(verificationItems)
          .set({
            status,
            rejectionReason: null,
            reviewedAt: new Date(),
            reviewedBy: user.id,
            updatedAt: new Date(),
          })
          .where(eq(verificationItems.id, req.params.id))
          .returning();
        if (result.length === 0) return res.status(404).json({ error: 'Verification item not found' });
        return res.json(result[0]);
      }

      if (!['Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({ error: "Status must be 'Approved', 'Rejected', or 'Under Review'" });
      }

      if (status === 'Rejected' && !rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason is required when rejecting' });
      }

      const pipelineResult = await approveVerificationItem(
        req.params.id,
        status as 'Approved' | 'Rejected',
        user?.id ?? user?.email ?? 'admin',
        {
          reason: rejectionReason,
          notes,
          fromReid: false,
        },
      );

      if (!pipelineResult.ok) {
        return res.status(404).json({ error: pipelineResult.error });
      }

      const [row] = await db
        .select()
        .from(verificationItems)
        .where(eq(verificationItems.id, req.params.id))
        .limit(1);
      return res.json(row);
    } catch (error) {
      console.error('Admin verification item update error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  });

  // ===== PILOT (EARLY ACCESS) PROGRAM ROUTES =====
  
  // PATCH /api/admin/movers/:id/pilot-status - Update mover pilot status
  app.patch("/api/admin/movers/:id/pilot-status", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { status, notes, expiresAt } = req.body;
      const moverId = req.params.id;
      const adminId = (req.session as any).userId;
      
      if (!status || !['none', 'pending', 'approved', 'rejected', 'suspended'].includes(status)) {
        return res.status(400).json({ error: "Invalid pilot status. Must be one of: none, pending, approved, rejected, suspended" });
      }
      
      const mover = await storage.getMover(moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      const expiryDate = expiresAt ? new Date(expiresAt) : undefined;
      const result = await storage.updateMoverPilotStatus(moverId, status, adminId, notes, expiryDate);
      
      console.log(`[Admin] Pilot status updated for mover ${moverId}: ${status} by admin ${adminId}`);
      
      // Send notification to driver about pilot status change
      const moverUser = await storage.getUser(mover.userId);
      if (moverUser) {
        try {
          await notificationService.sendPilotStatusUpdate(moverUser, status, notes);
          console.log(`[Notification] Pilot status notification sent to ${moverUser.email}`);
        } catch (notifError) {
          console.error(`[Notification] Failed to send pilot status notification:`, notifError);
        }
      }
      
      res.json(result);
    } catch (error) {
      console.error('Admin pilot status update error:', error);
      res.status(500).json({ error: "Failed to update pilot status" });
    }
  });
  
  // PATCH /api/admin/movers/:id/override-onboarding - Admin override to mark onboarding complete
  app.patch("/api/admin/movers/:id/override-onboarding", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const moverId = req.params.id;
      const adminId = (req.session as any).userId;
      
      const mover = await storage.getMover(moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      const result = await storage.updateMover(moverId, { onboardingCompleted: true });
      
      console.log(`[Admin] Onboarding override for mover ${moverId} by admin ${adminId}`);
      
      res.json({ success: true, message: "Onboarding marked complete", mover: result });
    } catch (error) {
      console.error('Admin onboarding override error:', error);
      res.status(500).json({ error: "Failed to override onboarding" });
    }
  });
  
  // GET /api/admin/movers/pilot - Get all movers by pilot status
  app.get("/api/admin/movers/pilot", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const status = req.query.status as string || 'pending';
      
      const movers = await storage.getMoversByPilotStatus(status);
      
      // Enrich with user data + derived vehicle class
      const enrichedMovers = await Promise.all(movers.map(async (mover) => {
        const user = await storage.getUser(mover.userId);
        const vehicleClass = vehicleClassFromVehicleType(mover.vehicleType);
        return {
          ...mover,
          vehicleClass,
          vehicleCapacityRange: VEHICLE_CAPACITY_RANGES[vehicleClass],
          user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null
        };
      }));

      res.json(enrichedMovers);
    } catch (error) {
      console.error('Admin get pilot movers error:', error);
      res.status(500).json({ error: "Failed to get pilot movers" });
    }
  });

  // POST /api/admin/users/:id/lock - Admin lock/suspend a user account
  app.post("/api/admin/users/:id/lock", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { reason } = req.body;
      const userId = req.params.id;
      
      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ error: "Lock reason is required" });
      }
      
      const result = await db.update(usersTable)
        .set({
          lockedByAdmin: true,
          lockReason: reason.trim(),
          lockedUntil: null, // Clear any timed lockout
        })
        .where(eq(usersTable.id, userId))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      console.log(`[Admin] User ${userId} locked by admin. Reason: ${reason}`);
      
      const { password: _, ...userWithoutPassword } = result[0];
      res.json({ message: "Account suspended", user: userWithoutPassword });
    } catch (error) {
      console.error('Admin lock user error:', error);
      res.status(500).json({ error: "Failed to lock account" });
    }
  });

  // POST /api/admin/users/:id/unlock - Admin unlock a user account
  app.post("/api/admin/users/:id/unlock", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const userId = req.params.id;
      
      const result = await db.update(usersTable)
        .set({
          lockedByAdmin: false,
          lockedUntil: null,
          lockReason: null,
          failedLoginAttempts: 0,
        })
        .where(eq(usersTable.id, userId))
        .returning();
      
      if (result.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      console.log(`[Admin] User ${userId} unlocked by admin`);
      
      const { password: _, ...userWithoutPassword } = result[0];
      res.json({ message: "Account unlocked", user: userWithoutPassword });
    } catch (error) {
      console.error('Admin unlock user error:', error);
      res.status(500).json({ error: "Failed to unlock account" });
    }
  });

  // GET /api/admin/users - Get all users with lock status (paginated)
  app.get("/api/admin/users", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(usersTable);
      const total = countRow?.total ?? 0;

      const allUsers = await db.select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        phone: usersTable.phone,
        role: usersTable.role,
        avatarUrl: usersTable.avatarUrl,
        failedLoginAttempts: usersTable.failedLoginAttempts,
        lockedUntil: usersTable.lockedUntil,
        lockedByAdmin: usersTable.lockedByAdmin,
        lockReason: usersTable.lockReason,
        createdAt: usersTable.createdAt,
      }).from(usersTable).orderBy(usersTable.createdAt).limit(limit).offset(offset);

      res.json({ data: allUsers, total, limit, offset, hasMore: offset + allUsers.length < total });
    } catch (error) {
      console.error('Admin get users error:', error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // PATCH /api/admin/users/:id - Admin update user profile
  app.patch("/api/admin/users/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const userId = req.params.id;
      const { name, email, phone, role } = req.body;
      
      // Check if user exists
      const existingUser = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (existingUser.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const previousRole = existingUser[0].role;
      const isUpgradeToMover = role === 'mover' && previousRole === 'customer';
      
      // Prevent changing the last admin's role
      if (existingUser[0].role === 'admin' && role && role !== 'admin') {
        const adminCount = await db.select().from(usersTable).where(eq(usersTable.role, 'admin'));
        if (adminCount.length <= 1) {
          return res.status(400).json({ error: "Cannot change role of the last admin" });
        }
      }
      
      // If email is being changed, check for duplicates
      if (email && email !== existingUser[0].email) {
        const emailExists = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
        if (emailExists.length > 0) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (role !== undefined) updateData.role = role;
      
      const result = await db.update(usersTable)
        .set(updateData)
        .where(eq(usersTable.id, userId))
        .returning();
      
      const updatedUser = result[0];
      
      // If upgrading from customer to mover, create mover profile if it doesn't exist
      if (isUpgradeToMover) {
        logger.info({
          env: process.env.NODE_ENV,
          event: "admin_role_upgrade",
          userId,
          previousRole,
          newRole: 'mover',
          action: 'checking_mover_profile'
        });
        
        // Check if mover profile already exists
        const existingMover = await db.select().from(moversTable)
          .where(eq(moversTable.userId, userId))
          .limit(1);
        
        if (existingMover.length === 0) {
          // Create default mover profile. Do NOT seed fake coordinates —
          // coords remain null until real GPS is pushed or the profile
          // address is geocoded.
          const newMover = await db.insert(moversTable).values({
            userId: userId,
            vehicleType: "van",
            isAvailable: true,
            location: "Calgary, AB",
            latitude: null,
            longitude: null,
            isVerified: false,
            profileVerified: false,
            documentsVerified: false,
            rating: "0",
            totalMoves: 0,
            completedTrips: 0,
            pilotStatus: "none",
          }).returning();
          
          logger.info({
            env: process.env.NODE_ENV,
            event: "admin_role_upgrade",
            userId,
            moverId: newMover[0].id,
            action: 'mover_profile_created'
          });
        } else {
          logger.info({
            env: process.env.NODE_ENV,
            event: "admin_role_upgrade",
            userId,
            moverId: existingMover[0].id,
            action: 'mover_profile_exists'
          });
        }
        
        // Send upgrade notification email
        try {
          await notificationService.sendRoleUpgradeEmail(updatedUser, 'mover');
          logger.info({
            env: process.env.NODE_ENV,
            event: "admin_role_upgrade",
            userId,
            action: 'upgrade_email_sent'
          });
        } catch (emailError) {
          logger.error({
            env: process.env.NODE_ENV,
            event: "admin_role_upgrade",
            userId,
            action: 'upgrade_email_failed',
            error: emailError instanceof Error ? emailError.message : 'Unknown error'
          });
        }
      }
      
      logger.info({
        env: process.env.NODE_ENV,
        event: "admin_user_update",
        userId,
        adminId: (req as any).user?.id,
        changes: Object.keys(updateData),
        roleChange: role !== undefined && role !== previousRole ? `${previousRole} -> ${role}` : null
      });

      // --- Post-update contact change flows ---
      const normalizedNewEmail = email?.trim().toLowerCase();
      const normalizedOldEmail = existingUser[0].email?.trim().toLowerCase();
      const normalizedNewPhone = phone?.trim();
      const normalizedOldPhone = existingUser[0].phone?.trim();
      const emailChanged = normalizedNewEmail !== undefined && normalizedNewEmail !== normalizedOldEmail;
      const phoneChanged = normalizedNewPhone !== undefined && normalizedNewPhone !== normalizedOldPhone;
      const isMover = updatedUser.role === 'mover';

      logger.info({
        env: process.env.NODE_ENV,
        event: "admin_contact_change_eval",
        userId,
        emailProvided: email !== undefined,
        emailChanged,
        phoneProvided: phone !== undefined,
        phoneChanged,
        oldEmail: normalizedOldEmail,
        newEmail: normalizedNewEmail,
      });

      // Invalidate all sessions for this user if email or phone changed (force re-login)
      if (emailChanged || phoneChanged) {
        try {
          await pool.query(
            `DELETE FROM user_sessions WHERE sess->>'userId' = $1`,
            [userId]
          );
          logger.info({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, emailChanged, phoneChanged, action: 'sessions_invalidated' });
        } catch (sessionErr) {
          logger.error({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'session_invalidation_failed' });
        }
      }

      // Email change flow
      if (emailChanged && email) {
        try {
          const { randomBytes } = await import("crypto");
          const verificationToken = randomBytes(32).toString("hex");
          const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

          // Reset email verification status and set new token
          await db.update(usersTable)
            .set({ emailVerified: false, verificationToken, verificationTokenExpiry })
            .where(eq(usersTable.id, userId));

          // Send verification email to the new address
          await notificationService.sendVerificationEmail(email, updatedUser.name || 'User', verificationToken);

          // Send security alert to old address
          await notificationService.sendEmail({
            to: existingUser[0].email,
            subject: 'Your LervIT Account Email Was Changed',
            type: 'status_update',
            body: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                <h2 style="color:#1a1a1a;">Email Address Updated</h2>
                <p>Hi ${updatedUser.name || 'there'},</p>
                <p>Your LervIT account email address was updated by an administrator to:</p>
                <p style="font-size:16px;font-weight:bold;color:#2563eb;">${email}</p>
                <p>A verification link has been sent to your new address. You'll need to verify it before you can log back in.</p>
                <p style="color:#dc2626;">If you did not request this change, contact support immediately at <a href="mailto:support@lervit.com">support@lervit.com</a>.</p>
              </div>`,
          });

          // Sync new email to Stripe Connect account if mover has one
          if (isMover) {
            const moverProfile = await db.select().from(moversTable).where(eq(moversTable.userId, userId)).limit(1);
            if (moverProfile.length > 0) {
              const stripeAccount = await db.select().from(moverStripeAccounts)
                .where(eq(moverStripeAccounts.moverId, moverProfile[0].id))
                .limit(1);
              if (stripeAccount.length > 0 && stripeAccount[0].stripeAccountId) {
                try {
                  await stripe.accounts.update(stripeAccount[0].stripeAccountId, { email });
                  logger.info({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'stripe_email_synced', stripeAccountId: stripeAccount[0].stripeAccountId });
                } catch (stripeErr) {
                  logger.error({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'stripe_email_sync_failed', error: stripeErr instanceof Error ? stripeErr.message : 'Unknown' });
                }
              }
            }
          }

          logger.info({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'email_change_complete', newEmail: email });
        } catch (emailErr) {
          logger.error({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'email_change_flow_failed', error: emailErr instanceof Error ? emailErr.message : 'Unknown' });
        }
      }

      // Phone change flow — SMS alert to new number
      if (phoneChanged && phone) {
        try {
          await notificationService.sendSMS({
            to: phone,
            type: 'booking_update',
            message: `LervIT: Your account phone number has been updated by an administrator. If you did not request this, contact support at support@lervit.ca`,
          });
          logger.info({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'phone_change_sms_sent' });
        } catch (smsErr) {
          logger.error({ env: process.env.NODE_ENV, event: "admin_contact_change", userId, action: 'phone_change_sms_failed', error: smsErr instanceof Error ? smsErr.message : 'Unknown' });
        }
      }

      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json({ 
        message: isUpgradeToMover 
          ? "User upgraded to mover successfully. Mover profile created and notification sent." 
          : "User updated", 
        user: userWithoutPassword,
        moverProfileCreated: isUpgradeToMover,
        emailChanged,
        phoneChanged,
        sessionsInvalidated: emailChanged || phoneChanged,
        emailVerificationSent: emailChanged,
      });
    } catch (error) {
      console.error('Admin update user error:', error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // POST /api/admin/users/:id/force-verify-email - Reset emailVerified, send verification email, invalidate sessions
  app.post("/api/admin/users/:id/force-verify-email", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const userId = req.params.id;

      const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (user.length === 0) return res.status(404).json({ error: "User not found" });

      const { randomBytes } = await import("crypto");
      const verificationToken = randomBytes(32).toString("hex");
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.update(usersTable)
        .set({ emailVerified: false, verificationToken, verificationTokenExpiry })
        .where(eq(usersTable.id, userId));

      // Invalidate all sessions so they must re-verify before logging in
      await pool.query(`DELETE FROM user_sessions WHERE sess->>'userId' = $1`, [userId]);

      // Send verification email to current address
      await notificationService.sendVerificationEmail(user[0].email, user[0].name || 'User', verificationToken);

      logger.info({
        env: process.env.NODE_ENV,
        event: "admin_force_verify_email",
        userId,
        email: user[0].email,
        adminId: (req as any).user?.id,
      });

      res.json({ message: "Verification email sent. User has been logged out and must verify before logging in." });
    } catch (error) {
      console.error("Admin force-verify-email error:", error);
      res.status(500).json({ error: "Failed to send verification email" });
    }
  });

  // DELETE /api/admin/users/:id - Admin delete user (for abandoned accounts)
  app.delete("/api/admin/users/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const userId = req.params.id;
      const adminUser = (req as any).user;
      
      // Prevent self-deletion
      if (userId === adminUser.id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      // Check if user exists
      const existingUser = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (existingUser.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Prevent deleting the last admin
      if (existingUser[0].role === 'admin') {
        const adminCount = await db.select().from(usersTable).where(eq(usersTable.role, 'admin'));
        if (adminCount.length <= 1) {
          return res.status(400).json({ error: "Cannot delete the last admin" });
        }
      }
      
      // Check for active bookings
      const activeBookings = await db.select().from(bookings)
        .where(and(
          eq(bookings.customerId, userId),
          notInArray(bookings.status, ['completed', 'cancelled'])
        ));
      
      if (activeBookings.length > 0) {
        return res.status(400).json({ 
          error: "Cannot delete user with active bookings",
          activeBookingsCount: activeBookings.length
        });
      }
      
      // Delete related data in order (respecting foreign keys)
      // 1. Delete support ticket replies
      const userTickets = await db.select({ id: supportTickets.id })
        .from(supportTickets)
        .where(eq(supportTickets.userId, userId));
      
      for (const ticket of userTickets) {
        await db.delete(supportTicketReplies).where(eq(supportTicketReplies.ticketId, ticket.id));
      }
      
      // 2. Delete support tickets
      await db.delete(supportTickets).where(eq(supportTickets.userId, userId));
      
      // 3. Delete messages
      await db.delete(messages).where(eq(messages.senderId, userId));
      
      // 4. Delete in-app notifications
      await db.delete(inAppNotifications).where(eq(inAppNotifications.userId, userId));
      
      // 5. Delete mover-related data if user is a mover
      const mover = await db.select().from(moversTable).where(eq(moversTable.userId, userId)).limit(1);
      if (mover.length > 0) {
        await db.delete(moverTermsAcceptance).where(eq(moverTermsAcceptance.moverId, mover[0].id));
        await db.delete(verificationItems).where(eq(verificationItems.moverId, mover[0].id));
        await db.delete(jobNotifications).where(eq(jobNotifications.moverId, mover[0].id));
        await db.delete(moverPerformanceTable).where(eq(moverPerformanceTable.moverId, mover[0].id));
        await db.delete(moverPayouts).where(eq(moverPayouts.moverId, mover[0].id));
        await db.delete(moverEarnings).where(eq(moverEarnings.moverId, mover[0].id));
        await db.delete(moverStripeAccounts).where(eq(moverStripeAccounts.moverId, mover[0].id));
        await db.delete(moversTable).where(eq(moversTable.userId, userId));
      }
      
      // 6. Delete reviews where user is the customer
      await db.delete(reviews).where(eq(reviews.customerId, userId));
      
      // 7. Delete completed/cancelled bookings (cascade)
      const userBookings = await db.select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.customerId, userId));
      
      for (const booking of userBookings) {
        await db.delete(moverEarnings).where(eq(moverEarnings.bookingId, booking.id));
        await db.delete(messages).where(eq(messages.bookingId, booking.id));
        await db.delete(reviews).where(eq(reviews.bookingId, booking.id));
        await db.delete(jobNotifications).where(eq(jobNotifications.bookingId, booking.id));
      }
      await db.delete(bookings).where(eq(bookings.customerId, userId));
      
      // 8. Finally delete the user
      await db.delete(usersTable).where(eq(usersTable.id, userId));
      
      console.log(`[Admin] User ${userId} (${existingUser[0].email}) deleted by admin ${adminUser.id}`);
      
      res.json({ message: "User deleted successfully", deletedUser: existingUser[0].email });
    } catch (error) {
      console.error('Admin delete user error:', error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ===== ADMIN EMAIL CAMPAIGNS =====
  
  // GET /api/admin/email/campaigns - List all email campaigns
  app.get("/api/admin/email/campaigns", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const campaigns = await db.select()
        .from(emailCampaigns)
        .orderBy(desc(emailCampaigns.createdAt));
      
      res.json(campaigns);
    } catch (error) {
      console.error('Get campaigns error:', error);
      res.status(500).json({ error: "Failed to get campaigns" });
    }
  });

  // GET /api/admin/email/recipients - Get potential recipients based on audience type
  app.get("/api/admin/email/recipients", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { audienceType } = req.query;
      
      let users;
      if (audienceType === 'customers') {
        users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.role, 'customer'));
      } else if (audienceType === 'movers') {
        users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.role, 'mover'));
      } else {
        // All users (excluding admins)
        users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
          .from(usersTable)
          .where(notInArray(usersTable.role, ['admin']));
      }
      
      res.json(users);
    } catch (error) {
      console.error('Get recipients error:', error);
      res.status(500).json({ error: "Failed to get recipients" });
    }
  });

  // POST /api/admin/email/upload-attachment - Upload file attachment for email
  const emailAttachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit for videos
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
        'video/mpeg',
      ];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Allowed: PDF, Word, Excel, CSV, images, and videos.'));
      }
    },
  });

  app.post("/api/admin/email/upload-attachment", emailAttachmentUpload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      // Return the file as base64 for immediate use (no storage needed)
      const base64Content = file.buffer.toString('base64');
      
      res.json({
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
        content: base64Content,
      });
    } catch (error: any) {
      console.error('Upload attachment error:', error);
      res.status(500).json({ error: error.message || "Failed to upload attachment" });
    }
  });

  // POST /api/admin/email/send - Send an email campaign
  app.post("/api/admin/email/send", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const adminUser = (req as any).user;
      const { subject, content, type, audienceType, recipientIds, attachmentLinks, fileAttachments } = req.body;
      
      if (!subject || !content || !type || !audienceType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Get recipients based on audience type
      let recipients;
      if (audienceType === 'specific' && recipientIds?.length > 0) {
        recipients = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(sql`${usersTable.id} IN (${sql.join(recipientIds.map((id: string) => sql`${id}`), sql`, `)})`);
      } else if (audienceType === 'customers') {
        recipients = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.role, 'customer'));
      } else if (audienceType === 'movers') {
        recipients = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.role, 'mover'));
      } else {
        // All users (excluding admins)
        recipients = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
          .from(usersTable)
          .where(notInArray(usersTable.role, ['admin']));
      }
      
      if (recipients.length === 0) {
        return res.status(400).json({ error: "No recipients found" });
      }
      
      // Create campaign record
      const [campaign] = await db.insert(emailCampaigns).values({
        subject,
        content,
        type,
        audienceType,
        recipientIds: recipients.map(r => r.id),
        recipientCount: recipients.length,
        sentBy: adminUser.id,
        status: 'sending',
      }).returning();
      
      // Send emails to all recipients
      let successCount = 0;
      let failCount = 0;
      
      for (const recipient of recipients) {
        const success = await notificationService.sendCampaignEmail(
          recipient.email,
          recipient.name,
          subject,
          content,
          type,
          attachmentLinks,
          fileAttachments
        );
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      }
      
      // Update campaign status
      const finalStatus = failCount === recipients.length ? 'failed' : 'sent';
      await db.update(emailCampaigns)
        .set({ status: finalStatus, sentAt: new Date() })
        .where(eq(emailCampaigns.id, campaign.id));
      
      console.log(`[Admin Email] Campaign sent by ${adminUser.id}: ${successCount} success, ${failCount} failed`);
      
      res.json({ 
        message: "Campaign sent", 
        campaignId: campaign.id,
        recipientCount: recipients.length,
        successCount,
        failCount
      });
    } catch (error) {
      console.error('Send campaign error:', error);
      res.status(500).json({ error: "Failed to send campaign" });
    }
  });

  // ===== PROMO CODE VALIDATION =====
  app.post("/api/promo/validate", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const { code } = req.body;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ valid: false, message: "Promo code is required" });
      }

      const normalizedCode = code.trim().toUpperCase();

      const latestUser = await storage.getUser(user.id);
      if (!latestUser) {
        return res.status(200).json({ valid: false, message: "User not found" });
      }

      if (normalizedCode === "LERVIT10") {
        if ((latestUser.promoUsesCount || 0) >= 1) {
          return res.status(200).json({ valid: false, message: "You've already used this promo code on your first Move" });
        }
        const usesRemaining = 1 - (latestUser.promoUsesCount || 0);
        return res.status(200).json({
          valid: true,
          code: "LERVIT10",
          discountPercent: 10,
          usesRemaining,
          message: `10% off applied! Valid on your first Move.`
        });
      }

      if (normalizedCode === "KAI15") {
        // KAI15 is a winback code — one use per customer, independent of
        // LERVIT10 (which fires promoUsesCount for first-move discounts).
        // Gate on prior KAI15 usage in the bookings table.
        const [priorKai15] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(bookings)
          .where(and(eq(bookings.customerId, user.id), eq(bookings.promoCode, 'KAI15')));
        if ((priorKai15?.n ?? 0) >= 1) {
          return res.status(200).json({ valid: false, message: "You've already used this winback code" });
        }
        return res.status(200).json({
          valid: true,
          code: "KAI15",
          discountPercent: 15,
          usesRemaining: 1,
          message: `15% off applied! Valid on your next move.`,
        });
      }

      return res.status(200).json({ valid: false, message: "Invalid promo code" });
    } catch (error: any) {
      console.error("Promo validation error:", error);
      return res.status(500).json({ valid: false, message: "Failed to validate promo code" });
    }
  });

  // ===== BOOKING ROUTES =====
  app.post("/api/bookings", async (req: Request, res: Response) => {
    try {
      // SECURITY: Require authentication
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Only customers can create bookings
      if (user.role !== "customer") {
        return res.status(403).json({ error: "Only customers can create bookings" });
      }
      
      // SECURITY: Require email verification to create bookings
      if (!user.emailVerified) {
        return res.status(403).json({ 
          error: "Email verification required",
          message: "Please verify your email address before making a booking. Check your inbox for the verification link.",
          requiresEmailVerification: true
        });
      }
      
      // Validate booking data - customerId will be added from authenticated user
      const bookingData = validateBody(
        insertBookingSchema.extend({
          customerId: z.string().optional(),
          pickupAddress: z.string().min(1, "Pickup address is required"),
          dropoffAddress: z.string().min(1, "Dropoff address is required"),
          preSelectedMoverId: z.string().optional(), // For direct mover selection from Browse Movers page
        }),
        { ...req.body, customerId: user.id }
      );
      
      // Extract and validate preSelectedMoverId for later use (after payment)
      let validatedPreSelectedMoverId: string | null = null;
      if (bookingData.preSelectedMoverId) {
        // SECURITY: Validate that the pre-selected mover exists and is operational
        const preSelectedMover = await storage.getMover(bookingData.preSelectedMoverId);
        if (preSelectedMover && preSelectedMover.isAvailable) {
          validatedPreSelectedMoverId = bookingData.preSelectedMoverId;
          logEvent.booking('preselected_mover_validated', {
            moverId: validatedPreSelectedMoverId,
            customerId: user.id,
          });
        } else {
          // Log warning but don't reject - fall back to proximity matching
          logEvent.booking('preselected_mover_invalid', {
            requestedMoverId: bookingData.preSelectedMoverId,
            reason: preSelectedMover ? 'mover_unavailable' : 'mover_not_found',
            customerId: user.id,
          });
        }
      }
      
      // Geocode addresses using Google Maps API for accurate coordinates
      const { geocodeAddress, getDrivingDistance } = await import("./google-maps");
      const { calculatePrice } = await import("@shared/pricing");
      const { findNearestMovers, calculateExpiryTime, resolveVehicleForBooking } = await import("@shared/matching");
      const { toDecimalString } = await import("@shared/utils");
      
      // Use Google Maps Geocoding API for real coordinates (not mock)
      const pickupGeo = await geocodeAddress(bookingData.pickupAddress);
      const dropoffGeo = await geocodeAddress(bookingData.dropoffAddress);
      
      logEvent.booking('geocoded_addresses', {
        pickupAddress: bookingData.pickupAddress,
        pickupCoords: pickupGeo.coordinates,
        pickupSource: pickupGeo.success ? 'google_maps' : 'fallback',
        dropoffAddress: bookingData.dropoffAddress,
        dropoffCoords: dropoffGeo.coordinates,
        dropoffSource: dropoffGeo.success ? 'google_maps' : 'fallback',
      });
      
      // Calculate driving distance and duration using Google Distance Matrix API
      const drivingDistanceResult = await getDrivingDistance(pickupGeo.coordinates, dropoffGeo.coordinates);
      
      logEvent.booking('distance_calculated', {
        distanceKm: drivingDistanceResult.distanceKm,
        durationMinutes: drivingDistanceResult.durationMinutes,
        source: drivingDistanceResult.success ? 'google_maps' : 'haversine_fallback',
      });
      const distance = drivingDistanceResult.distanceKm;
      const aiDetectedVolumeCuft = typeof req.body.aiDetectedVolumeCuft === 'number' ? req.body.aiDetectedVolumeCuft : undefined;
      const heavyItemCount = typeof req.body.heavyItemCount === 'number' ? req.body.heavyItemCount : undefined;
      const heavyItemFeeOverride = typeof req.body.heavyItemFeeOverride === 'number' ? req.body.heavyItemFeeOverride : undefined;
      // Preferred premium input: keyed itemPremiums from Vision Engine 2.0.
      const rawDetectedItems = Array.isArray(req.body.detectedItems) ? req.body.detectedItems : [];
      const detectedItems = rawDetectedItems
        .filter((it: any) => it && typeof it.itemName === 'string')
        .map((it: any) => ({
          itemName: it.itemName as string,
          premiumKey: typeof it.premiumKey === 'string' ? it.premiumKey : null,
        }));
      const hasKeyedPremiums = detectedItems.some((d: { premiumKey: string | null }) => !!d.premiumKey);
      const priceBreakdown = calculatePrice({
        distanceKm: distance,
        loadSize: bookingData.loadSize,
        pickupDifficulty: bookingData.pickupDifficulty,
        dropoffDifficulty: bookingData.dropoffDifficulty,
        heavyItem: bookingData.heavyItem || false,
        numberOfMovers: bookingData.numberOfMovers,
        volumeCuft: aiDetectedVolumeCuft,
        detectedItems,
        // Legacy fallback only when the vision engine emitted no keyed premiums.
        heavyItemFeeOverride: hasKeyedPremiums ? undefined : heavyItemFeeOverride,
      });
      // heavyItemCount is legacy — the tiered heavyItemFeeOverride from the client
      // supersedes it; kept in scope for logging only.
      void heavyItemCount;
      
      // Calculate promo code discount
      const latestUser = await storage.getUser(user.id);
      let finalPrice = priceBreakdown.total;
      let discountPercent = 0;
      let discountAmount = 0;
      let discountReason: string | null = null;
      let promoCode: string | null = null;
      let moverBalanceOwed = 0;

      // NOTE: Re-fetches latest user state above to minimize race conditions.
      // For high-concurrency scenarios, consider adding row-level locking.
      const submittedPromo = bookingData.promoCode?.trim().toUpperCase();
      if (submittedPromo === "LERVIT10" && latestUser && (latestUser.promoUsesCount || 0) < 1) {
        promoCode = "LERVIT10";
        discountPercent = 10;
        discountAmount = Math.round(priceBreakdown.total * 0.10 * 100) / 100;
        finalPrice = priceBreakdown.total - discountAmount;
        discountReason = `LERVIT10 promo - 10% off (first Move discount)`;
        // Platform absorbs discount: mover gets 85% of ORIGINAL price
        // Stripe auto-payout gives mover 85% of discounted price
        // Balance owed = 85% of original - 85% of discounted = 85% * discountAmount
        moverBalanceOwed = Math.round(0.85 * discountAmount * 100) / 100;
      } else if (submittedPromo === "KAI15" && latestUser) {
        // KAI15 winback — one use per customer, gated on prior KAI15 bookings
        // rather than promoUsesCount so LERVIT10 users can still redeem it.
        const [priorKai15] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(bookings)
          .where(and(eq(bookings.customerId, user.id), eq(bookings.promoCode, 'KAI15')));
        if ((priorKai15?.n ?? 0) < 1) {
          promoCode = "KAI15";
          discountPercent = 15;
          discountAmount = Math.round(priceBreakdown.total * 0.15 * 100) / 100;
          finalPrice = priceBreakdown.total - discountAmount;
          discountReason = `KAI15 promo - 15% off (winback)`;
          moverBalanceOwed = Math.round(0.85 * discountAmount * 100) / 100;
        }
      }
      
      // Attribution — accept UTM / channel hints from body, query, or headers.
      // Body wins over query wins over headers. All fields optional.
      const pickString = (v: unknown): string | undefined => {
        if (typeof v !== 'string') return undefined;
        const trimmed = v.trim();
        return trimmed.length ? trimmed.slice(0, 200) : undefined;
      };
      const utmSource = pickString((req.body as any)?.utmSource)
        ?? pickString(req.query.utm_source)
        ?? pickString(req.headers['x-utm-source'] as any);
      const utmMedium = pickString((req.body as any)?.utmMedium)
        ?? pickString(req.query.utm_medium)
        ?? pickString(req.headers['x-utm-medium'] as any);
      const utmCampaign = pickString((req.body as any)?.utmCampaign)
        ?? pickString(req.query.utm_campaign)
        ?? pickString(req.headers['x-utm-campaign'] as any);
      const sourceChannel = pickString((req.body as any)?.sourceChannel)
        ?? pickString(req.query.source_channel)
        ?? pickString(req.headers['x-source-channel'] as any)
        ?? (utmSource ? 'utm' : undefined);
      const landingPage = pickString((req.body as any)?.landingPage)
        ?? pickString(req.query.landing_page)
        ?? pickString(req.headers['referer'] as any);

      // Create booking with geocoded data, price breakdown, and AI metadata
      // SECURITY: Use authenticated user's ID, not from request body
      // If preSelectedMoverId is provided, store it for direct assignment after payment
      const booking = await storage.createBooking({
        customerId: user.id,
        pickupAddress: bookingData.pickupAddress,
        dropoffAddress: bookingData.dropoffAddress,
        loadSize: bookingData.loadSize,
        preferredDate: typeof bookingData.preferredDate === 'string' ? new Date(bookingData.preferredDate) : bookingData.preferredDate,
        pickupDifficulty: bookingData.pickupDifficulty,
        dropoffDifficulty: bookingData.dropoffDifficulty,
        heavyItem: bookingData.heavyItem || false,
        numberOfMovers: bookingData.numberOfMovers,
        status: BOOKING_STATUSES.PENDING_PAYMENT,
        ...(validatedPreSelectedMoverId && { preSelectedMoverId: validatedPreSelectedMoverId }), // Store validated pre-selected mover for direct assignment after payment
        ...(bookingData.images && { images: bookingData.images }),
        ...(bookingData.aiWeightClass && { aiWeightClass: bookingData.aiWeightClass }),
        ...(bookingData.aiRecommendedVehicle && { aiRecommendedVehicle: bookingData.aiRecommendedVehicle }),
        ...(bookingData.aiConfidenceScore !== undefined && { aiConfidenceScore: bookingData.aiConfidenceScore }),
        pickupLatitude: pickupGeo.coordinates.lat,
        pickupLongitude: pickupGeo.coordinates.lng,
        dropoffLatitude: dropoffGeo.coordinates.lat,
        dropoffLongitude: dropoffGeo.coordinates.lng,
        distance: toDecimalString(distance),
        price: toDecimalString(finalPrice),
        baseFee: toDecimalString(priceBreakdown.baseFee),
        distanceFee: toDecimalString(priceBreakdown.distanceFee),
        loadFee: toDecimalString(priceBreakdown.loadFee),
        moverTravelFee: "0.00",
        pickupDifficultyFee: toDecimalString(priceBreakdown.pickupDifficultyFee),
        dropoffDifficultyFee: toDecimalString(priceBreakdown.dropoffDifficultyFee),
        heavyItemFee: toDecimalString(priceBreakdown.premiumFee),
        subtotal: toDecimalString(priceBreakdown.subtotal),
        promoCode: promoCode,
        discountPercent: toDecimalString(discountPercent),
        discountAmount: toDecimalString(discountAmount),
        discountReason: discountReason,
        moverBalanceOwed: toDecimalString(moverBalanceOwed),
        notifiedAt: new Date(),
        ...(utmSource && { utmSource }),
        ...(utmMedium && { utmMedium }),
        ...(utmCampaign && { utmCampaign }),
        ...(sourceChannel && { sourceChannel }),
        ...(landingPage && { landingPage }),
      } as any);
      
      // Increment promo usage count if promo applied
      if (promoCode && discountAmount > 0) {
        await storage.updateUser(user.id, { 
          hasUsedFirstMoveDiscount: true,
          promoUsesCount: (latestUser?.promoUsesCount || 0) + 1 
        });
      }
      
      logEvent.booking('created', {
        bookingId: booking.id,
        customerId: user.id,
        loadSize: bookingData.loadSize,
        distanceKm: distance,
        totalPrice: priceBreakdown.total,
        vehicleClass: priceBreakdown.vehicleClass,
        status: BOOKING_STATUSES.PENDING_PAYMENT,
      });

      await emitEvent('booking.created', 'booking', booking.id, {
        customerId: user.id,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        loadSize: bookingData.loadSize,
        distanceKm: distance,
        price: priceBreakdown.total,
        vehicleClass: priceBreakdown.vehicleClass,
        sourceChannel: (booking as any).sourceChannel ?? null,
        utmSource: (booking as any).utmSource ?? null,
        utmCampaign: (booking as any).utmCampaign ?? null,
      });

      await agentEventBus.emit(
        'booking.created',
        {
          bookingId: booking.id,
          customerId: user.id,
          moverId: booking.moverId,
        },
        'system',
      );

      // Link anonymous quote → booking (non-fatal). Client may send quoteId
      // directly, or we fall back to a quote already attached to the lead
      // matched by contact email/phone.
      try {
        const clientQuoteId = typeof req.body?.quoteId === 'string' ? req.body.quoteId : null;
        let quoteIdToConvert = clientQuoteId;
        if (!quoteIdToConvert && user.email) {
          const [linked] = await db
            .select({ quoteId: leads.quoteId })
            .from(leads)
            .where(and(eq(leads.contactEmail, user.email), isNotNull(leads.quoteId)))
            .orderBy(desc(leads.createdAt))
            .limit(1);
          quoteIdToConvert = linked?.quoteId ?? null;
        }
        if (quoteIdToConvert) {
          await db.update(quotes).set({
            status: 'booked',
            bookingId: booking.id,
            updatedAt: new Date(),
          }).where(eq(quotes.id, quoteIdToConvert));
        }
      } catch (err) {
        logger.warn({ err, bookingId: booking.id }, 'quote conversion failed (non-fatal)');
      }

      // Note: Confirmation email and mover matching happen AFTER payment succeeds (in Stripe webhook)
      // Do NOT send booking confirmation here - booking is still pending payment
      res.json({
        ...booking,
        message: "Booking created. Please complete payment to find movers.",
      });
    } catch (error) {
      logEvent.error('booking_creation', error, { userId: (req as any).user?.id });
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/bookings", async (req: Request, res: Response) => {
    try {
      // CRITICAL SECURITY: Require authentication
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      let userBookings;
      let adminPagination: { total: number; limit: number; offset: number } | null = null;

      // SECURITY: Force filtering based on user role - ignore query parameters
      if (user.role === "customer") {
        // Customers can ONLY see their own bookings
        userBookings = await storage.getBookingsByCustomer(user.id);
      } else if (user.role === "mover") {
        // Movers can see:
        // 1. Bookings assigned to them
        // 2. Available/unassigned bookings (pending status, moverId = null)
        const mover = await storage.getMoverByUserId(user.id);
        if (!mover) {
          return res.json([]); // Mover profile not set up yet
        }
        const moverId = mover.id;
        
        // Get assigned bookings
        const assignedBookings = await storage.getBookingsByMover(moverId);
        
        // Get all PAID bookings available for acceptance
        // Only show "confirmed" status (paid jobs) without a mover assigned
        // Do NOT show "pending" or "pending_payment" as those haven't paid yet
        const allBookingsResult = await storage.getAllBookings({ limit: 200 });
        const availableBookings = allBookingsResult.data.filter(
          (b: any) => b.status === "confirmed" && b.moverId === null && b.paymentStatus === "succeeded"
        );
        
        // Combine both sets (remove duplicates)
        const bookingMap = new Map();
        [...assignedBookings, ...availableBookings].forEach((b) => bookingMap.set(b.id, b));
        userBookings = Array.from(bookingMap.values());
      } else if (user.role === "admin") {
        // Admins can filter by customerId or moverId or see all
        const customerId = req.query.customerId as string | undefined;
        const moverId = req.query.moverId as string | undefined;
        
        if (customerId) {
          userBookings = await storage.getBookingsByCustomer(customerId);
        } else if (moverId) {
          userBookings = await storage.getBookingsByMover(moverId);
        } else {
          // Support pagination for admin view. When neither ?limit nor ?offset
          // is supplied, return every booking — the previous 50-row default
                    // silently truncated admin views (e.g. revenue metrics) with no
          // signal to the client. Callers that want pagination still get it
          // via explicit ?limit / ?offset.
          const explicitPagination = req.query.limit !== undefined || req.query.offset !== undefined;
          const limit = explicitPagination
            ? Math.min(parseInt(req.query.limit as string) || 50, 200)
            : Number.MAX_SAFE_INTEGER;
          const offset = parseInt(req.query.offset as string) || 0;
          const result = await storage.getAllBookings({ limit, offset });
          userBookings = result.data;
          if (explicitPagination) {
            adminPagination = { total: result.total, limit, offset };
          }
        }
      } else {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // For customers, get all their reviews and surveys to check which bookings have been reviewed/surveyed
      let reviewedBookingIds = new Set<string>();
      let surveyedBookingIds = new Set<string>();
      if (user.role === "customer") {
        const customerReviews = await db.select({ bookingId: reviews.bookingId })
          .from(reviews)
          .where(eq(reviews.customerId, user.id));
        reviewedBookingIds = new Set(customerReviews.map(r => r.bookingId));

        const customerSurveys = await db.select({ bookingId: feedbackSurveys.bookingId })
          .from(feedbackSurveys)
          .where(eq(feedbackSurveys.userId, user.id));
        surveyedBookingIds = new Set(customerSurveys.map(s => s.bookingId));
      }
      
      // For movers, look up distanceToPickup from job notifications
      let moverDistanceToPickupMap = new Map<string, string>();
      let currentMoverForProximity: any = null;
      if (user.role === "mover") {
        const mover = await storage.getMoverByUserId(user.id);
        if (mover) {
          currentMoverForProximity = mover;
          const notifications = await db.select({
            bookingId: jobNotifications.bookingId,
            distanceToPickup: jobNotifications.distanceToPickup,
          })
            .from(jobNotifications)
            .where(eq(jobNotifications.moverId, mover.id));
          notifications.forEach(n => {
            if (n.distanceToPickup) {
              moverDistanceToPickupMap.set(n.bookingId, n.distanceToPickup);
            }
          });
        }
      }

      // Enrich with customer and mover data
      const enrichedBookings = await Promise.all(
        userBookings.map(async (booking) => {
          const customer = await storage.getUser(booking.customerId);
          const mover = booking.moverId ? await storage.getMover(booking.moverId) : null;
          const moverUser = mover ? await storage.getUser(mover.userId) : null;
          
          // Determine distanceToPickup: prefer live GPS calculation, fallback to job notification
          let distanceToPickup: string | null = null;
          const moverLat = currentMoverForProximity?.latitude;
          const moverLng = currentMoverForProximity?.longitude;
          if (moverLat && moverLng && booking.pickupLatitude && booking.pickupLongitude) {
            const dist = calculateDistance(
              moverLat,
              moverLng,
              booking.pickupLatitude,
              booking.pickupLongitude
            );
            distanceToPickup = dist.toFixed(1);
          } else {
            distanceToPickup = moverDistanceToPickupMap.get(booking.id) || null;
          }

          // Fetch latest partner assignment for this booking (if any)
          const [latestAssignment] = await db.select().from(bookingAssignments)
            .where(eq(bookingAssignments.bookingId, booking.id))
            .orderBy(desc(bookingAssignments.assignedAt))
            .limit(1);
          let partnerAssignment = null;
          let driverAvgRating: number | null = null;
          if (latestAssignment) {
            let driverPhoto: string | null = null;
            let driverCompletedMoves: number | null = null;
            if (latestAssignment.teamMemberId) {
              const [tm] = await db.select({ driverPhoto: partnerTeamMembers.driverPhoto })
                .from(partnerTeamMembers).where(eq(partnerTeamMembers.id, latestAssignment.teamMemberId)).limit(1);
              driverPhoto = tm?.driverPhoto ?? null;
              const allAssigned = await db.select({ bookingId: bookingAssignments.bookingId })
                .from(bookingAssignments)
                .where(eq(bookingAssignments.teamMemberId, latestAssignment.teamMemberId));
              if (allAssigned.length > 0) {
                const assignedIds = allAssigned.map(a => a.bookingId);
                const completedRows = await db.select({ id: bookings.id })
                  .from(bookings)
                  .where(and(inArray(bookings.id, assignedIds), eq(bookings.enterpriseStatus, 'completed')));
                driverCompletedMoves = completedRows.length;
                const driverReviews = await db.select({ rating: reviews.rating })
                  .from(reviews)
                  .where(inArray(reviews.bookingId, assignedIds));
                if (driverReviews.length > 0) {
                  const sum = driverReviews.reduce((acc, r) => acc + r.rating, 0);
                  driverAvgRating = Math.round((sum / driverReviews.length) * 10) / 10;
                }
              } else {
                driverCompletedMoves = 0;
              }
            }
            partnerAssignment = {
              driverName: latestAssignment.driverName,
              driverPhone: latestAssignment.driverPhone,
              driverPhoto,
              teamName: latestAssignment.teamName,
              vehicleType: latestAssignment.vehicleType,
              vehiclePlate: latestAssignment.vehiclePlate,
              assignedAt: latestAssignment.assignedAt,
              completedMoves: driverCompletedMoves,
            };
          }

          // Enrich with enterprise partner name if routed
          let enterprisePartnerName: string | null = null;
          if (booking.enterprisePartnerId) {
            const [ep] = await db.select({ name: partners.name })
              .from(partners)
              .where(eq(partners.id, booking.enterprisePartnerId))
              .limit(1);
            enterprisePartnerName = ep?.name ?? null;
          }

          return {
            ...booking,
            distanceToPickup,
            hasReview: reviewedBookingIds.has(booking.id),
            hasSurvey: surveyedBookingIds.has(booking.id),
            enterprisePartnerName,
            partnerAvgRating: driverAvgRating,
            customer: customer ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone } : null,
            mover: mover && moverUser ? {
              id: mover.id,
              userId: moverUser.id,
              name: moverUser.name,
              phone: moverUser.phone,
              moverImage: mover.moverImage,
              vehicleType: mover.vehicleType,
              vehicleColor: mover.vehicleColor,
              vehicleCapacity: mover.vehicleCapacity,
              licensePlate: mover.licensePlate,
              rating: mover.rating,
              completedTrips: mover.completedTrips,
              isVerified: mover.isVerified
            } : null,
            partnerAssignment,
          };
        })
      );
      
      if (adminPagination) {
        res.json({
          data: enrichedBookings,
          total: adminPagination.total,
          limit: adminPagination.limit,
          offset: adminPagination.offset,
          hasMore: adminPagination.offset + enrichedBookings.length < adminPagination.total,
        });
      } else {
        res.json(enrichedBookings);
      }
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/bookings/:id", async (req: Request, res: Response) => {
    try {
      const booking = await storage.getBooking(req.params.id);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const customer = await storage.getUser(booking.customerId);
      const mover = booking.moverId ? await storage.getMover(booking.moverId) : null;
      const moverUser = mover ? await storage.getUser(mover.userId) : null;
      
      // Check if this booking has a review
      const existingReview = await db.select({ id: reviews.id })
        .from(reviews)
        .where(eq(reviews.bookingId, booking.id))
        .limit(1);
      const hasReview = existingReview.length > 0;
      
      // Fetch latest partner assignment for this booking (if any)
      const [latestAssignment] = await db.select().from(bookingAssignments)
        .where(eq(bookingAssignments.bookingId, booking.id))
        .orderBy(desc(bookingAssignments.assignedAt))
        .limit(1);
      let partnerAssignment = null;
      if (latestAssignment) {
        let driverPhoto: string | null = null;
        let driverCompletedMoves: number | null = null;
        if (latestAssignment.teamMemberId) {
          const [tm] = await db.select({ driverPhoto: partnerTeamMembers.driverPhoto })
            .from(partnerTeamMembers).where(eq(partnerTeamMembers.id, latestAssignment.teamMemberId)).limit(1);
          driverPhoto = tm?.driverPhoto ?? null;
          // Count completed bookings this team member has been assigned to
          const allAssigned = await db.select({ bookingId: bookingAssignments.bookingId })
            .from(bookingAssignments)
            .where(eq(bookingAssignments.teamMemberId, latestAssignment.teamMemberId));
          if (allAssigned.length > 0) {
            const assignedIds = allAssigned.map(a => a.bookingId);
            const completed = await db.select({ id: bookings.id })
              .from(bookings)
              .where(and(inArray(bookings.id, assignedIds), eq(bookings.enterpriseStatus, 'completed')));
            driverCompletedMoves = completed.length;
          } else {
            driverCompletedMoves = 0;
          }
        }
        partnerAssignment = {
          driverName: latestAssignment.driverName,
          driverPhone: latestAssignment.driverPhone,
          driverPhoto,
          teamName: latestAssignment.teamName,
          vehicleType: latestAssignment.vehicleType,
          vehiclePlate: latestAssignment.vehiclePlate,
          assignedAt: latestAssignment.assignedAt,
          completedMoves: driverCompletedMoves,
        };
      }

      // Compute partner avg rating if routed to an enterprise partner
      let partnerAvgRating: number | null = null;
      if (booking.enterprisePartnerId) {
        const partnerBookings = await db.select({ id: bookings.id })
          .from(bookings)
          .where(eq(bookings.enterprisePartnerId, booking.enterprisePartnerId!));
        if (partnerBookings.length > 0) {
          const partnerBookingIds = partnerBookings.map(b => b.id);
          const partnerReviews = await db.select({ rating: reviews.rating })
            .from(reviews)
            .where(inArray(reviews.bookingId, partnerBookingIds));
          if (partnerReviews.length > 0) {
            const sum = partnerReviews.reduce((acc, r) => acc + r.rating, 0);
            partnerAvgRating = Math.round((sum / partnerReviews.length) * 10) / 10;
          }
        }
      }

      res.json({
        ...booking,
        hasReview,
        partnerAvgRating,
        customer: customer ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone } : null,
        mover: mover && moverUser ? {
          id: mover.id,
          name: moverUser.name,
          phone: moverUser.phone,
          moverImage: mover.moverImage,
          vehicleType: mover.vehicleType,
          vehicleColor: mover.vehicleColor,
          vehicleCapacity: mover.vehicleCapacity,
          licensePlate: mover.licensePlate,
          rating: mover.rating,
          completedTrips: mover.completedTrips,
          isVerified: mover.isVerified
        } : null,
        partnerAssignment,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Customer-facing status timeline for partner-routed bookings
  app.get("/api/bookings/:id/status-events", async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.customerId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const events = await db.select({
        id: bookingStatusEvents.id,
        toStatus: bookingStatusEvents.toStatus,
        fromStatus: bookingStatusEvents.fromStatus,
        notes: bookingStatusEvents.notes,
        customerVisible: bookingStatusEvents.customerVisible,
        createdAt: bookingStatusEvents.createdAt,
      })
        .from(bookingStatusEvents)
        .where(and(
          eq(bookingStatusEvents.bookingId, booking.id),
          eq(bookingStatusEvents.customerVisible, true)
        ))
        .orderBy(bookingStatusEvents.createdAt);
      res.json(events);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mover accepts a job (with race condition protection)
  app.post("/api/bookings/:id/accept", async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.id;
      const { moverId } = validateBody(z.object({
        moverId: z.string(),
      }), req.body);
      
      // Get the booking
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // CRITICAL: Only allow accepting PAID bookings
      if (booking.paymentStatus !== 'succeeded') {
        return res.status(400).json({ error: "Cannot accept booking - payment not completed" });
      }
      
      // Fast-path early rejection (non-authoritative — a concurrent accept
      // could still race in between this check and the atomic UPDATE below).
      if (booking.moverId) {
        return res.status(409).json({
          error: "Job already accepted by another mover",
          acceptedBy: booking.moverId
        });
      }

      // SINGLE ACTIVE JOB ENFORCEMENT: Check if mover already has an active job
      const moverBookings = await storage.getBookingsByMover(moverId);
      const activeJobStatuses = ['confirmed', 'en_route_to_pickup', 'loading', 'en_route_to_dropoff', 'unloading'];
      const existingActiveJob = moverBookings.find(b =>
        activeJobStatuses.includes(b.status) && b.paymentStatus === 'succeeded'
      );

      if (existingActiveJob) {
        return res.status(409).json({
          error: "You already have an active job. Complete your current job before accepting another.",
          activeBookingId: existingActiveJob.id
        });
      }

      // Check if mover was actually notified
      const notifications = await db
        .select()
        .from(jobNotifications)
        .where(and(
          eq(jobNotifications.bookingId, bookingId),
          eq(jobNotifications.moverId, moverId)
        ));

      const moverNotification = notifications[0];
      if (!moverNotification) {
        return res.status(403).json({ error: "You were not notified about this job" });
      }

      // Check if notification expired
      if (new Date() > moverNotification.expiresAt) {
        return res.status(410).json({ error: "Job notification has expired" });
      }

      // Check if mover already declined
      if (moverNotification.status === 'declined') {
        return res.status(400).json({ error: "You already declined this job" });
      }

      // ATOMIC CLAIM: conditional UPDATE prevents the race window that the
      // early check above cannot close on its own. Only the first mover whose
      // UPDATE hits an unassigned booking wins; concurrent accepts fall
      // through to the 409 below.
      const sla = computeBookingSla(booking);
      const [claimed] = await db
        .update(bookings)
        .set({
          moverId,
          status: 'confirmed',
          expectedCompletionAt: sla.expectedCompletionAt,
          slaDeadlineAt: sla.slaDeadlineAt,
          updatedAt: new Date(),
        })
        .where(and(
          eq(bookings.id, bookingId),
          isNull(bookings.moverId),
        ))
        .returning();

      if (!claimed) {
        // Someone else won the race between our SELECT and our UPDATE.
        const [current] = await db
          .select({ moverId: bookings.moverId })
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);
        return res.status(409).json({
          error: "Job already accepted by another mover",
          acceptedBy: current?.moverId ?? null,
        });
      }

      const updatedBooking = claimed;

      await emitEvent('booking.assigned', 'booking', bookingId, {
        moverId,
        customerId: booking.customerId,
        assignedBy: 'mover_accept',
        expectedCompletionAt: sla.expectedCompletionAt.toISOString(),
        slaDeadlineAt: sla.slaDeadlineAt.toISOString(),
        estimatedMinutes: sla.estimatedMinutes,
      });

      // Create mover performance tracking record
      try {
        await db.insert(moverPerformanceTable).values({
          moverId,
          bookingId,
          acceptedAt: new Date(),
          distanceKm: booking.distance || '0',
        });
        console.log(`[Performance] Created tracking record for booking ${bookingId}, mover ${moverId}`);
      } catch (perfErr) {
        console.error('[Performance] Failed to create tracking record:', perfErr);
      }
      
      // 1b. CRITICAL: Update Stripe PaymentIntent metadata with mover details
      // This ensures Stripe can match payments to movers for settlements
      if (booking.stripePaymentIntentId) {
        try {
          const moverStripeAccountResult = await db.select()
            .from(moverStripeAccounts)
            .where(eq(moverStripeAccounts.moverId, moverId))
            .limit(1);
          
          const moverAccount = moverStripeAccountResult[0];
          const isFullyOnboarded = moverAccount?.chargesEnabled && moverAccount?.payoutsEnabled;
          
          // Retrieve existing metadata to merge (Stripe replaces entire metadata object)
          const existingPI = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
          const mergedMetadata = {
            ...existingPI.metadata,
            moverId: moverId,
            moverStripeOnboarded: isFullyOnboarded ? 'true' : 'false',
            moverStripeAccountId: moverAccount?.stripeAccountId || '',
            ...(isFullyOnboarded ? { paymentType: 'platform_charge_with_transfer' } : {}),
          };
          
          await stripe.paymentIntents.update(booking.stripePaymentIntentId, {
            metadata: mergedMetadata,
          });
          
          logEvent.payment('payment_metadata_updated_on_accept', {
            bookingId,
            moverId,
            paymentIntentId: booking.stripePaymentIntentId,
            moverStripeAccountId: moverAccount?.stripeAccountId || 'none',
            moverOnboarded: isFullyOnboarded,
          });
        } catch (stripeErr) {
          console.error('[Accept] Failed to update Stripe metadata:', stripeErr);
        }
      }
      
      // 2. Mark this mover's notification as accepted
      await db
        .update(jobNotifications)
        .set({ 
          status: 'accepted',
          respondedAt: new Date(),
        })
        .where(eq(jobNotifications.id, moverNotification.id));
      
      // 3. Expire all other pending notifications for this booking
      await db
        .update(jobNotifications)
        .set({ 
          status: 'expired',
          respondedAt: new Date(),
        })
        .where(and(
          eq(jobNotifications.bookingId, bookingId),
          eq(jobNotifications.status, 'pending')
        ));
      
      // 4. Send email + SMS notifications with Uber-style mover details
      const customer = await storage.getUser(updatedBooking.customerId);
      const mover = await storage.getMover(moverId);
      if (customer && mover) {
        const moverUser = await storage.getUser(mover.userId);
        if (moverUser) {
          await notificationService.sendMoverAssigned(customer, moverUser, updatedBooking, mover);
          
          // Create in-app notifications (non-blocking)
          try {
            await storage.createNotification({
              userId: customer.id,
              type: 'mover_assigned',
              title: 'Mover Assigned',
              message: `Great news! ${moverUser.name} has been assigned to your move.`,
              bookingId: updatedBooking.id,
              actionUrl: '/my-bookings',
              isRead: false,
            });
            
            await storage.createNotification({
              userId: moverUser.id,
              type: 'job_opportunity',
              title: 'Job Accepted',
              message: `You've successfully accepted a new job!`,
              bookingId: updatedBooking.id,
              actionUrl: '/mover-dashboard',
              isRead: false,
            });
          } catch (notifErr) {
            console.error('Job acceptance notification failed:', notifErr);
          }
        }
      }
      
      res.json({
        ...updatedBooking,
        message: "Job accepted successfully"
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });
  
  // Mover declines a job
  app.post("/api/bookings/:id/decline", async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.id;
      const { moverId } = validateBody(z.object({
        moverId: z.string(),
      }), req.body);
      
      // Find the notification
      const notifications = await db
        .select()
        .from(jobNotifications)
        .where(and(
          eq(jobNotifications.bookingId, bookingId),
          eq(jobNotifications.moverId, moverId)
        ));
      
      const moverNotification = notifications[0];
      if (!moverNotification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      // Update notification status to declined
      await db
        .update(jobNotifications)
        .set({ 
          status: 'declined',
          respondedAt: new Date(),
        })
        .where(eq(jobNotifications.id, moverNotification.id));
      
      // Check if this was a pre-selected mover declining - trigger proximity matching fallback
      const booking = await storage.getBooking(bookingId);
      if (booking && booking.preSelectedMoverId === moverId) {
        logEvent.booking('preselected_mover_declined', {
          bookingId,
          moverId,
          triggeringProximityMatching: true,
        });
        
        // Clear the preSelectedMoverId since they declined
        await storage.updateBooking(bookingId, { preSelectedMoverId: null });
        
        // Trigger proximity matching to find other available movers (AC-6)
        try {
          const result = await dispatchJobToMovers(booking, { excludeMoverId: moverId });

          if (result.dispatched > 0) {
            logEvent.booking('proximity_matching_fallback_success', {
              bookingId,
              moversNotified: result.dispatched,
              requiredVehicle: result.requiredVehicle,
            });

            // Notify customer that we're finding other movers
            const customer = await storage.getUser(booking.customerId);
            if (customer) {
              await storage.createNotification({
                userId: customer.id,
                type: 'booking_update',
                title: 'Finding Other Movers',
                message: "Your selected mover is unavailable. We're finding other great movers nearby.",
                bookingId: booking.id,
                actionUrl: '/my-bookings',
                isRead: false,
              });
            }
          } else {
            logEvent.booking('proximity_matching_fallback_no_movers', { bookingId });
          }
        } catch (matchingError) {
          logEvent.error('proximity_matching_fallback_failed', matchingError instanceof Error ? matchingError : new Error('Unknown error'), { bookingId });
        }
      }
      
      res.json({ message: "Job declined successfully" });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Mover cancels an accepted (confirmed) booking and triggers re-dispatch
  app.post("/api/bookings/:id/mover-cancel", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const bookingId = req.params.id;
      const { reason } = req.body as { reason?: string };

      const booking = await storage.getBooking(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      // Only the assigned mover can do this
      const mover = await storage.getMoverByUserId(user.id);
      if (!mover || booking.moverId !== mover.id) {
        return res.status(403).json({ error: "You are not assigned to this booking" });
      }

      // Only allowed before the trip has started (confirmed status only)
      if (booking.status !== "confirmed") {
        return res.status(400).json({ error: "You can only cancel before the trip has started" });
      }

      logEvent.booking('mover_cancelled_confirmed_job', { bookingId, moverId: mover.id, reason });

      // Detach the mover and reset to pending so it can be re-dispatched
      await storage.updateBooking(bookingId, {
        moverId: null,
        status: "pending",
        preSelectedMoverId: null,
      });

      // Mark any active job notifications for this mover+booking as declined
      await db
        .update(jobNotifications)
        .set({ status: 'declined', respondedAt: new Date() })
        .where(
          and(
            eq(jobNotifications.bookingId, bookingId),
            eq(jobNotifications.moverId, mover.id),
          )
        );

      // Notify the customer
      const customer = await storage.getUser(booking.customerId);
      if (customer) {
        await storage.createNotification({
          userId: customer.id,
          type: 'booking_update',
          title: 'Your Mover Cancelled',
          message: "Your mover had to cancel. We're finding another great mover nearby — hang tight!",
          bookingId: booking.id,
          actionUrl: '/my-bookings',
          isRead: false,
        });

        // Email the customer
        try {
          await notificationService.sendEmail({
            to: customer.email,
            subject: "Update on your LervIT booking",
            body: `<p>Hi ${customer.name},</p><p>Unfortunately, your mover had to cancel your upcoming booking. Don't worry — we're actively searching for another available mover in your area.</p><p>You'll receive a notification as soon as a new mover accepts your job. If you have any concerns, please contact us at <a href="mailto:support@lervit.com">support@lervit.com</a>.</p><p>The LervIT Team</p>`,
            type: 'booking_confirmation',
          });
        } catch (emailErr) {
          logEvent.error('mover_cancel_customer_email_failed', emailErr instanceof Error ? emailErr : new Error('email error'), { bookingId });
        }
      }

      // Re-dispatch to other nearby movers (exclude the cancelling mover)
      const refreshedBooking = await storage.getBooking(bookingId);
      if (refreshedBooking) {
        try {
          const result = await dispatchJobToMovers(refreshedBooking, { excludeMoverId: mover.id });
          logEvent.booking('mover_cancel_redispatch', { bookingId, moversNotified: result.dispatched });
        } catch (dispatchErr) {
          logEvent.error('mover_cancel_redispatch_failed', dispatchErr instanceof Error ? dispatchErr : new Error('dispatch error'), { bookingId });
        }
      }

      res.json({ message: "Booking cancelled and job re-dispatched to other movers" });
    } catch (error) {
      logEvent.error('mover_cancel_job_error', error instanceof Error ? error : new Error('Unknown error'), { bookingId: req.params.id });
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to cancel booking" });
    }
  });

  // Delete a failed/cancelled booking (customer only)
  app.delete("/api/bookings/:id", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const bookingId = req.params.id;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Only the customer who created the booking can delete it
      if (booking.customerId !== user.id) {
        return res.status(403).json({ error: "You are not authorized to delete this booking" });
      }
      
      // Only allow deleting bookings with failed payment or cancelled status
      const deletableStatuses = ["payment_failed", "cancelled"];
      const hasFailedPayment = booking.paymentStatus === "failed";
      
      if (!deletableStatuses.includes(booking.status) && !hasFailedPayment) {
        return res.status(400).json({ 
          error: "Only failed or cancelled bookings can be deleted" 
        });
      }
      
      // SAFETY: Never delete bookings with successful payments
      if (booking.paymentStatus === "succeeded") {
        return res.status(400).json({ 
          error: "Cannot delete a booking with a successful payment. Please contact support." 
        });
      }
      
      logEvent.booking('customer_delete_booking', {
        bookingId,
        customerId: user.id,
        status: booking.status,
        paymentStatus: booking.paymentStatus
      });

      await emitEvent('booking.cancelled', 'booking', bookingId, {
        customerId: user.id,
        previousStatus: booking.status,
        paymentStatus: booking.paymentStatus,
        moverId: booking.moverId ?? null,
        reason: 'customer_deleted',
      });
      
      // Delete related records first (foreign key constraints)
      await db.delete(jobNotifications).where(eq(jobNotifications.bookingId, bookingId));
      await db.delete(messages).where(eq(messages.bookingId, bookingId));
      await db.delete(reviews).where(eq(reviews.bookingId, bookingId));
      await db.delete(identifiedItems).where(eq(identifiedItems.bookingId, bookingId));
      await db.delete(aiRuns).where(eq(aiRuns.bookingId, bookingId));
      
      // Delete the booking
      await db.delete(bookings).where(eq(bookings.id, bookingId));
      
      res.json({ message: "Booking deleted successfully" });
    } catch (error) {
      logEvent.error('delete_booking_failed', error instanceof Error ? error : new Error('Unknown error'), { 
        bookingId: req.params.id 
      });
      res.status(500).json({ error: "Failed to delete booking" });
    }
  });

  app.patch("/api/bookings/:id", async (req: Request, res: Response) => {
    try {
      // Validate allowed update fields - moverId allowed for direct job acceptance
      const updateSchema = z.object({
        moverId: z.string().optional(),
        status: z.string().optional(),
        preferredDate: z.union([z.string(), z.date()]).optional(),
        distance: z.string().optional(),
        price: z.string().optional(),
        paymentStatus: z.string().optional(),
        stripePaymentIntentId: z.string().optional(),
        currentLatitude: z.number().optional(),
        currentLongitude: z.number().optional(),
        locationUpdatedAt: z.date().optional(),
      });
      let updates = validateBody(updateSchema, req.body);
      
      // If moverId is being set (direct job acceptance), verify authorization
      if (updates.moverId) {
        if (!requireUser(req, res)) return;
        const user = (req as any).user;
        
        // Verify the mover belongs to this user
        const mover = await storage.getMover(updates.moverId);
        if (!mover || mover.userId !== user.id) {
          return res.status(403).json({ error: "You are not authorized to accept this job" });
        }
        
        // Check if job is already assigned
        const booking = await storage.getBooking(req.params.id);
        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }
        if (booking.moverId) {
          return res.status(409).json({ error: "This job has already been assigned to another mover" });
        }
        
        // CRITICAL: Update Stripe PaymentIntent metadata with mover details
        if (booking.stripePaymentIntentId) {
          try {
            const moverStripeAccountResult = await db.select()
              .from(moverStripeAccounts)
              .where(eq(moverStripeAccounts.moverId, updates.moverId))
              .limit(1);
            
            const moverAccount = moverStripeAccountResult[0];
            const isFullyOnboarded = moverAccount?.chargesEnabled && moverAccount?.payoutsEnabled;
            
            const existingPI = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
            const mergedMetadata = {
              ...existingPI.metadata,
              moverId: updates.moverId,
              moverStripeOnboarded: isFullyOnboarded ? 'true' : 'false',
              moverStripeAccountId: moverAccount?.stripeAccountId || '',
              ...(isFullyOnboarded ? { paymentType: 'platform_charge_with_transfer' } : {}),
            };
            
            await stripe.paymentIntents.update(booking.stripePaymentIntentId, {
              metadata: mergedMetadata,
            });
            
            console.log(`[PATCH Accept] Updated Stripe metadata for PI ${booking.stripePaymentIntentId} with moverId ${updates.moverId}`);
          } catch (stripeErr) {
            console.error('[PATCH Accept] Failed to update Stripe metadata:', stripeErr);
          }
        }

        // Mark the mover's job notification as accepted and expire all other pending ones.
        // This ensures the ops-metrics chart correctly counts accepted proximity/direct notifications
        // regardless of whether acceptance came through PATCH or POST /accept.
        try {
          const moverNotifs = await db
            .select()
            .from(jobNotifications)
            .where(and(
              eq(jobNotifications.bookingId, req.params.id),
              eq(jobNotifications.moverId, updates.moverId!)
            ))
            .limit(1);

          if (moverNotifs.length > 0) {
            // Mark this mover's notification as accepted
            await db
              .update(jobNotifications)
              .set({ status: 'accepted', respondedAt: new Date() })
              .where(eq(jobNotifications.id, moverNotifs[0].id));

            // Expire all other pending notifications for this booking
            await db
              .update(jobNotifications)
              .set({ status: 'expired', respondedAt: new Date() })
              .where(and(
                eq(jobNotifications.bookingId, req.params.id),
                eq(jobNotifications.status, 'pending')
              ));

            console.log(`[PATCH Accept] Marked notification ${moverNotifs[0].id} as accepted for booking ${req.params.id}`);
          }
        } catch (notifErr) {
          console.error('[PATCH Accept] Failed to update notification status:', notifErr);
        }
      }
      
      // Convert preferredDate to Date if it's a string
      if (updates.preferredDate && typeof updates.preferredDate === 'string') {
        updates = { ...updates, preferredDate: new Date(updates.preferredDate) };
      }
      
      // SECURITY: Validate status transitions for the new granular booking flow
      // Statuses: pending → confirmed → en_route_to_pickup → loading → en_route_to_dropoff → unloading → completed
      if (updates.status) {
        if (!requireUser(req, res)) return;
        const user = (req as any).user;
        
        const booking = await storage.getBooking(req.params.id);
        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }
        
        // Handle backward compatibility: treat old "in_transit" as "en_route_to_pickup"
        const newStatus = updates.status === "in_transit" ? BOOKING_STATUSES.EN_ROUTE_TO_PICKUP : updates.status;
        updates.status = newStatus;
        
        // Skip validation for confirmed status (handled by job acceptance flow)
        if (newStatus === BOOKING_STATUSES.CANCELLED) {
          // --- Customer cancellation: ownership, timing, refund, mover notification ---

          // 1. Only the booking's customer (or an admin) can cancel
          if (user.role !== 'admin' && booking.customerId !== user.id) {
            return res.status(403).json({ error: "You are not authorized to cancel this booking" });
          }

          // 2. Block cancellation once the trip is physically in progress
          const inProgressStatuses = [
            BOOKING_STATUSES.EN_ROUTE_TO_PICKUP,
            BOOKING_STATUSES.LOADING,
            BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF,
            BOOKING_STATUSES.UNLOADING,
          ];
          if (inProgressStatuses.includes(booking.status as any)) {
            return res.status(400).json({ error: "Cannot cancel a booking that is already in progress. Please contact support." });
          }

          // 3. Auto-issue Stripe refund if payment was captured
          if (booking.stripePaymentIntentId && booking.paymentStatus === 'succeeded') {
            try {
              await stripe.refunds.create({
                payment_intent: booking.stripePaymentIntentId,
                reason: 'requested_by_customer',
              });
              (updates as any).paymentStatus = 'refunded';
              logEvent.payment('auto_refund_on_customer_cancel', { bookingId: booking.id, intentId: booking.stripePaymentIntentId });
            } catch (refundErr) {
              logEvent.error('auto_refund_failed', refundErr instanceof Error ? refundErr : new Error('refund error'), { bookingId: booking.id });
              return res.status(500).json({ error: "Failed to process your refund. Please contact support." });
            }
          } else if (booking.stripePaymentIntentId && booking.paymentStatus === 'pending') {
            // Payment authorized but not yet captured — void the intent
            try {
              await stripe.paymentIntents.cancel(booking.stripePaymentIntentId);
              (updates as any).paymentStatus = 'cancelled';
            } catch (_) {
              // Already cancelled or in non-cancellable state — safe to ignore
            }
          }

          // 4. Notify the assigned mover (if any) that the customer cancelled
          if (booking.moverId) {
            try {
              const cancelledMover = await storage.getMover(booking.moverId);
              if (cancelledMover) {
                const cancelledMoverUser = await storage.getUser(cancelledMover.userId);
                await storage.createNotification({
                  userId: cancelledMover.userId,
                  type: 'booking_cancelled',
                  title: 'Booking Cancelled by Customer',
                  message: 'A customer has cancelled their booking. This job has been removed from your queue.',
                  bookingId: booking.id,
                });
                if (cancelledMoverUser?.email) {
                  await notificationService.sendEmail({
                    to: cancelledMoverUser.email,
                    subject: 'A booking has been cancelled',
                    body: `<p>Hi ${cancelledMoverUser.name},</p><p>A customer has cancelled their upcoming booking. This job has been removed from your active jobs.</p><p>If you have any questions, contact us at <a href="mailto:support@lervit.com">support@lervit.com</a>.</p><p>The LervIT Team</p>`,
                    type: 'status_update',
                  }).catch((emailErr: unknown) => {
                    logEvent.error('mover_cancel_notify_email_failed', emailErr instanceof Error ? emailErr : new Error('email error'), { bookingId: booking.id });
                  });
                }
              }
            } catch (notifyErr) {
              logEvent.error('mover_cancel_notify_failed', notifyErr instanceof Error ? notifyErr : new Error('notify error'), { bookingId: booking.id });
            }
          }
        } else if (newStatus !== BOOKING_STATUSES.CONFIRMED) {
          // Validate mover authorization for active status changes
          if (!booking.moverId) {
            console.log(`[Status Update] DENIED - No mover assigned. BookingId: ${booking.id}, UserId: ${user.id}, NewStatus: ${newStatus}`);
            return res.status(403).json({ error: "No mover assigned to this booking" });
          }
          
          const mover = await storage.getMover(booking.moverId);
          console.log(`[Status Update] Auth check - BookingId: ${booking.id}, UserId: ${user.id}, BookingMoverId: ${booking.moverId}, MoverUserId: ${mover?.userId}, Match: ${mover?.userId === user.id}`);
          if (!mover || mover.userId !== user.id) {
            console.log(`[Status Update] DENIED - Mover mismatch. BookingId: ${booking.id}, UserId: ${user.id}, MoverUserId: ${mover?.userId}`);
            return res.status(403).json({ error: "You are not authorized to update this booking status" });
          }
          
          // Validate status transition (backward compat: treat "in_transit" as "en_route_to_pickup")
          const currentStatus = booking.status === "in_transit" ? BOOKING_STATUSES.EN_ROUTE_TO_PICKUP : booking.status;
          
          if (!isValidStatusTransition(currentStatus, newStatus)) {
            const validNext = getNextValidStatuses(currentStatus);
            const validLabels = validNext.map(s => BOOKING_STATUS_INFO[s]?.label || s).join(", ");
            return res.status(400).json({ 
              error: `Invalid status transition from "${currentStatus}" to "${newStatus}". Valid next statuses: ${validLabels}` 
            });
          }
        }
      }
      
      const booking = await storage.updateBooking(req.params.id, updates as any);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Track performance timestamps on status transitions
      if (updates.status && booking.moverId) {
        try {
          const statusToFields: Record<string, Record<string, Date>> = {
            [BOOKING_STATUSES.LOADING]: { arrivedAtPickupAt: new Date(), loadingStartedAt: new Date() },
            [BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF]: { loadingCompletedAt: new Date() },
            [BOOKING_STATUSES.UNLOADING]: { arrivedAtDropoffAt: new Date() },
          };
          
          const fieldsToUpdate = statusToFields[updates.status];
          if (fieldsToUpdate) {
            const existingPerf = await db.select().from(moverPerformanceTable)
              .where(and(
                eq(moverPerformanceTable.bookingId, req.params.id),
                eq(moverPerformanceTable.moverId, booking.moverId)
              ))
              .limit(1);
            
            if (existingPerf.length > 0) {
              await db.update(moverPerformanceTable)
                .set(fieldsToUpdate)
                .where(eq(moverPerformanceTable.id, existingPerf[0].id));
              console.log(`[Performance] Updated ${Object.keys(fieldsToUpdate).join(', ')} for booking ${req.params.id}`);
            } else {
              await db.insert(moverPerformanceTable).values({
                moverId: booking.moverId,
                bookingId: req.params.id,
                acceptedAt: booking.acceptedAt || new Date(),
                ...fieldsToUpdate,
                distanceKm: booking.distance || '0',
              });
              console.log(`[Performance] Created tracking record with ${Object.keys(fieldsToUpdate).join(', ')} for booking ${req.params.id}`);
            }
          }
        } catch (perfErr) {
          console.error('[Performance] Status tracking error:', perfErr);
        }
      }
      
      // Push real-time status update to customer (AC: Task 2)
      if (updates.status && booking.customerId) {
        try {
          customerWebSocket.notifyCustomer(booking.customerId, {
            type: 'booking_status_update',
            bookingId: booking.id,
            status: booking.status,
            updatedAt: new Date().toISOString(),
          });
        } catch (_) {}
      }

      res.json(booking);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Admin-only: Get bookings with promo balance owed to movers
  app.get("/api/admin/promo-balances", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const allBookingsResult = await storage.getAllBookings({ limit: 1000 });
      const promoBookings = allBookingsResult.data.filter(
        (b: any) => b.promoCode && parseFloat(b.moverBalanceOwed || '0') > 0
          && b.moverId
          && b.paymentStatus === 'succeeded'
      );
      
      const results = await Promise.all(promoBookings.map(async (b: any) => {
        const customer = b.customerId ? await storage.getUser(b.customerId) : null;
        const moverProfile = b.moverId ? await storage.getMover(b.moverId) : null;
        const moverUser = moverProfile ? await storage.getUser(moverProfile.userId) : null;
        return {
          id: b.id,
          promoCode: b.promoCode,
          discountPercent: b.discountPercent,
          discountAmount: b.discountAmount,
          moverBalanceOwed: b.moverBalanceOwed,
          moverBalancePaid: b.moverBalancePaid,
          price: b.price,
          subtotal: b.subtotal,
          status: b.status,
          moverId: b.moverId,
          moverName: moverUser?.name || 'Unassigned',
          customerName: customer?.name || 'Unknown',
          createdAt: b.createdAt,
        };
      }));
      
      res.json(results);
    } catch (error: any) {
      console.error("Admin promo balances error:", error);
      res.status(500).json({ error: "Failed to fetch promo balances" });
    }
  });

  // Admin-only: Mark mover balance as paid for a promo booking
  app.post("/api/admin/promo-balances/:bookingId/mark-paid", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { bookingId } = req.params;
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      await storage.updateBooking(bookingId, { moverBalancePaid: true } as any);
      res.json({ success: true, message: "Mover balance marked as paid" });
    } catch (error: any) {
      console.error("Mark balance paid error:", error);
      res.status(500).json({ error: "Failed to mark balance as paid" });
    }
  });

  // Admin-only endpoint to force-update booking status (for refunds/corrections)
  app.patch("/api/admin/bookings/:id/status", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const statusSchema = z.object({
        status: z.string().optional(),
        paymentStatus: z.string().optional(),
      });
      
      const updates = validateBody(statusSchema, req.body);
      
      if (!updates.status && !updates.paymentStatus) {
        return res.status(400).json({ error: "Provide status and/or paymentStatus" });
      }
      
      const bookingId = req.params.id;
      const existingBooking = await storage.getBooking(bookingId);
      if (!existingBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const booking = await storage.updateBooking(bookingId, updates);
      
      console.log(`[Admin] Force-updated booking ${bookingId}: status=${updates.status || 'unchanged'}, paymentStatus=${updates.paymentStatus || 'unchanged'}`);
      
      res.json({
        success: true,
        booking,
        previousStatus: existingBooking.status,
        previousPaymentStatus: existingBooking.paymentStatus
      });
    } catch (error) {
      console.error('[Admin] Force-update booking error:', error);
      res.status(500).json({ error: "Failed to update booking" });
    }
  });

  // Admin-only endpoint to update booking addresses
  app.patch("/api/admin/bookings/:id/addresses", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // Only admins can update addresses
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const addressSchema = z.object({
        pickupAddress: z.string().min(1, "Pickup address is required").optional(),
        dropoffAddress: z.string().min(1, "Dropoff address is required").optional(),
      });
      
      const updates = validateBody(addressSchema, req.body);
      
      if (!updates.pickupAddress && !updates.dropoffAddress) {
        return res.status(400).json({ error: "At least one address must be provided" });
      }
      
      const bookingId = req.params.id;
      const existingBooking = await storage.getBooking(bookingId);
      if (!existingBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Import geocoding functions
      const { geocodeAddress, getDrivingDistance } = await import("./google-maps");
      
      // Build update object with geocoding for changed addresses
      const updateData: any = {};
      
      if (updates.pickupAddress) {
        updateData.pickupAddress = updates.pickupAddress;
        // Re-geocode pickup address
        const pickupGeo = await geocodeAddress(updates.pickupAddress);
        if (pickupGeo.success) {
          updateData.pickupLatitude = pickupGeo.coordinates.lat;
          updateData.pickupLongitude = pickupGeo.coordinates.lng;
        }
      }
      
      if (updates.dropoffAddress) {
        updateData.dropoffAddress = updates.dropoffAddress;
        // Re-geocode dropoff address
        const dropoffGeo = await geocodeAddress(updates.dropoffAddress);
        if (dropoffGeo.success) {
          updateData.dropoffLatitude = dropoffGeo.coordinates.lat;
          updateData.dropoffLongitude = dropoffGeo.coordinates.lng;
        }
      }
      
      // Recalculate distance if both addresses are available
      const finalPickup = updates.pickupAddress || existingBooking.pickupAddress;
      const finalDropoff = updates.dropoffAddress || existingBooking.dropoffAddress;
      
      const pickupGeo = await geocodeAddress(finalPickup);
      const dropoffGeo = await geocodeAddress(finalDropoff);
      
      if (pickupGeo.success && dropoffGeo.success) {
        const distanceResult = await getDrivingDistance(pickupGeo.coordinates, dropoffGeo.coordinates);
        updateData.distance = distanceResult.distanceKm.toFixed(2);
      }
      
      const updatedBooking = await storage.updateBooking(bookingId, updateData);
      
      console.log(`[Admin] Booking ${bookingId} addresses updated by admin ${user.email}`);
      
      res.json(updatedBooking);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Customer endpoint to edit unpaid bookings (before payment is made)
  app.patch("/api/bookings/:id/edit", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const bookingId = req.params.id;
      
      // Validate editable fields schema
      const editBookingSchema = z.object({
        pickupAddress: z.string().min(1).optional(),
        dropoffAddress: z.string().min(1).optional(),
        preferredDate: z.union([z.string(), z.date()]).optional(),
        loadSize: z.enum(['boxes', 'small', 'medium', 'large', 'apartment']).optional(),
        pickupDifficulty: z.enum(['ground', 'basement', 'stairs', 'elevator']).optional(),
        dropoffDifficulty: z.enum(['ground', 'basement', 'stairs', 'elevator']).optional(),
        heavyItem: z.boolean().optional(),
        numberOfMovers: z.number().int().min(1).max(2).optional(),
        description: z.string().optional(),
      });
      
      const updates = validateBody(editBookingSchema, req.body);
      
      // Get existing booking
      const existingBooking = await storage.getBooking(bookingId);
      if (!existingBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Security: Verify user owns this booking
      if (existingBooking.customerId !== user.id) {
        return res.status(403).json({ error: "You are not authorized to edit this booking" });
      }
      
      // Security: Only allow editing unpaid bookings
      if (existingBooking.paymentStatus === 'succeeded') {
        return res.status(400).json({ error: "Cannot edit a booking that has already been paid" });
      }
      
      // Only allow editing pending or pending_payment bookings
      if (!['pending', 'pending_payment'].includes(existingBooking.status)) {
        return res.status(400).json({ error: "Can only edit bookings with pending status" });
      }
      
      // Build update data
      const updateData: any = { ...updates };
      
      // Convert preferredDate to Date if string
      if (updates.preferredDate && typeof updates.preferredDate === 'string') {
        updateData.preferredDate = new Date(updates.preferredDate);
      }
      
      // If addresses changed, re-geocode and recalculate distance
      const { geocodeAddress, getDrivingDistance } = await import("./google-maps");
      const { calculatePrice, calculateMoverEarnings } = await import("@shared/pricing");
      
      let pickupLat = existingBooking.pickupLatitude;
      let pickupLng = existingBooking.pickupLongitude;
      let dropoffLat = existingBooking.dropoffLatitude;
      let dropoffLng = existingBooking.dropoffLongitude;
      let distance = parseFloat(existingBooking.distance || '0');
      
      if (updates.pickupAddress) {
        const pickupGeo = await geocodeAddress(updates.pickupAddress);
        if (pickupGeo.success) {
          pickupLat = pickupGeo.coordinates.lat;
          pickupLng = pickupGeo.coordinates.lng;
          updateData.pickupLatitude = pickupLat;
          updateData.pickupLongitude = pickupLng;
        }
      }
      
      if (updates.dropoffAddress) {
        const dropoffGeo = await geocodeAddress(updates.dropoffAddress);
        if (dropoffGeo.success) {
          dropoffLat = dropoffGeo.coordinates.lat;
          dropoffLng = dropoffGeo.coordinates.lng;
          updateData.dropoffLatitude = dropoffLat;
          updateData.dropoffLongitude = dropoffLng;
        }
      }
      
      // Recalculate distance if addresses changed
      if (updates.pickupAddress || updates.dropoffAddress) {
        const distanceResult = await getDrivingDistance(
          { lat: pickupLat, lng: pickupLng },
          { lat: dropoffLat, lng: dropoffLng }
        );
        if (distanceResult.success) {
          distance = distanceResult.distanceKm;
          updateData.distance = distance.toFixed(2);
        }
      }
      
      // Always recalculate price when any pricing-affecting field changes
      const finalLoadSize = updates.loadSize || existingBooking.loadSize;
      const finalPickupDifficulty = updates.pickupDifficulty || existingBooking.pickupDifficulty;
      const finalDropoffDifficulty = updates.dropoffDifficulty || existingBooking.dropoffDifficulty;
      const finalHeavyItem = updates.heavyItem !== undefined ? updates.heavyItem : existingBooking.heavyItem;
      const finalNumberOfMovers = updates.numberOfMovers || existingBooking.numberOfMovers;

      // Re-derive detectedItems from persisted identifiedItems so edits after the
      // initial booking still surface item premiums (e.g. admin edits pickup access).
      const persistedItems = await storage.getIdentifiedItemsByBooking(existingBooking.id);
      const detectedItemsForUpdate = persistedItems
        .filter(i => i.processingStatus === 'completed' && i.itemName)
        .map(i => ({
          itemName: i.itemName as string,
          premiumKey: (i as { premiumKey?: string | null }).premiumKey ?? null,
        }));

      const priceBreakdown = calculatePrice({
        distanceKm: distance,
        loadSize: finalLoadSize,
        pickupDifficulty: finalPickupDifficulty,
        dropoffDifficulty: finalDropoffDifficulty,
        heavyItem: finalHeavyItem,
        numberOfMovers: finalNumberOfMovers,
        detectedItems: detectedItemsForUpdate,
      });
      
      // Apply promo code discount if booking has one
      let discountPercent = 0;
      let discountAmount = 0;
      let discountReason = null;
      let finalPrice = priceBreakdown.total;
      let moverBalanceOwed = 0;
      
      if (existingBooking.promoCode === "LERVIT10") {
        discountPercent = 10;
        discountAmount = priceBreakdown.total * 0.10;
        discountReason = existingBooking.discountReason;
        finalPrice = priceBreakdown.total - discountAmount;
        moverBalanceOwed = Math.round(0.85 * discountAmount * 100) / 100;
      } else if (existingBooking.promoCode === "KAI15") {
        discountPercent = 15;
        discountAmount = priceBreakdown.total * 0.15;
        discountReason = existingBooking.discountReason;
        finalPrice = priceBreakdown.total - discountAmount;
        moverBalanceOwed = Math.round(0.85 * discountAmount * 100) / 100;
      }
      
      // Calculate platform fees for mover payouts
      const earnings = calculateMoverEarnings(priceBreakdown);
      
      // Update all pricing-related fields
      updateData.baseFee = priceBreakdown.baseFee.toFixed(2);
      updateData.distanceFee = priceBreakdown.distanceFee.toFixed(2);
      updateData.loadFee = priceBreakdown.loadFee.toFixed(2);
      updateData.pickupDifficultyFee = priceBreakdown.pickupDifficultyFee.toFixed(2);
      updateData.dropoffDifficultyFee = priceBreakdown.dropoffDifficultyFee.toFixed(2);
      updateData.heavyItemFee = priceBreakdown.premiumFee.toFixed(2);
      updateData.subtotal = priceBreakdown.subtotal.toFixed(2);
      updateData.price = finalPrice.toFixed(2);
      updateData.discountPercent = discountPercent.toFixed(2);
      updateData.discountAmount = discountAmount.toFixed(2);
      updateData.discountReason = discountReason;
      updateData.moverBalanceOwed = moverBalanceOwed.toFixed(2);
      updateData.platformFeePercent = earnings.platformFeePercent.toFixed(2);
      updateData.platformFeeAmount = earnings.platformFee.toFixed(2);
      updateData.moverNetAmount = earnings.net.toFixed(2);
      updateData.updatedAt = new Date();
      
      // If price changed significantly and there's an existing PaymentIntent, cancel it
      if (existingBooking.stripePaymentIntentId) {
        const oldPrice = parseFloat(existingBooking.price || '0');
        const newPrice = finalPrice;
        if (Math.abs(oldPrice - newPrice) > 0.01) {
          try {
            await stripe.paymentIntents.cancel(existingBooking.stripePaymentIntentId);
            updateData.stripePaymentIntentId = null;
          } catch (e) {
            // Payment intent may already be in a terminal state
            console.log('[Edit Booking] Could not cancel PaymentIntent:', e);
          }
        }
      }
      
      const updatedBooking = await storage.updateBooking(bookingId, updateData);
      
      console.log(`[Booking Edit] Customer ${user.email} updated booking ${bookingId}`);
      
      res.json(updatedBooking);
    } catch (error) {
      console.error('[Booking Edit] Error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== PAYMENT ROUTES =====
  
  /**
   * CREATE PAYMENT INTENT (PROTECTED - requires authenticated customer)
   * 
   * SECURITY NOTES:
   * - User ID comes from session, NOT from request body
   * - Amount is calculated SERVER-SIDE from booking price (NEVER trust client amounts)
   * - Ownership verified: user must be the booking's customer
   * - Idempotency key prevents duplicate charges for same booking
   */
  app.post("/api/bookings/:id/create-payment-intent", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      // SECURITY: Get user from session, not from request
      const user = (req as any).user;
      const bookingId = req.params.id;
      
      // Get the booking from database
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // SECURITY: Verify user owns this booking (prevents payment for other users' bookings)
      if (booking.customerId !== user.id) {
        logEvent.payment('ownership_violation', { 
          bookingId, 
          requesterId: user.id, 
          ownerId: booking.customerId 
        });
        return res.status(403).json({ error: "Access denied" });
      }
      
      // SECURITY: Require email verification for payments
      if (!user.emailVerified) {
        return res.status(403).json({ 
          error: "Email verification required",
          message: "Please verify your email address before making a payment.",
          requiresEmailVerification: true
        });
      }
      
      // Check if booking is in valid state for payment (pending, confirmed, or payment_failed for retries)
      const validPaymentStatuses = ['pending', 'confirmed', 'payment_failed', 'pending_payment'];
      if (!validPaymentStatuses.includes(booking.status)) {
        return res.status(400).json({ error: "Booking must be pending, confirmed, or payment_failed for payment" });
      }
      
      // Check if already paid
      if (booking.paymentStatus === 'succeeded') {
        return res.status(400).json({ error: "Booking has already been paid" });
      }
      
      // If this is a payment retry (status was payment_failed), reset status and force new PaymentIntent
      const isRetry = booking.status === 'payment_failed' || booking.paymentStatus === 'failed';
      if (isRetry) {
        await storage.updateBooking(bookingId, { 
          status: 'pending',
          paymentStatus: 'pending'
        });
        logEvent.payment('payment_retry_initiated', { bookingId, previousStatus: booking.status });
      }
      
      // SECURITY: Calculate amount SERVER-SIDE from booking (NEVER trust client amounts)
      // Use calculatePlatformFee for consistent rounding across all payment operations
      const priceAmount = parseFloat(booking.price || '0');
      if (priceAmount <= 0) {
        return res.status(400).json({ error: "Invalid booking price" });
      }
      
      // Create or retrieve payment intent
      let paymentIntent;
      let needsNewPaymentIntent = false;
      
      if (booking.stripePaymentIntentId && !isRetry) {
        // Retrieve existing payment intent (only if not a retry)
        try {
          paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
          
          // Check if payment intent is in a terminal state
          if (paymentIntent.status === 'succeeded') {
            // Payment already succeeded - update booking and return
            await storage.updateBooking(bookingId, { paymentStatus: 'succeeded' });
            return res.status(400).json({ 
              error: "Payment already completed",
              alreadyPaid: true,
              status: 'succeeded'
            });
          } else if (paymentIntent.status === 'canceled') {
            // Canceled - need a new payment intent
            needsNewPaymentIntent = true;
          }
          // Other statuses like 'requires_payment_method', 'processing' can be reused
        } catch (error) {
          // If payment intent doesn't exist, create a new one
          needsNewPaymentIntent = true;
        }
      } else if (isRetry) {
        // For retries, cancel old PaymentIntent and create fresh one
        if (booking.stripePaymentIntentId) {
          try {
            await stripe.paymentIntents.cancel(booking.stripePaymentIntentId);
            logEvent.payment('old_intent_canceled_for_retry', { bookingId, oldIntentId: booking.stripePaymentIntentId });
          } catch (cancelError) {
            // Intent might already be canceled or in a non-cancelable state - that's fine
            logEvent.payment('old_intent_cancel_skipped', { bookingId, reason: 'already_canceled_or_succeeded' });
          }
        }
        needsNewPaymentIntent = true;
      } else {
        needsNewPaymentIntent = true;
      }
      
      // Create new payment intent if needed
      if (needsNewPaymentIntent) {
        // Get or create Stripe customer so customer info appears in Stripe Dashboard
        const stripeCustomerId = await getOrCreateStripeCustomer(user);
        
        // ALWAYS sync customer info to Stripe (backfills existing customers with missing data)
        try {
          await stripe.customers.update(stripeCustomerId, {
            name: user.name || undefined,
            email: user.email || undefined,
            phone: user.phone || undefined,
          });
        } catch (updateErr) {
          console.error('Failed to sync Stripe customer info:', updateErr);
        }
        
        // Check if mover has a connected account for destination charges (Uber-style)
        const moverAccount = await getMoverStripeAccountForDestinationCharge(booking);
        
        // Calculate platform fee - use grossAmountCents from helper for consistent rounding
        const feeCalc = calculatePlatformFee(priceAmount, booking.loadSize);
        const { grossAmountCents, platformFeeCents, moverPayoutCents, platformFeePercent } = feeCalc;
        
        // Include charge type in key so it changes if mover account availability changes,
        // preventing StripeIdempotencyError when the same booking is retried with different params.
        const chargeSegment = moverAccount ? moverAccount.stripeAccountId : 'platform';
        const idempotencyKey = isRetry 
          ? `payment_intent_${booking.id}_${grossAmountCents}_${chargeSegment}_retry_${Date.now()}`
          : `payment_intent_${booking.id}_${grossAmountCents}_${chargeSegment}`;
        
        // If there is an existing payment intent stored on the booking but the charge type has
        // changed (e.g., mover now has a Stripe account when they didn't before), cancel the old
        // intent so we don't lock a platform-charge payment that should be a destination charge.
        if (booking.stripePaymentIntentId) {
          try {
            const existingIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
            const existingIsDestination = !!(existingIntent.transfer_data?.destination);
            const newIsDestination = !!moverAccount;
            if (existingIsDestination !== newIsDestination && existingIntent.status !== 'succeeded') {
              await stripe.paymentIntents.cancel(booking.stripePaymentIntentId).catch(() => {});
              logEvent.payment('intent_canceled_charge_type_changed', { bookingId, oldType: existingIsDestination ? 'destination' : 'platform', newType: newIsDestination ? 'destination' : 'platform' });
            }
          } catch {
            // Intent may already be gone - safe to proceed with creating a new one
          }
        }
        
        // Validate fee doesn't exceed amount (safety check)
        if (platformFeeCents > grossAmountCents) {
          console.error(`[Payment] Platform fee (${platformFeeCents}) exceeds amount (${grossAmountCents})`);
          return res.status(400).json({ error: "Invalid fee calculation" });
        }
        
        // Get the mover ID even if they don't have a Stripe account (for tracking in metadata)
        const bookingMoverId = booking.moverId || booking.preSelectedMoverId || '';
        
        // Build payment intent params - use grossAmountCents for consistent rounding
        // FlexiPay: include Afterpay and Klarna for buy-now-pay-later (BNPL) at checkout.
        // For destination charges (mover has connected account) we keep card-only because
        // Afterpay/Klarna are not supported on destination charges in Stripe.
        // For platform charges (mover not yet confirmed) BNPL is enabled.
        const bnplPaymentMethods: Stripe.PaymentIntentCreateParams['payment_method_types'] =
          moverAccount
            ? ['card']
            : ['card', 'afterpay_clearpay', 'klarna'];

        const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
          amount: grossAmountCents,
          currency: "cad",
          payment_method_types: bnplPaymentMethods,
          customer: stripeCustomerId,
          receipt_email: user.email,
          metadata: {
            bookingId: booking.id,
            customerId: user.id,
            customerName: user.name,
            customerEmail: user.email,
            customerPhone: user.phone || '',
            pickupAddress: booking.pickupAddress || '',
            dropoffAddress: booking.dropoffAddress || '',
            isRetry: isRetry ? 'true' : 'false',
            paymentType: moverAccount ? 'destination_charge' : 'platform_charge',
            moverId: bookingMoverId, // Always include mover ID if available (even without Stripe account)
            moverStripeAccountId: moverAccount?.stripeAccountId || '',
            moverStripeOnboarded: moverAccount ? 'true' : 'false', // Indicates if mover has Stripe account ready
            platformFeePercent: platformFeePercent.toString(),
            platformFeeCents: platformFeeCents.toString(),
          },
          description: `LervIT booking from ${booking.pickupAddress} to ${booking.dropoffAddress}`,
        };
        
        // Add destination charge params if mover has connected account (Uber-style split)
        if (moverAccount) {
          paymentIntentParams.transfer_data = {
            destination: moverAccount.stripeAccountId,
          };
          paymentIntentParams.application_fee_amount = platformFeeCents;
          console.log(`[Destination Charge] Using Uber-style split: mover ${moverAccount.moverId} gets $${(moverPayoutCents/100).toFixed(2)}, platform gets $${(platformFeeCents/100).toFixed(2)}`);
          logEvent.payment('destination_charge_setup', {
            bookingId: booking.id,
            moverId: moverAccount.moverId,
            moverStripeAccountId: moverAccount.stripeAccountId,
            grossAmount: grossAmountCents,
            platformFee: platformFeeCents,
            moverPayout: moverPayoutCents,
          });
        } else {
          console.log(`[Platform Charge] No mover account available, using platform charge (manual transfer later)`);
        }
        
        paymentIntent = await stripe.paymentIntents.create(paymentIntentParams, {
          idempotencyKey,
        });
        
        // Update booking with payment intent ID and commission details
        await storage.updateBooking(bookingId, {
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: 'pending',
          platformFeePercent: platformFeePercent.toString(),
          platformFeeAmount: (platformFeeCents / 100).toFixed(2),
          moverNetAmount: (moverPayoutCents / 100).toFixed(2),
        });
      }
      
      res.json({ 
        clientSecret: paymentIntent!.client_secret,
        paymentIntentId: paymentIntent!.id,
      });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ 
        error: "Error creating payment intent: " + error.message 
      });
    }
  });
  
  // Confirm payment (called after successful inline payment)
  app.post("/api/bookings/:id/confirm-payment", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const bookingId = req.params.id;
      const { paymentIntentId } = req.body;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Verify user owns this booking
      if (booking.customerId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Verify payment intent ID matches
      if (booking.stripePaymentIntentId !== paymentIntentId) {
        return res.status(400).json({ error: "Payment intent mismatch" });
      }
      
      // Verify payment with Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ error: "Payment not yet completed" });
      }
      
      // Check if already processed
      if (booking.paymentStatus === 'succeeded') {
        return res.json({ success: true, message: "Payment already confirmed" });
      }
      
      // Update booking payment status — use PENDING (awaiting mover match), NOT confirmed.
      // 'confirmed' is only set when a mover explicitly accepts the job.
      await storage.updateBooking(bookingId, {
        paymentStatus: 'succeeded',
        status: BOOKING_STATUSES.PENDING,
      });
      
      console.log(`[Payment] Confirmed payment for booking ${bookingId}`);
      
      // Send confirmation emails
      const customer = await storage.getUser(booking.customerId);
      if (customer) {
        try {
          await notificationService.sendBookingConfirmation(customer, booking);
          await notificationService.sendPaymentReceipt(customer, booking, booking.price || '0');
          console.log(`[Payment] Sent confirmation emails to ${customer.email}`);
        } catch (emailErr) {
          console.error("[Payment] Failed to send emails:", emailErr);
        }
        
        // Send admin notification for new booking
        try {
          const adminUsers = await db.select().from(usersTable).where(eq(usersTable.role, 'admin'));
          for (const admin of adminUsers) {
            await notificationService.sendAdminNewBookingAlert(admin.email, customer, booking);
          }
          console.log(`[Payment] Sent admin notification for booking ${bookingId}`);
        } catch (adminErr) {
          console.error("[Payment] Failed to send admin notification:", adminErr);
        }
      }
      
      // Route through Victor for tracking + events (fire-and-forget — response
      // returns before dispatch resolves so a mover-side hiccup can't block
      // payment confirmation).
      victor.run('dispatch', { bookingId: booking.id }).catch(err =>
        logger.error({ err, bookingId: booking.id }, '[Victor] dispatch failed'),
      );

      res.json({ success: true, message: "Payment confirmed" });
    } catch (error: any) {
      console.error("Error confirming payment:", error);
      res.status(500).json({ error: "Failed to confirm payment" });
    }
  });

  // Get payment status for a booking
  app.get("/api/bookings/:id/payment-status", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const bookingId = req.params.id;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Verify user has access (customer or assigned mover)
      if (booking.customerId !== user.id && booking.moverId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json({
        paymentStatus: booking.paymentStatus || 'pending',
        stripePaymentIntentId: booking.stripePaymentIntentId,
        amount: booking.price,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payment status" });
    }
  });

  // === SAVED PAYMENT METHODS ===
  
  // Helper to get or create Stripe customer with full contact info
  // Helper to get mover's Stripe connected account for destination charges (Uber-style)
  async function getMoverStripeAccountForDestinationCharge(booking: any): Promise<{
    stripeAccountId: string;
    chargesEnabled: boolean;
    moverId: string;
  } | null> {
    // Determine which mover to use (assigned mover or pre-selected mover)
    const moverId = booking.moverId || booking.preSelectedMoverId;
    if (!moverId) {
      return null;
    }
    
    // Look up mover's Stripe connected account
    const accounts = await db.select()
      .from(moverStripeAccounts)
      .where(eq(moverStripeAccounts.moverId, moverId))
      .limit(1);
    
    if (accounts.length === 0) {
      console.log(`[Destination Charge] Mover ${moverId} has no Stripe account`);
      return null;
    }
    
    const account = accounts[0];
    
    // Check if account can receive payments
    if (!account.chargesEnabled) {
      console.log(`[Destination Charge] Mover ${moverId} account not ready (chargesEnabled: false)`);
      return null;
    }
    
    return {
      stripeAccountId: account.stripeAccountId,
      chargesEnabled: account.chargesEnabled,
      moverId,
    };
  }

  async function getOrCreateStripeCustomer(user: User): Promise<string> {
    // If user has a stored Stripe customer ID, verify it exists in current Stripe mode
    if (user.stripeCustomerId) {
      try {
        // Try to retrieve the customer to verify it exists
        await stripe.customers.retrieve(user.stripeCustomerId);
        return user.stripeCustomerId;
      } catch (err: any) {
        // Customer doesn't exist (likely switched from test to live mode)
        // Fall through to create a new customer
        console.log(`Stripe customer ${user.stripeCustomerId} not found, creating new one for user ${user.id}`);
      }
    }
    
    // Create new Stripe customer with all available info for dashboard visibility
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      phone: user.phone || undefined,
      metadata: {
        userId: user.id,
        role: user.role || 'customer',
      },
    });
    
    // Save Stripe customer ID to user
    await db.update(usersTable).set({ stripeCustomerId: customer.id }).where(eq(usersTable.id, user.id));
    
    return customer.id;
  }

  // Create setup intent for saving a card
  app.post("/api/payment-methods/setup-intent", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user as User;
      
      const stripeCustomerId = await getOrCreateStripeCustomer(user);
      
      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        metadata: {
          userId: user.id,
        },
      });
      
      res.json({ clientSecret: setupIntent.client_secret });
    } catch (error: any) {
      console.error("Error creating setup intent:", error);
      res.status(500).json({ error: "Failed to create setup intent" });
    }
  });

  // Get saved payment methods
  app.get("/api/payment-methods", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user as User;
      
      if (!user.stripeCustomerId) {
        return res.json({ paymentMethods: [] });
      }
      
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
      });
      
      // Get default payment method
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);
      const defaultPaymentMethodId = (customer as any).invoice_settings?.default_payment_method;
      
      const cards = paymentMethods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
        isDefault: pm.id === defaultPaymentMethodId,
      }));
      
      res.json({ paymentMethods: cards });
    } catch (error: any) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ error: "Failed to fetch payment methods" });
    }
  });

  // Delete a saved payment method
  app.delete("/api/payment-methods/:id", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user as User;
      const paymentMethodId = req.params.id;
      
      // Verify the payment method belongs to this user
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== user.stripeCustomerId) {
        return res.status(403).json({ error: "Payment method does not belong to you" });
      }
      
      await stripe.paymentMethods.detach(paymentMethodId);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting payment method:", error);
      res.status(500).json({ error: "Failed to delete payment method" });
    }
  });

  // Set default payment method
  app.post("/api/payment-methods/:id/set-default", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user as User;
      const paymentMethodId = req.params.id;
      
      if (!user.stripeCustomerId) {
        return res.status(400).json({ error: "No Stripe customer found" });
      }
      
      // Verify the payment method belongs to this user
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== user.stripeCustomerId) {
        return res.status(403).json({ error: "Payment method does not belong to you" });
      }
      
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error setting default payment method:", error);
      res.status(500).json({ error: "Failed to set default payment method" });
    }
  });

  // Pay with saved card
  app.post("/api/bookings/:id/pay-with-saved-card", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user as User;
      const bookingId = req.params.id;
      const { paymentMethodId } = validateBody(z.object({
        paymentMethodId: z.string(),
      }), req.body);
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      if (booking.customerId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (booking.paymentStatus === 'succeeded') {
        return res.status(400).json({ error: "Booking already paid" });
      }
      
      if (!user.stripeCustomerId) {
        return res.status(400).json({ error: "No saved payment methods" });
      }
      
      // Check if mover has a connected account for destination charges (Uber-style)
      const moverAccount = await getMoverStripeAccountForDestinationCharge(booking);
      
      // Calculate platform fee - use grossAmountCents from helper for consistent rounding
      const feeCalc = calculatePlatformFee(
        parseFloat(booking.price || '0'),
        booking.loadSize
      );
      const { grossAmountCents, platformFeeCents, moverPayoutCents, platformFeePercent } = feeCalc;
      
      // Validate fee doesn't exceed amount (safety check)
      if (platformFeeCents > grossAmountCents) {
        console.error(`[Payment - Saved Card] Platform fee (${platformFeeCents}) exceeds amount (${grossAmountCents})`);
        return res.status(400).json({ error: "Invalid fee calculation" });
      }
      
      // Get the mover ID even if they don't have a Stripe account (for tracking in metadata)
      const bookingMoverId = booking.moverId || booking.preSelectedMoverId || '';
      
      // Build payment intent params for saved card - use grossAmountCents for consistent rounding
      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: grossAmountCents,
        currency: 'cad',
        customer: user.stripeCustomerId,
        payment_method: paymentMethodId,
        off_session: false,
        confirm: true,
        metadata: {
          bookingId: booking.id,
          customerId: user.id,
          paymentType: moverAccount ? 'destination_charge' : 'platform_charge',
          moverId: bookingMoverId, // Always include mover ID if available (even without Stripe account)
          moverStripeAccountId: moverAccount?.stripeAccountId || '',
          moverStripeOnboarded: moverAccount ? 'true' : 'false', // Indicates if mover has Stripe account ready
          platformFeePercent: platformFeePercent.toString(),
        },
      };
      
      // Add destination charge params if mover has connected account (Uber-style split)
      if (moverAccount) {
        paymentIntentParams.transfer_data = {
          destination: moverAccount.stripeAccountId,
        };
        paymentIntentParams.application_fee_amount = platformFeeCents;
        console.log(`[Destination Charge - Saved Card] Uber-style split: mover ${moverAccount.moverId} gets $${(moverPayoutCents/100).toFixed(2)}`);
        logEvent.payment('destination_charge_saved_card', {
          bookingId: booking.id,
          moverId: moverAccount.moverId,
          grossAmount: grossAmountCents,
          platformFee: platformFeeCents,
        });
      }
      
      // Create payment intent with saved card (use deterministic idempotency key for safety)
      const savedCardIdempotencyKey = `saved_card_${booking.id}_${grossAmountCents}_${paymentMethodId}`;
      const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams, {
        idempotencyKey: savedCardIdempotencyKey,
      });
      
      if (paymentIntent.status === 'succeeded') {
        // Update booking to PENDING (awaiting mover acceptance) — not 'confirmed'.
        // 'confirmed' is only set when a mover explicitly accepts the job.
        const updatedBooking = await storage.updateBooking(bookingId, {
          paymentStatus: 'succeeded',
          status: BOOKING_STATUSES.PENDING,
          stripePaymentIntentId: paymentIntent.id,
          platformFeePercent: platformFeePercent.toString(),
          platformFeeAmount: (platformFeeCents / 100).toFixed(2),
          moverNetAmount: (moverPayoutCents / 100).toFixed(2),
        });

        // Send customer confirmation emails
        const customer = await storage.getUser(booking.customerId);
        if (customer) {
          try {
            await notificationService.sendBookingConfirmation(customer, updatedBooking || booking);
            await notificationService.sendPaymentReceipt(customer, updatedBooking || booking, booking.price || '0');
          } catch (emailErr) {
            console.error("Failed to send emails:", emailErr);
          }

          try {
            const adminUsers = await db.select().from(usersTable).where(eq(usersTable.role, 'admin'));
            for (const admin of adminUsers) {
              await notificationService.sendAdminNewBookingAlert(admin.email, customer, updatedBooking || booking);
            }
          } catch (adminErr) {
            console.error("[Payment] Failed to send admin notification:", adminErr);
          }
        }

        // Route through Victor for tracking + events (fire-and-forget).
        const dispatchTarget = updatedBooking || booking;
        victor.run('dispatch', { bookingId: dispatchTarget.id }).catch(err =>
          logger.error({ err, bookingId: dispatchTarget.id }, '[Victor] dispatch failed'),
        );

        res.json({ success: true, status: 'succeeded' });
      } else if (paymentIntent.status === 'requires_action') {
        // Card requires 3D Secure
        res.json({
          requiresAction: true,
          clientSecret: paymentIntent.client_secret,
        });
      } else {
        res.status(400).json({ error: "Payment failed", status: paymentIntent.status });
      }
    } catch (error: any) {
      console.error("Error paying with saved card:", error);
      res.status(500).json({ error: error.message || "Payment failed" });
    }
  });
  
  /**
   * =========================================================================
   * RESEND WEBHOOK ENDPOINT (RESEND-ONLY - NO USER SESSION)
   * =========================================================================
   *
   * Signed via svix. Signature is computed over the exact bytes Resend sent,
   * so we verify against req.rawBody (captured by the global express.json
   * `verify` hook in server/index.ts) — re-serializing req.body would change
   * key order / whitespace and break verification.
   * =========================================================================
   */
  app.post("/api/webhooks/resend", async (req: Request, res: Response) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    const svixId = req.headers['svix-id'] as string | undefined;
    const svixTimestamp = req.headers['svix-timestamp'] as string | undefined;
    const svixSignature = req.headers['svix-signature'] as string | undefined;

    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        logger.error('[Resend Webhook] RESEND_WEBHOOK_SECRET not configured');
        return res.status(500).json({ error: 'Webhook not configured' });
      }
      logger.warn('[Resend Webhook] RESEND_WEBHOOK_SECRET not set - dev mode, skipping verification');
    }

    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ error: 'Missing svix headers' });
    }

    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) {
      logger.error('[Resend Webhook] Raw body not available for signature verification');
      return res.status(400).json({ error: 'Invalid request body' });
    }

    let payload: any;
    if (secret) {
      try {
        const { Webhook } = await import('svix');
        const wh = new Webhook(secret);
        payload = wh.verify(rawBody, {
          'svix-id': svixId,
          'svix-timestamp': svixTimestamp,
          'svix-signature': svixSignature,
        });
      } catch (err) {
        logger.warn({ err }, '[Resend Webhook] Invalid signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    } else {
      payload = req.body;
    }

    const { type, data } = payload ?? {};
    const to: string[] = Array.isArray(data?.to)
      ? data.to
      : (typeof data?.to === 'string' ? [data.to] : []);
    const entityId = to[0] ?? 'unknown';

    logger.info({ type, emailId: data?.email_id }, '[Resend Webhook] Event received');

    try {
      switch (type) {
        case 'email.bounced':
          await emitEvent('email.bounced', 'customer', entityId, {
            emailId: data?.email_id,
            to,
            subject: data?.subject,
            bouncedAt: data?.created_at,
          }, 'webhook');
          logger.warn({ to, subject: data?.subject }, '[Email] Bounced');
          break;

        case 'email.complained':
          await emitEvent('email.complained', 'customer', entityId, {
            emailId: data?.email_id,
            to,
            subject: data?.subject,
          }, 'webhook');
          try {
            const { xavier } = await import('./agents/xavier');
            await xavier.run('escalate', {
              issue: `Spam complaint from ${entityId}`,
              severity: 'high',
              agentName: 'Email System',
              data: { subject: data?.subject, emailId: data?.email_id },
            });
          } catch (escalateErr) {
            logger.error({ err: escalateErr }, '[Resend Webhook] Xavier escalation failed');
          }
          logger.error({ to }, '[Email] Spam complaint received');
          break;

        case 'email.delivery_delayed':
          logger.warn({ to, subject: data?.subject }, '[Email] Delivery delayed');
          break;

        case 'email.delivered':
          logger.info({ to }, '[Email] Delivered');
          break;

        case 'email.sent':
          logger.info({ to }, '[Email] Sent');
          break;

        case 'email.opened':
          await emitEvent('email.opened', 'customer', entityId, {
            emailId: data?.email_id,
            to,
            subject: data?.subject,
            openedAt: data?.created_at,
          }, 'webhook');
          break;

        case 'email.clicked':
          await emitEvent('email.clicked', 'customer', entityId, {
            emailId: data?.email_id,
            to,
            subject: data?.subject,
            clickedAt: data?.created_at,
          }, 'webhook');
          break;

        case 'email.failed':
          await emitEvent(
            'email.failed',
            'email',
            data.to?.[0] ?? 'unknown',
            {
              emailId: data.email_id,
              to: data.to,
              subject: data.subject,
              failedAt: data.created_at,
            },
            'webhook'
          );
          logger.error({
            to: data.to,
            subject: data.subject,
          }, '[Email] Send failed');
          break;

        case 'email.scheduled':
          logger.info({
            to: data.to
          }, '[Email] Scheduled');
          break;

        case 'contact.created':
        case 'contact.updated':
        case 'contact.deleted':
          logger.info({ type },
            '[Resend] Contact event');
          break;

        case 'domain.created':
        case 'domain.updated':
        case 'domain.deleted':
          logger.info({ type },
            '[Resend] Domain event');
          break;

        default:
          logger.info({ type }, '[Resend Webhook] Unhandled event');
      }

      return res.json({ received: true });
    } catch (err) {
      logger.error({ err, type }, '[Resend Webhook] Handler error');
      return res.status(500).json({ error: 'Handler failed' });
    }
  });

  /**
   * =========================================================================
   * STRIPE WEBHOOK ENDPOINT (STRIPE-ONLY - NO USER SESSION)
   * =========================================================================
   *
   * SECURITY NOTES:
   * - This endpoint is called ONLY by Stripe servers, not by users
   * - Signature verification is REQUIRED in production
   * - Uses raw request body (not JSON-parsed) for signature verification
   * - Returns 400 immediately if signature verification fails
   * - Never log sensitive data (card details, full webhook body)
   *
   * RATE LIMITING:
   * - Configured separately in middleware/security.ts (webhookLimiter)
   * - Allows Stripe retries while preventing abuse
   *
   * =========================================================================
   */
  app.post("/api/stripe-webhook", async (req: Request, res: Response) => {
    // Hoisted above the outer try so the outer catch can reference the event id
    // for the dedup-row error-message update.
    let webhookEventId: string | undefined;
    try {
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      // SECURITY: Require stripe-signature header
      if (!sig) {
        logEvent.error('stripe_webhook', new Error('Missing stripe signature - possible spoofing attempt'));
        return res.status(400).json({ error: 'No stripe signature' });
      }

      let event: Stripe.Event;

      // SECURITY: Always verify webhook signature in production
      if (webhookSecret) {
        try {
          // IMPORTANT: Use raw body, not JSON-parsed body, for signature verification
          const rawBody = (req as any).rawBody;
          if (!rawBody) {
            logEvent.error('stripe_webhook', new Error('Raw body not available for signature verification'));
            return res.status(400).json({ error: 'Invalid request body' });
          }
          event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
          logEvent.payment('webhook_verified', { eventType: event.type });
        } catch (err) {
          // SECURITY: Log and reject immediately on verification failure
          logEvent.error('stripe_webhook_verification', err);
          return res.status(400).json({ error: 'Webhook signature verification failed' });
        }
      } else if (process.env.NODE_ENV === 'production') {
        // SECURITY: In production, ALWAYS require webhook secret
        logEvent.error('stripe_webhook', new Error('STRIPE_WEBHOOK_SECRET required in production'));
        return res.status(500).json({ error: 'Webhook configuration error' });
      } else {
        // Development mode ONLY - log warning but process anyway
        logger.warn({ event: 'stripe_webhook' }, 'DEV MODE: STRIPE_WEBHOOK_SECRET not set - skipping signature verification');
        event = req.body as Stripe.Event;
      }

      // Dedup: Stripe retries deliver the same event.id. INSERT ... ON CONFLICT
      // DO NOTHING; if 0 rows were inserted, the event was already processed
      // (or is being processed concurrently) — short-circuit with 200 so Stripe
      // stops retrying. Placed AFTER signature verify so unverified events
      // can't pollute the dedup table.
      //
      // Best-effort: a crash between this insert and the switch statement
      // loses the event. Acceptable for current scope; a two-phase claim
      // (like server/voice-routes.ts) is an option if the blast radius grows.
      webhookEventId = event.id;
      try {
        const dedupResult: any = await db.execute(sql`
          INSERT INTO stripe_webhook_events (id, type, received_at)
          VALUES (${event.id}, ${event.type}, NOW())
          ON CONFLICT (id) DO NOTHING
        `);
        const inserted = dedupResult?.rowCount ?? dedupResult?.rows?.length ?? 0;
        if (inserted === 0) {
          logEvent.payment('webhook_dedup_skipped', { eventId: event.id, eventType: event.type });
          return res.json({ received: true, skipped: true });
        }
      } catch (dedupErr) {
        // If the dedup table doesn't exist yet or the query fails, log and
        // continue — dedup is a hardening layer, not a correctness prerequisite.
        logEvent.error('stripe_webhook_dedup', dedupErr instanceof Error ? dedupErr : new Error('dedup error'), { eventId: event.id });
      }

      // Handle the event
      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          
          // STRIPE RADAR: Extract fraud risk data from latest charge
          let riskLevel: string | undefined;
          let riskScore: number | undefined;
          let fraudFlagged = false;
          
          try {
            const chargeId = paymentIntent.latest_charge;
            if (chargeId && typeof chargeId === 'string') {
              const charge = await stripe.charges.retrieve(chargeId);
              riskLevel = charge.outcome?.risk_level;
              riskScore = charge.outcome?.risk_score;
              fraudFlagged = riskLevel === 'highest' || (riskScore !== undefined && riskScore > 75);
            }
          } catch (radarErr) {
            logEvent.error('stripe_radar_fetch', radarErr, { paymentIntentId: paymentIntent.id });
          }
          
          logEvent.payment('intent_succeeded', { 
            bookingId: paymentIntent.metadata?.bookingId,
            paymentIntentId: paymentIntent.id,
            amount: String(paymentIntent.amount / 100),
            currency: paymentIntent.currency,
            riskLevel: riskLevel || 'unknown',
            riskScore: riskScore ?? null,
            fraudFlagged
          });
          
          // Find booking by payment intent ID (primary lookup)
          let successBookings = await db
            .select()
            .from(bookings)
            .where(eq(bookings.stripePaymentIntentId, paymentIntent.id))
            .limit(1);
          
          // FALLBACK: If not found by payment intent ID, try by bookingId from metadata
          // This catches race conditions where the payment intent ID wasn't saved yet
          if (successBookings.length === 0 && paymentIntent.metadata?.bookingId) {
            logEvent.payment('webhook_fallback_lookup', {
              paymentIntentId: paymentIntent.id,
              metadataBookingId: paymentIntent.metadata.bookingId,
            });
            
            successBookings = await db
              .select()
              .from(bookings)
              .where(eq(bookings.id, paymentIntent.metadata.bookingId))
              .limit(1);
            
            // If found via metadata, update the booking with the payment intent ID
            if (successBookings.length > 0) {
              await db.update(bookings)
                .set({ stripePaymentIntentId: paymentIntent.id })
                .where(eq(bookings.id, paymentIntent.metadata.bookingId));
              
              logEvent.payment('webhook_fallback_success', {
                bookingId: paymentIntent.metadata.bookingId,
                paymentIntentId: paymentIntent.id,
              });
            }
          }
          
          if (successBookings.length > 0) {
            const booking = successBookings[0];
            
            // Idempotency check - don't process if already succeeded AND job notifications exist
            if (booking.paymentStatus === 'succeeded') {
              const existingJobNotifs = await db.select({ id: jobNotifications.id })
                .from(jobNotifications)
                .where(eq(jobNotifications.bookingId, booking.id))
                .limit(1);
              if (existingJobNotifs.length > 0) {
                logEvent.payment('already_processed', { bookingId: booking.id, paymentIntentId: paymentIntent.id });
                return res.json({ received: true, status: 'already_processed' });
              }
              // Payment confirmed but no job notifications yet - proceed to notify movers
              logEvent.payment('rerun_mover_notifications', { bookingId: booking.id, paymentIntentId: paymentIntent.id });
            }
            
            // STRIPE RADAR: Log and flag high-risk payments for manual review
            if (fraudFlagged) {
              logEvent.payment('high_risk_payment', {
                bookingId: booking.id,
                paymentIntentId: paymentIntent.id,
                userId: booking.customerId,
                riskLevel,
                riskScore,
                amount: String(paymentIntent.amount / 100),
                action: 'flagged_for_review'
              });
            }
            
            // Update booking payment status and move to PENDING (awaiting mover)
            // Also flag for review if Stripe Radar detected high risk
            await storage.updateBooking(booking.id, {
              paymentStatus: 'succeeded',
              status: BOOKING_STATUSES.PENDING,
              ...(fraudFlagged && {
                flaggedForReview: true,
                flaggedReason: 'stripe_radar_high_risk'
              })
            });
            
            logEvent.payment('booking_confirmed', {
              bookingId: booking.id,
              userId: booking.customerId,
              paymentIntentId: paymentIntent.id,
              status: 'succeeded',
              pickupAddress: booking.pickupAddress,
              dropoffAddress: booking.dropoffAddress,
              amount: booking.price,
              riskLevel: riskLevel || 'unknown'
            });

            await emitEvent('payment.succeeded', 'booking', booking.id, {
              amount: booking.price,
              currency: paymentIntent.currency,
              paymentIntentId: paymentIntent.id,
              customerId: booking.customerId,
              riskLevel: riskLevel || 'unknown',
              fraudFlagged,
            }, 'webhook');
            
            // ATOMICITY: All post-payment operations are wrapped in try-catch
            // to ensure webhook success even if notifications fail.
            // Booking status is already updated - these are non-critical follow-ups.
            
            // Send booking confirmation and payment receipt emails
            try {
              const customer = await storage.getUser(booking.customerId);
              if (customer) {
                await notificationService.sendBookingConfirmation(customer, booking);
                await notificationService.sendPaymentReceipt(
                  customer,
                  booking,
                  booking.price || '0'
                );
                logEvent.notification('customer_emails_sent', { bookingId: booking.id, customerId: customer.id });
                
                // Create in-app notification for payment confirmation (non-blocking)
                try {
                  await storage.createNotification({
                    userId: customer.id,
                    type: 'payment_received',
                    title: 'Payment Confirmed',
                    message: `Your payment of $${booking.price} CAD was successful. We're finding movers for your move.`,
                    bookingId: booking.id,
                    actionUrl: '/my-bookings',
                    isRead: false,
                  });
                } catch (notifErr) {
                  logEvent.error('payment_notification_failed', notifErr, { bookingId: booking.id, userId: customer.id });
                }
                
                // Send admin notification for new booking
                try {
                  const adminUsers = await db.select().from(usersTable).where(eq(usersTable.role, 'admin'));
                  for (const admin of adminUsers) {
                    await notificationService.sendAdminNewBookingAlert(admin.email, customer, booking);
                  }
                } catch (adminErr) {
                  logEvent.error('webhook_admin_notification', adminErr, { bookingId: booking.id });
                }
              }
            } catch (emailErr) {
              logEvent.error('webhook_customer_emails', emailErr, { bookingId: booking.id });
            }
            
            // Route through Victor for tracking + events (fire-and-forget so a
            // dispatch hiccup can't stall Stripe's webhook 200 window).
            victor.run('dispatch', { bookingId: booking.id })
              .then(() => {
                logEvent.payment('movers_notified', {
                  bookingId: booking.id,
                  websocketConnected: moverWebSocket.getConnectedMoversCount(),
                });
              })
              .catch(err =>
                logEvent.error('webhook_mover_notifications', err, { bookingId: booking.id }),
              );
          } else {
            // CRITICAL: No booking found for this payment intent - this is the lost booking scenario!
            // This should never happen if the payment flow is working correctly.
            logEvent.error('webhook_booking_not_found', new Error('Payment succeeded but no booking found'), {
              paymentIntentId: paymentIntent.id,
              amount: String(paymentIntent.amount / 100),
              metadataBookingId: paymentIntent.metadata?.bookingId || 'none',
              metadataCustomerId: paymentIntent.metadata?.customerId || 'none',
            });
          }
          break;
          
        case 'payment_intent.payment_failed':
          const failedIntent = event.data.object as Stripe.PaymentIntent;
          
          logEvent.payment('intent_failed', { 
            bookingId: failedIntent.metadata?.bookingId,
            error: failedIntent.last_payment_error?.message 
          });
          
          // Find booking by payment intent ID
          const failedBookings = await db
            .select()
            .from(bookings)
            .where(eq(bookings.stripePaymentIntentId, failedIntent.id))
            .limit(1);
          
          if (failedBookings.length > 0) {
            const booking = failedBookings[0];
            
            // Update booking payment status to failed
            await storage.updateBooking(booking.id, {
              paymentStatus: 'failed',
              status: BOOKING_STATUSES.PAYMENT_FAILED,
            });
            
            logEvent.payment('booking_failed', { bookingId: booking.id });
          }
          break;
        
        // Handle Stripe Connect account updates (mover onboarding status changes)
        case 'account.updated':
          const updatedAccount = event.data.object as Stripe.Account;
          
          logEvent.payment('connect_account_updated', { 
            stripeAccountId: updatedAccount.id,
            chargesEnabled: updatedAccount.charges_enabled,
            payoutsEnabled: updatedAccount.payouts_enabled,
          });
          
          // Find mover by Stripe account ID and update their status
          const moverAccounts = await db.select()
            .from(moverStripeAccounts)
            .where(eq(moverStripeAccounts.stripeAccountId, updatedAccount.id))
            .limit(1);
          
          if (moverAccounts.length > 0) {
            const moverAccount = moverAccounts[0];
            const wasFullyOnboarded = moverAccount.chargesEnabled && moverAccount.payoutsEnabled;
            const isNowFullyOnboarded = updatedAccount.charges_enabled && updatedAccount.payouts_enabled;
            
            const newOnboardingStatus = updatedAccount.details_submitted ? 'complete' : 
                                        (updatedAccount.requirements?.currently_due?.length ? 'restricted' : 'in_progress');
            
            await db.update(moverStripeAccounts)
              .set({
                chargesEnabled: updatedAccount.charges_enabled,
                payoutsEnabled: updatedAccount.payouts_enabled,
                detailsSubmitted: updatedAccount.details_submitted,
                onboardingStatus: newOnboardingStatus,
                requirementsDue: updatedAccount.requirements?.eventually_due || [],
                currentlyDue: updatedAccount.requirements?.currently_due || [],
                updatedAt: new Date(),
              })
              .where(eq(moverStripeAccounts.id, moverAccount.id));
            
            logEvent.payment('mover_connect_status_synced', { 
              moverId: moverAccount.moverId,
              onboardingStatus: newOnboardingStatus,
            });
            
            // AUTO-TRANSFER: If mover just became fully onboarded, process any pending earnings
            if (!wasFullyOnboarded && isNowFullyOnboarded) {
              logEvent.payment('mover_onboarding_complete_auto_transfer_check', {
                moverId: moverAccount.moverId,
                stripeAccountId: updatedAccount.id,
              });

              // Hand off to Riley (ONBOARD) for the payouts-live SMS.
              try {
                const rileyQueue = createAgentQueue(QUEUE_NAMES.ONBOARD);
                if (rileyQueue) {
                  await rileyQueue.add('stripe_connected', {
                    moverId: moverAccount.moverId,
                  });
                }
              } catch (qErr) {
                logger.warn({ err: qErr, moverId: moverAccount.moverId }, 'Riley: stripe_connected enqueue failed');
              }
              
              // Find pending earnings for this mover that need transfer
              const pendingEarnings = await db.select()
                .from(moverEarnings)
                .where(and(
                  eq(moverEarnings.moverId, moverAccount.moverId),
                  or(
                    eq(moverEarnings.status, 'pending'),
                    eq(moverEarnings.status, 'needs_backfill')
                  ),
                  isNull(moverEarnings.stripeTransferId)
                ));
              
              for (const earning of pendingEarnings) {
                try {
                  // Get the booking to calculate correct fee
                  const booking = await storage.getBooking(earning.bookingId);
                  if (!booking || booking.paymentStatus !== 'succeeded') continue;
                  
                  // Calculate amounts using centralized helper
                  const grossAmount = parseFloat(booking.price || '0');
                  const feeCalc = calculatePlatformFee(grossAmount, booking.loadSize);
                  const { moverPayoutCents, platformFeeCents, platformFeePercent } = feeCalc;
                  
                  // Create transfer to mover's connected account
                  const transfer = await circuitBreakers.stripe.execute(() =>
                    stripe.transfers.create({
                      amount: moverPayoutCents,
                      currency: 'cad',
                      destination: updatedAccount.id,
                      metadata: {
                        bookingId: earning.bookingId,
                        moverId: moverAccount.moverId,
                        grossAmount: grossAmount.toFixed(2),
                        platformFee: (platformFeeCents / 100).toFixed(2),
                        processedBy: 'auto_onboarding_complete',
                      },
                    }, {
                      idempotencyKey: `auto-transfer-onboard-${earning.bookingId}`,
                    }),
                  );
                  
                  // Update earnings record — retry to prevent divergence.
                  // Transfer already succeeded; if the DB write ultimately
                  // fails, reconciliation will heal it.
                  await updateMoverEarningWithRetry(
                    { id: earning.id, stripeTransferId: transfer.id, bookingId: earning.bookingId },
                    { stripeTransferId: transfer.id, status: 'paid', paidAt: new Date() },
                  );

                  // Update PaymentIntent metadata to reflect the auto-transfer (merge with existing)
                  if (booking.stripePaymentIntentId) {
                    try {
                      const existingPI = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
                      await stripe.paymentIntents.update(booking.stripePaymentIntentId, {
                        metadata: {
                          ...existingPI.metadata,
                          stripeTransferId: transfer.id,
                          moverStripeAccountId: updatedAccount.id,
                          moverStripeOnboarded: 'true',
                          paymentType: 'platform_charge_with_transfer',
                          transferAmount: (moverPayoutCents / 100).toFixed(2),
                          moverId: moverAccount.moverId,
                        },
                      });
                    } catch (metaErr) {
                      console.error('[Webhook] Failed to update PaymentIntent metadata:', metaErr);
                    }
                  }
                  
                  logEvent.payment('auto_transfer_on_onboarding_success', {
                    moverId: moverAccount.moverId,
                    bookingId: earning.bookingId,
                    transferId: transfer.id,
                    amount: moverPayoutCents / 100,
                  });
                } catch (transferError: any) {
                  logEvent.error('auto_transfer_on_onboarding_failed', transferError, {
                    moverId: moverAccount.moverId,
                    bookingId: earning.bookingId,
                  });
                }
              }
            }
          }

          // Enterprise partner branch: same Stripe account webhook stream is
          // used for both movers and partners. If no mover account matches,
          // look up a partner. Delegates transfer creation to recordPartnerEarnings
          // for a single source of truth.
          {
            const [partnerRow] = await db.select().from(partners)
              .where(eq(partners.stripeAccountId, updatedAccount.id))
              .limit(1);

            if (partnerRow) {
              const nextPayoutsEnabled = !!updatedAccount.payouts_enabled;
              const nextStatus = updatedAccount.details_submitted && nextPayoutsEnabled
                ? 'active'
                : (updatedAccount.details_submitted ? 'restricted' : 'pending');

              await db.update(partners)
                .set({
                  stripePayoutsEnabled: nextPayoutsEnabled,
                  stripeDetailsSubmitted: !!updatedAccount.details_submitted,
                  stripeConnectStatus: nextStatus,
                  updatedAt: new Date(),
                })
                .where(eq(partners.id, partnerRow.id));

              logEvent.payment('partner_connect_status_synced', {
                partnerId: partnerRow.id,
                stripeAccountId: updatedAccount.id,
                payoutsEnabled: nextPayoutsEnabled,
                status: nextStatus,
              });

              // Auto-drive pending partner earnings once payouts turn on.
              const wasFullyOnboarded = partnerRow.stripePayoutsEnabled && partnerRow.stripeDetailsSubmitted;
              const isNowFullyOnboarded = nextPayoutsEnabled && !!updatedAccount.details_submitted;

              if (!wasFullyOnboarded && isNowFullyOnboarded) {
                logEvent.payment('partner_onboarding_complete_auto_transfer_check', {
                  partnerId: partnerRow.id,
                  stripeAccountId: updatedAccount.id,
                });

                const pendingPartnerEarnings = await db.select().from(partnerEarnings)
                  .where(and(
                    eq(partnerEarnings.partnerId, partnerRow.id),
                    eq(partnerEarnings.status, 'pending'),
                  ));

                for (const earning of pendingPartnerEarnings) {
                  const booking = await storage.getBooking(earning.bookingId);
                  if (!booking || booking.paymentStatus !== 'succeeded') continue;
                  try {
                    await recordPartnerEarnings(earning.bookingId, partnerRow.id, booking);
                  } catch (partnerTransferErr: any) {
                    logEvent.error('partner_auto_transfer_on_onboarding_failed', partnerTransferErr, {
                      partnerId: partnerRow.id,
                      bookingId: earning.bookingId,
                    });
                  }
                }
              }
            }
          }
          break;

        case 'charge.refunded':
          const refundedCharge = event.data.object as Stripe.Charge;
          const refundedAmountDollars = refundedCharge.amount_refunded / 100;

          logEvent.payment('charge_refunded', {
            chargeId: refundedCharge.id,
            amount: refundedAmountDollars,
          });

          try {
            // Resolve payment intent ID from the charge (may be string or expanded object)
            const refundPaymentIntentId = typeof refundedCharge.payment_intent === 'string'
              ? refundedCharge.payment_intent
              : (refundedCharge.payment_intent as any)?.id ?? null;

            if (refundPaymentIntentId) {
              const [refundedBooking] = await db
                .select()
                .from(bookings)
                .where(eq(bookings.stripePaymentIntentId, refundPaymentIntentId))
                .limit(1);

              if (refundedBooking) {
                // Mark booking cancelled and payment refunded
                await storage.updateBooking(refundedBooking.id, {
                  status: BOOKING_STATUSES.CANCELLED,
                  paymentStatus: 'refunded',
                });

                logEvent.payment('refund_booking_cancelled', {
                  bookingId: refundedBooking.id,
                  chargeId: refundedCharge.id,
                  refundedAmount: refundedAmountDollars,
                  timestamp: new Date().toISOString(),
                });

                // Notify customer (email + in-app)
                const refundCustomer = await storage.getUser(refundedBooking.customerId);
                if (refundCustomer) {
                  // In-app notification
                  await storage.createNotification({
                    userId: refundCustomer.id,
                    type: 'booking_cancelled',
                    title: 'Booking Cancelled & Refunded',
                    message: `Your booking has been cancelled and a refund of $${refundedAmountDollars.toFixed(2)} CAD has been issued to your original payment method.`,
                    bookingId: refundedBooking.id,
                    actionUrl: '/my-bookings',
                    isRead: false,
                  });

                  // Email notification
                  await notificationService.sendEmail({
                    to: refundCustomer.email,
                    subject: 'Your LervIT booking has been refunded',
                    body: `<p>Hi ${refundCustomer.name},</p><p>Your booking has been cancelled and a refund of <strong>$${refundedAmountDollars.toFixed(2)} CAD</strong> has been issued to your original payment method. Please allow 5–10 business days for the refund to appear.</p><p>If you have any questions, contact us at <a href="mailto:support@lervit.com">support@lervit.com</a>.</p><p>The LervIT Team</p>`,
                    type: 'status_update',
                  });
                }
              } else {
                logger.warn({ refundPaymentIntentId, chargeId: refundedCharge.id }, 'charge.refunded: no matching booking found');
              }
            }
          } catch (refundErr) {
            logEvent.error('charge_refunded_handler', refundErr, { chargeId: refundedCharge.id });
          }
          break;
          
        case 'transfer.created': {
          // Transfer to a connected account was created. Set stripeTransferId
          // and advance the matching earning to 'available' (funds in transit
          // to the mover's connected balance). transfer.paid will confirm bank
          // settlement and advance to 'paid'.
          try {
            const transfer = event.data.object as Stripe.Transfer;
            const earningId = transfer.metadata?.earningsId;
            const bookingId = transfer.metadata?.bookingId;
            if (earningId || bookingId) {
              await db.update(moverEarnings)
                .set({ stripeTransferId: transfer.id, status: 'available' })
                .where(
                  earningId
                    ? eq(moverEarnings.id, earningId)
                    : eq(moverEarnings.bookingId, bookingId!),
                );
              logEvent.payment('transfer_created_webhook', {
                transferId: transfer.id,
                amount: transfer.amount,
                bookingId,
              });
            } else {
              logger.warn({ transferId: transfer.id }, 'transfer.created webhook missing earningsId/bookingId metadata');
            }
          } catch (err) {
            logEvent.error('transfer_created_webhook', err instanceof Error ? err : new Error(String(err)));
          }
          break;
        }

        // NB: Stripe does NOT emit `transfer.paid` or `transfer.failed`
        // webhook events. Transfers to a connected account are instant into
        // the connected balance — the terminal state advance to 'paid' is
        // driven by:
        //   1) Admin running process-pending-payouts (promotes 'available'
        //      rows with a stripeTransferId → 'paid' — see FIX 4).
        //   2) /api/admin/reconcile-stripe-payouts (looks up Stripe transfers
        //      and heals divergent rows).
        // The only failure signal Stripe emits at the transfer level is
        // transfer.reversed (funds pulled back), handled below.
        case 'transfer.reversed': {
          try {
            const transfer = event.data.object as Stripe.Transfer;
            await db.update(moverEarnings)
              .set({ status: 'failed' })
              .where(eq(moverEarnings.stripeTransferId, transfer.id));
            logEvent.payment('transfer_reversed_webhook', {
              transferId: transfer.id,
            });
          } catch (err) {
            logEvent.error('transfer_reversed_webhook', err instanceof Error ? err : new Error(String(err)));
          }
          break;
        }

        case 'payout.paid': {
          // Stripe paid out the connected account balance to the mover's
          // bank. transfer.paid already updated our DB; this is audit-only.
          const payout = event.data.object as Stripe.Payout;
          logEvent.payment('payout_paid_webhook', {
            payoutId: payout.id,
            amount: payout.amount,
            arrivalDate: payout.arrival_date,
          });
          break;
        }

        case 'payout.failed': {
          try {
            const payout = event.data.object as Stripe.Payout;
            logEvent.payment('payout_failed_webhook', {
              payoutId: payout.id,
              failureCode: payout.failure_code,
              failureMessage: payout.failure_message,
            });
            // Notify all admins (same pattern as booking-created alerts above).
            const adminUsers = await db.select().from(usersTable).where(eq(usersTable.role, 'admin'));
            for (const admin of adminUsers) {
              await db.insert(inAppNotifications).values({
                userId: admin.id,
                type: 'system_message',
                title: 'Mover Payout Failed',
                message: `Stripe payout ${payout.id} failed: ${payout.failure_message ?? payout.failure_code ?? 'unknown reason'}`,
                actionUrl: '/admin/payouts',
                isRead: false,
              }).catch((notifErr) => {
                logEvent.error('payout_failed_admin_notification', notifErr, { adminId: admin.id, payoutId: payout.id });
              });
            }
          } catch (err) {
            logEvent.error('payout_failed_webhook', err instanceof Error ? err : new Error(String(err)));
          }
          break;
        }

        default:
          logger.debug({ eventType: event.type }, 'Unhandled Stripe event type');
      }

      // Mark the dedup row processed so re-scans can distinguish "seen" from
      // "successfully handled". Best-effort — a failure here is not fatal.
      try {
        await db.execute(sql`UPDATE stripe_webhook_events SET processed_at = NOW() WHERE id = ${event.id}`);
      } catch (_) { /* dedup table optional at runtime */ }

      res.json({ received: true });
    } catch (error: any) {
      logEvent.error('stripe_webhook', error);
      // Record the failure on the dedup row so ops has an audit trail.
      if (webhookEventId) {
        try {
          await db.execute(sql`UPDATE stripe_webhook_events SET error_message = ${String(error?.message ?? 'unknown').slice(0, 500)} WHERE id = ${webhookEventId}`);
        } catch (_) { /* best-effort */ }
      }
      res.status(400).json({ error: error.message });
    }
  });

  // ===== MESSAGE ROUTES =====
  app.get("/api/messages", async (req: Request, res: Response) => {
    try {
      const bookingId = req.query.bookingId as string;
      if (!bookingId) {
        return res.status(400).json({ error: "bookingId is required" });
      }
      
      const messages = await storage.getMessagesByBooking(bookingId);
      
      // Enrich with sender data
      const enrichedMessages = await Promise.all(
        messages.map(async (message) => {
          const sender = await storage.getUser(message.senderId);
          return {
            ...message,
            sender: sender ? { id: sender.id, name: sender.name } : null
          };
        })
      );
      
      res.json(enrichedMessages);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/messages", async (req: Request, res: Response) => {
    try {
      const messageData = validateBody(insertMessageSchema, req.body);
      messageData.text = he.encode(messageData.text);
      const message = await storage.createMessage(messageData);
      
      const sender = await storage.getUser(message.senderId);
      
      // Create in-app notification for the recipient
      try {
        const booking = await storage.getBooking(message.bookingId);
        if (booking) {
          const senderName = sender?.name || "Someone";
          const messagePreview = message.text.length > 80
            ? message.text.substring(0, 80) + "..."
            : message.text;

          // Determine recipient: if sender is customer, notify mover; if sender is mover's user, notify customer
          let recipientId: string | null = null;

          if (message.senderId === booking.customerId && booking.moverId) {
            // Sender is customer → notify assigned mover
            const mover = await storage.getMover(booking.moverId);
            if (mover) recipientId = mover.userId;
          } else if (booking.moverId) {
            // Sender is mover → notify customer
            const mover = await storage.getMover(booking.moverId);
            if (mover && mover.userId === message.senderId) {
              recipientId = booking.customerId;
            }
          }

          if (recipientId) {
            await storage.createNotification({
              userId: recipientId,
              type: "new_message",
              title: `New message from ${senderName}`,
              message: messagePreview,
              bookingId: message.bookingId,
              actionUrl: `/messages/${message.bookingId}`,
              isRead: false,
            });
          }

          // Partner-routed booking: no direct mover — notify all active partner portal users instead
          if (!recipientId && message.senderId === booking.customerId && (booking as any).enterprisePartnerId) {
            const partnerUserRows = await db
              .select({ userId: partnerUsers.userId })
              .from(partnerUsers)
              .where(
                and(
                  eq(partnerUsers.partnerId, (booking as any).enterprisePartnerId),
                  eq(partnerUsers.isActive, true),
                  inArray(partnerUsers.partnerRole, ["partner_admin", "partner_ops_manager", "partner_dispatcher"]),
                ),
              );
            for (const pu of partnerUserRows) {
              await storage.createNotification({
                userId: pu.userId,
                type: "new_message",
                title: `Customer message: ${senderName}`,
                message: messagePreview,
                bookingId: message.bookingId,
                actionUrl: `/partner/messages`,
                isRead: false,
              });
            }
          }
        }
      } catch (notifError) {
        // Don't fail the message creation if notification fails
        console.error("Failed to create message notification:", notifError);
      }
      
      res.json({
        ...message,
        sender: sender ? { id: sender.id, name: sender.name } : null
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Get unread message notifications for current user
  app.get("/api/messages/notifications", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const userId = req.session.userId;
      const unreadMessages = await storage.getUnreadMessagesForUser(userId);
      
      // Calculate total unread count
      const totalUnread = unreadMessages.reduce((sum, item) => sum + item.count, 0);
      
      res.json({
        totalUnread,
        byBooking: unreadMessages
      });
    } catch (error) {
      console.error("Error fetching message notifications:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Mark messages as read for a specific booking
  app.post("/api/messages/:bookingId/mark-read", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { bookingId } = req.params;
      const userId = req.session.userId;
      
      await storage.markMessagesAsRead(bookingId, userId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== EARNINGS ROUTES =====
  app.get("/api/movers/:moverId/earnings", async (req: Request, res: Response) => {
    try {
      const moverId = req.params.moverId;
      
      // Verify mover exists
      const mover = await storage.getMover(moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      // Get all bookings for this mover (returns empty array if none found)
      const allBookings = await storage.getBookingsByMover(moverId);
      
      // Calculate earnings from completed bookings with payment succeeded
      const completedBookings = allBookings.filter(
        b => b.status === 'completed' && b.paymentStatus === 'succeeded'
      );
      
      // Calculate earnings from confirmed bookings with payment succeeded (pending payout)
      const confirmedBookings = allBookings.filter(
        b => (b.status === 'confirmed' || b.status === 'in_progress') && b.paymentStatus === 'succeeded'
      );
      
      const totalEarnings = completedBookings.reduce(
        (sum, b) => sum + parseFloat(b.price || '0'),
        0
      );
      
      const pendingEarnings = confirmedBookings.reduce(
        (sum, b) => sum + parseFloat(b.price || '0'),
        0
      );
      
      // Get earnings breakdown by month
      const earningsByMonth: Record<string, { earnings: number; count: number }> = {};
      completedBookings.forEach(booking => {
        const month = format(new Date(booking.createdAt), 'MMM yyyy');
        if (!earningsByMonth[month]) {
          earningsByMonth[month] = { earnings: 0, count: 0 };
        }
        earningsByMonth[month].earnings += parseFloat(booking.price || '0');
        earningsByMonth[month].count += 1;
      });
      
      // Fetch customer names for recent bookings
      const recentBookingsWithCustomer = await Promise.all(
        completedBookings.slice(0, 10).map(async (b) => {
          const customer = await storage.getUser(b.customerId);
          return {
            id: b.id,
            customerName: customer?.name || 'Customer',
            pickupAddress: b.pickupAddress,
            dropoffAddress: b.dropoffAddress,
            date: b.preferredDate,
            earnings: b.price,
            status: b.status,
            paymentStatus: b.paymentStatus,
          };
        })
      );
      
      res.json({
        totalEarnings: totalEarnings.toFixed(2),
        pendingEarnings: pendingEarnings.toFixed(2),
        completedJobs: completedBookings.length,
        pendingJobs: confirmedBookings.length,
        earningsByMonth: Object.entries(earningsByMonth).map(([month, data]) => ({
          month,
          earnings: data.earnings.toFixed(2),
          jobCount: data.count,
        })),
        recentBookings: recentBookingsWithCustomer,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch earnings" });
    }
  });

  // ===== REVIEW ROUTES =====
  app.get("/api/reviews", async (req: Request, res: Response) => {
    try {
      const moverId = req.query.moverId as string;
      if (!moverId) {
        return res.status(400).json({ error: "moverId is required" });
      }
      
      const reviews = await storage.getReviewsByMover(moverId);
      
      // Enrich with customer data
      const enrichedReviews = await Promise.all(
        reviews.map(async (review) => {
          const customer = await storage.getUser(review.customerId);
          return {
            ...review,
            customer: customer ? { id: customer.id, name: customer.name } : null
          };
        })
      );
      
      res.json(enrichedReviews);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/reviews", async (req: Request, res: Response) => {
    console.log('[Reviews] POST /api/reviews - Request body:', JSON.stringify(req.body));
    try {
      if (!requireUser(req, res)) return;
      const authUser = (req as any).user as { id: string };

      const reviewData = validateBody(insertReviewSchema, req.body);
      if (reviewData.comment) reviewData.comment = he.encode(reviewData.comment);
      console.log('[Reviews] Validated review data:', JSON.stringify(reviewData));

      // AuthZ: caller can only submit reviews as themselves
      if (reviewData.customerId !== authUser.id) {
        return res.status(403).json({ error: "Cannot submit review on behalf of another user" });
      }

      // Validate that the booking is completed before allowing a review
      const booking = await storage.getBooking(reviewData.bookingId);
      console.log('[Reviews] Booking lookup result:', booking ? `Found (status: ${booking.status})` : 'Not found');

      if (!booking) {
        console.log('[Reviews] ERROR: Booking not found for id:', reviewData.bookingId);
        return res.status(404).json({ error: "Booking not found" });
      }

      // AuthZ: caller must own this booking
      if (booking.customerId !== authUser.id) {
        return res.status(403).json({ error: "You did not have this booking" });
      }

      // AuthZ: mover in review must match the booking's assigned mover
      if (reviewData.moverId && booking.moverId && booking.moverId !== reviewData.moverId) {
        return res.status(403).json({ error: "Mover does not match booking" });
      }

      if (booking.status !== "completed") {
        console.log('[Reviews] ERROR: Booking status is not completed:', booking.status);
        return res.status(400).json({ error: "You can only leave a review after the move is completed" });
      }

      // 30-day review window (updatedAt is the completion proxy — see autoCompletePastPaidBookings)
      const completedAt = booking.updatedAt ? new Date(booking.updatedAt).getTime() : null;
      if (completedAt) {
        const daysSinceCompletion = (Date.now() - completedAt) / (1000 * 60 * 60 * 24);
        if (daysSinceCompletion > 30) {
          return res.status(400).json({ error: "Review window has expired (30 days after completion)" });
        }
      }

      console.log('[Reviews] Creating review in database...');
      let review;
      try {
        review = await storage.createReview(reviewData);
        console.log('[Reviews] Review created with id:', review.id);
      } catch (err: any) {
        // Unique-violation on (booking_id, customer_id) — customer already reviewed this
        // booking. Treat as success (idempotent) and return the existing row so the client
        // stops re-prompting, matching how POST /api/surveys handles the same case.
        if (err?.code !== '23505') throw err;
        const [existing] = await db.select().from(reviews)
          .where(and(eq(reviews.bookingId, reviewData.bookingId), eq(reviews.customerId, reviewData.customerId)))
          .limit(1);
        if (!existing) throw err;
        console.log('[Reviews] Duplicate submission (23505) — returning existing review', existing.id);
        const customer = await storage.getUser(existing.customerId);
        return res.json({ ...existing, customer: customer ? { id: customer.id, name: customer.name } : null });
      }

      // IMPORTANT: Update mover's average rating after new review (skip for partner bookings with no mover)
      if (review.moverId) {
        const allReviews = await storage.getReviewsByMover(review.moverId);
        console.log('[Reviews] Found', allReviews.length, 'total reviews for mover', review.moverId);
        
        if (allReviews.length > 0) {
          const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
          const averageRating = (totalRating / allReviews.length).toFixed(1);
          
          console.log('[Reviews] Updating mover rating to', averageRating);
          await storage.updateMover(review.moverId, { 
            rating: averageRating,
            completedTrips: allReviews.length
          });
          
          console.log(`[Reviews] SUCCESS: Updated mover ${review.moverId} rating to ${averageRating} (${allReviews.length} reviews)`);
        }
      } else {
        console.log('[Reviews] Partner booking review — skipping mover rating update (no moverId)');
      }
      
      const customer = await storage.getUser(review.customerId);
      const response = {
        ...review,
        customer: customer ? { id: customer.id, name: customer.name } : null
      };

      await emitEvent('review.submitted', 'booking', review.bookingId, {
        reviewId: review.id,
        rating: review.rating,
        moverId: review.moverId,
        customerId: review.customerId,
        hasComment: !!review.comment,
      });

      // Low-rating admin alert (fire-and-forget; never block the response)
      if (review.rating <= 2) {
        (async () => {
          try {
            let moverName = 'Unknown mover';
            if (review.moverId) {
              const moverProfile = await storage.getMover(review.moverId);
              if (moverProfile) {
                const moverUser = await storage.getUser(moverProfile.userId);
                if (moverUser?.name) moverName = moverUser.name;
              }
            }

            const admins = await db.select({ id: usersTable.id })
              .from(usersTable)
              .where(eq(usersTable.role, 'admin'));

            const shortId = review.bookingId.slice(0, 8);
            const title = `Low rating alert: ${review.rating}★`;
            const message = `${moverName} received ${review.rating} stars on booking #${shortId}`;

            await Promise.all(admins.map(a =>
              storage.createNotification({
                userId: a.id,
                type: 'system_message',
                title,
                message,
                bookingId: review.bookingId,
                actionUrl: '/admin/moves',
                isRead: false,
              }).catch(err => logEvent.error('low_rating_admin_notify', err, { adminId: a.id })),
            ));

            await emitEvent('review.low_rating', 'booking', review.bookingId, {
              rating: review.rating,
              moverId: review.moverId,
              comment: review.comment,
            });
          } catch (err) {
            logEvent.error('low_rating_alert', err, { bookingId: review.bookingId });
          }
        })();
      }

      console.log('[Reviews] Sending response:', JSON.stringify(response));
      res.json(response);
    } catch (error) {
      console.error('[Reviews] ERROR creating review:', error);
      console.error('[Reviews] Error stack:', error instanceof Error ? error.stack : 'No stack');
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== FILE UPLOAD ROUTES =====
  app.post("/api/upload/images", upload.array('images', 10), async (req: Request, res: Response) => {
    try {
      if (!req.files || !Array.isArray(req.files)) {
        return res.status(400).json({ error: "No images uploaded" });
      }
      
      // Get user ID for ownership (use session user or default)
      const userId = req.session?.userId || 'anonymous';
      
      // Upload to Object Storage for production persistence
      const objectStorageService = new ObjectStorageService();
      const imageUrls: string[] = [];
      
      for (const file of req.files as Express.Multer.File[]) {
        try {
          // Read the file from local disk (multer saves it temporarily)
          const rawBuffer = fs.readFileSync(file.path);

          // Resize + convert to WebP (also decodes HEIC/HEIF)
          const optimized = await optimizeImageBuffer(
            rawBuffer,
            file.originalname,
            file.mimetype,
          );

          // Upload to cloud storage
          const cloudPath = await objectStorageService.uploadBuffer(
            optimized.buffer,
            optimized.filename,
            optimized.mimetype,
            userId
          );
          
          imageUrls.push(cloudPath);
          
          // Clean up local file after successful upload
          fs.unlinkSync(file.path);
        } catch (uploadError) {
          console.error('Object Storage upload failed, using local fallback:', uploadError);
          // Fallback to local path if Object Storage fails
          imageUrls.push(`/uploads/${file.filename}`);
        }
      }
      
      res.json({ urls: imageUrls });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Upload failed" });
    }
  });

  // ===== STRICT LOAD SIZE CATEGORIZATION RULES =====
  // These mappings are MANDATORY and cannot be overridden
  const STRICT_LARGE_ITEMS = [
    'sofa', 'couch', 'sectional', 'loveseat', 'futon',
    'bed', 'mattress', 'bedframe',
    'fridge', 'refrigerator', 'freezer',
    'washer', 'dryer', 'dishwasher',
    'dresser', 'wardrobe', 'armoire',
    'bookcase', 'bookshelf',
    'treadmill', 'elliptical', 'exercise equipment'
  ];

  const STRICT_APARTMENT_ITEMS = [
    'bedroom set', 'living room set', 'dining room set',
    'apartment', 'studio', 'room furniture'
  ];

  const STRICT_BOXES_ITEMS = [
    'shoe', 'shoes', 'bag', 'backpack', 'suitcase', 'luggage',
    'box', 'boxes', 'lamp', 'monitor', 'keyboard',
    'book', 'books', 'toy', 'toys', 'pillow', 'cushion'
  ];

  // Mock AI photo analysis (fallback when OpenAI is unavailable)
  function mockPhotoAnalysis(fileSize: number, filename: string) {
    // Analyze file size in MB to estimate load
    const sizeMB = fileSize / (1024 * 1024);
    
    // New volume-based load size categories:
    // boxes: 1-10 ft³ (small personal items, boxes, bags)
    // medium: 11-50 ft³ (chairs, small tables, TVs)
    // large: 50-170 ft³ (sofas, beds, fridges, appliances)
    // apartment: 170+ ft³ (full room furniture)
    let loadSize: "boxes" | "medium" | "large" | "apartment" = "medium";
    let heavyItem = false;
    let recommendedMovers = 1;
    let itemType = "Household item";
    let estimatedWeight: "light" | "medium" | "heavy" = "medium";
    let weightClass: "light" | "medium" | "heavy" = "medium";
    let estimatedWeightLbs = 200;
    let recommendedVehicle = "Cargo Van";
    
    // Filename pattern detection - Enhanced with more specific descriptions
    const lowerName = filename.toLowerCase();
    
    // ===== STRICT ENFORCEMENT: Check against mandatory categorization lists =====
    // PRIORITY 1: Apartment-sized items (MUST be "apartment")
    for (const item of STRICT_APARTMENT_ITEMS) {
      if (lowerName.includes(item)) {
        loadSize = "apartment";
        break;
      }
    }
    
    // PRIORITY 2: Large items (MUST be "large") - SOFAS, BEDS, FRIDGES, etc.
    if (loadSize !== "apartment") {
      for (const item of STRICT_LARGE_ITEMS) {
        if (lowerName.includes(item)) {
          loadSize = "large";
          break;
        }
      }
    }
    
    // PRIORITY 3: Small items (MUST be "boxes")
    if (loadSize !== "apartment" && loadSize !== "large") {
      for (const item of STRICT_BOXES_ITEMS) {
        if (lowerName.includes(item)) {
          loadSize = "boxes";
          break;
        }
      }
    }
    
    // File size analysis ONLY if no strict match was found
    if (loadSize === "medium") {
      if (sizeMB < 1) {
        loadSize = "boxes";
        estimatedWeight = "light";
        weightClass = "light";
        estimatedWeightLbs = 30;
        recommendedMovers = 1;
        recommendedVehicle = "SUV";
        itemType = "Small item or personal belonging";
      } else if (sizeMB > 3) {
        loadSize = "large";
        estimatedWeight = "heavy";
        weightClass = "heavy";
        estimatedWeightLbs = 600;
        heavyItem = true;
        recommendedMovers = 2;
        recommendedVehicle = "Cube Truck";
        itemType = "Large furniture piece";
      }
    }
    
    // Furniture - Seating
    if (lowerName.includes('sofa') || lowerName.includes('couch') || lowerName.includes('sectional')) {
      itemType = lowerName.includes('sectional') ? "Sectional sofa" : "Sofa";
      loadSize = "large"; // 50-170 ft³: Large furniture
      weightClass = "medium";
      estimatedWeightLbs = 300;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cargo Van";
    } else if (lowerName.includes('chair')) {
      if (lowerName.includes('office') || lowerName.includes('desk')) {
        itemType = "Office chair";
      } else if (lowerName.includes('dining')) {
        itemType = "Dining chair";
      } else if (lowerName.includes('arm')) {
        itemType = "Armchair";
      } else {
        itemType = "Chair";
      }
      loadSize = "medium"; // 11-50 ft³: Small furniture
      weightClass = "light";
      estimatedWeightLbs = 40;
      recommendedMovers = 1;
      recommendedVehicle = "SUV";
    } else if (lowerName.includes('stool')) {
      itemType = "Stool";
      loadSize = "boxes"; // 1-10 ft³: Very small items
      weightClass = "light";
      estimatedWeightLbs = 25;
      recommendedMovers = 1;
      recommendedVehicle = "SUV";
    }
    
    // Furniture - Tables
    else if (lowerName.includes('table')) {
      if (lowerName.includes('coffee')) {
        itemType = "Coffee table";
        loadSize = "medium"; // 11-50 ft³
        estimatedWeightLbs = 80;
      } else if (lowerName.includes('dining')) {
        itemType = "Dining table";
        loadSize = "large"; // 50-170 ft³: Large furniture
        estimatedWeightLbs = 200;
        recommendedMovers = 2;
      } else if (lowerName.includes('side') || lowerName.includes('end')) {
        itemType = "Side table";
        loadSize = "boxes"; // 1-10 ft³: Very small items
        estimatedWeightLbs = 40;
      } else {
        itemType = "Table";
        loadSize = "medium"; // 11-50 ft³
        estimatedWeightLbs = 120;
      }
      weightClass = "medium";
      recommendedVehicle = "Pickup";
    } else if (lowerName.includes('desk')) {
      itemType = lowerName.includes('standing') ? "Standing desk" : "Desk";
      loadSize = "medium"; // 11-50 ft³: Small furniture
      weightClass = "medium";
      estimatedWeightLbs = 150;
      recommendedMovers = 1;
      recommendedVehicle = "Pickup";
    }
    
    // Furniture - Beds
    else if (lowerName.includes('bed')) {
      if (lowerName.includes('king')) {
        itemType = "King-size bed";
        estimatedWeightLbs = 350;
      } else if (lowerName.includes('queen')) {
        itemType = "Queen-size bed";
        estimatedWeightLbs = 280;
      } else if (lowerName.includes('twin') || lowerName.includes('single')) {
        itemType = "Twin bed";
        estimatedWeightLbs = 180;
      } else {
        itemType = "Bed frame";
        estimatedWeightLbs = 250;
      }
      loadSize = "large"; // 50-170 ft³: Large furniture
      weightClass = "medium";
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cargo Van";
    } else if (lowerName.includes('mattress')) {
      if (lowerName.includes('king')) {
        itemType = "King-size mattress";
        estimatedWeightLbs = 150;
      } else if (lowerName.includes('queen')) {
        itemType = "Queen-size mattress";
        estimatedWeightLbs = 120;
      } else {
        itemType = "Mattress";
        estimatedWeightLbs = 100;
      }
      loadSize = "large"; // 50-170 ft³: Large item
      weightClass = "medium";
      recommendedMovers = 2;
      recommendedVehicle = "Cargo Van";
    }
    
    // Appliances
    else if (lowerName.includes('fridge') || lowerName.includes('refrigerator')) {
      itemType = lowerName.includes('mini') ? "Mini fridge" : "Refrigerator";
      loadSize = "large"; // 50-170 ft³: Large appliance
      weightClass = "heavy";
      estimatedWeightLbs = lowerName.includes('mini') ? 100 : 550;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    } else if (lowerName.includes('washer') || lowerName.includes('dryer')) {
      itemType = lowerName.includes('washer') ? "Washing machine" : "Dryer";
      loadSize = "large"; // 50-170 ft³: Large appliance
      weightClass = "heavy";
      estimatedWeightLbs = 500;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    } else if (lowerName.includes('appliance') || lowerName.includes('stove') || lowerName.includes('oven')) {
      itemType = "Kitchen appliance";
      loadSize = "large"; // 50-170 ft³: Large appliance
      weightClass = "heavy";
      estimatedWeightLbs = 400;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    } else if (lowerName.includes('treadmill') || lowerName.includes('exercise')) {
      itemType = "Treadmill";
      loadSize = "large"; // 50-170 ft³: Large equipment
      weightClass = "heavy";
      estimatedWeightLbs = 450;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cube Truck";
    }
    
    // Storage & Shelving
    else if (lowerName.includes('dresser') || lowerName.includes('drawer')) {
      itemType = "Dresser";
      loadSize = "large"; // 50-170 ft³: Large furniture
      weightClass = "medium";
      estimatedWeightLbs = 250;
      heavyItem = true;
      recommendedMovers = 2;
      recommendedVehicle = "Cargo Van";
    } else if (lowerName.includes('bookshelf') || lowerName.includes('bookcase')) {
      itemType = "Bookshelf";
      loadSize = "medium"; // 11-50 ft³: Medium furniture
      weightClass = "medium";
      estimatedWeightLbs = 120;
      recommendedMovers = 1;
      recommendedVehicle = "Pickup";
    } else if (lowerName.includes('cabinet') || lowerName.includes('cupboard')) {
      itemType = "Cabinet";
      loadSize = "medium"; // 11-50 ft³: Medium furniture
      weightClass = "medium";
      estimatedWeightLbs = 180;
      recommendedMovers = 2;
      recommendedVehicle = "Pickup";
    }
    
    // Small items & Personal belongings
    else if (lowerName.includes('box') || lowerName.includes('boxes')) {
      itemType = "Moving boxes";
      loadSize = "boxes"; // 1-10 ft³: Boxes category
      weightClass = "light";
      estimatedWeightLbs = 40;
      recommendedMovers = 1;
      recommendedVehicle = "SUV";
    } else if (lowerName.includes('shoe') || lowerName.includes('sneaker') || lowerName.includes('boot')) {
      itemType = "Shoes";
      loadSize = "boxes"; // 1-10 ft³: Very small items
      weightClass = "light";
      estimatedWeightLbs = 5;
      recommendedMovers = 1;
      recommendedVehicle = "Car";
    } else if (lowerName.includes('bag') || lowerName.includes('luggage') || lowerName.includes('suitcase')) {
      itemType = lowerName.includes('suitcase') ? "Suitcase" : (lowerName.includes('backpack') ? "Backpack" : "Bag");
      loadSize = "boxes"; // 1-10 ft³: Very small items
      weightClass = "light";
      estimatedWeightLbs = 15;
      recommendedMovers = 1;
      recommendedVehicle = "Car";
    } else if (lowerName.includes('lamp') || lowerName.includes('light')) {
      itemType = lowerName.includes('floor') || lowerName.includes('standing') ? "Standing lamp" : "Lamp";
      loadSize = "boxes"; // 1-10 ft³: Small items
      weightClass = "light";
      estimatedWeightLbs = 20;
      recommendedMovers = 1;
      recommendedVehicle = "SUV";
    }
    
    // Electronics
    else if (lowerName.includes('tv') || lowerName.includes('television')) {
      itemType = "Television";
      loadSize = "medium"; // 11-50 ft³: Medium electronics
      weightClass = "medium";
      estimatedWeightLbs = 60;
      recommendedMovers = 1;
      recommendedVehicle = "SUV";
    } else if (lowerName.includes('monitor') || lowerName.includes('screen')) {
      itemType = "Monitor";
      loadSize = "boxes"; // 1-10 ft³: Small electronics
      weightClass = "light";
      estimatedWeightLbs = 25;
      recommendedMovers = 1;
      recommendedVehicle = "Car";
    }
    
    return {
      loadSize,
      heavyItem,
      recommendedMovers,
      itemType,
      estimatedWeight,
      weightClass,
      estimatedWeightLbs,
      recommendedVehicle,
      confidence: 75,
      explanation: `Based on image analysis, this appears to be a ${itemType.toLowerCase()} with ${estimatedWeight} weight (~${estimatedWeightLbs} lbs). We recommend ${recommendedMovers} mover${recommendedMovers > 1 ? 's' : ''} and a ${recommendedVehicle} for safe handling.`,
      allowManualOverride: true
    };
  }

  // AI photo analysis endpoint with free mock fallback
  app.post("/api/ai/analyze-photo", upload.single('photo'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No photo uploaded" });
      }
      
      const imagePath = `/uploads/${req.file.filename}`;
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      
      // Try OpenAI Vision API first if key is available
      if (OPENAI_API_KEY) {
        try {
          const fullImageUrl = `${req.protocol}://${req.get('host')}${imagePath}`;
          
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `You are an expert moving estimator analyzing photos of items that need to be moved. Provide SPECIFIC, DETAILED item descriptions.

CRITICAL: Be very specific about what you see. Don't use generic terms like "furniture" or "item".

Examples of GOOD descriptions:
✅ "Queen-size bed frame"
✅ "L-shaped sectional sofa"
✅ "Leather office chair"
✅ "Cardboard moving boxes (3 stacked)"
✅ "Pair of running shoes"
✅ "Large suitcase"
✅ "King-size mattress"
✅ "Wooden dining table (6-seater)"
✅ "Mini fridge"
✅ "Standing lamp"
✅ "Backpack"
✅ "Coffee table (glass top)"

Examples of BAD descriptions (too generic):
❌ "Furniture"
❌ "Item"
❌ "Object"
❌ "Thing"

Analyze the image and determine:
1. **Specific item description** - Be detailed! (e.g., "Sectional sofa", "Queen bed", "Running shoes", "Luggage bag")
2. Load size based on VOLUME (FT³):
   - "boxes": 1-10 ft³ (small personal items: shoes, bags, boxes, lamps, monitors)
   - "medium": 11-50 ft³ (small furniture: chairs, small tables, TVs, bookshelves)
   - "large": 50-170 ft³ (large furniture: sofas, beds, fridges, appliances, dressers, treadmills)
   - "apartment": 170+ ft³ (full room furniture or multiple large items)
3. Is it heavy/fragile requiring special care? (true/false)
4. Recommended movers: 1 or 2
5. Weight category: light (<100 lbs), medium (100-500 lbs), heavy (>500 lbs)
6. Approximate weight in pounds
7. Recommended vehicle: Car, SUV, Pickup, Cargo Van, Cube Truck, or Flatbed

⚠️ STRICT MANDATORY CATEGORIZATION RULES (CANNOT BE OVERRIDDEN):

MUST classify as "large" (50-170 ft³):
- ALL sofas, couches, sectionals, loveseats, futons
- ALL beds, mattresses, bed frames (twin, full, queen, king)
- ALL refrigerators, freezers, fridges
- ALL washers, dryers, dishwashers
- ALL dressers, wardrobes, armoires
- ALL bookcases, bookshelves
- ALL treadmills, ellipticals, exercise equipment

MUST classify as "apartment" (170+ ft³):
- Bedroom sets, living room sets, dining room sets
- Full room furniture or multiple large items

MUST classify as "boxes" (1-10 ft³):
- Shoes, bags, backpacks, suitcases, luggage
- Boxes, lamps, monitors, keyboards
- Books, toys, pillows, cushions

Load Size Classification Guidelines:
- If you see a SOFA, COUCH, SECTIONAL, BED, FRIDGE, DRESSER, or BOOKSHELF → MUST be "large"
- Shoes, bags, boxes, lamps, monitors → "boxes" (1-10 ft³)
- Chairs, small tables, TVs → "medium" (11-50 ft³)
- Full room furniture sets → "apartment" (170+ ft³)

Respond with VALID JSON only:
{
  "loadSize": "boxes" | "medium" | "large" | "apartment",
  "heavyItem": true | false,
  "recommendedMovers": 1 | 2,
  "itemType": "SPECIFIC description here (e.g., 'Queen-size bed', 'Leather sofa', 'Running shoes')",
  "estimatedWeight": "light" | "medium" | "heavy",
  "weightClass": "light" | "medium" | "heavy",
  "estimatedWeightLbs": number,
  "recommendedVehicle": "Car" | "SUV" | "Pickup" | "Cargo Van" | "Cube Truck" | "Flatbed",
  "confidence": 0-100,
  "explanation": "brief explanation with specific item details and volume estimate",
  "allowManualOverride": true
}`
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: fullImageUrl
                      }
                    }
                  ]
                }
              ],
              max_tokens: 500
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            const content = data.choices[0]?.message?.content;
            
            if (content) {
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                let analysis = JSON.parse(jsonMatch[0]);
                
                // ===== STRICT VALIDATION: Enforce mandatory categorization rules =====
                const itemTypeLower = (analysis.itemType || '').toLowerCase();
                
                // Force "large" for specific items (SOFAS, BEDS, FRIDGES, etc.)
                for (const item of STRICT_LARGE_ITEMS) {
                  if (itemTypeLower.includes(item)) {
                    if (analysis.loadSize !== "large" && analysis.loadSize !== "apartment") {
                      console.log(`[AI Validation] Correcting ${analysis.itemType} from "${analysis.loadSize}" to "large" (strict rule)`);
                      analysis.loadSize = "large";
                      analysis.heavyItem = true;
                      analysis.recommendedMovers = 2;
                    }
                    break;
                  }
                }
                
                // Force "apartment" for furniture sets
                for (const item of STRICT_APARTMENT_ITEMS) {
                  if (itemTypeLower.includes(item)) {
                    if (analysis.loadSize !== "apartment") {
                      console.log(`[AI Validation] Correcting ${analysis.itemType} from "${analysis.loadSize}" to "apartment" (strict rule)`);
                      analysis.loadSize = "apartment";
                      analysis.heavyItem = true;
                      analysis.recommendedMovers = 2;
                    }
                    break;
                  }
                }
                
                // Force "boxes" for small items
                for (const item of STRICT_BOXES_ITEMS) {
                  if (itemTypeLower.includes(item)) {
                    if (analysis.loadSize !== "boxes") {
                      console.log(`[AI Validation] Correcting ${analysis.itemType} from "${analysis.loadSize}" to "boxes" (strict rule)`);
                      analysis.loadSize = "boxes";
                      analysis.heavyItem = false;
                      analysis.recommendedMovers = 1;
                    }
                    break;
                  }
                }
                
                return res.json({
                  ...analysis,
                  imageUrl: imagePath
                });
              }
            }
          } else {
            const errorData = await response.json();
            console.log('OpenAI API unavailable, using mock analysis:', errorData.error?.code);
          }
        } catch (openaiError) {
          console.log('OpenAI Vision failed, falling back to mock analysis');
        }
      }
      
      // Fallback to mock analysis
      const mockResult = mockPhotoAnalysis(req.file.size, req.file.originalname);
      
      res.json({
        ...mockResult,
        imageUrl: imagePath
      });
    } catch (error) {
      console.error('Photo analysis error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Analysis failed" });
    }
  });

  // Geocoding distance endpoint for AI auto-quote predictor
  app.post("/api/geocode/distance", async (req: Request, res: Response) => {
    try {
      const distanceSchema = z.object({
        pickupAddress: z.string(),
        dropoffAddress: z.string(),
      });
      
      const { pickupAddress, dropoffAddress } = validateBody(distanceSchema, req.body);
      
      // Use Google Maps Geocoding API and Distance Matrix API for accurate results
      const { geocodeAddress, getDrivingDistance } = await import("./google-maps");
      
      // Geocode both addresses
      const pickupGeo = await geocodeAddress(pickupAddress);
      const dropoffGeo = await geocodeAddress(dropoffAddress);
      
      // Calculate actual driving distance using Google Distance Matrix API
      const result = await getDrivingDistance(pickupGeo.coordinates, dropoffGeo.coordinates);
      
      console.log(`[Distance API] ${pickupAddress} → ${dropoffAddress}: ${result.distanceKm}km (${result.success ? 'Google Maps' : 'Haversine fallback'})`);
      
      res.json({ 
        distance: result.distanceKm,
        durationMinutes: result.durationMinutes,
        success: result.success 
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // ===== SUPPORT TICKET ROUTES =====
  
  // Create a new support ticket
  app.post("/api/support/tickets", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const ticketData = validateBody(insertSupportTicketSchema, req.body);
      ticketData.subject = he.encode(ticketData.subject);
      ticketData.message = he.encode(ticketData.message);

      const ticket = await db.insert(supportTickets).values({
        ...ticketData,
        userId: user.id,
      }).returning();
      
      res.status(201).json(ticket[0]);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create ticket" });
    }
  });
  
  // Get all support tickets for the authenticated user
  app.get("/api/support/tickets", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const tickets = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.userId, user.id))
        .orderBy(supportTickets.createdAt);
      
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });
  
  // Get open/in-progress ticket count for admin notification badge
  app.get("/api/admin/support/open-count", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const openTickets = await db.select({ id: supportTickets.id })
        .from(supportTickets)
        .where(
          sql`${supportTickets.status} IN ('open', 'in_progress')`
        );
      
      res.json({ count: openTickets.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ticket count" });
    }
  });

  // Get all support tickets (admin only)
  app.get("/api/support/tickets/all", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const hasExplicitPagination = req.query.limit !== undefined || req.query.offset !== undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(supportTickets);
      const total = countRow?.total ?? 0;

      const tickets = await db.select({
        id: supportTickets.id,
        userId: supportTickets.userId,
        subject: supportTickets.subject,
        category: supportTickets.category,
        message: supportTickets.message,
        status: supportTickets.status,
        priority: supportTickets.priority,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        resolvedAt: supportTickets.resolvedAt,
        lastStaffReplyAt: supportTickets.lastStaffReplyAt,
        customerLastReadAt: supportTickets.customerLastReadAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userPhone: usersTable.phone,
        userRole: usersTable.role,
      })
        .from(supportTickets)
        .leftJoin(usersTable, eq(supportTickets.userId, usersTable.id))
        .orderBy(supportTickets.createdAt)
        .limit(limit)
        .offset(offset);

      if (hasExplicitPagination) {
        res.json({ data: tickets, total, limit, offset, hasMore: offset + tickets.length < total });
      } else {
        res.json(tickets);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  // Get unread ticket count for customer notifications
  // NOTE: Must be defined BEFORE /api/support/tickets/:id to avoid route conflict
  app.get("/api/support/tickets/unread-count", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      
      // Get all tickets for this user where lastStaffReplyAt > customerLastReadAt
      // or where lastStaffReplyAt exists but customerLastReadAt is null
      const tickets = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.userId, user.id));
      
      // Count tickets with unread staff replies
      const unreadCount = tickets.filter(ticket => {
        if (!ticket.lastStaffReplyAt) return false;
        if (!ticket.customerLastReadAt) return true;
        return ticket.lastStaffReplyAt > ticket.customerLastReadAt;
      }).length;
      
      res.json({ unreadCount });
    } catch (error) {
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });
  
  // Get a specific ticket with replies
  app.get("/api/support/tickets/:id", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const ticket = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, req.params.id))
        .limit(1);
      
      if (!ticket.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      // Check if user owns the ticket or is admin
      if (ticket[0].userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const replies = await db.select()
        .from(supportTicketReplies)
        .where(eq(supportTicketReplies.ticketId, req.params.id))
        .orderBy(supportTicketReplies.createdAt);
      
      res.json({ ticket: ticket[0], replies });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  });
  
  // Add a reply to a ticket
  app.post("/api/support/tickets/:id/replies", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      const replySchema = z.object({
        message: z.string().min(1),
      });
      
      const { message: rawReplyMessage } = validateBody(replySchema, req.body);
      const message = he.encode(rawReplyMessage);

      // Check if ticket exists and user has access
      const ticket = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, req.params.id))
        .limit(1);
      
      if (!ticket.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      if (ticket[0].userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const reply = await db.insert(supportTicketReplies).values({
        ticketId: req.params.id,
        userId: user.id,
        message,
        isStaff: user.role === "admin",
      }).returning();
      
      // Update ticket's updatedAt and set lastStaffReplyAt if admin replied
      const updateData: any = { updatedAt: new Date() };
      if (user.role === "admin") {
        updateData.lastStaffReplyAt = new Date();
        
        // Create in-app notification for the customer when staff replies (non-blocking)
        // Only notify ticket owner, not if admin is replying to their own ticket
        if (ticket[0].userId !== user.id) {
          try {
            await storage.createNotification({
              userId: ticket[0].userId,
              type: 'support_ticket_update',
              title: 'Support Reply',
              message: `Support has replied to your ticket: "${ticket[0].subject}"`,
              actionUrl: `/support/${req.params.id}`,
              isRead: false,
            });
          } catch (notifErr) {
            console.error('Support ticket notification failed:', notifErr);
          }

          // Send email notification to customer
          try {
            const customer = await db.select({
              email: usersTable.email,
              name: usersTable.name,
            })
            .from(usersTable)
            .where(eq(usersTable.id, ticket[0].userId))
            .limit(1);

            if (customer[0]?.email) {
              await sendResendEmail({
                from: EMAIL_SENDERS.SUPPORT,
                replyTo: 'support@lervit.com',
                to: customer[0].email,
                subject: `Re: ${ticket[0].subject}`,
                html: `<div style="font-family:-apple-system,BlinkMacSystemFont,
                                   'Segoe UI',sans-serif;font-size:15px;
                                   line-height:1.6;color:#1a1a1a;
                                   max-width:560px;">
                  <p>Hi ${customer[0].name?.split(' ')[0] ?? 'there'},</p>
                  <p>Our support team has replied to your ticket
                     <strong>"${ticket[0].subject}"</strong>:</p>
                  <div style="background:#f8fafc;border-left:3px solid #2563eb;
                              border-radius:4px;padding:16px;margin:16px 0;
                              color:#374151;font-size:14px;">
                    ${rawReplyMessage}
                  </div>
                  <p>
                    <a href="https://app.lervit.com/support/${req.params.id}"
                       style="background:#2563eb;color:white;
                              padding:10px 20px;border-radius:8px;
                              text-decoration:none;display:inline-block;
                              font-weight:500;font-size:14px;">
                      View Full Conversation →
                    </a>
                  </p>
                  <p style="color:#64748b;font-size:13px;
                            margin-top:24px;border-top:1px solid #e2e8f0;
                            padding-top:16px;">
                    LervIT Support · Calgary, AB<br/>
                    Reply to this email or visit your
                    <a href="https://app.lervit.com/support"
                       style="color:#2563eb;">support portal</a>
                  </p>
                </div>`,
              });

              logger.info({
                ticketId: req.params.id,
                email: customer[0].email
              }, 'Support reply email sent');
            }
          } catch (emailErr) {
            logger.warn({ emailErr },
              'Support reply email failed — non-fatal');
          }
        }
      }
      await db.update(supportTickets)
        .set(updateData)
        .where(eq(supportTickets.id, req.params.id));
      
      res.status(201).json(reply[0]);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to add reply" });
    }
  });
  
  // Update ticket status (admin only)
  app.patch("/api/support/tickets/:id/status", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const statusSchema = z.object({
        status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
        assignedTo: z.string().optional(),
      });
      
      const { status, assignedTo } = validateBody(statusSchema, req.body);
      
      const updateData: any = { 
        status,
        updatedAt: new Date(),
      };
      
      if (status === 'resolved' || status === 'closed') {
        updateData.resolvedAt = new Date();
      }
      
      if (assignedTo) {
        updateData.assignedTo = assignedTo;
      }
      
      const ticket = await db.update(supportTickets)
        .set(updateData)
        .where(eq(supportTickets.id, req.params.id))
        .returning();
      
      if (!ticket.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      res.json(ticket[0]);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update ticket" });
    }
  });

  // Mark a ticket as read by customer
  app.post("/api/support/tickets/:id/mark-read", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const user = (req as any).user;
      
      // Verify user owns this ticket
      const ticket = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, req.params.id))
        .limit(1);
      
      if (!ticket.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      if (ticket[0].userId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Update customerLastReadAt
      await db.update(supportTickets)
        .set({ customerLastReadAt: new Date() })
        .where(eq(supportTickets.id, req.params.id));
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark ticket as read" });
    }
  });

  // AI-powered ticket analysis (admin only)
  app.post("/api/support/tickets/:id/ai-analyze", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const ticketId = req.params.id;
      
      // Get ticket details
      const ticketResult = await db.select()
        .from(supportTickets)
        .where(eq(supportTickets.id, ticketId))
        .limit(1);
      
      if (!ticketResult.length) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      const ticket = ticketResult[0];
      
      // Get ticket replies
      const replies = await db.select()
        .from(supportTicketReplies)
        .where(eq(supportTicketReplies.ticketId, ticketId))
        .orderBy(supportTicketReplies.createdAt);
      
      // Get user details
      const userResult = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, ticket.userId))
        .limit(1);
      
      // Check for cached analysis (less than 1 hour old)
      const existingInsight = await db.select()
        .from(aiSupportInsights)
        .where(eq(aiSupportInsights.ticketId, ticketId))
        .orderBy(aiSupportInsights.createdAt)
        .limit(1);
      
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (existingInsight.length && existingInsight[0].createdAt > oneHourAgo) {
        return res.json({
          ...existingInsight[0],
          cached: true
        });
      }
      
      const startTime = Date.now();
      
      // Run AI analysis
      const analysis = await analyzeTicket({
        ticket,
        replies,
        user: userResult[0]
      });
      
      const processingTime = Date.now() - startTime;
      
      // Store the insight
      const insight = await db.insert(aiSupportInsights).values({
        ticketId,
        summary: analysis.summary,
        category: analysis.category,
        suggestedPriority: analysis.suggestedPriority,
        rootCause: analysis.rootCause,
        recommendations: analysis.recommendations,
        suggestedResponse: analysis.suggestedResponse, // Legacy field
        customerResponse: analysis.customerResponse,   // Customer-friendly response
        internalNotes: analysis.internalNotes,         // Staff-only technical notes
        similarCases: analysis.similarCases,
        confidence: analysis.confidence,
        processingTimeMs: processingTime,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }).returning();
      
      res.json({
        ...insight[0],
        cached: false
      });
    } catch (error) {
      console.error("AI analysis error:", error);
      res.status(500).json({ error: "Failed to analyze ticket" });
    }
  });

  // Get cached AI insight for a ticket (admin only)
  app.get("/api/support/tickets/:id/ai-insight", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const insight = await db.select()
        .from(aiSupportInsights)
        .where(eq(aiSupportInsights.ticketId, req.params.id))
        .orderBy(aiSupportInsights.createdAt)
        .limit(1);
      
      if (!insight.length) {
        return res.status(404).json({ error: "No AI insight available. Click 'Analyze with AI' to generate one." });
      }
      
      res.json(insight[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve AI insight" });
    }
  });

  // Get quick response templates for a category
  app.get("/api/support/quick-responses/:category", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const responses = getQuickResponses(req.params.category);
      res.json(responses);
    } catch (error) {
      res.status(500).json({ error: "Failed to get quick responses" });
    }
  });

  // ===== IN-APP INBOX / NOTIFICATIONS =====
  
  // Get all notifications for the logged-in user
  app.get("/api/inbox", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const limit = parseInt(req.query.limit as string) || 50;
      const notifications = await storage.getNotificationsByUser(user.id, limit);
      
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });
  
  // Get unread notification count
  app.get("/api/inbox/unread-count", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const count = await storage.getUnreadNotificationCount(user.id);
      
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });
  
  // Mark a single notification as read
  app.post("/api/inbox/:id/read", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const notification = await storage.markNotificationAsRead(req.params.id);
      
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      // Verify the notification belongs to the user
      if (notification.userId !== user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      res.json(notification);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });
  
  // Mark all notifications as read
  app.post("/api/inbox/read-all", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      await storage.markAllNotificationsAsRead(user.id);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // ===== MOVER PAYOUT SYSTEM (Uber-style) =====
  
  // Use platform commission from centralized config
  const PLATFORM_COMMISSION_PERCENT = PLATFORM_COMMISSION.DEFAULT_PERCENT;

  // Get mover's Stripe Connect account status
  app.get("/api/movers/payouts/account", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // Get mover profile
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      // Get Stripe Connect account
      const accounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, mover.id))
        .limit(1);
      
      if (!accounts.length) {
        return res.json({
          hasAccount: false,
          onboardingStatus: 'not_started',
          chargesEnabled: false,
          payoutsEnabled: false,
        });
      }
      
      const account = accounts[0];
      
      res.json({
        hasAccount: true,
        stripeAccountId: account.stripeAccountId,
        onboardingStatus: account.onboardingStatus,
        chargesEnabled: account.chargesEnabled,
        payoutsEnabled: account.payoutsEnabled,
        detailsSubmitted: account.detailsSubmitted,
        requirementsDue: account.requirementsDue || [],
        currentlyDue: account.currentlyDue || [],
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get payout account status" });
    }
  });

  // Create Stripe Connect onboarding link for mover
  app.post("/api/movers/payouts/onboarding-link", async (req: Request, res: Response) => {
    console.log("[Payout Onboarding] Request received");
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      console.log("[Payout Onboarding] User authenticated:", user.id);
      
      // Get mover profile
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      // Check if account already exists
      console.log("[Payout Onboarding] Checking for existing Stripe account for mover:", mover.id);
      let stripeAccount;
      const existingAccounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, mover.id))
        .limit(1);
      
      if (existingAccounts.length) {
        stripeAccount = existingAccounts[0];
        console.log("[Payout Onboarding] Found existing account:", stripeAccount.stripeAccountId);
      } else {
        console.log("[Payout Onboarding] Creating new Stripe account...");
        // Pre-fill as much data as possible from mover profile to reduce onboarding friction
        // Parse name into first/last for Stripe's individual profile
        const displayName = user.name || '';
        const nameParts = displayName.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || nameParts[0] || '';
        
        // Clean phone number - remove non-digits but keep for E.164 format
        const cleanPhone = user.phone?.replace(/\D/g, '') || '';
        const formattedPhone = cleanPhone.length === 10 ? `+1${cleanPhone}` : 
                               cleanPhone.length === 11 && cleanPhone.startsWith('1') ? `+${cleanPhone}` : '';
        
        // Build Stripe account with pre-filled data
        const accountParams: any = {
          type: 'express',
          country: 'CA',
          email: user.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: 'individual',
          business_profile: {
            name: displayName || undefined,
            url: 'https://lervit.com', // Pre-fill platform URL so movers don't need their own website
            product_description: 'Professional moving services',
            mcc: '4214', // MCC code for local delivery/courier
          },
          metadata: {
            moverId: mover.id,
            userId: user.id,
          },
        };
        
        // Add individual details if we have name data
        if (firstName) {
          accountParams.individual = {
            first_name: firstName,
            last_name: lastName || firstName,
            email: user.email,
          };
          
          // Add phone if valid
          if (formattedPhone) {
            accountParams.individual.phone = formattedPhone;
          }
        }
        
        // Create new Stripe Express account with pre-filled data
        const account = await stripe.accounts.create(accountParams);
        
        // Save to database
        const [newAccount] = await db.insert(moverStripeAccounts).values({
          moverId: mover.id,
          stripeAccountId: account.id,
          accountType: 'express',
          onboardingStatus: 'pending',
        }).returning();
        
        stripeAccount = newAccount;
      }
      
      // Create account link for onboarding
      console.log("[Payout Onboarding] Creating account link for:", stripeAccount.stripeAccountId);
      const baseUrl = req.headers.origin || `https://${req.headers.host}`;
      console.log("[Payout Onboarding] Base URL:", baseUrl);
      
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccount.stripeAccountId,
        refresh_url: `${baseUrl}/mover-dashboard?payout_refresh=true`,
        return_url: `${baseUrl}/mover-dashboard?payout_success=true`,
        type: 'account_onboarding',
      });
      console.log("[Payout Onboarding] Account link created successfully");
      
      // Update onboarding status
      await db.update(moverStripeAccounts)
        .set({ 
          onboardingStatus: 'in_progress',
          updatedAt: new Date(),
        })
        .where(eq(moverStripeAccounts.id, stripeAccount.id));
      
      console.log("[Payout Onboarding] Sending URL response:", accountLink.url?.substring(0, 50) + "...");
      res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error("Stripe Connect error:", {
        message: error.message,
        type: error.type,
        code: error.code,
        param: error.param,
        detail: error.detail,
        raw: error.raw?.message,
      });
      
      // Provide user-friendly error messages for common Stripe errors
      let userMessage = "Failed to create onboarding link. Please try again.";
      if (error.code === 'account_invalid') {
        userMessage = "There's an issue with the payout account. Please contact support.";
      } else if (error.code === 'rate_limit') {
        userMessage = "Too many requests. Please wait a moment and try again.";
      } else if (error.type === 'StripeInvalidRequestError') {
        userMessage = error.message || "Invalid request. Please contact support.";
      }
      
      res.status(500).json({ error: userMessage, code: error.code });
    }
  });

  // Refresh Stripe account status (sync from Stripe)
  app.post("/api/movers/payouts/refresh-status", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      const accounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, mover.id))
        .limit(1);
      
      if (!accounts.length) {
        return res.status(404).json({ error: "No payout account found" });
      }
      
      const account = accounts[0];
      
      // Fetch latest status from Stripe
      const stripeAccount = await stripe.accounts.retrieve(account.stripeAccountId);
      
      // Update database with latest status
      await db.update(moverStripeAccounts)
        .set({
          chargesEnabled: stripeAccount.charges_enabled,
          payoutsEnabled: stripeAccount.payouts_enabled,
          detailsSubmitted: stripeAccount.details_submitted,
          onboardingStatus: stripeAccount.details_submitted ? 'complete' : 
                           (stripeAccount.requirements?.currently_due?.length ? 'restricted' : 'in_progress'),
          requirementsDue: stripeAccount.requirements?.eventually_due || [],
          currentlyDue: stripeAccount.requirements?.currently_due || [],
          updatedAt: new Date(),
        })
        .where(eq(moverStripeAccounts.id, account.id));
      
      res.json({ 
        success: true,
        chargesEnabled: stripeAccount.charges_enabled,
        payoutsEnabled: stripeAccount.payouts_enabled,
        detailsSubmitted: stripeAccount.details_submitted,
      });
    } catch (error: any) {
      console.error("Stripe refresh error:", error);
      res.status(500).json({ error: error.message || "Failed to refresh status" });
    }
  });

  /**
   * Create Stripe Express Dashboard login link for movers
   * 
   * Allows onboarded movers to access their Stripe Express Dashboard to:
   * - View payout history
   * - Update banking information
   * - Manage tax documents
   * - View earnings reports
   * 
   * Called by: Frontend (mover dashboard)
   * Returns: { url: string } - Redirect URL to Stripe Express Dashboard
   */
  app.get("/api/movers/payouts/login-link", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      const accounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, mover.id))
        .limit(1);
      
      if (!accounts.length) {
        return res.status(404).json({ error: "No payout account found. Please complete onboarding first." });
      }
      
      const account = accounts[0];
      
      if (!account.detailsSubmitted) {
        return res.status(400).json({ 
          error: "Onboarding not complete. Please finish setting up your payout account.",
          needsOnboarding: true
        });
      }
      
      if (!account.chargesEnabled) {
        return res.status(400).json({
          error: "Your account is restricted. Please complete any pending requirements.",
          needsOnboarding: true,
          hasRestrictions: true
        });
      }
      
      try {
        const loginLink = await stripe.accounts.createLoginLink(account.stripeAccountId);
        
        logEvent.payment('express_login_link_created', { moverId: mover.id });
        
        res.json({ url: loginLink.url });
      } catch (stripeError: any) {
        if (stripeError.code === 'account_invalid') {
          return res.status(400).json({
            error: "Your Stripe account is no longer valid. Please contact support.",
            accountInvalid: true
          });
        }
        throw stripeError;
      }
    } catch (error: any) {
      console.error("Stripe login link error:", error);
      res.status(500).json({ error: error.message || "Failed to create dashboard link" });
    }
  });

  // Get mover's payout summary (Uber-style dashboard)
  app.get("/api/movers/payouts/summary", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      // Get all earnings
      const earnings = await db.select()
        .from(moverEarnings)
        .where(eq(moverEarnings.moverId, mover.id));
      
      // Calculate totals
      const pendingEarnings = earnings
        .filter(e => e.status === 'pending')
        .reduce((sum, e) => sum + parseFloat(e.netAmount), 0);
      
      const availableBalance = earnings
        .filter(e => e.status === 'available')
        .reduce((sum, e) => sum + parseFloat(e.netAmount), 0);
      
      const totalPaidOut = earnings
        .filter(e => e.status === 'paid')
        .reduce((sum, e) => sum + parseFloat(e.netAmount), 0);
      
      const totalEarnings = earnings
        .reduce((sum, e) => sum + parseFloat(e.netAmount), 0);
      
      // Get recent payouts
      const recentPayouts = await db.select()
        .from(moverPayouts)
        .where(eq(moverPayouts.moverId, mover.id))
        .orderBy(moverPayouts.createdAt)
        .limit(10);
      
      // Get Stripe account status
      const accounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, mover.id))
        .limit(1);
      
      const payoutAccount = accounts[0];
      
      res.json({
        pendingEarnings: pendingEarnings.toFixed(2),
        availableBalance: availableBalance.toFixed(2),
        totalPaidOut: totalPaidOut.toFixed(2),
        totalEarnings: totalEarnings.toFixed(2),
        completedJobs: earnings.length,
        platformFeePercent: PLATFORM_COMMISSION_PERCENT,
        payoutAccount: payoutAccount ? {
          hasAccount: true,
          payoutsEnabled: payoutAccount.payoutsEnabled,
          onboardingStatus: payoutAccount.onboardingStatus,
        } : { hasAccount: false },
        recentPayouts: recentPayouts.map(p => ({
          id: p.id,
          amount: p.amount,
          status: p.status,
          payoutType: p.payoutType,
          arrivalDate: p.arrivalDate,
          initiatedAt: p.initiatedAt,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get payout summary" });
    }
  });

  // Get mover's earnings history
  app.get("/api/movers/payouts/earnings", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = movers[0];
      
      // Get all earnings with booking details
      const earnings = await db.select()
        .from(moverEarnings)
        .where(eq(moverEarnings.moverId, mover.id))
        .orderBy(moverEarnings.createdAt);
      
      // Enrich with booking data
      const enrichedEarnings = await Promise.all(
        earnings.map(async (earning) => {
          const booking = await storage.getBooking(earning.bookingId);
          const customer = booking ? await storage.getUser(booking.customerId) : null;
          
          return {
            id: earning.id,
            bookingId: earning.bookingId,
            grossAmount: earning.grossAmount,
            platformFeePercent: earning.platformFeePercent,
            platformFeeAmount: earning.platformFeeAmount,
            netAmount: earning.netAmount,
            status: earning.status,
            createdAt: earning.createdAt,
            booking: booking ? {
              pickupAddress: booking.pickupAddress,
              dropoffAddress: booking.dropoffAddress,
              preferredDate: booking.preferredDate,
              loadSize: booking.loadSize,
            } : null,
            customerName: customer?.name || 'Unknown',
            promoCode: booking?.promoCode || null,
            moverBalanceOwed: booking?.moverBalanceOwed || null,
            moverBalancePaid: booking?.moverBalancePaid || null,
          };
        })
      );
      
      res.json(enrichedEarnings);
    } catch (error) {
      res.status(500).json({ error: "Failed to get earnings history" });
    }
  });

  /**
   * Record earnings when job is completed
   * 
   * UBER-STYLE DESTINATION CHARGES:
   * - If payment used destination charge (transfer_data.destination), money was
   *   already split at payment time - no separate transfer needed
   * - Status is 'available' immediately since funds are already with mover
   * 
   * LEGACY PLATFORM CHARGES (Fallback):
   * - If payment was a platform charge (no mover assigned at payment time),
   *   create a Transfer to mover's connected account
   * - Status is 'available' after transfer completes
   */
  async function recordMoverEarnings(bookingId: string, moverId: string, booking: any) {
    // Get commission data from booking (persisted for audit trail)
    const grossAmount = parseFloat(booking.price || '0');
    const platformFeePercent = parseFloat(booking.platformFeePercent || PLATFORM_COMMISSION_PERCENT.toString());
    const platformFeeAmount = parseFloat(booking.platformFeeAmount || (grossAmount * platformFeePercent / 100).toString());
    const netAmount = parseFloat(booking.moverNetAmount || (grossAmount - platformFeeAmount).toString());
    
    // Check if earnings already recorded
    const existing = await db.select()
      .from(moverEarnings)
      .where(eq(moverEarnings.bookingId, bookingId))
      .limit(1);
    
    if (existing.length) {
      return existing[0];
    }
    
    let stripeTransferId: string | undefined;
    let earningsStatus = 'pending';
    
    // Check if this was a destination charge (Uber-style) by checking payment intent metadata
    let wasDestinationCharge = false;
    if (booking.stripePaymentIntentId) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
        wasDestinationCharge = paymentIntent.metadata?.paymentType === 'destination_charge';
        
        if (wasDestinationCharge) {
          // Money was already split at payment time - mark as available immediately
          earningsStatus = 'available';
          stripeTransferId = `destination_charge_${paymentIntent.id}`; // Marker for destination charges
          
          logEvent.payment('destination_charge_earnings_recorded', {
            bookingId,
            moverId,
            paymentIntentId: paymentIntent.id,
            netAmount,
          });
        }
      } catch (err) {
        console.error(`[Earnings] Failed to retrieve PaymentIntent for ${bookingId}:`, err);
      }
    }
    
    // If not a destination charge, try to create a transfer (platform charge flow)
    if (!wasDestinationCharge) {
      // Get mover's Stripe Connect account for transfer
      const moverStripeAccountResult = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, moverId))
        .limit(1);
      
      // Only create transfer if mover has an onboarded Stripe Connect account
      if (moverStripeAccountResult.length > 0 && moverStripeAccountResult[0].payoutsEnabled) {
        const moverStripeAccount = moverStripeAccountResult[0];
        const transferAmountCents = Math.round(netAmount * 100);
        
        try {
          // Get the charge ID from the payment intent to link as source_transaction
          // This ensures funds come from the specific customer payment, not platform balance
          let sourceChargeId: string | undefined;
          if (booking.stripePaymentIntentId) {
            try {
              const pi = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
              if (pi.latest_charge) {
                sourceChargeId = typeof pi.latest_charge === 'string' 
                  ? pi.latest_charge 
                  : pi.latest_charge.id;
              }
            } catch (chargeErr) {
              console.error(`[Earnings] Failed to get charge for source_transaction:`, chargeErr);
            }
          }
          
          // Create Stripe Transfer to mover's connected account
          const transferParams: Stripe.TransferCreateParams = {
            amount: transferAmountCents,
            currency: 'cad',
            destination: moverStripeAccount.stripeAccountId,
            metadata: {
              bookingId,
              moverId,
              grossAmount: grossAmount.toFixed(2),
              platformFee: platformFeeAmount.toFixed(2),
              processedBy: 'booking_completion',
            },
          };
          
          // Link to the source charge so funds come from the specific payment
          if (sourceChargeId) {
            transferParams.source_transaction = sourceChargeId;
          }
          
          const transfer = await circuitBreakers.stripe.execute(() =>
            stripe.transfers.create(transferParams, {
              idempotencyKey: `transfer-${bookingId}-v2`,
            }),
          );
          
          stripeTransferId = transfer.id;
          earningsStatus = 'available';
          
          logEvent.payment('transfer_created', {
            bookingId,
            moverId,
            transferId: transfer.id,
            amount: netAmount,
          });
          
          // Update PaymentIntent metadata to reflect the transfer (merge with existing)
          if (booking.stripePaymentIntentId) {
            try {
              const existingPI = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
              await stripe.paymentIntents.update(booking.stripePaymentIntentId, {
                metadata: {
                  ...existingPI.metadata,
                  stripeTransferId: transfer.id,
                  moverStripeAccountId: moverStripeAccount.stripeAccountId,
                  moverStripeOnboarded: 'true',
                  paymentType: 'platform_charge_with_transfer',
                  transferAmount: (transferAmountCents / 100).toFixed(2),
                  moverId: moverId,
                },
              });
            } catch (metaErr) {
              console.error('[Earnings] Failed to update PaymentIntent metadata:', metaErr);
            }
          }
        } catch (transferError: any) {
          console.error(`[Earnings] Transfer failed for booking ${bookingId}:`, 
            transferError?.type, transferError?.message, transferError?.code);
          logEvent.error('transfer_failed', transferError);
          earningsStatus = 'pending';
        }
      } else {
        logEvent.payment('transfer_skipped', {
          bookingId,
          moverId,
          reason: moverStripeAccountResult.length === 0 
            ? 'No Stripe Connect account' 
            : 'Payouts not enabled - mover onboarding incomplete',
        });
      }
    }
    
    // Insert with retry — if the DB write fails after a successful transfer,
    // reconciliation will pick up the transfer by metadata.bookingId later.
    const earnings = await insertMoverEarningWithRetry({
      moverId,
      bookingId,
      grossAmount: grossAmount.toFixed(2),
      platformFeePercent: platformFeePercent.toFixed(2),
      platformFeeAmount: platformFeeAmount.toFixed(2),
      netAmount: netAmount.toFixed(2),
      stripeTransferId,
      status: earningsStatus,
      availableAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Available after 2 days
    });

    return earnings;
  }

  /**
   * Record enterprise partner earnings when a booking routed to a partner
   * completes. Mirrors recordMoverEarnings.
   *
   * Fee resolution: partner override (partners.platform_fee_percent) → booking
   * absolute fee (bookings.platform_fee_amount if > 0) → booking percent → 15%.
   *
   * Transfer path (only when partner has payouts_enabled):
   *   - Wrap stripe.transfers.create in circuitBreakers.stripe.execute
   *   - idempotencyKey: `partner-transfer-${bookingId}-v1` (deterministic; safe on retry)
   *   - On success: row is inserted/updated with status='paid', stripeTransferId set,
   *     and bookings.partner_stripe_transfer_id set for cross-reference
   *   - On StripeInvalidRequestError (e.g. account restricted): row stored
   *     with status='failed' and failureReason recorded — never optimistically 'paid'
   *   - On any other Stripe error: row stored with status='pending' so the
   *     next account.updated tick or admin retry can re-drive
   *
   * Idempotent on retry: the booking_id UNIQUE constraint routes the second
   * call into an UPDATE, so processing a pending row after onboarding does
   * not violate the unique index.
   */
  async function recordPartnerEarnings(bookingId: string, partnerId: string, booking: any) {
    const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId)).limit(1);
    if (!partner) {
      logEvent.error('partner_earnings_missing_partner', new Error(`Partner ${partnerId} not found for booking ${bookingId}`));
      return null;
    }

    const grossAmount = parseFloat(booking?.price ?? '0');
    const bookingFeePercent = booking?.platformFeePercent != null ? parseFloat(booking.platformFeePercent) : null;
    const bookingFeeAmount  = booking?.platformFeeAmount  != null ? parseFloat(booking.platformFeeAmount)  : null;
    const partnerFeeOverride = partner.platformFeePercent != null ? parseFloat(partner.platformFeePercent as any) : null;

    const calc = calculatePartnerNet(grossAmount, bookingFeePercent, partnerFeeOverride, bookingFeeAmount);

    // If payouts are not yet enabled, persist a pending row and return early.
    // account.updated will re-drive when the partner finishes onboarding.
    if (!partner.stripePayoutsEnabled || !partner.stripeAccountId) {
      const [row] = await db.insert(partnerEarnings).values({
        partnerId,
        bookingId,
        grossAmount: calc.grossAmount.toFixed(2),
        platformFeePercent: calc.platformFeePercent.toFixed(2),
        platformFeeAmount: calc.platformFeeAmount.toFixed(2),
        partnerNetAmount: calc.partnerNet.toFixed(2),
        status: 'pending',
      }).onConflictDoUpdate({
        target: partnerEarnings.bookingId,
        set: {
          grossAmount: calc.grossAmount.toFixed(2),
          platformFeePercent: calc.platformFeePercent.toFixed(2),
          platformFeeAmount: calc.platformFeeAmount.toFixed(2),
          partnerNetAmount: calc.partnerNet.toFixed(2),
          updatedAt: new Date(),
        },
      }).returning();

      logEvent.payment('partner_transfer_skipped', {
        bookingId,
        partnerId,
        reason: partner.stripeAccountId ? 'Payouts not enabled' : 'No Stripe Connect account',
        amount: calc.partnerNet,
      });
      return row;
    }

    // Payouts enabled — attempt transfer via circuit breaker.
    const transferAmountCents = Math.round(calc.partnerNet * 100);

    try {
      const transfer = await circuitBreakers.stripe.execute(() =>
        stripe.transfers.create({
          amount: transferAmountCents,
          currency: 'cad',
          destination: partner.stripeAccountId!,
          transfer_group: bookingId,
          metadata: {
            bookingId,
            partnerId,
            grossAmount: calc.grossAmount.toFixed(2),
            platformFee: calc.platformFeeAmount.toFixed(2),
            processedBy: 'booking_completion',
          },
        }, {
          idempotencyKey: `partner-transfer-${bookingId}-v1`,
        }),
      );

      const [row] = await db.insert(partnerEarnings).values({
        partnerId,
        bookingId,
        grossAmount: calc.grossAmount.toFixed(2),
        platformFeePercent: calc.platformFeePercent.toFixed(2),
        platformFeeAmount: calc.platformFeeAmount.toFixed(2),
        partnerNetAmount: calc.partnerNet.toFixed(2),
        stripeTransferId: transfer.id,
        status: 'paid',
        paidAt: new Date(),
        failureReason: null,
      }).onConflictDoUpdate({
        target: partnerEarnings.bookingId,
        set: {
          grossAmount: calc.grossAmount.toFixed(2),
          platformFeePercent: calc.platformFeePercent.toFixed(2),
          platformFeeAmount: calc.platformFeeAmount.toFixed(2),
          partnerNetAmount: calc.partnerNet.toFixed(2),
          stripeTransferId: transfer.id,
          status: 'paid',
          paidAt: new Date(),
          failureReason: null,
          updatedAt: new Date(),
        },
      }).returning();

      await db.update(bookings)
        .set({ partnerStripeTransferId: transfer.id })
        .where(eq(bookings.id, bookingId));

      logEvent.payment('partner_transfer_created', {
        bookingId,
        partnerId,
        transferId: transfer.id,
        amount: calc.partnerNet,
      });

      return row;
    } catch (err: any) {
      // StripeInvalidRequestError → capability-level failure (destination account
      // restricted, currency mismatch, etc.). Record 'failed' so it does NOT get
      // auto-retried by the onboarding webhook — it needs admin attention first.
      const isInvalidRequest = err?.type === 'StripeInvalidRequestError';
      const status = isInvalidRequest ? 'failed' : 'pending';
      const failureReason = err?.message ? String(err.message).slice(0, 500) : 'Transfer failed';

      const [row] = await db.insert(partnerEarnings).values({
        partnerId,
        bookingId,
        grossAmount: calc.grossAmount.toFixed(2),
        platformFeePercent: calc.platformFeePercent.toFixed(2),
        platformFeeAmount: calc.platformFeeAmount.toFixed(2),
        partnerNetAmount: calc.partnerNet.toFixed(2),
        status,
        failureReason,
      }).onConflictDoUpdate({
        target: partnerEarnings.bookingId,
        set: {
          grossAmount: calc.grossAmount.toFixed(2),
          platformFeePercent: calc.platformFeePercent.toFixed(2),
          platformFeeAmount: calc.platformFeeAmount.toFixed(2),
          partnerNetAmount: calc.partnerNet.toFixed(2),
          status,
          failureReason,
          updatedAt: new Date(),
        },
      }).returning();

      logEvent.payment('partner_transfer_failed', {
        bookingId,
        partnerId,
        status,
        errorType: err?.type ?? 'unknown',
        errorMessage: failureReason,
      });

      return row;
    }
  }

  // Calculate and set commission on booking before completion
  async function calculateBookingCommission(bookingId: string) {
    const booking = await storage.getBooking(bookingId);
    if (!booking) return null;
    
    const grossAmount = parseFloat(booking.price || '0');
    const platformFeePercent = PLATFORM_COMMISSION_PERCENT;
    const platformFeeAmount = grossAmount * (platformFeePercent / 100);
    const moverNetAmount = grossAmount - platformFeeAmount;
    
    // Update booking with commission data for audit trail
    await db.update(bookings)
      .set({
        platformFeePercent: platformFeePercent.toFixed(2),
        platformFeeAmount: platformFeeAmount.toFixed(2),
        moverNetAmount: moverNetAmount.toFixed(2),
      })
      .where(eq(bookings.id, bookingId));
    
    return {
      grossAmount,
      platformFeePercent,
      platformFeeAmount,
      moverNetAmount,
    };
  }

  // Complete a booking and record earnings (mover action)
  app.post("/api/bookings/:id/complete", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const bookingId = req.params.id;
      
      // Get booking
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Verify mover owns this booking
      const movers = await storage.getMovers({ userId: user.id });
      if (!movers.length || booking.moverId !== movers[0].id) {
        return res.status(403).json({ error: "Only the assigned mover can complete this booking" });
      }
      
      if (booking.status === 'completed') {
        return res.status(400).json({ error: "Booking already completed" });
      }
      
      // Allow completion from any active status (including legacy in_transit)
      const validCompletionStatuses = [
        'in_transit', 
        BOOKING_STATUSES.UNLOADING,
        BOOKING_STATUSES.EN_ROUTE_TO_DROPOFF,
        BOOKING_STATUSES.EN_ROUTE_TO_PICKUP,
        BOOKING_STATUSES.LOADING,
        'confirmed' // Allow direct completion for edge cases
      ];
      if (!validCompletionStatuses.includes(booking.status)) {
        return res.status(400).json({ error: `Cannot complete booking with status "${booking.status}"` });
      }
      
      if (booking.paymentStatus !== 'succeeded') {
        return res.status(400).json({ error: "Payment must be completed before marking job as done" });
      }
      
      // Calculate and persist commission on booking for audit trail
      const commission = await calculateBookingCommission(bookingId);
      if (!commission) {
        return res.status(500).json({ error: "Failed to calculate commission" });
      }
      
      // Update booking status to completed
      await storage.updateBooking(bookingId, { status: 'completed', completedAt: new Date() });

      // Get updated booking with commission data for earnings record
      const updatedBooking = await storage.getBooking(bookingId);

      await emitEvent('booking.completed', 'booking', bookingId, {
        moverId: booking.moverId,
        customerId: booking.customerId,
        price: booking.price,
        distanceKm: booking.distance,
        expectedCompletionAt: booking.expectedCompletionAt ?? null,
        slaDeadlineAt: booking.slaDeadlineAt ?? null,
        completedAt: new Date().toISOString(),
        onTime: booking.slaDeadlineAt ? Date.now() <= new Date(booking.slaDeadlineAt).getTime() : null,
      });

      await agentEventBus.emit(
        'booking.completed',
        {
          bookingId,
          customerId: booking.customerId,
          moverId: booking.moverId,
        },
        'system',
      );
      
      // Record earnings using persisted commission data from booking
      const earnings = await recordMoverEarnings(bookingId, booking.moverId!, updatedBooking);

      // If the booking was routed to an enterprise partner, record + settle
      // partner earnings on the same completion event. Non-blocking on the
      // mover-completion response: any transfer failure is captured on the
      // partner_earnings row (status='pending'|'failed') for admin retry.
      if (updatedBooking?.enterprisePartnerId) {
        try {
          await recordPartnerEarnings(bookingId, updatedBooking.enterprisePartnerId, updatedBooking);
        } catch (partnerErr) {
          logEvent.error('partner_earnings_unhandled', partnerErr instanceof Error ? partnerErr : new Error('partner earnings error'), { bookingId, partnerId: updatedBooking.enterprisePartnerId });
        }
      }

      // Increment mover's completed trips AND total moves using SQL to avoid null issues
      const mover = movers[0];
      await db.execute(sql`
        UPDATE movers 
        SET completed_trips = COALESCE(completed_trips, 0) + 1,
            total_moves = COALESCE(total_moves, 0) + 1
        WHERE id = ${mover.id}
      `);
      console.log(`[Complete] Incremented trip count for mover ${mover.id}`);
      
      // Update mover performance record with completion data
      try {
        const existingPerf = await db.select().from(moverPerformanceTable)
          .where(and(
            eq(moverPerformanceTable.bookingId, bookingId),
            eq(moverPerformanceTable.moverId, mover.id)
          ))
          .limit(1);
        
        const completionTime = new Date();
        const acceptedTime = existingPerf[0]?.acceptedAt || booking.acceptedAt;
        const totalMoveMinutes = acceptedTime 
          ? Math.round((completionTime.getTime() - new Date(acceptedTime).getTime()) / 60000)
          : null;
        
        if (existingPerf.length > 0) {
          await db.update(moverPerformanceTable)
            .set({ 
              unloadingCompletedAt: completionTime,
              totalMoveMinutes,
            })
            .where(eq(moverPerformanceTable.id, existingPerf[0].id));
          console.log(`[Performance] Completed: booking ${bookingId}, totalMoveMinutes: ${totalMoveMinutes}`);
        } else {
          await db.insert(moverPerformanceTable).values({
            moverId: mover.id,
            bookingId,
            acceptedAt: booking.acceptedAt || completionTime,
            unloadingCompletedAt: completionTime,
            totalMoveMinutes,
            distanceKm: booking.distance || '0',
          });
          console.log(`[Performance] Created completed record: booking ${bookingId}, totalMoveMinutes: ${totalMoveMinutes}`);
        }
      } catch (perfErr) {
        console.error('[Performance] Completion tracking error:', perfErr);
      }
      
      res.json({
        success: true,
        message: "Job completed! Earnings recorded.",
        earnings: {
          gross: earnings.grossAmount,
          platformFee: earnings.platformFeeAmount,
          net: earnings.netAmount,
          availableAt: earnings.availableAt,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to complete booking" });
    }
  });

  // ===== UTILITY ROUTES =====
  app.post("/api/calculate-price", async (req: Request, res: Response) => {
    try {
      const priceSchema = z.object({
        distance: z.number().positive(),
        loadSize: z.enum(["small", "medium", "large", "full"]),
      });
      
      const { distance, loadSize } = validateBody(priceSchema, req.body);
      
      const loadMultipliers: Record<string, number> = {
        small: 1.0,
        medium: 1.5,
        large: 2.0,
        full: 3.0,
      };
      
      const baseRate = 15; // CAD per km
      const multiplier = loadMultipliers[loadSize];
      
      // Calculate total cost: base rate * distance * load multiplier
      const totalCost = Number((baseRate * distance * multiplier).toFixed(2));
      
      // For display: show base distance cost and load surcharge
      const baseCost = Number((baseRate * distance).toFixed(2));
      const loadSurcharge = Number((totalCost - baseCost).toFixed(2));
      
      res.json({
        distance: Number(distance.toFixed(2)),
        loadSize,
        baseRate,
        baseCost,
        loadSurcharge,
        totalCost
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  // Seed endpoint - ADMIN ONLY, DEVELOPMENT ONLY
  app.post("/api/seed", async (req: Request, res: Response) => {
    try {
      // SECURITY: Block in production environment
      if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ error: "Not found" });
      }
      
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Only admins can seed data
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      // Delete existing test users to avoid conflicts
      const testEmails = [
        "john.doe@example.com",
        "mike.johnson@moveit.com",
        "sarah.chen@moveit.com"
      ];
      
      for (const email of testEmails) {
        const existingUsers = await db.select().from(usersTable).where(eq(usersTable.email, email));
        if (existingUsers.length > 0) {
          const existingUser = existingUsers[0];
          // Delete user's movers first (foreign key constraint)
          const movers = await storage.getMovers({ userId: existingUser.id });
          for (const mover of movers) {
            await db.delete(moversTable).where(eq(moversTable.id, mover.id));
          }
          // Delete user
          await db.delete(usersTable).where(eq(usersTable.id, existingUser.id));
        }
      }
      
      // Create test users with passwords
      const customer1 = await storage.createUser({
        email: "john.doe@example.com",
        password: await hashPassword("password123"),
        name: "John Doe",
        phone: "+1-403-555-0100",
        role: "customer"
      });

      const moverUser1 = await storage.createUser({
        email: "mike.johnson@moveit.com",
        password: await hashPassword("password123"),
        name: "Mike Johnson",
        phone: "+1-403-555-0101",
        role: "mover"
      });

      const moverUser2 = await storage.createUser({
        email: "sarah.chen@moveit.com",
        password: await hashPassword("password123"),
        name: "Sarah Chen",
        phone: "+1-403-555-0102",
        role: "mover"
      });

      // Create movers (Calgary GPS coordinates)
      const mover1 = await storage.createMover({
        userId: moverUser1.id,
        vehicleType: "truck",
        vehicleCapacity: "3000 lbs",
        isVerified: true,
        location: "Calgary, AB",
        latitude: 51.0447,
        longitude: -114.0719,
        bio: "Professional mover with 5+ years experience",
        isAvailable: true
      });

      const mover2 = await storage.createMover({
        userId: moverUser2.id,
        vehicleType: "van",
        vehicleCapacity: "1500 lbs",
        isVerified: true,
        location: "Calgary, AB",
        latitude: 51.0786,
        longitude: -113.9656,
        bio: "Fast and reliable service",
        isAvailable: true
      });

      // Update ratings
      await storage.updateMover(mover1.id, { rating: "4.9", totalMoves: 142 });
      await storage.updateMover(mover2.id, { rating: "4.8", totalMoves: 98 });

      res.json({ message: "Seed data created successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to seed data" });
    }
  });

  // ===== ADMIN: RECOVER BOOKING FROM STRIPE PAYMENT =====
  // Use this when a payment was successful but booking wasn't updated
  app.post("/api/admin/recover-booking", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Only admins can recover bookings
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ error: "Payment intent ID is required (starts with pi_)" });
      }
      
      // Fetch payment intent from Stripe
      let paymentIntent;
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      } catch (stripeErr) {
        return res.status(404).json({ error: "Payment intent not found in Stripe" });
      }
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ 
          error: `Payment not successful. Current status: ${paymentIntent.status}` 
        });
      }
      
      // Try to find booking by payment intent ID
      const existingBookings = await db
        .select()
        .from(bookings)
        .where(eq(bookings.stripePaymentIntentId, paymentIntentId))
        .limit(1);
      
      if (existingBookings.length > 0) {
        const booking = existingBookings[0];
        
        // Booking exists but might not be updated
        if (booking.paymentStatus !== 'succeeded') {
          await storage.updateBooking(booking.id, {
            paymentStatus: 'succeeded',
            status: BOOKING_STATUSES.PENDING,
          });
          
          logEvent.payment('booking_recovered', { 
            bookingId: booking.id, 
            paymentIntentId,
            adminUserId: user.id 
          });
          
          return res.json({ 
            success: true, 
            message: "Booking found and payment status updated",
            bookingId: booking.id,
            previousStatus: booking.status,
            newStatus: 'pending'
          });
        }
        
        return res.json({ 
          success: true, 
          message: "Booking already confirmed with successful payment",
          bookingId: booking.id,
          status: booking.status
        });
      }
      
      // Booking not found - check metadata for bookingId
      const bookingIdFromMetadata = paymentIntent.metadata?.bookingId;
      
      if (bookingIdFromMetadata) {
        // Try to find by booking ID from metadata
        const bookingById = await storage.getBooking(bookingIdFromMetadata);
        
        if (bookingById) {
          await storage.updateBooking(bookingById.id, {
            stripePaymentIntentId: paymentIntentId,
            paymentStatus: 'succeeded',
            status: BOOKING_STATUSES.PENDING,
          });
          
          logEvent.payment('booking_recovered_by_metadata', { 
            bookingId: bookingById.id, 
            paymentIntentId,
            adminUserId: user.id 
          });
          
          return res.json({ 
            success: true, 
            message: "Booking recovered using payment metadata",
            bookingId: bookingById.id
          });
        }
      }
      
      return res.status(404).json({ 
        error: "Could not find matching booking",
        paymentIntentId,
        bookingIdFromMetadata: bookingIdFromMetadata || null,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        suggestion: "Please check if the booking was created. If not, you may need to create one manually and link it."
      });
      
    } catch (error) {
      logEvent.error('admin_recover_booking', error);
      res.status(500).json({ error: "Failed to recover booking" });
    }
  });

  // ===== ADMIN: RESEND JOB NOTIFICATIONS =====
  // Use this to resend job notifications to movers for a pending booking
  app.post("/api/admin/resend-job-notifications", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Only admins can resend notifications
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { bookingId } = req.body;
      
      if (!bookingId) {
        return res.status(400).json({ error: "Booking ID is required" });
      }
      
      // Get the booking
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Only resend for bookings that are not completed or cancelled
      if (booking.status === 'completed' || booking.status === 'cancelled') {
        return res.status(400).json({ 
          error: "Cannot resend notifications for completed or cancelled bookings",
          currentStatus: booking.status
        });
      }
      
      // Only resend for bookings with future or today's date
      const bookingDate = new Date(booking.preferredDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      bookingDate.setHours(0, 0, 0, 0);
      
      if (bookingDate < today) {
        return res.status(400).json({ 
          error: "Cannot resend notifications for past bookings. This booking was scheduled for " + new Date(booking.preferredDate).toLocaleDateString('en-US', { timeZone: 'America/Edmonton' }),
          preferredDate: booking.preferredDate
        });
      }
      
      // Delete any existing pending notifications for this booking
      await db.delete(jobNotifications).where(eq(jobNotifications.bookingId, bookingId));
      
      // Reset booking to pending state so the customer sees "Awaiting Mover"
      // and movers see the job as available (not already claimed)
      await storage.updateBooking(bookingId, {
        status: 'pending',
        moverId: null,
      });
      
      // Fetch the latest booking state (after the status reset above)
      const freshBooking = await storage.getBooking(bookingId);
      if (!freshBooking) {
        return res.status(404).json({ error: "Booking not found after reset" });
      }

      // Dispatch using the shared pipeline (strict vehicle enforcement, AC-1 through AC-10)
      const dispatchResult = await dispatchJobToMovers(freshBooking);

      if (dispatchResult.dispatched === 0) {
        return res.status(404).json({
          error: `No available ${dispatchResult.requiredVehicle} movers found. This ${booking.loadSize} move requires a ${dispatchResult.requiredVehicle}. Please ensure a mover with the correct vehicle type is online and available.`,
          requiredVehicle: dispatchResult.requiredVehicle,
          loadSize: booking.loadSize,
        });
      }

      logEvent.booking('job_notifications_resent', {
        bookingId,
        adminUserId: user.id,
        moversNotified: dispatchResult.dispatched,
        vehicleType: dispatchResult.requiredVehicle,
        loadSize: booking.loadSize,
      });

      res.json({
        success: true,
        message: `Job notifications sent to ${dispatchResult.dispatched} ${dispatchResult.requiredVehicle} mover(s)`,
        bookingId,
        requiredVehicle: dispatchResult.requiredVehicle,
        notifiedMovers: dispatchResult.dispatched,
      });
      
    } catch (error) {
      logEvent.error('admin_resend_notifications', error);
      res.status(500).json({ error: "Failed to resend job notifications" });
    }
  });

  // ===== ADMIN: MANUAL MOVER ASSIGNMENT =====
  // Allows admin to manually assign a mover to a booking
  app.post("/api/admin/bookings/:bookingId/assign-mover", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      // SECURITY: Only admins can manually assign movers
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { bookingId } = req.params;
      const { moverId } = req.body;
      
      if (!moverId) {
        return res.status(400).json({ error: "Mover ID is required" });
      }
      
      // Get the booking
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Get the mover
      const mover = await storage.getMover(moverId);
      if (!mover) {
        return res.status(404).json({ error: "Mover not found" });
      }
      
      // Get mover's user info
      const moverUser = await storage.getUser(mover.userId);
      if (!moverUser) {
        return res.status(404).json({ error: "Mover user not found" });
      }
      
      // Update the booking with the mover + SLA fields
      const adminSla = computeBookingSla(booking);
      const updatedBooking = await storage.updateBooking(bookingId, {
        moverId: moverId,
        status: 'confirmed', // 'confirmed' is the canonical "mover accepted" status
        expectedCompletionAt: adminSla.expectedCompletionAt,
        slaDeadlineAt: adminSla.slaDeadlineAt,
      });

      await emitEvent('booking.assigned', 'booking', bookingId, {
        moverId,
        customerId: booking.customerId,
        assignedBy: 'admin_manual',
        expectedCompletionAt: adminSla.expectedCompletionAt.toISOString(),
        slaDeadlineAt: adminSla.slaDeadlineAt.toISOString(),
        estimatedMinutes: adminSla.estimatedMinutes,
      });

      // Clear any pending job notifications for this booking
      await db.delete(jobNotifications).where(eq(jobNotifications.bookingId, bookingId));
      
      // Create an accepted notification record so the mover appears in analytics/leaderboard
      const { calculateExpiryTime } = await import("@shared/matching");
      await storage.createJobNotification({
        bookingId: bookingId,
        moverId: moverId,
        distanceToPickup: "0",
        estimatedEarnings: (parseFloat(booking.price || '0')).toFixed(2),
        status: 'accepted',
        expiresAt: calculateExpiryTime(10080), // far future — admin assignments don't expire
      });
      
      // Notify the mover about the assignment (best-effort — don't fail the request if WS is down)
      try {
        moverWebSocket.notifyMover(mover.userId, {
          type: 'job_notification',
          bookingId: booking.id,
          pickupAddress: booking.pickupAddress,
          dropoffAddress: booking.dropoffAddress,
          price: booking.price?.toString(),
          data: { message: 'You have been assigned a new job by admin' },
        });
      } catch (wsErr) {
        logger.warn({ bookingId, moverId, error: (wsErr as Error).message }, 'admin_assign_mover: WS notify failed (non-fatal)');
      }
      
      // Send SMS to mover
      if (moverUser.phone) {
        await notificationService.sendJobAssignment(
          moverUser,
          booking,
          (parseFloat(booking.price || '0') * 0.85).toFixed(2), // 85% earnings
          '0' // No distance calculation for manual assignment
        );
      }

      // Redundant direct SMS — sendJobAssignment can silently swallow SMS failures;
      // this second call mirrors auto-dispatch (dispatch.ts) and surfaces errors via logger.
      try {
        if (moverUser.phone) {
          await notificationService.sendSMS({
            to: moverUser.phone,
            message: `LervIT New Job Assigned: Move on ${formatCalgaryDate(booking.preferredDate)}. Pickup: ${booking.pickupAddress} → ${booking.dropoffAddress}. Open LervIT to confirm.`,
            type: 'booking_update',
          });
        } else {
          logger.warn({ moverId: mover.id }, 'Mover has no phone — SMS skipped on manual assignment');
        }
      } catch (err) {
        logger.error({ err, moverId: mover.id }, 'SMS failed on manual assignment');
        // Do not throw — assignment already succeeded
      }

      // Create in-app notification for mover
      await storage.createNotification({
        userId: mover.userId,
        type: 'job_assigned',
        title: 'New Job Assigned',
        message: `You have been assigned a move from ${booking.pickupAddress} to ${booking.dropoffAddress}`,
        bookingId: booking.id,
      });
      
      // Also notify the customer
      const customer = await storage.getUser(booking.customerId);
      if (customer) {
        await storage.createNotification({
          userId: customer.id,
          type: 'mover_assigned',
          title: 'Mover Assigned',
          message: `${moverUser.name} has been assigned to your move`,
          bookingId: booking.id,
        });
      }
      
      logEvent.booking('admin_manual_assignment', {
        bookingId,
        moverId,
        moverName: moverUser.name,
        adminUserId: user.id,
      });
      
      res.json({
        success: true,
        message: `${moverUser.name} has been assigned to this booking`,
        booking: updatedBooking,
        mover: {
          id: mover.id,
          name: moverUser.name,
          phone: moverUser.phone,
          vehicleType: mover.vehicleType,
        }
      });
      
    } catch (error) {
      logEvent.error('admin_manual_assignment', error);
      res.status(500).json({ error: "Failed to assign mover" });
    }
  });

  // Get list of available movers for admin assignment dropdown
  app.get("/api/admin/available-movers", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      if (user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      // Get all movers who are available
      const availableMovers = await db.select().from(moversTable).where(eq(moversTable.isAvailable, true));
      
      // Get user details for each mover
      const moversWithDetails = await Promise.all(
        availableMovers.map(async (mover) => {
          const moverUser = await storage.getUser(mover.userId);
          const vehicleClass = vehicleClassFromVehicleType(mover.vehicleType);
          return {
            id: mover.id,
            userId: mover.userId,
            name: moverUser?.name || 'Unknown',
            phone: moverUser?.phone || '',
            vehicleType: mover.vehicleType,
            vehicleClass,
            vehicleCapacityRange: VEHICLE_CAPACITY_RANGES[vehicleClass],
            rating: mover.rating,
            totalMoves: mover.totalMoves,
            isVerified: mover.isVerified,
          };
        })
      );

      res.json(moversWithDetails);
    } catch (error) {
      logEvent.error('admin_get_available_movers', error);
      res.status(500).json({ error: "Failed to get available movers" });
    }
  });

  // ===== REAL-TIME LOCATION TRACKING =====
  
  // Update mover's current location during active trip
  app.post("/api/bookings/:bookingId/location", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const { bookingId } = req.params;
      const { latitude, longitude } = req.body;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ error: "Latitude and longitude are required" });
      }
      
      // Verify booking exists and is in transit
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // SECURITY: Verify the user is the assigned mover
      if (!booking.moverId) {
        return res.status(403).json({ error: "No mover assigned to this booking" });
      }
      
      const mover = await storage.getMover(booking.moverId);
      if (!mover || mover.userId !== user.id) {
        return res.status(403).json({ error: "You are not authorized to update location for this booking" });
      }
      
      // Allow location updates for all active statuses (en_route, loading, unloading, etc.)
      if (!ACTIVE_STATUSES.includes(booking.status as any)) {
        return res.status(400).json({ error: "Location updates only allowed during active trip statuses" });
      }
      
      // Update location
      const updatedBooking = await storage.updateBooking(bookingId, {
        currentLatitude: latitude,
        currentLongitude: longitude,
        locationUpdatedAt: new Date()
      });
      
      res.json({
        success: true,
        location: {
          latitude: updatedBooking?.currentLatitude,
          longitude: updatedBooking?.currentLongitude,
          updatedAt: updatedBooking?.locationUpdatedAt
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to update location" });
    }
  });
  
  // Get current location for tracking
  app.get("/api/bookings/:bookingId/location", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      
      const { bookingId } = req.params;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // SECURITY: Verify the user is either the customer or the mover for this booking
      const isCustomer = booking.customerId === user.id;
      const isMover = booking.moverId && (await storage.getMover(booking.moverId))?.userId === user.id;
      const isAdmin = user?.role === "admin";
      
      if (!isCustomer && !isMover && !isAdmin) {
        return res.status(403).json({ error: "You are not authorized to view this booking's location" });
      }
      
      let moverData = null;
      if (booking.moverId) {
        const mover = await storage.getMover(booking.moverId);
        if (mover) {
          const moverUser = await storage.getUser(mover.userId);
          moverData = {
            name: moverUser?.name || "Your mover",
            phone: moverUser?.phone || "",
            vehicleType: mover.vehicleType || "",
            rating: mover.rating ?? 0,
            vehiclePhoto: mover.vehiclePhoto || null,
            profilePhoto: mover.vehiclePhoto || null,
          };
        }
      }

      res.json({
        bookingId: booking.id,
        status: booking.status,
        pickup: {
          address: booking.pickupAddress,
          latitude: booking.pickupLatitude,
          longitude: booking.pickupLongitude
        },
        dropoff: {
          address: booking.dropoffAddress,
          latitude: booking.dropoffLatitude,
          longitude: booking.dropoffLongitude
        },
        currentLocation: booking.currentLatitude && booking.currentLongitude ? {
          latitude: booking.currentLatitude,
          longitude: booking.currentLongitude,
          updatedAt: booking.locationUpdatedAt
        } : null,
        mover: moverData,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch location" });
    }
  });

  // ===== AI PRODUCT IDENTIFIER ROUTES =====
  
  // POST /api/ai/items/identify - Identify items from photos (ASYNC mode for performance)
  // Creates pending items immediately and processes in background
  // Supports pre-booking identification (without bookingId) or post-booking identification (with bookingId)
  app.post("/api/ai/items/identify", async (req: Request, res: Response) => {
    try {
      const { bookingId, photoUrls, async: useAsync = true } = req.body;
      
      if (!photoUrls || !Array.isArray(photoUrls) || photoUrls.length === 0) {
        return res.status(400).json({ error: "photoUrls array required" });
      }
      
      const user = (req as any).user;
      
      // If bookingId provided, require authentication and verify ownership
      if (bookingId) {
        if (!requireUser(req, res)) return;
        const booking = await storage.getBooking(bookingId);
        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }
        if (booking.customerId !== user?.id && user?.role !== 'admin') {
          return res.status(403).json({ error: "Not authorized" });
        }
      }
      
      // ASYNC MODE (default): Create pending items and queue for background processing
      // This returns immediately, preventing the request from blocking
      if (useAsync && bookingId) {
        const { visionQueue } = await import('./vision-queue');
        
        console.log(`[Vision Engine 2.0] ASYNC: Queueing ${photoUrls.length} photos for background processing`);
        
        const items: any[] = [];
        
        for (const photoUrl of photoUrls) {
          // Create pending item in database
          const pendingItem = await storage.createIdentifiedItem({
            bookingId,
            photoUrl,
            processingStatus: 'pending',
          });
          
          // Queue for background processing
          await visionQueue.enqueue(pendingItem.id, bookingId, photoUrl);
          
          items.push(pendingItem);
        }
        
        // Return immediately with pending items
        return res.json({
          success: true,
          async: true,
          items,
          message: `${photoUrls.length} photo(s) queued for analysis. Results will appear shortly.`,
          summary: {
            total: photoUrls.length,
            pending: photoUrls.length,
            successful: 0,
            failed: 0,
          },
        });
      }
      
      // SYNC MODE: Process photos synchronously (for pre-booking or explicit sync requests)
      // Import Vision Engine 2.0 (dynamic to avoid loading on startup)
      const { identifyItemV2, toIdentificationResult } = await import('./vision-engine-v2');
      
      console.log(`[Vision Engine 2.0] SYNC: Processing ${photoUrls.length} photos in parallel...`);
      const startTime = Date.now();
      
      // Process ALL photos in parallel for speed using Vision Engine 2.0
      const results = await Promise.allSettled(
        photoUrls.map(async (photoUrl: string, i: number) => {
          console.log(`[Vision Engine 2.0] Starting photo ${i + 1}/${photoUrls.length}: ${photoUrl}`);
          const v2Result = await identifyItemV2(photoUrl);
          // Convert to legacy format for backward compatibility
          const result = toIdentificationResult(v2Result);
          console.log(`[Vision Engine 2.0] Completed photo ${i + 1}: ${result.itemName} (${v2Result.source})`);
          return { photoUrl, result, index: i };
        })
      );
      
      const processingTime = Date.now() - startTime;
      console.log(`[Vision Engine 2.0] All ${photoUrls.length} photos processed in ${processingTime}ms`);
      
      // Collect results
      const items: any[] = [];
      const errors: any[] = [];
      
      for (const settled of results) {
        if (settled.status === 'fulfilled') {
          const { photoUrl, result, index } = settled.value;
          
          if (bookingId) {
            const identifiedItem = await storage.createIdentifiedItem({
              bookingId,
              photoUrl,
              processingStatus: 'completed',
              itemName: result.itemName,
              category: result.category,
              weightKg: result.weightKg.toString() as any,
              dimensionsLcm: result.dimensionsLcm.toString() as any,
              dimensionsWcm: result.dimensionsWcm.toString() as any,
              dimensionsHcm: result.dimensionsHcm.toString() as any,
              volumeCuft: result.volumeCuft.toString() as any,
              handlingComplexity: result.handlingComplexity,
              premiumKey: result.premiumKey ?? null,
              vehicleType: result.vehicleType,
              recommendedMovers: result.recommendedMovers,
              insuranceLevel: result.insuranceLevel,
              confidence: result.confidence.toString() as any,
              sourceMetadata: result.sourceMetadata,
            });
            items.push(identifiedItem);
          } else {
            items.push({
              id: `temp-${index}`,
              photoUrl,
              processingStatus: 'completed',
              itemName: result.itemName,
              category: result.category,
              weightKg: result.weightKg.toString(),
              dimensionsLcm: result.dimensionsLcm.toString(),
              dimensionsWcm: result.dimensionsWcm.toString(),
              dimensionsHcm: result.dimensionsHcm.toString(),
              volumeCuft: result.volumeCuft.toString(),
              estimatedPrice: result.estimatedPrice.toString(),
              handlingComplexity: result.handlingComplexity,
              premiumKey: result.premiumKey ?? null,
              vehicleType: result.vehicleType,
              recommendedMovers: result.recommendedMovers,
              insuranceLevel: result.insuranceLevel,
              confidence: result.confidence.toString(),
              sourceMetadata: result.sourceMetadata,
            });
          }
        } else {
          const error = settled.reason;
          const photoUrl = photoUrls[results.indexOf(settled)];
          console.error(`[Vision Engine 2.0] Error processing photo:`, error);
          
          items.push({
            id: `temp-${results.indexOf(settled)}`,
            photoUrl,
            processingStatus: 'failed',
            errorMessage: error?.message || 'Unknown error',
          });
          
          errors.push({
            photoUrl,
            error: error?.message || 'Unknown error',
          });
        }
      }
      
      res.json({
        success: true,
        async: false,
        items,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          total: photoUrls.length,
          successful: items.filter(i => i.processingStatus === 'completed').length,
          failed: errors.length,
        },
      });
    } catch (error: any) {
      console.error('[Vision Engine 2.0] Route error:', error);
      res.status(500).json({ error: "Failed to identify items" });
    }
  });
  
  // GET /api/ai/items/:bookingId - Get identified items for a booking
  app.get("/api/ai/items/:bookingId", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const { bookingId } = req.params;
      
      // Verify booking exists and user has access
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const user = (req as any).user;
      const isMover = booking.moverId && (await storage.getMover(booking.moverId))?.userId === user.id;
      
      if (booking.customerId !== user.id && !isMover && user.role !== 'admin') {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const items = await storage.getIdentifiedItemsByBooking(bookingId);
      res.json(items);
    } catch (error) {
      console.error('[AI Identifier] Get items error:', error);
      res.status(500).json({ error: "Failed to fetch identified items" });
    }
  });
  
  // POST /api/ai/items/:bookingId/save - Save pre-analyzed items to a booking (idempotent)
  app.post("/api/ai/items/:bookingId/save", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const { bookingId } = req.params;
      const { items } = req.body;
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array required" });
      }
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const user = (req as any).user;
      if (booking.customerId !== user.id && user.role !== 'admin') {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Idempotency: skip if items already exist for this booking
      const existingItems = await storage.getIdentifiedItemsByBooking(bookingId);
      if (existingItems.length > 0) {
        return res.json({ saved: 0, items: existingItems, message: "Items already saved" });
      }
      
      const savedItems = [];
      for (const item of items) {
        if (!item.photoUrl || typeof item.photoUrl !== 'string') continue;
        if (!item.itemName || typeof item.itemName !== 'string') continue;
        
        const saved = await storage.createIdentifiedItem({
          bookingId,
          photoUrl: item.photoUrl,
          processingStatus: 'completed',
          itemName: item.itemName,
          category: typeof item.category === 'string' ? item.category : null,
          weightKg: item.weightKg != null ? String(item.weightKg) : null,
          dimensionsLcm: item.dimensionsLcm != null ? String(item.dimensionsLcm) : null,
          dimensionsWcm: item.dimensionsWcm != null ? String(item.dimensionsWcm) : null,
          dimensionsHcm: item.dimensionsHcm != null ? String(item.dimensionsHcm) : null,
          volumeCuft: item.volumeCuft != null ? String(item.volumeCuft) : null,
          handlingComplexity: typeof item.handlingComplexity === 'string' ? item.handlingComplexity : null,
          premiumKey: typeof item.premiumKey === 'string' ? item.premiumKey : null,
          vehicleType: typeof item.vehicleType === 'string' ? item.vehicleType : null,
          recommendedMovers: typeof item.recommendedMovers === 'number' ? item.recommendedMovers : 1,
          insuranceLevel: typeof item.insuranceLevel === 'string' ? item.insuranceLevel : null,
          confidence: item.confidence != null ? String(item.confidence) : null,
          sourceMetadata: typeof item.sourceMetadata === 'string' ? item.sourceMetadata : null,
        } as any);
        savedItems.push(saved);
      }
      
      console.log(`[AI Items] Saved ${savedItems.length} pre-analyzed items for booking ${bookingId}`);
      res.json({ saved: savedItems.length, items: savedItems });
    } catch (error) {
      console.error('[AI Items] Save error:', error);
      res.status(500).json({ error: "Failed to save items" });
    }
  });
  
  // PATCH /api/ai/items/:itemId - Manual override for identified item
  app.patch("/api/ai/items/:itemId", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      
      const { itemId } = req.params;
      const updates = req.body;
      
      // Get the item to verify ownership
      const items = await db.select().from(identifiedItems).where(eq(identifiedItems.id, itemId)).limit(1);
      const item = items[0];
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Verify booking ownership
      const booking = await storage.getBooking(item.bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const user = (req as any).user;
      if (booking.customerId !== user.id && user.role !== 'admin') {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Update item
      const updated = await storage.updateIdentifiedItem(itemId, updates);
      res.json(updated);
    } catch (error) {
      console.error('[AI Identifier] Update item error:', error);
      res.status(500).json({ error: "Failed to update item" });
    }
  });

  // Admin: Cleanup bookings with broken/missing images
  app.delete("/api/admin/cleanup-broken-bookings", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Find bookings with NULL/empty images OR old /uploads/ paths (which don't persist after deploy)
      const allBookingsResult = await storage.getAllBookings({ limit: 200 });
      const brokenBookings = allBookingsResult.data.filter((b: any) => {
        // CRITICAL SAFETY: NEVER delete bookings that have payment intents (customer may have paid)
        if (b.stripePaymentIntentId) return false;
        // CRITICAL SAFETY: NEVER delete bookings with succeeded payments
        if (b.paymentStatus === 'succeeded') return false;
        
        if (!b.images || b.images.length === 0) return true;
        // Check if any image uses old /uploads/ path (not cloud storage)
        return b.images.some((img: string) => img.startsWith('/uploads/') && !img.startsWith('/objects/'));
      });
      
      if (brokenBookings.length === 0) {
        return res.json({ message: "No broken bookings found", deleted: 0 });
      }
      
      const bookingIds = brokenBookings.map((b: any) => b.id);
      
      // Delete related records first (FK constraints) - order matters!
      for (const bookingId of bookingIds) {
        // Delete from all tables with FK to bookings
        await db.delete(jobNotifications).where(eq(jobNotifications.bookingId, bookingId));
        await db.delete(messages).where(eq(messages.bookingId, bookingId));
        await db.delete(reviews).where(eq(reviews.bookingId, bookingId));
        await db.delete(identifiedItems).where(eq(identifiedItems.bookingId, bookingId));
        await db.delete(aiRuns).where(eq(aiRuns.bookingId, bookingId));
      }
      
      // Delete the bookings
      for (const bookingId of bookingIds) {
        await db.delete(bookings).where(eq(bookings.id, bookingId));
      }
      
      res.json({ 
        message: `Cleaned up ${brokenBookings.length} bookings with broken images`,
        deleted: brokenBookings.length 
      });
    } catch (error) {
      console.error('[Admin] Cleanup error:', error);
      res.status(500).json({ error: "Failed to cleanup bookings" });
    }
  });

  // Admin: Cancel all past-dated bookings (manual trigger for cleanup)
  app.post("/api/admin/cancel-past-dated", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // All active statuses that should be cancelled if past-dated
      const activeStatuses = [
        'pending', 
        'confirmed', 
        'pending_payment',
        'en_route_to_pickup',
        'loading',
        'en_route_to_dropoff',
        'unloading',
        'in_transit'
      ];
      
      const pastBookings = await db
        .update(bookings)
        .set({ 
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(bookings.status, activeStatuses),
            lt(bookings.preferredDate, today)
          )
        )
        .returning({ id: bookings.id, preferredDate: bookings.preferredDate, status: bookings.status });
      
      res.json({ 
        message: `Cancelled ${pastBookings.length} past-dated bookings`,
        cancelled: pastBookings.length,
        bookings: pastBookings.map(b => ({ id: b.id.slice(0, 8), date: b.preferredDate }))
      });
    } catch (error) {
      console.error('[Admin] Cancel past-dated error:', error);
      res.status(500).json({ error: "Failed to cancel past-dated bookings" });
    }
  });

  // ===== LEARNING INTELLIGENCE SYSTEM (Vision Engine™ & PrecisionMatch™) =====
  
  // Submit post-move metrics (customer or mover)
  app.post("/api/bookings/:bookingId/metrics", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const { bookingId } = req.params;
      
      // Verify booking exists and is completed
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Verify user has permission (customer, assigned mover, or admin)
      const isCustomer = booking.customerId === user.id;
      const isMover = booking.moverId && (await storage.getMover(booking.moverId))?.userId === user.id;
      const isAdmin = user.role === 'admin';
      
      if (!isCustomer && !isMover && !isAdmin) {
        return res.status(403).json({ error: "Not authorized to submit metrics for this booking" });
      }
      
      // Check if metrics already exist
      const existingMetrics = await db.select().from(bookingMetricsTable).where(eq(bookingMetricsTable.bookingId, bookingId)).limit(1);
      
      const metricsData: Record<string, any> = {
        bookingId,
        // Estimated values from booking
        estimatedPrice: booking.price,
        estimatedVehicleClass: mapLoadSizeToClass(booking.loadSize),
        // Actuals from request
        actualVehicleClass: req.body.actualVehicleClass,
        actualVolumeCuft: req.body.actualVolumeCuft,
        actualDurationMinutes: req.body.actualDurationMinutes,
        actualPrice: req.body.actualPrice,
        // Customer feedback
        customerSatisfactionRating: isCustomer ? req.body.satisfactionRating : undefined,
        estimateAccuracyRating: isCustomer ? req.body.estimateAccuracyRating : undefined,
        customerNotes: isCustomer ? req.body.notes : undefined,
        // Mover feedback
        moverDifficultyRating: isMover ? req.body.difficultyRating : undefined,
        moverNotes: isMover ? req.body.notes : undefined,
        loadingTimeMinutes: isMover ? req.body.loadingTimeMinutes : undefined,
        unloadingTimeMinutes: isMover ? req.body.unloadingTimeMinutes : undefined,
      };
      
      // Calculate accuracy if both estimated and actual values exist
      if (metricsData.estimatedPrice && metricsData.actualPrice) {
        const estimated = parseFloat(metricsData.estimatedPrice);
        const actual = parseFloat(metricsData.actualPrice);
        metricsData.priceAccuracyPercent = ((1 - Math.abs(estimated - actual) / estimated) * 100).toFixed(2);
      }
      
      if (metricsData.estimatedVehicleClass && metricsData.actualVehicleClass) {
        metricsData.vehicleClassMatch = metricsData.estimatedVehicleClass === metricsData.actualVehicleClass;
      }
      
      let result;
      if (existingMetrics.length > 0) {
        // Update existing metrics
        const updated = await db.update(bookingMetricsTable)
          .set({ ...metricsData as any, updatedAt: new Date() })
          .where(eq(bookingMetricsTable.bookingId, bookingId))
          .returning();
        result = updated[0];
      } else {
        // Create new metrics
        const inserted = await db.insert(bookingMetricsTable).values(metricsData as any).returning();
        result = inserted[0];
      }
      
      console.log(`[Learning] Metrics submitted for booking ${bookingId} by ${user.role}`);
      res.json(result);
    } catch (error) {
      console.error('[Learning] Metrics submission error:', error);
      res.status(500).json({ error: "Failed to submit metrics" });
    }
  });
  
  // Helper function to map load size to vehicle class (uses global pricing config)
  function mapLoadSizeToClass(loadSize: string): string {
    // Import from shared pricing module for consistency
    const { getVehicleClassFromLoadSize } = require('@shared/pricing');
    return getVehicleClassFromLoadSize(loadSize);
  }
  
  // Submit item feedback for Vision Engine™ learning
  app.post("/api/identified-items/:itemId/feedback", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const { itemId } = req.params;
      
      // Get the item
      const items = await db.select().from(identifiedItems).where(eq(identifiedItems.id, itemId)).limit(1);
      const item = items[0];
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Verify booking ownership
      const booking = await storage.getBooking(item.bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const isCustomer = booking.customerId === user.id;
      const isMover = booking.moverId && (await storage.getMover(booking.moverId))?.userId === user.id;
      const isAdmin = user.role === 'admin';
      
      if (!isCustomer && !isMover && !isAdmin) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Create item feedback
      const feedbackData = {
        identifiedItemId: itemId,
        bookingId: item.bookingId,
        submittedBy: user.id,
        submitterRole: user.role,
        // Original values from AI
        originalItemName: item.itemName,
        originalCategory: item.category,
        originalWeightKg: item.weightKg,
        originalVolumeCuft: item.volumeCuft,
        originalVehicleType: item.vehicleType,
        // Corrected values from user
        correctedItemName: req.body.correctedItemName,
        correctedCategory: req.body.correctedCategory,
        correctedWeightKg: req.body.correctedWeightKg,
        correctedVolumeCuft: req.body.correctedVolumeCuft,
        correctedVehicleType: req.body.correctedVehicleType,
        feedbackReason: req.body.feedbackReason,
        feedbackNotes: req.body.feedbackNotes,
      };
      
      const inserted = await db.insert(itemFeedbackTable).values(feedbackData).returning();
      
      console.log(`[Vision Engine™ Learning] Feedback submitted for item ${itemId} by ${user.role}`);
      res.json(inserted[0]);
    } catch (error) {
      console.error('[Vision Engine™] Feedback error:', error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });
  
  // Get learning insights (admin only)
  app.get("/api/learning/insights", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get aggregate metrics
      const allMetrics = await db.select().from(bookingMetricsTable);
      const allFeedback = await db.select().from(itemFeedbackTable);
      const allPerformance = await db.select().from(moverPerformanceTable);
      
      // Calculate Vision Engine accuracy
      const feedbackWithCorrections = allFeedback.filter(f => f.correctedItemName || f.correctedCategory);
      const visionAccuracy = feedbackWithCorrections.length > 0 
        ? ((allFeedback.length - feedbackWithCorrections.length) / allFeedback.length * 100).toFixed(1)
        : 100;
      
      // Calculate price accuracy
      const metricsWithPrice = allMetrics.filter(m => m.priceAccuracyPercent);
      const avgPriceAccuracy = metricsWithPrice.length > 0
        ? (metricsWithPrice.reduce((sum, m) => sum + parseFloat(m.priceAccuracyPercent || '0'), 0) / metricsWithPrice.length).toFixed(1)
        : null;
      
      // Calculate vehicle class match rate
      const metricsWithVehicle = allMetrics.filter(m => m.vehicleClassMatch !== null);
      const vehicleMatchRate = metricsWithVehicle.length > 0
        ? ((metricsWithVehicle.filter(m => m.vehicleClassMatch).length / metricsWithVehicle.length) * 100).toFixed(1)
        : null;
      
      // Calculate average ratings
      const customerRatings = allMetrics.filter(m => m.customerSatisfactionRating);
      const avgSatisfaction = customerRatings.length > 0
        ? (customerRatings.reduce((sum, m) => sum + (m.customerSatisfactionRating || 0), 0) / customerRatings.length).toFixed(1)
        : null;
      
      // Get top correction reasons
      const reasonCounts: Record<string, number> = {};
      allFeedback.forEach(f => {
        if (f.feedbackReason) {
          reasonCounts[f.feedbackReason] = (reasonCounts[f.feedbackReason] || 0) + 1;
        }
      });
      
      const topCorrectionReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));
      
      res.json({
        visionEngine: {
          totalItemsAnalyzed: allFeedback.length,
          accuracyPercent: visionAccuracy,
          feedbackReceived: feedbackWithCorrections.length,
          topCorrectionReasons,
        },
        pricingAccuracy: {
          totalBookingsAnalyzed: allMetrics.length,
          avgAccuracyPercent: avgPriceAccuracy,
          vehicleClassMatchRate: vehicleMatchRate,
        },
        customerSatisfaction: {
          totalRatings: customerRatings.length,
          avgRating: avgSatisfaction,
        },
        moverPerformance: {
          totalRecords: allPerformance.length,
          avgTotalMoveMinutes: allPerformance.length > 0
            ? Math.round(allPerformance.reduce((sum, p) => sum + (p.totalMoveMinutes || 0), 0) / allPerformance.length)
            : null,
        },
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Learning] Insights error:', error);
      res.status(500).json({ error: "Failed to get learning insights" });
    }
  });
  
  // Get booking metrics (for displaying on completed booking page)
  app.get("/api/bookings/:bookingId/metrics", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const { bookingId } = req.params;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Verify access
      const isCustomer = booking.customerId === user.id;
      const isMover = booking.moverId && (await storage.getMover(booking.moverId))?.userId === user.id;
      const isAdmin = user.role === 'admin';
      
      if (!isCustomer && !isMover && !isAdmin) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const metrics = await db.select().from(bookingMetricsTable).where(eq(bookingMetricsTable.bookingId, bookingId)).limit(1);
      
      if (metrics.length === 0) {
        return res.json(null);
      }
      
      res.json(metrics[0]);
    } catch (error) {
      console.error('[Learning] Get metrics error:', error);
      res.status(500).json({ error: "Failed to get metrics" });
    }
  });

  // ===== ADMIN: SYNC MOVER TRIP COUNTERS =====
  // One-time sync to update completedTrips and totalMoves based on actual completed bookings
  app.post("/api/admin/sync-mover-counters", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get before state for all movers
      const beforeState = await db.select({
        id: moversTable.id,
        completedTrips: moversTable.completedTrips
      }).from(moversTable);
      
      // Get booking counts
      const statusCounts = await db
        .select({
          status: bookings.status,
          count: sql<number>`COUNT(*)::int`
        })
        .from(bookings)
        .groupBy(bookings.status);
      
      const completedCounts = await db
        .select({
          moverId: bookings.moverId,
          count: sql<number>`COUNT(*)::int`
        })
        .from(bookings)
        .where(and(
          eq(bookings.status, 'completed'),
          eq(bookings.paymentStatus, 'succeeded')
        ))
        .groupBy(bookings.moverId);
      
      console.log('[Admin Sync] Completed bookings by mover:', completedCounts);
      
      // FORCE UPDATE using direct SQL - bypass all JavaScript comparison
      // First, reset all movers to 0
      await db.execute(sql`UPDATE movers SET completed_trips = 0, total_moves = 0`);
      
      // Then set the correct counts for movers with completed bookings
      let updatedCount = 0;
      const updates: { moverId: string; newTrips: number }[] = [];
      
      for (const row of completedCounts) {
        if (row.moverId && row.count > 0) {
          await db.execute(sql`
            UPDATE movers 
            SET completed_trips = ${row.count}, total_moves = ${row.count}
            WHERE id = ${row.moverId}
          `);
          updates.push({ moverId: row.moverId, newTrips: row.count });
          updatedCount++;
          console.log(`[Admin Sync] Set mover ${row.moverId} to ${row.count} trips`);
        }
      }
      
      // Get after state
      const afterState = await db.select({
        id: moversTable.id,
        completedTrips: moversTable.completedTrips
      }).from(moversTable);
      
      res.json({
        success: true,
        message: `Force synced ${updatedCount} mover(s) with completed bookings. All other movers reset to 0.`,
        updates,
        diagnostics: {
          totalMovers: beforeState.length,
          bookingStatusCounts: statusCounts,
          completedByMover: completedCounts,
          beforeState,
          afterState
        }
      });
    } catch (error) {
      console.error('[Admin] Sync mover counters error:', error);
      res.status(500).json({ error: "Failed to sync mover counters" });
    }
  });

  // ===== ADMIN: BACKFILL MISSING MOVER EARNINGS =====
  // Creates mover_earnings records for completed bookings that don't have them
  app.post("/api/admin/backfill-mover-earnings", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get all completed bookings with movers assigned
      const completedBookings = await db.select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, 'completed'),
            sql`${bookings.moverId} IS NOT NULL`
          )
        );
      
      // Get existing earnings records
      const existingEarnings = await db.select({ bookingId: moverEarnings.bookingId })
        .from(moverEarnings);
      
      const existingBookingIds = new Set(existingEarnings.map(e => e.bookingId));
      
      // Find bookings missing earnings
      const missingBookings = completedBookings.filter(b => !existingBookingIds.has(b.id));
      
      if (missingBookings.length === 0) {
        return res.json({ 
          success: true, 
          message: "All completed bookings already have earnings records",
          created: 0
        });
      }
      
      const created: { bookingId: string; moverId: string; netAmount: string }[] = [];
      
      for (const booking of missingBookings) {
        if (!booking.moverId || !booking.price) continue;

        const grossAmount = parseFloat(booking.price);
        const bookingFee = booking.platformFeeAmount ? parseFloat(booking.platformFeeAmount) : 0;
        const platformFeeAmount = bookingFee > 0
          ? bookingFee
          : grossAmount * (PLATFORM_COMMISSION_PERCENT / 100);
        const platformFeePercent = grossAmount > 0
          ? (platformFeeAmount / grossAmount) * 100
          : PLATFORM_COMMISSION_PERCENT;
        const netAmount = grossAmount - platformFeeAmount;

        try {
          await db.insert(moverEarnings).values({
            id: crypto.randomUUID(),
            bookingId: booking.id,
            moverId: booking.moverId,
            grossAmount: grossAmount.toFixed(2),
            platformFeePercent: platformFeePercent.toFixed(2),
            platformFeeAmount: platformFeeAmount.toFixed(2),
            netAmount: netAmount.toFixed(2),
            status: 'pending',
            availableAt: new Date(),
            createdAt: new Date(),
          });
          
          created.push({
            bookingId: booking.id,
            moverId: booking.moverId,
            netAmount: netAmount.toFixed(2)
          });
        } catch (err) {
          console.error(`[Admin] Failed to create earnings for booking ${booking.id}:`, err);
        }
      }
      
      res.json({
        success: true,
        message: `Created ${created.length} missing earnings records`,
        created
      });
    } catch (error) {
      console.error('[Admin] Backfill earnings error:', error);
      res.status(500).json({ error: "Failed to backfill earnings" });
    }
  });

  // ===== ADMIN: MARK EARNINGS AS MANUALLY PAID =====
  // For cases where payment was made outside Stripe (bank transfer, e-transfer, etc.)
  app.post("/api/admin/mark-manually-paid", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { earningsIds, reference } = req.body;
      
      if (!earningsIds || !Array.isArray(earningsIds) || earningsIds.length === 0) {
        return res.status(400).json({ error: "earningsIds array is required" });
      }
      
      const updated: { earningsId: string; moverId: string; amount: string }[] = [];
      const failed: { earningsId: string; reason: string }[] = [];
      
      for (const earningsId of earningsIds) {
        try {
          // Get the earning record
          const earning = await db.select()
            .from(moverEarnings)
            .where(eq(moverEarnings.id, earningsId))
            .limit(1);
          
          if (earning.length === 0) {
            failed.push({ earningsId, reason: 'Earning record not found' });
            continue;
          }
          
          if (earning[0].status === 'paid') {
            failed.push({ earningsId, reason: 'Already marked as paid' });
            continue;
          }
          
          // Update to paid status with manual reference
          const referenceNote = reference || `manual_bank_transfer_${new Date().toISOString().slice(0,10)}`;
          
          await db.update(moverEarnings)
            .set({
              status: 'paid',
              stripeTransferId: referenceNote,
              paidAt: new Date(),
            })
            .where(eq(moverEarnings.id, earningsId));
          
          updated.push({
            earningsId,
            moverId: earning[0].moverId,
            amount: earning[0].netAmount,
          });
          
          logEvent.payment('manual_payout_marked', {
            earningsId,
            moverId: earning[0].moverId,
            amount: earning[0].netAmount,
            reference: referenceNote,
            adminId: (req.session as any)?.userId,
          });
        } catch (err) {
          console.error(`[Admin] Failed to mark earning ${earningsId} as paid:`, err);
          failed.push({ earningsId, reason: 'Database update failed' });
        }
      }
      
      const totalPaid = updated.reduce((sum, u) => sum + parseFloat(u.amount), 0);
      
      res.json({
        success: true,
        message: `Marked ${updated.length} earnings as manually paid ($${totalPaid.toFixed(2)})`,
        updated,
        failed,
      });
    } catch (error) {
      console.error('[Admin] Mark manually paid error:', error);
      res.status(500).json({ error: "Failed to mark earnings as paid" });
    }
  });

  // ===== ADMIN: PROCESS PENDING MOVER PAYOUTS =====
  // Transfers money from LervIT's Stripe account to movers for pending earnings
  app.post("/api/admin/process-pending-payouts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get all pending earnings
      const pendingEarnings = await db.select()
        .from(moverEarnings)
        .where(eq(moverEarnings.status, 'pending'));
      
      if (pendingEarnings.length === 0) {
        return res.json({
          success: true,
          message: "No pending payouts to process",
          processed: 0,
          failed: 0
        });
      }
      
      const processed: { earningsId: string; moverId: string; amount: string; transferId: string }[] = [];
      const failed: { earningsId: string; moverId: string; reason: string }[] = [];
      const skipped: { earningsId: string; moverId: string; reason: string }[] = [];
      
      for (const earning of pendingEarnings) {
        // Get mover's Stripe connected account
        const moverAccounts = await db.select()
          .from(moverStripeAccounts)
          .where(eq(moverStripeAccounts.moverId, earning.moverId))
          .limit(1);
        
        if (moverAccounts.length === 0) {
          skipped.push({
            earningsId: earning.id,
            moverId: earning.moverId,
            reason: 'No Stripe account connected'
          });
          continue;
        }
        
        const moverAccount = moverAccounts[0];
        
        if (!moverAccount.chargesEnabled || !moverAccount.payoutsEnabled) {
          skipped.push({
            earningsId: earning.id,
            moverId: earning.moverId,
            reason: 'Stripe account not fully verified'
          });
          continue;
        }
        
        const netAmountCents = Math.round(parseFloat(earning.netAmount) * 100);
        
        try {
          // Get the charge ID from the booking's payment intent for source_transaction
          let sourceChargeId: string | undefined;
          const bookingData = await storage.getBooking(earning.bookingId);
          if (bookingData?.stripePaymentIntentId) {
            try {
              const pi = await stripe.paymentIntents.retrieve(bookingData.stripePaymentIntentId);
              if (pi.latest_charge) {
                sourceChargeId = typeof pi.latest_charge === 'string' 
                  ? pi.latest_charge 
                  : pi.latest_charge.id;
              }
            } catch (chargeErr) {
              console.error(`[Admin Payout] Failed to get charge for source_transaction:`, chargeErr);
            }
          }
          
          // Create Stripe Transfer to mover's connected account
          const transferParams: Stripe.TransferCreateParams = {
            amount: netAmountCents,
            currency: 'cad',
            destination: moverAccount.stripeAccountId,
            metadata: {
              earningsId: earning.id,
              bookingId: earning.bookingId,
              moverId: earning.moverId,
              processedBy: 'admin_batch_payout',
            },
          };
          
          if (sourceChargeId) {
            transferParams.source_transaction = sourceChargeId;
          }
          
          const transfer = await circuitBreakers.stripe.execute(() =>
            stripe.transfers.create(transferParams, {
              idempotencyKey: `batch-payout-${earning.id}-v1`,
            }),
          );

          // Create mover_payouts audit row for the transfer
          const paidAt = new Date();
          let payoutRowId: string | null = null;
          try {
            const [payoutRow] = await db.insert(moverPayouts).values({
              moverId: earning.moverId,
              stripePayoutId: transfer.id,
              amount: earning.netAmount,
              currency: 'cad',
              status: 'paid',
              payoutType: 'standard',
              initiatedAt: paidAt,
              completedAt: paidAt,
            }).returning({ id: moverPayouts.id });
            payoutRowId = payoutRow?.id ?? null;
          } catch (payoutErr) {
            console.error(`[Admin Payout] Failed to insert mover_payouts row for earning ${earning.id}:`, payoutErr);
          }

          // Update earnings status to paid — retry to prevent divergence.
          // Transfer already succeeded; reconciliation heals the row if the
          // DB write ultimately fails.
          await updateMoverEarningWithRetry(
            { id: earning.id, stripeTransferId: transfer.id, bookingId: earning.bookingId },
            {
              status: 'paid',
              stripeTransferId: transfer.id,
              paidAt,
              ...(payoutRowId ? { payoutId: payoutRowId } : {}),
            },
          );

          processed.push({
            earningsId: earning.id,
            moverId: earning.moverId,
            amount: earning.netAmount,
            transferId: transfer.id
          });

          console.log(`[Admin Payout] Transferred $${earning.netAmount} to mover ${earning.moverId} (transfer: ${transfer.id})`);
        } catch (err: any) {
          console.error(`[Admin Payout] Failed to transfer for earnings ${earning.id}:`, err);
          failed.push({
            earningsId: earning.id,
            moverId: earning.moverId,
            reason: err.message || 'Transfer failed'
          });
        }
      }
      
      // Second pass: promote 'available' rows that already have a
      // stripeTransferId (auto-transferred on completion) to 'paid'. Without
      // this, rows created by recordMoverEarnings never advance past
      // 'available' until transfer.paid arrives (and that webhook was
      // previously unhandled — see FIX 1).
      const availableEarnings = await db.select()
        .from(moverEarnings)
        .where(and(
          eq(moverEarnings.status, 'available'),
          isNotNull(moverEarnings.stripeTransferId),
        ));

      for (const earning of availableEarnings) {
        try {
          await db.update(moverEarnings)
            .set({ status: 'paid', paidAt: new Date() })
            .where(eq(moverEarnings.id, earning.id));
          processed.push({
            earningsId: earning.id,
            moverId: earning.moverId,
            amount: earning.netAmount,
            transferId: earning.stripeTransferId ?? '',
          });
        } catch (err: any) {
          failed.push({
            earningsId: earning.id,
            moverId: earning.moverId,
            reason: err?.message || 'available→paid update failed',
          });
        }
      }

      const totalPaid = processed.reduce((sum, p) => sum + parseFloat(p.amount), 0);

      res.json({
        success: true,
        message: `Processed ${processed.length} payouts, ${failed.length} failed, ${skipped.length} skipped`,
        totalPaid: totalPaid.toFixed(2),
        processed,
        failed,
        skipped
      });
    } catch (error) {
      console.error('[Admin] Process pending payouts error:', error);
      res.status(500).json({ error: "Failed to process pending payouts" });
    }
  });

  // ===== ADMIN: RECONCILE MOVER_EARNINGS WITH STRIPE =====
  // Pulls the last 30d of transfers from Stripe and heals any local rows
  // whose status/stripeTransferId diverged (e.g. webhook missed, DB write
  // failed after transfer.create). Safe to run repeatedly.
  app.post("/api/admin/reconcile-stripe-payouts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
      const summary = { checked: 0, updated: 0, alreadyCorrect: 0, notFound: 0 };
      const notFoundDetails: Array<{ transferId: string; bookingId?: string; amount: number }> = [];

      // Paginate through Stripe transfers (limit 100 per page).
      let startingAfter: string | undefined = undefined;
      while (true) {
        const page: Stripe.ApiList<Stripe.Transfer> = await circuitBreakers.stripe.execute(() =>
          stripe.transfers.list({
            limit: 100,
            created: { gte: since },
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          }),
        );

        for (const transfer of page.data) {
          summary.checked += 1;

          // Primary: match by stripeTransferId
          const byTransferId = await db.select()
            .from(moverEarnings)
            .where(eq(moverEarnings.stripeTransferId, transfer.id))
            .limit(1);

          if (byTransferId.length > 0) {
            const row = byTransferId[0];
            if (row.status === 'paid') {
              summary.alreadyCorrect += 1;
            } else {
              await db.update(moverEarnings)
                .set({ status: 'paid', paidAt: row.paidAt ?? new Date() })
                .where(eq(moverEarnings.id, row.id));
              summary.updated += 1;
              logEvent.payment('reconcile_marked_paid_by_transfer_id', {
                earningId: row.id,
                transferId: transfer.id,
                previousStatus: row.status,
              });
            }
            continue;
          }

          // Fallback: match by metadata.bookingId (covers rows created before
          // the transferId was persisted).
          const bookingId = transfer.metadata?.bookingId;
          if (bookingId) {
            const byBookingId = await db.select()
              .from(moverEarnings)
              .where(eq(moverEarnings.bookingId, bookingId))
              .limit(1);
            if (byBookingId.length > 0) {
              const row = byBookingId[0];
              if (row.status === 'paid' && row.stripeTransferId === transfer.id) {
                summary.alreadyCorrect += 1;
              } else {
                await db.update(moverEarnings)
                  .set({
                    stripeTransferId: transfer.id,
                    status: 'paid',
                    paidAt: row.paidAt ?? new Date(),
                  })
                  .where(eq(moverEarnings.id, row.id));
                summary.updated += 1;
                logEvent.payment('reconcile_marked_paid_by_booking_id', {
                  earningId: row.id,
                  transferId: transfer.id,
                  bookingId,
                  previousStatus: row.status,
                });
              }
              continue;
            }
          }

          // No local row matches this Stripe transfer — surface for admin.
          summary.notFound += 1;
          notFoundDetails.push({
            transferId: transfer.id,
            bookingId: bookingId ?? undefined,
            amount: transfer.amount / 100,
          });
        }

        if (!page.has_more || page.data.length === 0) break;
        startingAfter = page.data[page.data.length - 1].id;
      }

      logEvent.payment('reconcile_completed', summary);
      res.json({ success: true, ...summary, notFoundDetails });
    } catch (error: any) {
      console.error('[Admin] Reconcile Stripe payouts error:', error);
      res.status(500).json({ error: error?.message || 'Failed to reconcile Stripe payouts' });
    }
  });

  // ===== ADMIN: GET PENDING PAYOUTS SUMMARY =====
  // View all pending payouts before processing
  app.get("/api/admin/pending-payouts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get all pending earnings with mover info
      const pendingEarnings = await db.select()
        .from(moverEarnings)
        .where(eq(moverEarnings.status, 'pending'));
      
      // Get mover Stripe account status for each
      const payoutSummary = [];
      let totalPending = 0;
      let readyToPay = 0;
      let needsStripeSetup = 0;
      let noStripeAccount = 0;
      let unverified = 0;
      const noStripeMovers = new Set<string>();
      const unverifiedMovers = new Set<string>();

      for (const earning of pendingEarnings) {
        const moverAccounts = await db.select()
          .from(moverStripeAccounts)
          .where(eq(moverStripeAccounts.moverId, earning.moverId))
          .limit(1);

        const hasStripeAccount = moverAccounts.length > 0;
        const isReady = hasStripeAccount && moverAccounts[0].chargesEnabled && moverAccounts[0].payoutsEnabled;

        const netAmount = parseFloat(earning.netAmount);
        totalPending += netAmount;

        if (isReady) {
          readyToPay += netAmount;
        } else {
          needsStripeSetup += netAmount;
          if (!hasStripeAccount) {
            noStripeAccount += netAmount;
            noStripeMovers.add(earning.moverId);
          } else {
            unverified += netAmount;
            unverifiedMovers.add(earning.moverId);
          }
        }
        
        // Get mover name
        const mover = await db.select().from(moversTable).where(eq(moversTable.id, earning.moverId)).limit(1);
        const moverUser = mover.length > 0 ? await storage.getUser(mover[0].userId) : null;
        
        payoutSummary.push({
          earningsId: earning.id,
          bookingId: earning.bookingId,
          moverId: earning.moverId,
          moverName: moverUser?.name || 'Unknown',
          grossAmount: earning.grossAmount,
          platformFee: earning.platformFeeAmount,
          netAmount: earning.netAmount,
          hasStripeAccount,
          isReadyToPay: isReady,
          createdAt: earning.createdAt,
        });
      }
      
      res.json({
        success: true,
        totalPending: totalPending.toFixed(2),
        readyToPay: readyToPay.toFixed(2),
        needsStripeSetup: needsStripeSetup.toFixed(2),
        noStripeAccount: noStripeAccount.toFixed(2),
        noStripeAccountCount: noStripeMovers.size,
        unverified: unverified.toFixed(2),
        unverifiedCount: unverifiedMovers.size,
        count: pendingEarnings.length,
        payouts: payoutSummary
      });
    } catch (error) {
      console.error('[Admin] Get pending payouts error:', error);
      res.status(500).json({ error: "Failed to get pending payouts" });
    }
  });

  // ===== ADMIN: GET ALL MOVER EARNINGS =====
  // Returns all mover earnings records for reconciliation, including completed bookings missing earnings records
  app.get("/api/admin/mover-earnings", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get existing earnings records
      const earnings = await db.select()
        .from(moverEarnings)
        .orderBy(desc(moverEarnings.createdAt));
      
      // Get completed bookings with movers that DON'T have earnings records yet
      const existingBookingIds = new Set(earnings.map(e => e.bookingId));
      
      const completedBookings = await db.select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, 'completed'),
            inArray(bookings.paymentStatus, ['paid', 'succeeded']),
            sql`${bookings.moverId} IS NOT NULL`
          )
        )
        .orderBy(desc(bookings.createdAt));
      
      // Convert completed bookings without earnings to a compatible format
      const missingEarnings = completedBookings
        .filter(b => !existingBookingIds.has(b.id))
        .map(b => {
          const grossAmount = Number(b.price) || 0;
          const bookingFee = b.platformFeeAmount ? parseFloat(b.platformFeeAmount) : 0;
          const platformFeeAmount = bookingFee > 0
            ? bookingFee
            : Math.round(grossAmount * 15) / 100;
          const platformFeePercent = grossAmount > 0
            ? (platformFeeAmount / grossAmount) * 100
            : 15;
          const netAmount = grossAmount - platformFeeAmount;

          return {
            id: `missing-${b.id}`,
            moverId: b.moverId,
            bookingId: b.id,
            grossAmount: grossAmount.toFixed(2),
            platformFeePercent: platformFeePercent.toFixed(2),
            platformFeeAmount: platformFeeAmount.toFixed(2),
            netAmount: netAmount.toFixed(2),
            stripeTransferId: null,
            status: 'needs_backfill' as const,
            availableAt: null,
            paidAt: null,
            payoutId: null,
            createdAt: b.createdAt,
            _isMissing: true,  // Flag for frontend
          };
        });
      
      // Combine and sort by date
      const allEarnings = [...earnings, ...missingEarnings].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      res.json(allEarnings);
    } catch (error) {
      console.error('[Admin] Get mover earnings error:', error);
      res.status(500).json({ error: "Failed to get mover earnings" });
    }
  });

  // ===== ADMIN: PARTNER PAYOUTS =====
  // Mirrors the mover admin payout endpoints. Partner earnings are populated
  // by recordPartnerEarnings on booking completion; these endpoints let ops
  // list them and retry failed/pending transfers.

  // List partner earnings with the owning partner + booking snapshot.
  // Query params: status, partnerId, from (ISO), to (ISO).
  app.get("/api/admin/partner-payouts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const conditions: any[] = [];
      if (typeof req.query.status === 'string' && req.query.status.length) {
        conditions.push(eq(partnerEarnings.status, req.query.status));
      }
      if (typeof req.query.partnerId === 'string' && req.query.partnerId.length) {
        conditions.push(eq(partnerEarnings.partnerId, req.query.partnerId));
      }
      if (typeof req.query.from === 'string' && req.query.from.length) {
        const d = new Date(req.query.from);
        if (!isNaN(d.getTime())) conditions.push(sql`${partnerEarnings.createdAt} >= ${d}`);
      }
      if (typeof req.query.to === 'string' && req.query.to.length) {
        const d = new Date(req.query.to);
        if (!isNaN(d.getTime())) conditions.push(sql`${partnerEarnings.createdAt} <= ${d}`);
      }

      const rows = await db.select({
        earning: partnerEarnings,
        partner: {
          id: partners.id,
          name: partners.name,
          legalName: partners.legalName,
          stripeAccountId: partners.stripeAccountId,
          stripePayoutsEnabled: partners.stripePayoutsEnabled,
        },
        booking: {
          id: bookings.id,
          price: bookings.price,
          pickupAddress: bookings.pickupAddress,
          dropoffAddress: bookings.dropoffAddress,
          enterpriseStatus: bookings.enterpriseStatus,
          partnerStripeTransferId: bookings.partnerStripeTransferId,
        },
      })
        .from(partnerEarnings)
        .leftJoin(partners, eq(partners.id, partnerEarnings.partnerId))
        .leftJoin(bookings, eq(bookings.id, partnerEarnings.bookingId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(partnerEarnings.createdAt))
        .limit(500);

      res.json(rows.map(r => ({ ...r.earning, partner: r.partner, booking: r.booking })));
    } catch (error) {
      console.error('[Admin] partner-payouts list error:', error);
      res.status(500).json({ error: "Failed to load partner payouts" });
    }
  });

  // Batch process all pending partner earnings. Mirrors the mover batch endpoint.
  // Skips rows where the owning partner does not have stripePayoutsEnabled.
  app.post("/api/admin/partner-payouts/process", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const pending = await db.select().from(partnerEarnings)
        .where(eq(partnerEarnings.status, 'pending'));

      const processed: Array<{ earningsId: string; partnerId: string; transferId: string; amount: string }> = [];
      const failed: Array<{ earningsId: string; partnerId: string; reason: string }> = [];
      const skipped: Array<{ earningsId: string; partnerId: string; reason: string }> = [];

      for (const earning of pending) {
        const booking = await storage.getBooking(earning.bookingId);
        if (!booking || (booking.paymentStatus !== 'succeeded' && booking.paymentStatus !== 'paid')) {
          skipped.push({ earningsId: earning.id, partnerId: earning.partnerId, reason: 'Booking not paid' });
          continue;
        }
        try {
          const row = await recordPartnerEarnings(earning.bookingId, earning.partnerId, booking);
          if (row?.status === 'paid') {
            processed.push({
              earningsId: earning.id,
              partnerId: earning.partnerId,
              transferId: row.stripeTransferId ?? '',
              amount: row.partnerNetAmount,
            });
          } else if (row?.status === 'failed') {
            failed.push({ earningsId: earning.id, partnerId: earning.partnerId, reason: row.failureReason ?? 'Transfer failed' });
          } else {
            skipped.push({ earningsId: earning.id, partnerId: earning.partnerId, reason: 'Payouts not enabled' });
          }
        } catch (err: any) {
          failed.push({ earningsId: earning.id, partnerId: earning.partnerId, reason: err?.message ?? 'Unknown error' });
        }
      }

      const totalPaid = processed.reduce((s, p) => s + parseFloat(p.amount || '0'), 0);
      res.json({ success: true, processed, failed, skipped, totalPaid: totalPaid.toFixed(2) });
    } catch (error) {
      console.error('[Admin] partner-payouts batch error:', error);
      res.status(500).json({ error: "Failed to process partner payouts" });
    }
  });

  // Retry a single failed or pending partner earning row.
  app.post("/api/admin/partner-payouts/:earningId/retry", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const [earning] = await db.select().from(partnerEarnings)
        .where(eq(partnerEarnings.id, req.params.earningId)).limit(1);
      if (!earning) return res.status(404).json({ error: "Earning row not found" });
      if (!['pending', 'failed'].includes(earning.status)) {
        return res.status(400).json({ error: `Cannot retry earnings in status ${earning.status}` });
      }
      const booking = await storage.getBooking(earning.bookingId);
      if (!booking || (booking.paymentStatus !== 'succeeded' && booking.paymentStatus !== 'paid')) {
        return res.status(400).json({ error: "Booking is not paid" });
      }
      const row = await recordPartnerEarnings(earning.bookingId, earning.partnerId, booking);
      res.json({ earning: row });
    } catch (error: any) {
      console.error('[Admin] partner-payouts retry error:', error);
      res.status(500).json({ error: error?.message ?? "Failed to retry partner payout" });
    }
  });

  // ===== ADMIN: REFRESH GPS STATUS FOR ALL ONLINE MOVERS =====
  // Updates lastLocationUpdate for all online movers so they show as "Live" on Find Movers
  app.post("/api/admin/refresh-mover-gps", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get all online movers
      const onlineMovers = await db.select()
        .from(moversTable)
        .where(eq(moversTable.isAvailable, true));
      
      if (onlineMovers.length === 0) {
        return res.json({
          success: true,
          message: "No online movers found",
          updated: 0
        });
      }
      
      // Update lastLocationUpdate for all online movers to current time
      const now = new Date();
      const updated: { moverId: string; name: string | null }[] = [];
      
      for (const mover of onlineMovers) {
        await db.update(moversTable)
          .set({ lastLocationUpdate: now })
          .where(eq(moversTable.id, mover.id));
        
        // Get mover name
        const user = await db.select({ name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, mover.userId))
          .limit(1);
        
        updated.push({
          moverId: mover.id,
          name: user[0]?.name || null
        });
      }
      
      console.log(`[Admin] Refreshed GPS status for ${updated.length} online movers`);
      
      res.json({
        success: true,
        message: `Refreshed GPS status for ${updated.length} online mover(s). They will now show as "Live" on Find Movers.`,
        updated
      });
    } catch (error) {
      console.error('[Admin] Refresh mover GPS error:', error);
      res.status(500).json({ error: "Failed to refresh mover GPS status" });
    }
  });

  // ===== ADMIN: SYNC MOVER STRIPE STATUS =====
  // Manually refresh a mover's Stripe Connect status from Stripe API
  app.post("/api/admin/sync-mover-stripe/:moverId", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { moverId } = req.params;
      
      // Get mover's Stripe account from our database
      const moverAccounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, moverId))
        .limit(1);
      
      if (moverAccounts.length === 0) {
        return res.status(404).json({ error: "No Stripe account found for this mover" });
      }
      
      const moverAccount = moverAccounts[0];
      
      // Fetch latest status from Stripe
      const stripeAccount = await stripe.accounts.retrieve(moverAccount.stripeAccountId);
      
      // Determine onboarding status
      const newOnboardingStatus = stripeAccount.details_submitted ? 'complete' : 
                                  (stripeAccount.requirements?.currently_due?.length ? 'restricted' : 'in_progress');
      
      // Update our database with latest Stripe status
      await db.update(moverStripeAccounts)
        .set({
          chargesEnabled: stripeAccount.charges_enabled,
          payoutsEnabled: stripeAccount.payouts_enabled,
          detailsSubmitted: stripeAccount.details_submitted,
          onboardingStatus: newOnboardingStatus,
          requirementsDue: stripeAccount.requirements?.eventually_due || [],
          currentlyDue: stripeAccount.requirements?.currently_due || [],
          updatedAt: new Date(),
        })
        .where(eq(moverStripeAccounts.id, moverAccount.id));
      
      console.log(`[Admin] Synced Stripe status for mover ${moverId}: charges=${stripeAccount.charges_enabled}, payouts=${stripeAccount.payouts_enabled}`);
      
      res.json({
        success: true,
        message: "Stripe status synced successfully",
        status: {
          chargesEnabled: stripeAccount.charges_enabled,
          payoutsEnabled: stripeAccount.payouts_enabled,
          detailsSubmitted: stripeAccount.details_submitted,
          onboardingStatus: newOnboardingStatus,
          currentlyDue: stripeAccount.requirements?.currently_due || [],
        }
      });
    } catch (error: any) {
      console.error('[Admin] Sync mover Stripe error:', error);
      res.status(500).json({ error: error.message || "Failed to sync Stripe status" });
    }
  });

  // ===== ADMIN: MANUAL TRANSFER FOR BOOKING =====
  // Create a manual Stripe transfer for a platform charge booking
  app.post("/api/admin/manual-transfer/:bookingId", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { bookingId } = req.params;
      
      // Get the booking
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      if (!booking.moverId) {
        return res.status(400).json({ error: "Booking has no assigned mover" });
      }
      
      if (booking.paymentStatus !== 'succeeded' && booking.paymentStatus !== 'paid') {
        return res.status(400).json({ error: "Booking payment not completed" });
      }
      
      // Check if already transferred
      const existingEarnings = await db.select()
        .from(moverEarnings)
        .where(eq(moverEarnings.bookingId, bookingId))
        .limit(1);
      
      if (existingEarnings.length > 0 && existingEarnings[0].stripeTransferId) {
        return res.status(400).json({ 
          error: "Transfer already exists",
          transferId: existingEarnings[0].stripeTransferId 
        });
      }
      
      // Get mover's Stripe account
      const moverAccounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, booking.moverId))
        .limit(1);
      
      if (moverAccounts.length === 0) {
        return res.status(400).json({ error: "Mover has no Stripe Connect account" });
      }
      
      const moverAccount = moverAccounts[0];
      
      if (!moverAccount.payoutsEnabled) {
        return res.status(400).json({ 
          error: "Mover's Stripe account not ready for payouts. They need to complete onboarding.",
          chargesEnabled: moverAccount.chargesEnabled,
          payoutsEnabled: moverAccount.payoutsEnabled,
        });
      }
      
      // Calculate amounts using the centralized fee calculation helper
      const grossAmount = parseFloat(booking.price || '0');
      const feeCalc = calculatePlatformFee(grossAmount, booking.loadSize);
      const { grossAmountCents, platformFeeCents, moverPayoutCents, platformFeePercent } = feeCalc;
      const platformFeeAmount = platformFeeCents / 100;
      const netAmount = moverPayoutCents / 100;
      
      // Create Stripe Transfer (use moverPayoutCents from fee calculation)
      const transfer = await circuitBreakers.stripe.execute(() =>
        stripe.transfers.create({
          amount: moverPayoutCents,
          currency: 'cad',
          destination: moverAccount.stripeAccountId,
          metadata: {
            bookingId,
            moverId: booking.moverId,
            grossAmount: grossAmount.toFixed(2),
            platformFee: platformFeeAmount.toFixed(2),
            processedBy: 'admin_manual_transfer',
          },
        }, {
          idempotencyKey: `manual-transfer-${bookingId}`,
        }),
      );
      
      // Create or update earnings record — retry to prevent divergence.
      // Transfer already succeeded; reconciliation heals if DB writes fail.
      if (existingEarnings.length > 0) {
        await updateMoverEarningWithRetry(
          { id: existingEarnings[0].id, stripeTransferId: transfer.id, bookingId },
          { stripeTransferId: transfer.id, status: 'paid', paidAt: new Date() },
        );
      } else {
        await insertMoverEarningWithRetry({
          moverId: booking.moverId,
          bookingId,
          grossAmount: grossAmount.toFixed(2),
          platformFeePercent: platformFeePercent.toFixed(2),
          platformFeeAmount: platformFeeAmount.toFixed(2),
          netAmount: netAmount.toFixed(2),
          stripeTransferId: transfer.id,
          status: 'paid',
          paidAt: new Date(),
        });
      }
      
      // Update booking with commission data
      await storage.updateBooking(bookingId, {
        platformFeePercent: platformFeePercent.toString(),
        platformFeeAmount: platformFeeAmount.toFixed(2),
        moverNetAmount: netAmount.toFixed(2),
      });
      
      console.log(`[Admin] Manual transfer created: $${netAmount.toFixed(2)} to mover ${booking.moverId} (transfer: ${transfer.id})`);
      
      res.json({
        success: true,
        message: `Successfully transferred $${netAmount.toFixed(2)} to mover`,
        transfer: {
          id: transfer.id,
          amount: netAmount.toFixed(2),
          grossAmount: grossAmount.toFixed(2),
          platformFee: platformFeeAmount.toFixed(2),
        }
      });
    } catch (error: any) {
      console.error('[Admin] Manual transfer error:', error);
      res.status(500).json({ error: error.message || "Failed to create transfer" });
    }
  });

  // ===== ADMIN: Sync Stripe Connect Accounts from Stripe =====
  // Fetches all connected accounts from Stripe and syncs them to our database
  app.post("/api/admin/sync-stripe-accounts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      logEvent.payment('stripe_accounts_sync_started', {
        triggeredBy: (req as any).user?.id,
      });
      
      // Fetch all connected accounts from Stripe
      const accounts = await stripe.accounts.list({ limit: 100 });
      
      let synced = 0;
      let created = 0;
      let updated = 0;
      const results: any[] = [];
      
      for (const account of accounts.data) {
        const onboardingStatus = account.charges_enabled && account.payouts_enabled 
          ? 'complete' 
          : account.details_submitted 
            ? 'pending' 
            : 'incomplete';
        
        // First check if this Stripe account already exists in our database
        const existingByStripeId = await db.select()
          .from(moverStripeAccounts)
          .where(eq(moverStripeAccounts.stripeAccountId, account.id))
          .limit(1);
        
        if (existingByStripeId.length > 0) {
          // Update existing record by Stripe account ID
          await db.update(moverStripeAccounts)
            .set({
              onboardingStatus,
              chargesEnabled: account.charges_enabled || false,
              payoutsEnabled: account.payouts_enabled || false,
              detailsSubmitted: account.details_submitted || false,
              updatedAt: new Date(),
            })
            .where(eq(moverStripeAccounts.stripeAccountId, account.id));
          updated++;
          results.push({ accountId: account.id, email: account.email, moverId: existingByStripeId[0].moverId, status: 'updated', chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled });
          synced++;
          continue;
        }
        
        // Try to find the mover by email
        const email = account.email;
        if (!email) {
          results.push({ accountId: account.id, status: 'skipped', reason: 'No email on Stripe account' });
          continue;
        }
        
        // Find user by email
        const userMatches = await db.select()
          .from(usersTable)
          .where(eq(usersTable.email, email))
          .limit(1);
        
        if (userMatches.length === 0) {
          results.push({ accountId: account.id, email, status: 'skipped', reason: 'No matching user found' });
          continue;
        }
        
        const userId = userMatches[0].id;
        
        // Check if this user is actually a mover and get their mover ID
        const moverCheck = await db.select()
          .from(moversTable)
          .where(eq(moversTable.userId, userId))
          .limit(1);
        
        if (moverCheck.length === 0) {
          results.push({ accountId: account.id, email, status: 'skipped', reason: 'User is not a mover' });
          continue;
        }
        
        const moverId = moverCheck[0].id; // Use mover's ID, not user's ID
        
        // Check if we already have a record for this mover (different Stripe account)
        const existingByMoverId = await db.select()
          .from(moverStripeAccounts)
          .where(eq(moverStripeAccounts.moverId, moverId))
          .limit(1);
        
        if (existingByMoverId.length > 0) {
          // Update existing mover record with new Stripe account
          await db.update(moverStripeAccounts)
            .set({
              stripeAccountId: account.id,
              onboardingStatus,
              chargesEnabled: account.charges_enabled || false,
              payoutsEnabled: account.payouts_enabled || false,
              detailsSubmitted: account.details_submitted || false,
              updatedAt: new Date(),
            })
            .where(eq(moverStripeAccounts.moverId, moverId));
          updated++;
          results.push({ accountId: account.id, email, moverId, status: 'updated', chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled });
        } else {
          // Create new record
          await db.insert(moverStripeAccounts).values({
            moverId,
            stripeAccountId: account.id,
            accountType: 'express',
            onboardingStatus,
            chargesEnabled: account.charges_enabled || false,
            payoutsEnabled: account.payouts_enabled || false,
            detailsSubmitted: account.details_submitted || false,
            defaultCurrency: account.default_currency || 'cad',
            country: account.country || 'CA',
          });
          created++;
          results.push({ accountId: account.id, email, userId, status: 'created', chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled });
        }
        synced++;
      }
      
      logEvent.payment('stripe_accounts_sync_completed', {
        totalAccounts: accounts.data.length,
        synced,
        created,
        updated,
      });
      
      res.json({
        success: true,
        totalStripeAccounts: accounts.data.length,
        synced,
        created,
        updated,
        results,
      });
    } catch (error: any) {
      console.error('Stripe accounts sync error:', error);
      logEvent.error('stripe_accounts_sync_failed', error);
      res.status(500).json({ error: error.message || "Failed to sync Stripe accounts" });
    }
  });

  // ===== TEST ENDPOINT: Simulate Auto-Transfer on Onboarding =====
  // This endpoint simulates what happens when a mover completes Stripe Connect onboarding
  // Use this to test the auto-transfer flow without going through actual onboarding
  app.post("/api/admin/test-auto-transfer/:moverId", async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { moverId } = req.params;
      
      // Get mover's Stripe account
      const moverAccounts = await db.select()
        .from(moverStripeAccounts)
        .where(eq(moverStripeAccounts.moverId, moverId))
        .limit(1);
      
      if (moverAccounts.length === 0) {
        return res.status(404).json({ error: "Mover has no Stripe Connect account" });
      }
      
      const moverAccount = moverAccounts[0];
      
      if (!moverAccount.chargesEnabled || !moverAccount.payoutsEnabled) {
        return res.status(400).json({ 
          error: "Mover is not fully onboarded yet",
          chargesEnabled: moverAccount.chargesEnabled,
          payoutsEnabled: moverAccount.payoutsEnabled,
          hint: "Mover must complete Stripe Connect onboarding first"
        });
      }
      
      logEvent.payment('test_auto_transfer_triggered', { 
        moverId,
        triggeredBy: user.id,
      });
      
      // Find pending earnings for this mover that need transfer
      const pendingEarnings = await db.select()
        .from(moverEarnings)
        .where(and(
          eq(moverEarnings.moverId, moverId),
          or(
            eq(moverEarnings.status, 'pending'),
            eq(moverEarnings.status, 'needs_backfill')
          ),
          isNull(moverEarnings.stripeTransferId)
        ));
      
      if (pendingEarnings.length === 0) {
        return res.json({ 
          success: true, 
          message: "No pending earnings found for this mover",
          transfersCreated: 0 
        });
      }
      
      const results: any[] = [];
      
      for (const earning of pendingEarnings) {
        try {
          // Get the booking to calculate correct fee
          const booking = await storage.getBooking(earning.bookingId);
          if (!booking || booking.paymentStatus !== 'paid') {
            results.push({
              bookingId: earning.bookingId,
              status: 'skipped',
              reason: booking ? 'Payment not completed' : 'Booking not found'
            });
            continue;
          }
          
          // Calculate amounts using centralized helper
          const grossAmount = parseFloat(booking.price || '0');
          const feeCalc = calculatePlatformFee(grossAmount, booking.loadSize);
          const { moverPayoutCents, platformFeeCents } = feeCalc;
          
          // Create transfer to mover's connected account.
          // Idempotency key is deterministic per earning (previously included
          // Date.now(), which defeated retry-safety).
          const transfer = await circuitBreakers.stripe.execute(() =>
            stripe.transfers.create({
              amount: moverPayoutCents,
              currency: 'cad',
              destination: moverAccount.stripeAccountId,
              metadata: {
                bookingId: earning.bookingId,
                moverId,
                grossAmount: grossAmount.toFixed(2),
                platformFee: (platformFeeCents / 100).toFixed(2),
                processedBy: 'test_auto_transfer',
              },
            }, {
              idempotencyKey: `test-auto-transfer-${earning.id}-v1`,
            }),
          );
          
          // Update earnings record — retry to prevent divergence.
          await updateMoverEarningWithRetry(
            { id: earning.id, stripeTransferId: transfer.id, bookingId: earning.bookingId },
            { stripeTransferId: transfer.id, status: 'paid', paidAt: new Date() },
          );

          results.push({
            bookingId: earning.bookingId,
            status: 'success',
            transferId: transfer.id,
            amount: moverPayoutCents / 100,
          });

          logEvent.payment('test_auto_transfer_success', {
            moverId,
            bookingId: earning.bookingId,
            transferId: transfer.id,
            amount: moverPayoutCents / 100,
          });
        } catch (transferError: any) {
          results.push({
            bookingId: earning.bookingId,
            status: 'failed',
            error: transferError.message,
          });
          
          logEvent.error('test_auto_transfer_failed', transferError, {
            moverId,
            bookingId: earning.bookingId,
          });
        }
      }
      
      res.json({
        success: true,
        message: `Processed ${results.length} pending earnings`,
        transfersCreated: results.filter(r => r.status === 'success').length,
        results,
      });
    } catch (error: any) {
      console.error('[Admin] Test auto-transfer error:', error);
      res.status(500).json({ error: error.message || "Failed to run test auto-transfer" });
    }
  });

  // ===== ABANDONED BOOKINGS API =====
  
  // POST /api/abandoned-bookings - Save abandoned booking for reminder follow-up
  app.post("/api/abandoned-bookings", async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { pickupAddress, dropoffAddress, loadSize, preferredDate, selectedMoverId, lastStep, email, phone } = req.body;
      
      // Use user data if authenticated, otherwise use provided data
      const abandonedData = {
        userId: user?.id || null,
        email: user?.email || email || null,
        phone: user?.phone || phone || null,
        pickupAddress: pickupAddress || null,
        dropoffAddress: dropoffAddress || null,
        loadSize: loadSize || null,
        preferredDate: preferredDate || null,
        selectedMoverId: selectedMoverId || null,
        lastStep: lastStep || 1,
      };
      
      // Check if we have at least some identifying info
      if (!abandonedData.userId && !abandonedData.email && !abandonedData.phone) {
        return res.status(400).json({ error: "At least email, phone, or user ID required" });
      }
      
      // Check if there's an existing abandoned booking for this user/email
      let existingAbandoned = null;
      if (abandonedData.userId) {
        const result = await db.select().from(abandonedBookings)
          .where(and(
            eq(abandonedBookings.userId, abandonedData.userId),
            eq(abandonedBookings.recovered, false)
          ))
          .limit(1);
        existingAbandoned = result[0];
      } else if (abandonedData.email) {
        const result = await db.select().from(abandonedBookings)
          .where(and(
            eq(abandonedBookings.email, abandonedData.email),
            eq(abandonedBookings.recovered, false)
          ))
          .limit(1);
        existingAbandoned = result[0];
      }
      
      if (existingAbandoned) {
        // Update existing abandoned booking
        await db.update(abandonedBookings)
          .set({
            ...abandonedData,
            updatedAt: new Date(),
          })
          .where(eq(abandonedBookings.id, existingAbandoned.id));
        
        res.json({ success: true, updated: true, id: existingAbandoned.id });
      } else {
        // Create new abandoned booking
        const result = await db.insert(abandonedBookings).values(abandonedData).returning({ id: abandonedBookings.id });
        res.json({ success: true, created: true, id: result[0].id });
      }
    } catch (error) {
      console.error('[Abandoned Booking] Error saving:', error);
      res.status(500).json({ error: "Failed to save abandoned booking" });
    }
  });
  
  // GET /api/abandoned-bookings/:id - Get abandoned booking data for restoration
  app.get("/api/abandoned-bookings/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const [abandoned] = await db.select()
        .from(abandonedBookings)
        .where(eq(abandonedBookings.id, id))
        .limit(1);
      
      if (!abandoned) {
        return res.status(404).json({ error: "Abandoned booking not found" });
      }
      
      // Return the booking data for restoration
      res.json({
        id: abandoned.id,
        pickupAddress: abandoned.pickupAddress,
        dropoffAddress: abandoned.dropoffAddress,
        loadSize: abandoned.loadSize,
        preferredDate: abandoned.preferredDate,
        selectedMoverId: abandoned.selectedMoverId,
        lastStep: abandoned.lastStep,
        recovered: abandoned.recovered,
      });
    } catch (error) {
      console.error('[Abandoned Booking] Error fetching:', error);
      res.status(500).json({ error: "Failed to fetch abandoned booking" });
    }
  });

  // POST /api/abandoned-bookings/:id/recover - Mark abandoned booking as recovered
  app.post("/api/abandoned-bookings/:id/recover", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { bookingId } = req.body;
      
      await db.update(abandonedBookings)
        .set({
          recovered: true,
          recoveredBookingId: bookingId || null,
          updatedAt: new Date(),
        })
        .where(eq(abandonedBookings.id, id));
      
      res.json({ success: true });
    } catch (error) {
      console.error('[Abandoned Booking] Error recovering:', error);
      res.status(500).json({ error: "Failed to mark booking as recovered" });
    }
  });

  // ===== ADMIN: BACKFILL PERFORMANCE DATA =====
  app.post("/api/admin/backfill-performance", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      // Get all completed bookings that don't have performance records
      const completedBookings = await db.select()
        .from(bookings)
        .where(and(
          eq(bookings.status, 'completed'),
          isNotNull(bookings.moverId)
        ));
      
      const existingPerf = await db.select({
        bookingId: moverPerformanceTable.bookingId
      }).from(moverPerformanceTable);
      
      const existingBookingIds = new Set(existingPerf.map(p => p.bookingId));
      const missingBookings = completedBookings.filter(b => !existingBookingIds.has(b.id));
      
      let created = 0;
      for (const b of missingBookings) {
        try {
          const acceptedTime = b.acceptedAt || b.createdAt;
          const completedTime = b.updatedAt || new Date();
          const totalMoveMinutes = Math.round(
            (new Date(completedTime).getTime() - new Date(acceptedTime).getTime()) / 60000
          );
          
          await db.insert(moverPerformanceTable).values({
            moverId: b.moverId!,
            bookingId: b.id,
            acceptedAt: acceptedTime ? new Date(acceptedTime) : null,
            unloadingCompletedAt: completedTime ? new Date(completedTime) : null,
            totalMoveMinutes: totalMoveMinutes > 0 ? totalMoveMinutes : null,
            distanceKm: b.distance || '0',
          });
          created++;
        } catch (err) {
          console.error(`[Backfill] Failed for booking ${b.id}:`, err);
        }
      }
      
      console.log(`[Backfill] Created ${created} performance records from ${missingBookings.length} completed bookings`);
      res.json({ 
        success: true, 
        message: `Backfilled ${created} performance records`,
        total: completedBookings.length,
        alreadyTracked: existingBookingIds.size,
        newlyCreated: created,
      });
    } catch (error) {
      console.error('[Backfill] Error:', error);
      res.status(500).json({ error: "Failed to backfill performance data" });
    }
  });
  
  // ===== ADMIN: GROWTH METRICS DASHBOARD =====
  
  app.get("/api/admin/growth-metrics", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Fulfilment period filter (7, 30, 90 days or 'all')
      const fulfilmentPeriod = req.query.fulfilmentPeriod as string || 'all';
      let fulfilmentCutoff: Date | null = null;
      if (fulfilmentPeriod === '7') fulfilmentCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (fulfilmentPeriod === '30') fulfilmentCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      else if (fulfilmentPeriod === '90') fulfilmentCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Revenue period filter (7, 30 days or 'all')
      const revenuePeriod = req.query.revenuePeriod as string || 'all';
      let revenueCutoff: Date | null = null;
      if (revenuePeriod === '7') revenueCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (revenuePeriod === '30') revenueCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Get all bookings
      const allBookings = await db.select().from(bookings);
      
      // Get all users
      const allUsers = await db.select().from(usersTable);
      
      // Get all movers
      const allMovers = await db.select().from(moversTable);
      
      // Get abandoned bookings
      const allAbandoned = await db.select().from(abandonedBookings);
      
      // Calculate metrics
      const totalBookings = allBookings.length;
      const weeklyBookings = allBookings.filter(b => new Date(b.createdAt) >= oneWeekAgo).length;
      const monthlyBookings = allBookings.filter(b => new Date(b.createdAt) >= oneMonthAgo).length;
      
      const completedBookings = allBookings.filter(b => b.status === 'completed');
      const completedCount = completedBookings.length;
      const totalRevenue = completedBookings.reduce((sum, b) => sum + parseFloat(b.price || '0'), 0);
      
      const paidBookings = allBookings.filter(b => b.paymentStatus === 'paid').length;
      const pendingPaymentBookings = allBookings.filter(b => b.paymentStatus === 'pending').length;
      const failedBookings = allBookings.filter(b => b.status === 'cancelled' || b.paymentStatus === 'failed').length;
      
      // Conversion rate: completed / total
      const conversionRate = totalBookings > 0 ? (completedCount / totalBookings * 100).toFixed(1) : '0';
      
      // User metrics
      const totalCustomers = allUsers.filter(u => u.role === 'customer').length;
      const weeklyNewCustomers = allUsers.filter(u => u.role === 'customer' && new Date(u.createdAt) >= oneWeekAgo).length;
      
      const totalMovers = allMovers.length;
      const onlineMovers = allMovers.filter(m => m.isAvailable).length;
      const verifiedMovers = allMovers.filter(m => m.isVerified).length;
      const weeklyNewMovers = allMovers.filter(m => new Date(m.createdAt) >= oneWeekAgo).length;
      
      // Live GPS movers (updated within last hour)
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const liveGpsMovers = allMovers.filter(m => 
        m.isAvailable && m.lastLocationUpdate && new Date(m.lastLocationUpdate) > oneHourAgo
      ).length;
      
      // Abandoned booking metrics
      const totalAbandoned = allAbandoned.length;
      const recoveredAbandoned = allAbandoned.filter(a => a.recovered).length;
      const pendingAbandoned = allAbandoned.filter(a => !a.recovered).length;
      const recoveryRate = totalAbandoned > 0 ? (recoveredAbandoned / totalAbandoned * 100).toFixed(1) : '0';
      
      // Average booking value (all-time)
      const avgBookingValue = completedCount > 0 ? (totalRevenue / completedCount).toFixed(2) : '0';

      // Revenue period-filtered calculations.
      // Only count revenue where paymentStatus IN ('paid', 'succeeded') — this excludes
      // cancelled/failed/pending_payment bookings whose price was set at creation but
      // never actually collected. Both count and amount share the same createdAt-based
      // filter so they stay in lockstep with the selected period.
      const revenueEligible = completedBookings.filter(b =>
        b.paymentStatus === 'paid' || b.paymentStatus === 'succeeded'
      );
      const revenueFilteredCompleted = revenueCutoff
        ? revenueEligible.filter(b => b.createdAt && new Date(b.createdAt) >= revenueCutoff!)
        : revenueEligible;
      const revenueFilteredCount = revenueFilteredCompleted.length;
      const revenueFilteredTotal = revenueFilteredCompleted.reduce((sum, b) => sum + parseFloat(b.price || '0'), 0);
      const revenueFilteredAvg = revenueFilteredCount > 0 ? (revenueFilteredTotal / revenueFilteredCount).toFixed(2) : '0';
      
      // Booking status breakdown
      const statusBreakdown = {
        pending: allBookings.filter(b => b.status === 'pending').length,
        accepted: allBookings.filter(b => b.status === 'accepted').length,
        in_progress: allBookings.filter(b => b.status === 'in_progress').length,
        completed: completedCount,
        cancelled: allBookings.filter(b => b.status === 'cancelled').length,
      };
      
      // Fulfilment hours - mover performance data
      const allPerformanceData = await db.select({
        id: moverPerformanceTable.id,
        moverId: moverPerformanceTable.moverId,
        bookingId: moverPerformanceTable.bookingId,
        totalMoveMinutes: moverPerformanceTable.totalMoveMinutes,
        acceptedAt: moverPerformanceTable.acceptedAt,
        arrivedAtPickupAt: moverPerformanceTable.arrivedAtPickupAt,
        loadingStartedAt: moverPerformanceTable.loadingStartedAt,
        loadingCompletedAt: moverPerformanceTable.loadingCompletedAt,
        arrivedAtDropoffAt: moverPerformanceTable.arrivedAtDropoffAt,
        unloadingCompletedAt: moverPerformanceTable.unloadingCompletedAt,
        distanceKm: moverPerformanceTable.distanceKm,
        createdAt: moverPerformanceTable.createdAt,
        moverName: usersTable.name,
      })
        .from(moverPerformanceTable)
        .leftJoin(moversTable, eq(moverPerformanceTable.moverId, moversTable.id))
        .leftJoin(usersTable, eq(moversTable.userId, usersTable.id));

      // Apply period filter using actual completion date (unloadingCompletedAt),
      // not createdAt which reflects when the DB row was inserted (misleading for backfilled records)
      const filteredPerf = fulfilmentCutoff
        ? allPerformanceData.filter(p => {
            const completionDate = p.unloadingCompletedAt || p.createdAt;
            return completionDate && new Date(completionDate) >= fulfilmentCutoff!;
          })
        : allPerformanceData;

      const completedPerf = filteredPerf.filter(p => p.totalMoveMinutes && p.totalMoveMinutes > 0);
      const totalMoves = completedPerf.length;
      const avgMoveMinutes = totalMoves > 0
        ? Math.round(completedPerf.reduce((sum, p) => sum + (p.totalMoveMinutes || 0), 0) / totalMoves)
        : 0;
      const fastestMove = totalMoves > 0
        ? Math.min(...completedPerf.map(p => p.totalMoveMinutes || Infinity))
        : 0;
      const slowestMove = totalMoves > 0
        ? Math.max(...completedPerf.map(p => p.totalMoveMinutes || 0))
        : 0;

      // Average completed job distance from mover performance table
      const perfWithDistance = completedPerf.filter(p => p.distanceKm && parseFloat(p.distanceKm) > 0);
      const avgCompletedDistanceKm = perfWithDistance.length > 0
        ? parseFloat((perfWithDistance.reduce((sum, p) => sum + parseFloat(p.distanceKm || '0'), 0) / perfWithDistance.length).toFixed(1))
        : null;

      // Per-driver breakdown
      const driverMap = new Map<string, { name: string; moverId: string; moves: number; totalMinutes: number; fastest: number; slowest: number; totalDistanceKm: number; distanceMoves: number }>();
      for (const p of completedPerf) {
        const key = p.moverId;
        const existing = driverMap.get(key);
        const mins = p.totalMoveMinutes || 0;
        const dist = p.distanceKm ? parseFloat(p.distanceKm) : 0;
        if (existing) {
          existing.moves++;
          existing.totalMinutes += mins;
          existing.fastest = Math.min(existing.fastest, mins);
          existing.slowest = Math.max(existing.slowest, mins);
          if (dist > 0) { existing.totalDistanceKm += dist; existing.distanceMoves++; }
        } else {
          driverMap.set(key, {
            name: p.moverName || 'Unknown',
            moverId: key,
            moves: 1,
            totalMinutes: mins,
            fastest: mins,
            slowest: mins,
            totalDistanceKm: dist > 0 ? dist : 0,
            distanceMoves: dist > 0 ? 1 : 0,
          });
        }
      }

      const driverPerformance = Array.from(driverMap.values())
        .map(d => ({
          name: d.name,
          moverId: d.moverId,
          totalMoves: d.moves,
          avgMinutes: Math.round(d.totalMinutes / d.moves),
          fastestMinutes: d.fastest,
          slowestMinutes: d.slowest,
          totalHours: parseFloat((d.totalMinutes / 60).toFixed(1)),
          avgDistanceKm: d.distanceMoves > 0 ? parseFloat((d.totalDistanceKm / d.distanceMoves).toFixed(1)) : null,
        }))
        .sort((a, b) => b.totalMoves - a.totalMoves);

      // Daily bookings for last 7 days
      const dailyBookings = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const count = allBookings.filter(b => {
          const created = new Date(b.createdAt);
          return created >= date && created < nextDate;
        }).length;
        
        dailyBookings.push({
          date: date.toISOString().split('T')[0],
          count,
        });
      }
      
      res.json({
        overview: {
          totalBookings,
          weeklyBookings,
          monthlyBookings,
          completedBookings: completedCount,
          totalRevenue: totalRevenue.toFixed(2),
          avgBookingValue,
          conversionRate,
        },
        revenue: {
          totalRevenue: revenueFilteredTotal.toFixed(2),
          avgBookingValue: revenueFilteredAvg,
          completedCount: revenueFilteredCount,
          period: revenuePeriod,
        },
        bookings: {
          paid: paidBookings,
          pendingPayment: pendingPaymentBookings,
          failed: failedBookings,
          statusBreakdown,
        },
        users: {
          totalCustomers,
          weeklyNewCustomers,
          totalMovers,
          weeklyNewMovers,
          onlineMovers,
          verifiedMovers,
          liveGpsMovers,
        },
        abandoned: {
          total: totalAbandoned,
          recovered: recoveredAbandoned,
          pending: pendingAbandoned,
          recoveryRate,
        },
        fulfilment: {
          totalTrackedMoves: totalMoves,
          avgMoveMinutes,
          avgMoveHours: parseFloat((avgMoveMinutes / 60).toFixed(1)),
          fastestMoveMinutes: fastestMove,
          slowestMoveMinutes: slowestMove,
          avgCompletedDistanceKm,
          driverPerformance,
          period: fulfilmentPeriod,
        },
        trends: {
          dailyBookings,
        },
        generatedAt: now.toISOString(),
      });
    } catch (error) {
      console.error('[Admin] Growth metrics error:', error);
      res.status(500).json({ error: "Failed to fetch growth metrics" });
    }
  });
  
  // GET /api/admin/abandoned-bookings - Get all abandoned bookings
  app.get("/api/admin/abandoned-bookings", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const abandoned = await db.select()
        .from(abandonedBookings)
        .orderBy(desc(abandonedBookings.createdAt));
      
      res.json(abandoned);
    } catch (error) {
      console.error('[Admin] Get abandoned bookings error:', error);
      res.status(500).json({ error: "Failed to fetch abandoned bookings" });
    }
  });

  // ============================================================
  // REVENUE SUMMARY (admin) — single pre-aggregated query so the
  // /admin/revenue page never has to reduce over an arbitrary booking
  // page and can never silently truncate. See AdminRevenuePage.tsx.
  //
  // Period filter uses updated_at as a proxy for completion date because
  // the bookings table does not carry a dedicated completed_at column.
  // Cancelled / payment_failed / pending_payment aggregates ignore the
  // period so the page can always show total exposure at a glance.
  // ============================================================

  app.get("/api/admin/revenue/summary", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const period = (req.query.period as string) || 'all';
      const now = new Date();
      let cutoff: Date | null = null;
      if (period === '7d') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (period === '30d') cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // updated_at is used as the completion-date proxy (see block comment above).
      const earnedPeriod = cutoff ? sql`AND updated_at >= ${cutoff}` : sql``;

      const result: any = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (
            WHERE status = 'completed'
              AND payment_status IN ('paid', 'succeeded')
              ${earnedPeriod}
          )::int AS earned_count,
          COALESCE(SUM(price) FILTER (
            WHERE status = 'completed'
              AND payment_status IN ('paid', 'succeeded')
              ${earnedPeriod}
          ), 0)::text AS earned_revenue,
          COALESCE(SUM(platform_fee_amount) FILTER (
            WHERE status = 'completed'
              AND payment_status IN ('paid', 'succeeded')
              ${earnedPeriod}
          ), 0)::text AS platform_fees,
          COALESCE(SUM(price - COALESCE(platform_fee_amount, 0)) FILTER (
            WHERE status = 'completed'
              AND payment_status IN ('paid', 'succeeded')
              ${earnedPeriod}
          ), 0)::text AS mover_payouts,

          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
          COALESCE(SUM(price) FILTER (WHERE status = 'cancelled'), 0)::text AS cancelled_value,

          COUNT(*) FILTER (WHERE status = 'payment_failed' OR payment_status = 'failed')::int AS failed_count,
          COALESCE(SUM(price) FILTER (WHERE status = 'payment_failed' OR payment_status = 'failed'), 0)::text AS failed_value,

          COUNT(*) FILTER (WHERE status = 'pending_payment')::int AS pending_count,
          COALESCE(SUM(price) FILTER (WHERE status = 'pending_payment'), 0)::text AS pending_revenue,

          COUNT(*) FILTER (
            WHERE enterprise_partner_id IS NOT NULL
              AND status = 'completed'
              AND payment_status IN ('paid', 'succeeded')
              ${earnedPeriod}
          )::int AS partner_completed,
          COALESCE(SUM(price) FILTER (
            WHERE enterprise_partner_id IS NOT NULL
              AND status = 'completed'
              AND payment_status IN ('paid', 'succeeded')
              ${earnedPeriod}
          ), 0)::text AS partner_revenue,

          COALESCE(SUM(price) FILTER (
            WHERE status = 'completed'
              AND payment_status IN ('paid', 'succeeded')
              AND created_at >= NOW() - INTERVAL '7 days'
          ), 0)::text AS revenue_this_week,
          COALESCE(SUM(price) FILTER (
            WHERE status = 'completed'
              AND payment_status IN ('paid', 'succeeded')
              AND created_at >= NOW() - INTERVAL '30 days'
          ), 0)::text AS revenue_this_month,

          COUNT(*)::int AS total_bookings
        FROM bookings
      `);

      const row = result?.rows?.[0] ?? {};
      const num = (v: any) => parseFloat(v ?? '0') || 0;
      const earnedCount = Number(row.earned_count ?? 0);
      const earnedRevenue = num(row.earned_revenue);
      const avgBookingValue = earnedCount > 0 ? earnedRevenue / earnedCount : 0;

      res.json({
        period,
        earned: {
          count: earnedCount,
          revenue: earnedRevenue,
          avgBookingValue,
        },
        platformFees: num(row.platform_fees),
        moverPayouts: num(row.mover_payouts),
        cancelled: {
          count: Number(row.cancelled_count ?? 0),
          value: num(row.cancelled_value),
        },
        paymentFailed: {
          count: Number(row.failed_count ?? 0),
          value: num(row.failed_value),
        },
        pending: {
          count: Number(row.pending_count ?? 0),
          revenue: num(row.pending_revenue),
        },
        partner: {
          count: Number(row.partner_completed ?? 0),
          revenue: num(row.partner_revenue),
        },
        revenueThisWeek: num(row.revenue_this_week),
        revenueThisMonth: num(row.revenue_this_month),
        totalBookings: Number(row.total_bookings ?? 0),
      });
    } catch (error) {
      console.error('[Admin] Revenue summary error:', error);
      res.status(500).json({ error: 'Failed to fetch revenue summary' });
    }
  });

  // ============================================================
  // ADMIN AUDIT LOG (admin)
  // Paginated read of admin_audit_log. Filters: adminId, resourceType,
  // resourceId, method, since (ISO date). Enriches each row with the
  // admin's name/email so the UI doesn't need a second lookup.
  // ============================================================
  app.get("/api/admin/audit-log", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const limit = Math.min(parseInt((req.query.limit as string) || "50", 10) || 50, 200);
      const offset = Math.max(parseInt((req.query.offset as string) || "0", 10) || 0, 0);

      const filters: any[] = [];
      if (req.query.adminId) filters.push(eq(adminAuditLog.adminId, req.query.adminId as string));
      if (req.query.method) filters.push(eq(adminAuditLog.method, (req.query.method as string).toUpperCase()));
      if (req.query.resourceType) filters.push(eq(adminAuditLog.resourceType, req.query.resourceType as string));
      if (req.query.resourceId) filters.push(eq(adminAuditLog.resourceId, req.query.resourceId as string));
      if (req.query.since) {
        const since = new Date(req.query.since as string);
        if (!isNaN(since.getTime())) filters.push(sql`${adminAuditLog.createdAt} >= ${since}`);
      }
      const where = filters.length ? and(...filters) : undefined;

      const rows = await db
        .select({
          id: adminAuditLog.id,
          adminId: adminAuditLog.adminId,
          method: adminAuditLog.method,
          path: adminAuditLog.path,
          resourceType: adminAuditLog.resourceType,
          resourceId: adminAuditLog.resourceId,
          statusCode: adminAuditLog.statusCode,
          ipAddress: adminAuditLog.ipAddress,
          userAgent: adminAuditLog.userAgent,
          requestBody: adminAuditLog.requestBody,
          createdAt: adminAuditLog.createdAt,
          adminName: usersTable.name,
          adminEmail: usersTable.email,
        })
        .from(adminAuditLog)
        .leftJoin(usersTable, eq(adminAuditLog.adminId, usersTable.id))
        .where(where as any)
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(limit)
        .offset(offset);

      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(adminAuditLog)
        .where(where as any);

      res.json({
        data: rows,
        total: Number(countRow?.count ?? 0),
        limit,
        offset,
        hasMore: offset + rows.length < Number(countRow?.count ?? 0),
      });
    } catch (error) {
      console.error('[Admin Audit] Read error:', error);
      res.status(500).json({ error: 'Failed to fetch admin audit log' });
    }
  });

  // ============================================================
  // ANALYTICS SUMMARY (admin)
  // ============================================================

  app.get("/api/admin/analytics-summary", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const days = parseInt((req.query.days as string) || "7", 10);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const events = await db
        .select()
        .from(analyticsEvents)
        .where(sql`${analyticsEvents.createdAt} >= ${cutoff}`)
        .orderBy(desc(analyticsEvents.createdAt));

      // Page views per page
      const pageViewEvents = events.filter(e => e.eventName === "page_view");
      const pageViewMap: Record<string, number> = {};
      for (const e of pageViewEvents) {
        const props = (e.properties as Record<string, any> | null) ?? {};
        const name = props.page_name ?? e.page ?? "unknown";
        pageViewMap[name] = (pageViewMap[name] ?? 0) + 1;
      }
      const pageViews = Object.entries(pageViewMap)
        .map(([page, views]) => ({ page, views }))
        .sort((a, b) => b.views - a.views);

      // Unique sessions
      const uniqueSessions = new Set(events.map(e => e.sessionId).filter(Boolean)).size;
      const uniqueUsers = new Set(events.map(e => e.userId).filter(Boolean)).size;

      // All event type counts
      const eventCounts: Record<string, number> = {};
      for (const e of events) {
        eventCounts[e.eventName] = (eventCounts[e.eventName] ?? 0) + 1;
      }
      const eventBreakdown = Object.entries(eventCounts)
        .map(([event, count]) => ({ event, count }))
        .sort((a, b) => b.count - a.count);

      // Daily visit trend — fill ALL days in range with 0 for days with no data
      const dailyMap: Record<string, number> = {};
      for (const e of pageViewEvents) {
        const day = new Date(e.createdAt).toISOString().slice(0, 10);
        dailyMap[day] = (dailyMap[day] ?? 0) + 1;
      }
      // Generate every calendar day from cutoff to today
      const dailyTrend: { date: string; views: number }[] = [];
      const cursor = new Date(cutoff);
      cursor.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      while (cursor <= today) {
        const key = cursor.toISOString().slice(0, 10);
        dailyTrend.push({ date: key.slice(5), views: dailyMap[key] ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }

      // Booking funnel from events
      const funnelEvents = ["booking_step_1_locations", "booking_step_2_load_details", "booking_step_3_schedule", "booking_submitted", "payment_completed"];
      const eventFunnel = funnelEvents.map(name => ({
        label: name.replace(/_/g, " "),
        count: eventCounts[name] ?? 0,
      }));

      // Recent events (last 50)
      const recent = events.slice(0, 50).map(e => ({
        id: e.id,
        eventName: e.eventName,
        page: e.page,
        sessionId: e.sessionId ? e.sessionId.slice(0, 8) + "…" : null,
        userId: e.userId,
        createdAt: e.createdAt,
      }));

      res.json({
        period: `${days}d`,
        totalEvents: events.length,
        uniqueSessions,
        uniqueUsers,
        pageViews,
        eventBreakdown,
        dailyTrend,
        eventFunnel,
        recent,
      });
    } catch (error) {
      console.error("[Admin] Analytics summary error:", error);
      res.status(500).json({ error: "Failed to fetch analytics summary" });
    }
  });

  // ============================================================
  // ANALYTICS EVENT BEACON
  // ============================================================

  app.post("/api/analytics/event", async (req: Request, res: Response) => {
    try {
      const { eventName, sessionId, page, properties } = req.body;
      if (!eventName || typeof eventName !== "string") {
        return res.status(400).json({ error: "eventName required" });
      }
      const userId = (req.session as any)?.userId ?? null;
      await db.insert(analyticsEvents).values({
        eventName: eventName.slice(0, 100),
        userId: userId ?? undefined,
        sessionId: sessionId ? String(sessionId).slice(0, 100) : undefined,
        page: page ? String(page).slice(0, 200) : undefined,
        properties: properties ?? undefined,
      });
      res.json({ ok: true });
    } catch (error) {
      // Silent fail — never block UX for analytics
      res.json({ ok: false });
    }
  });

  // ============================================================
  // OPERATIONS DASHBOARD METRICS
  // ============================================================

  app.get("/api/admin/ops-metrics", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const now = new Date();

      // Fetch raw data from existing tables
      const [allBookings, allMovers, allUsers, allNotifications, allAbandoned, allMetrics] = await Promise.all([
        db.select().from(bookings),
        db.select().from(moversTable),
        db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone }).from(usersTable),
        db.select().from(jobNotifications),
        db.select().from(abandonedBookings),
        db.select().from(bookingMetricsTable),
      ]);

      // Build userId → user lookup for mover name/email resolution
      const userById = new Map(allUsers.map(u => [u.id, u]));

      // ---- BOOKING FUNNEL ----
      // Step 1: Users who visited booking page (abandoned at step 1 OR made it further)
      const abandonedAtStep1 = allAbandoned.filter(a => a.lastStep === 1 || a.lastStep === 2).length;
      const abandonedAtStep2 = allAbandoned.filter(a => a.lastStep === 3).length;
      const totalAbandoned = allAbandoned.length;
      const totalCreatedBookings = allBookings.length;
      const totalPaid = allBookings.filter(b => b.paymentStatus === 'paid' || b.paymentStatus === 'succeeded').length;
      const totalCompleted = allBookings.filter(b => b.status === 'completed').length;
      const totalConfirmed = allBookings.filter(b => ACTIVE_STATUSES.includes(b.status)).length;
      const totalStarted = totalAbandoned + totalCreatedBookings;

      const funnelSteps = [
        { label: "Started Booking", count: totalStarted },
        { label: "Selected Mover", count: totalAbandoned - abandonedAtStep1 + totalCreatedBookings },
        { label: "Booking Created", count: totalCreatedBookings },
        { label: "Payment Completed", count: totalPaid },
        { label: "Mover Accepted", count: totalConfirmed },
        { label: "Move Completed", count: totalCompleted },
      ];

      // ---- LIVE OPS ----
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const isPaid = (b: typeof allBookings[0]) => b.paymentStatus === 'succeeded' || b.paymentStatus === 'paid';
      const pendingJobs = allBookings.filter(b => b.status === 'pending' && isPaid(b)).length;
      const inProgressJobs = allBookings.filter(b => ACTIVE_STATUSES.includes(b.status) && b.status !== 'completed').length;
      const pendingMoverAcceptance = allBookings.filter(b => ['confirmed', 'accepted'].includes(b.status) && b.moverId).length;
      const onlineMovers = allMovers.filter(m => m.isAvailable).length;
      const liveGpsMovers = allMovers.filter(m => m.isAvailable && m.lastLocationUpdate && new Date(m.lastLocationUpdate) > oneHourAgo).length;
      const unverifiedMovers = allMovers.filter(m => !m.isVerified).length;

      // Proximity-matching job notification breakdown
      // ------------------------------------------------------------------
      // Three historical gaps we must account for:
      //   A) Notification exists in 'pending' but booking is confirmed with that mover
      //      → mover accepted via PATCH (pre-fix), notification was never updated.
      //   B) No notification record exists at all for a confirmed proximity booking
      //      → booking predates the job_notifications system entirely.
      //   C) Notification exists with correct 'accepted' status → normal, modern flow.
      // ------------------------------------------------------------------

      // Map: bookingId → moverId for every booking where a mover is/was active
      const confirmedBookingMover = new Map(
        allBookings
          .filter(b => b.moverId && ACTIVE_STATUSES.includes(b.status))
          .map(b => [b.id, b.moverId!])
      );

      // Set of bookingIds that have at least one notification record
      const notifiedBookingIds = new Set(allNotifications.map(n => n.bookingId));

      // Pending = truly still waiting (not secretly accepted via PATCH)
      const pendingNotifications = allNotifications.filter(n => {
        if (n.status !== 'pending') return false;
        const confirmedMover = n.bookingId ? confirmedBookingMover.get(n.bookingId) : undefined;
        return confirmedMover !== n.moverId; // exclude gap-A entries
      }).length;

      // Accepted = explicit + gap-A (pending notif, booking confirmed with same mover)
      const explicitlyAccepted = allNotifications.filter(n => n.status === 'accepted').length;
      const gapAAccepted = allNotifications.filter(n => {
        if (n.status !== 'pending') return false;
        const confirmedMover = n.bookingId ? confirmedBookingMover.get(n.bookingId) : undefined;
        return confirmedMover === n.moverId;
      }).length;

      // Gap-B: confirmed proximity bookings with NO notification record at all
      // (preSelectedMoverId null = not a direct booking, has moverId = mover assigned)
      const gapBInferredAccepted = allBookings.filter(b =>
        b.moverId &&
        !b.preSelectedMoverId &&
        ACTIVE_STATUSES.includes(b.status) &&
        !notifiedBookingIds.has(b.id)
      ).length;

      const acceptedNotifications = explicitlyAccepted + gapAAccepted + gapBInferredAccepted;

      const declinedNotifications = allNotifications.filter(n => n.status === 'declined').length;
      const expiredNotifications = allNotifications.filter(n => n.status === 'expired').length;
      // totalNotifications counts real records + inferred gap-B rows for chart sizing
      const totalNotifications = allNotifications.length + gapBInferredAccepted;

      // Direct acceptances = bookings where customer explicitly pre-selected a mover who then confirmed
      // (preSelectedMoverId is the source-of-truth indicator — set at booking creation when customer picks a specific mover)
      const directAcceptedBookings = allBookings.filter(
        b => b.preSelectedMoverId && b.moverId && ACTIVE_STATUSES.includes(b.status)
      ).length;

      // ---- MOVER PERFORMANCE ----
      // Track proximity notifications per mover (notification-level stats)
      const moverNotifMap: Record<string, { total: number; accepted: number; declined: number; expired: number }> = {};
      for (const n of allNotifications) {
        if (!n.moverId) continue;
        if (!moverNotifMap[n.moverId]) moverNotifMap[n.moverId] = { total: 0, accepted: 0, declined: 0, expired: 0 };
        moverNotifMap[n.moverId].total++;
        // Gap-A: pending notif where booking is already confirmed with this mover → count as accepted
        const isGapA = n.status === 'pending' && n.bookingId
          ? confirmedBookingMover.get(n.bookingId) === n.moverId
          : false;
        if (n.status === 'accepted' || isGapA) moverNotifMap[n.moverId].accepted++;
        else if (n.status === 'declined') moverNotifMap[n.moverId].declined++;
        else if (n.status === 'expired') moverNotifMap[n.moverId].expired++;
      }
      // Gap-B: add inferred accepted for movers whose confirmed bookings have no notification record.
      // Only skip when preSelectedMoverId === moverId (genuine direct accept counted in moverDirectMap).
      // If preSelectedMoverId points to a DIFFERENT mover (original who declined), the current mover
      // was proximity-matched as a replacement and still needs to be counted here.
      for (const b of allBookings) {
        if (!b.moverId) continue;
        if (b.preSelectedMoverId === b.moverId) continue; // genuine direct accept — counted via moverDirectMap
        if (!ACTIVE_STATUSES.includes(b.status)) continue;
        if (notifiedBookingIds.has(b.id)) continue; // already counted above
        const id = b.moverId;
        if (!moverNotifMap[id]) moverNotifMap[id] = { total: 0, accepted: 0, declined: 0, expired: 0 };
        moverNotifMap[id].total++;
        moverNotifMap[id].accepted++;
      }
      // Track completed moves and direct acceptances per mover
      const moverCompletedMap: Record<string, number> = {};
      const moverDirectMap: Record<string, number> = {};
      for (const b of allBookings.filter(b => b.moverId)) {
        const id = b.moverId!;
        if (b.status === 'completed') {
          moverCompletedMap[id] = (moverCompletedMap[id] ?? 0) + 1;
        }
        // Direct = customer pre-selected this specific mover and the booking is active
        if (b.preSelectedMoverId === id && ACTIVE_STATUSES.includes(b.status)) {
          moverDirectMap[id] = (moverDirectMap[id] ?? 0) + 1;
        }
      }

      const moverPerf = allMovers.map(m => {
        const notifs = moverNotifMap[m.id] ?? { total: 0, accepted: 0, declined: 0, expired: 0 };
        const completed = moverCompletedMap[m.id] ?? 0;
        const directAccepts = moverDirectMap[m.id] ?? 0;
        // Acceptance rate: combine both notification accepts and direct accepts as numerator
        // denominator is proximity notifications + direct bookings dispatched to this mover
        const totalDispatched = notifs.total + directAccepts;
        const totalAccepted = notifs.accepted + directAccepts;
        const acceptanceRate = totalDispatched > 0 ? Math.round((totalAccepted / totalDispatched) * 100) : null;
        const user = userById.get(m.userId);
        return {
          moverId: m.id,
          name: user?.name ?? "Unknown Mover",
          email: user?.email ?? null,
          phone: user?.phone ?? null,
          isAvailable: m.isAvailable,
          isVerified: m.isVerified,
          rating: m.rating ? parseFloat(m.rating) : null,
          totalOffers: totalDispatched,
          accepted: totalAccepted,
          declined: notifs.declined,
          expired: notifs.expired,
          directAccepts,
          acceptanceRate,
          completedMoves: completed,
        };
      }).filter(m => m.totalOffers > 0 || m.completedMoves > 0)
        .sort((a, b) => (b.completedMoves - a.completedMoves));

      // Overall acceptance rate: booking-level (confirmed+in_progress+completed) / all paid
      // This is the true ground-truth rate, covering both direct and notification flows
      const totalPaidBookings = allBookings.filter(b => ['paid', 'succeeded'].includes(b.paymentStatus ?? '')).length;
      const totalMoverConfirmed = allBookings.filter(
        b => b.moverId && ACTIVE_STATUSES.includes(b.status)
      ).length;
      const overallAcceptanceRate = totalPaidBookings > 0 ? Math.round((totalMoverConfirmed / totalPaidBookings) * 100) : 0;

      // ---- REVENUE COHORTS (weekly, last 8 weeks) ----
      const cohortMap: Record<string, { week: string; revenue: number; bookings: number; avgValue: number }> = {};
      const paidBookings = allBookings.filter(b => b.paymentStatus === 'paid' || b.paymentStatus === 'succeeded');
      for (const b of paidBookings) {
        const d = new Date(b.createdAt);
        // ISO week start (Monday)
        const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1;
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);
        const key = weekStart.toISOString().slice(0, 10);
        if (!cohortMap[key]) cohortMap[key] = { week: key, revenue: 0, bookings: 0, avgValue: 0 };
        cohortMap[key].revenue += parseFloat(b.price || '0');
        cohortMap[key].bookings++;
      }
      const revenueCohorts = Object.values(cohortMap)
        .sort((a, b) => a.week.localeCompare(b.week))
        .slice(-8)
        .map(c => ({ ...c, revenue: Math.round(c.revenue * 100) / 100, avgValue: c.bookings > 0 ? Math.round((c.revenue / c.bookings) * 100) / 100 : 0 }));

      // ---- ESTIMATION ACCURACY ----
      const metricsWithBoth = allMetrics.filter(m => m.estimatedPrice && m.actualPrice);
      const avgPriceAccuracy = metricsWithBoth.length > 0
        ? Math.round(metricsWithBoth.reduce((s, m) => s + parseFloat(m.priceAccuracyPercent ?? '0'), 0) / metricsWithBoth.length)
        : null;
      const avgVolumeAccuracy = metricsWithBoth.length > 0
        ? Math.round(metricsWithBoth.reduce((s, m) => s + parseFloat(m.volumeAccuracyPercent ?? '0'), 0) / metricsWithBoth.length)
        : null;

      res.json({
        funnel: funnelSteps,
        liveOps: {
          pendingJobs,
          inProgressJobs,
          pendingMoverAcceptance,
          onlineMovers,
          liveGpsMovers,
          unverifiedMovers,
          notifications: { pending: pendingNotifications, accepted: acceptedNotifications, declined: declinedNotifications, expired: expiredNotifications, direct: directAcceptedBookings, total: totalNotifications },
          overallAcceptanceRate,
        },
        moverPerformance: moverPerf,
        revenueCohorts,
        aiAccuracy: { avgPriceAccuracy, avgVolumeAccuracy, sampleSize: metricsWithBoth.length },
        generatedAt: now.toISOString(),
      });
    } catch (error) {
      console.error('[Admin] Ops metrics error:', error);
      res.status(500).json({ error: "Failed to fetch ops metrics" });
    }
  });

  // ===== SPRINT 5: SAVED ADDRESSES =====

  app.get("/api/addresses", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const rows = await db
        .select()
        .from(savedAddresses)
        .where(eq(savedAddresses.userId, user.id))
        .orderBy(savedAddresses.createdAt);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch saved addresses" });
    }
  });

  app.post("/api/addresses", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const { label, address } = req.body;
      let { latitude, longitude } = req.body;
      if (!label || !address) {
        return res.status(400).json({ error: "label and address are required" });
      }
      const existing = await db
        .select({ id: savedAddresses.id })
        .from(savedAddresses)
        .where(eq(savedAddresses.userId, user.id));
      if (existing.length >= 5) {
        return res.status(400).json({ error: "Maximum 5 saved addresses allowed" });
      }
      // Geocode server-side when the client didn't supply coords, so the row
      // is usable as a distance origin (Browse Movers, matching).
      if (latitude == null || longitude == null) {
        try {
          const { geocodeAddress } = await import("./google-maps");
          const geo = await geocodeAddress(String(address));
          if (geo.success && geo.coordinates) {
            latitude = geo.coordinates.lat;
            longitude = geo.coordinates.lng;
          }
        } catch (geocodeError) {
          console.warn("[Addresses] Geocoding failed for", address, geocodeError);
        }
      }
      const [created] = await db
        .insert(savedAddresses)
        .values({ userId: user.id, label: String(label), address: String(address), latitude: latitude ?? null, longitude: longitude ?? null })
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(400).json({ error: "An address with that label already exists" });
      }
      res.status(500).json({ error: "Failed to save address" });
    }
  });

  app.delete("/api/addresses/:id", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const [deleted] = await db
        .delete(savedAddresses)
        .where(and(eq(savedAddresses.id, req.params.id), eq(savedAddresses.userId, user.id)))
        .returning();
      if (!deleted) return res.status(404).json({ error: "Address not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete address" });
    }
  });

  // ===== SPRINT 5: FEEDBACK SURVEYS =====

  app.post("/api/surveys", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const { bookingId, npsScore, easeRating, moverRating, comments } = req.body;
      if (!bookingId || npsScore === undefined || easeRating === undefined || moverRating === undefined) {
        return res.status(400).json({ error: "bookingId, npsScore, easeRating, and moverRating are required" });
      }
      if (npsScore < 0 || npsScore > 10) return res.status(400).json({ error: "npsScore must be 0-10" });
      if (easeRating < 1 || easeRating > 5) return res.status(400).json({ error: "easeRating must be 1-5" });
      if (moverRating < 1 || moverRating > 5) return res.status(400).json({ error: "moverRating must be 1-5" });
      const booking = await storage.getBooking(bookingId);
      if (!booking || booking.customerId !== user.id) {
        return res.status(404).json({ error: "Booking not found" });
      }
      const [created] = await db
        .insert(feedbackSurveys)
        .values({ bookingId, userId: user.id, npsScore: Number(npsScore), easeRating: Number(easeRating), moverRating: Number(moverRating), comments: comments ?? null })
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(400).json({ error: "Survey already submitted for this booking" });
      }
      res.status(500).json({ error: "Failed to submit survey" });
    }
  });

  // Per-booking survey lookup — authoritative check for "did this user already
  // submit a survey for this booking?" Used by the customer dashboard as a
  // belt-and-suspenders guard around the hasSurvey field on /api/bookings.
  // Returns the row (200) or null (200) — never 404 — so the client's fetch
  // path stays simple.
  app.get("/api/surveys/:bookingId", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const bookingId = req.params.bookingId;
      if (!bookingId) return res.status(400).json({ error: "bookingId is required" });
      const [row] = await db
        .select()
        .from(feedbackSurveys)
        .where(and(eq(feedbackSurveys.bookingId, bookingId), eq(feedbackSurveys.userId, user.id)))
        .limit(1);
      res.json(row ?? null);
    } catch (error) {
      logger.error({ err: error }, '[Surveys] lookup failed');
      res.status(500).json({ error: "Failed to load survey" });
    }
  });

  app.get("/api/admin/surveys", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const [countRow] = await db.select({ total: sql<number>`count(*)::int` }).from(feedbackSurveys);
      const total = countRow?.total ?? 0;
      const rows = await db
        .select({
          id: feedbackSurveys.id,
          bookingId: feedbackSurveys.bookingId,
          npsScore: feedbackSurveys.npsScore,
          easeRating: feedbackSurveys.easeRating,
          moverRating: feedbackSurveys.moverRating,
          comments: feedbackSurveys.comments,
          submittedAt: feedbackSurveys.submittedAt,
          userName: usersTable.name,
          userEmail: usersTable.email,
        })
        .from(feedbackSurveys)
        .innerJoin(usersTable, eq(feedbackSurveys.userId, usersTable.id))
        .orderBy(desc(feedbackSurveys.submittedAt))
        .limit(limit)
        .offset(offset);
      res.json({ data: rows, total, limit, offset, hasMore: offset + rows.length < total });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch surveys" });
    }
  });

  app.get("/api/admin/surveys/summary", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const [stats] = await db
        .select({
          count: sql<number>`count(*)::int`,
          avgNps: sql<number>`round(avg(nps_score)::numeric, 2)`,
          avgEase: sql<number>`round(avg(ease_rating)::numeric, 2)`,
          avgMover: sql<number>`round(avg(mover_rating)::numeric, 2)`,
        })
        .from(feedbackSurveys);
      res.json({
        totalSurveys: stats?.count ?? 0,
        avgNpsScore: stats?.avgNps ?? null,
        avgEaseRating: stats?.avgEase ?? null,
        avgMoverRating: stats?.avgMover ?? null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch survey summary" });
    }
  });

  // ===== ADMIN: OPERATIONAL INTELLIGENCE SUMMARY (APEX daily brief) =====
  // Single endpoint that bundles everything APEX needs for the daily brief,
  // plus alerts PULSE surfaces to admins.
  app.get("/api/admin/intelligence/summary", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const summary = await buildIntelligenceSummary();
      res.json(summary);
    } catch (error) {
      logger.error({ err: error }, '[Admin] intelligence/summary: failed');
      res.status(500).json({ error: "Failed to build intelligence summary" });
    }
  });

  // ===== XAVIER COLE (APEX) AGENT =====

  // Last N daily briefs from business_events (default 7).
  app.get("/api/admin/agent/xavier/briefs", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const limit = Math.max(1, Math.min(30, Number(req.query.limit ?? 7)));
      const days = Math.max(1, Math.min(30, Number(req.query.days ?? 7)));
      const rows = await db
        .select({
          id: businessEvents.id,
          createdAt: businessEvents.createdAt,
          payload: businessEvents.payload,
        })
        .from(businessEvents)
        .where(and(
          eq(businessEvents.eventType, 'apex.daily_brief'),
          sql`${businessEvents.createdAt} > NOW() - (${days} || ' days')::interval`,
        ))
        .orderBy(desc(businessEvents.createdAt))
        .limit(limit);

      res.json({
        briefs: rows.map(r => ({
          id: r.id,
          createdAt: r.createdAt,
          brief: (r.payload as any)?.brief ?? null,
          generatedAt: (r.payload as any)?.generatedAt ?? null,
        })),
      });
    } catch (err) {
      logger.error({ err }, '[Admin] xavier/briefs: failed');
      res.status(500).json({ error: 'Failed to load Xavier briefs' });
    }
  });

  // Manually trigger a Xavier action (default: daily_brief).
  app.post("/api/admin/agent/xavier/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { xavier } = await import('./agents/xavier');
      const action = (req.body?.action ?? 'daily_brief') as string;
      if (action !== 'daily_brief' && action !== 'escalate') {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const result = await xavier.run(action, req.body?.input ?? {});
      res.json({ ok: true, action, result });
    } catch (err) {
      logger.error({ err }, '[Admin] xavier/trigger: failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ===== VICTOR NASH (DISPATCH) =====

  // Manually trigger Victor: run initial dispatch for a booking, or force the
  // no-mover escalation (used mainly for testing the Xavier hand-off).
  app.post("/api/admin/agent/victor/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const action = (req.body?.action ?? 'dispatch') as string;
      if (action !== 'dispatch' && action !== 'escalate_no_movers' && action !== 'dispatch_pending') {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const result = await victor.run(action, req.body?.input ?? {});
      res.json({ ok: true, action, result });
    } catch (err) {
      logger.error({ err }, '[Admin] victor/trigger: failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Victor dispatch stats — today's dispatched + escalated counts, plus
  // all-time total so the card reflects lifetime throughput.
  app.get("/api/admin/agent-bus/stats", (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    res.json(agentEventBus.getStats());
  });

  app.get("/api/admin/agent/victor/stats", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const [todayRows, totalRows] = await Promise.all([
        db.execute(sql`
          SELECT
            COUNT(*) FILTER (WHERE event_type = 'dispatch.dispatched')            ::int AS dispatched_today,
            COUNT(*) FILTER (WHERE event_type = 'dispatch.escalated_no_movers')   ::int AS escalations_today
          FROM business_events
          WHERE created_at >= date_trunc('day', now())
            AND event_type IN ('dispatch.dispatched', 'dispatch.escalated_no_movers')
        `),
        db.execute(sql`
          SELECT COUNT(*)::int AS total_dispatched
          FROM business_events
          WHERE event_type = 'dispatch.dispatched'
        `),
      ]);
      const t = (todayRows as any).rows?.[0] ?? { dispatched_today: 0, escalations_today: 0 };
      const total = (totalRows as any).rows?.[0] ?? { total_dispatched: 0 };
      res.json({
        dispatchedToday: t.dispatched_today ?? 0,
        escalationsToday: t.escalations_today ?? 0,
        totalDispatchedAllTime: total.total_dispatched ?? 0,
        avgDispatchMinutes: null,
        period: 'today',
      });
    } catch (err) {
      logger.error({ err }, '[Admin] victor/stats failed');
      res.status(500).json({ error: 'Failed to load Victor stats' });
    }
  });

  // ===== MARK SHAW (PULSE) =====

  // Recent PULSE alerts from business_events (all pulse.* types, newest first).
  // Supports ?severity=high|medium|all (default all).
  const MARK_HIGH_SEVERITY_EVENTS = ['pulse.gps_silent', 'pulse.no_start'];
  const MARK_MEDIUM_SEVERITY_EVENTS = [
    'pulse.overtime',
    'pulse.customer_uninformed',
    'pulse.customer_notify_failed',
  ];
  app.get("/api/admin/agent/mark/alerts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 25)));
      const severityRaw = String(req.query.severity ?? 'all');
      const severity: 'high' | 'medium' | 'all' =
        severityRaw === 'high' || severityRaw === 'medium' ? severityRaw : 'all';

      const whereClause =
        severity === 'high'
          ? and(
              sql`${businessEvents.eventType} LIKE 'pulse.%'`,
              inArray(businessEvents.eventType, MARK_HIGH_SEVERITY_EVENTS),
            )
          : severity === 'medium'
          ? and(
              sql`${businessEvents.eventType} LIKE 'pulse.%'`,
              inArray(businessEvents.eventType, MARK_MEDIUM_SEVERITY_EVENTS),
            )
          : sql`${businessEvents.eventType} LIKE 'pulse.%'`;

      const rows = await db
        .select({
          id: businessEvents.id,
          eventType: businessEvents.eventType,
          entityId: businessEvents.entityId,
          payload: businessEvents.payload,
          createdAt: businessEvents.createdAt,
        })
        .from(businessEvents)
        .where(whereClause)
        .orderBy(desc(businessEvents.createdAt))
        .limit(limit);
      res.json({ alerts: rows, severity });
    } catch (err) {
      logger.error({ err }, '[Admin] mark/alerts: failed');
      res.status(500).json({ error: 'Failed to load Mark alerts' });
    }
  });

  // Manually trigger Mark: full active-trip scan, or single-booking evaluation.
  app.post("/api/admin/agent/mark/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { mark } = await import('./agents/mark');
      const action = (req.body?.action ?? 'scan_active_trips') as string;
      if (action !== 'scan_active_trips' && action !== 'check_booking') {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const result = await mark.run(action, req.body?.input ?? {});
      res.json({ ok: true, action, result });
    } catch (err) {
      logger.error({ err }, '[Admin] mark/trigger: failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ===== RILEY MORGAN (ONBOARD) =====

  // Manually enqueue a Riley action. Unlike Xavier/Victor/Mark which run
  // synchronously, Riley's touches are delay-scheduled — always go through
  // the queue so BullMQ handles retries and the timing model stays consistent.
  const RILEY_ACTIONS = new Set([
    'mover_verified',
    'stripe_connected',
    'customer_verified',
    'mover_nudge',
    'customer_nudge',
    'scan_inactive_movers',
    'scan_unverified_movers',
  ]);
  app.post("/api/admin/agent/riley/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const action = (req.body?.action ?? '') as string;
      if (!RILEY_ACTIONS.has(action)) {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;
      const input = (req.body?.input ?? {}) as Record<string, any>;

      if (dryRun) {
        const { riley } = await import('./agents/riley');
        const result = await riley.run(action, input, { dryRun: true });
        return res.json({ ok: true, dryRun: true, action, result });
      }

      const rileyQueue = createAgentQueue(QUEUE_NAMES.ONBOARD);
      if (!rileyQueue) {
        return res.status(503).json({ error: 'ONBOARD queue unavailable (REDIS_URL not configured)' });
      }
      const job = await rileyQueue.add(action, input);
      res.status(202).json({ ok: true, queued: true, action, jobId: job.id });
    } catch (err) {
      logger.error({ err }, '[Admin] riley/trigger: failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Riley onboarding stats — last 7 days.
  app.get("/api/admin/agent/riley/stats", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const rows = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'riley.mover_verified')                        ::int AS movers_verified,
          COUNT(*) FILTER (WHERE event_type = 'riley.customer_verified')                     ::int AS customers_verified,
          COUNT(*) FILTER (WHERE event_type IN ('riley.mover_nudge','riley.customer_nudge')) ::int AS nudges_sent,
          COUNT(*) FILTER (WHERE event_type = 'riley.stripe_connected')                      ::int AS stripe_connected
        FROM business_events
        WHERE created_at >= ${since}
          AND event_type LIKE 'riley.%'
      `);
      const r = (rows as any).rows?.[0] ?? {};
      res.json({
        moversVerified: r.movers_verified ?? 0,
        customersVerified: r.customers_verified ?? 0,
        nudgesSent: r.nudges_sent ?? 0,
        stripeConnected: r.stripe_connected ?? 0,
        period: '7 days',
      });
    } catch (err) {
      logger.error({ err }, '[Admin] riley/stats failed');
      res.status(500).json({ error: 'Failed to load Riley stats' });
    }
  });

  // ===== KAI BENNETT (RETAIN) =====

  // Manually enqueue a Kai action. Scans are heavy so always run through
  // the queue rather than in-request — matches Riley's pattern.
  const KAI_ACTIONS = new Set([
    'scan_dormant_customers',
    'scan_inactive_movers',
    'send_customer_winback',
    'send_mover_reactivation',
  ]);
  app.post("/api/admin/agent/kai/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const action = (req.body?.action ?? '') as string;
      if (!KAI_ACTIONS.has(action)) {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;
      const input = (req.body?.input ?? {}) as Record<string, any>;

      // Dry-run: skip the queue, run inline so the admin sees preview immediately.
      if (dryRun) {
        const { kai } = await import('./agents/kai');
        const result = await kai.run(action, input, { dryRun: true });
        return res.json({ ok: true, dryRun: true, action, result });
      }

      const kaiQueue = createAgentQueue(QUEUE_NAMES.RETAIN);
      if (!kaiQueue) {
        return res.status(503).json({ error: 'RETAIN queue unavailable (REDIS_URL not configured)' });
      }
      const job = await kaiQueue.add(action, input);
      res.status(202).json({ ok: true, queued: true, action, jobId: job.id });
    } catch (err) {
      logger.error({ err }, '[Admin] kai/trigger: failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Kai retention stats — last 7 days.
  app.get("/api/admin/agent/kai/stats", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const eventRows = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE event_type LIKE 'kai.customer_winback%')       ::int AS customers_contacted,
          COUNT(*) FILTER (WHERE event_type LIKE 'kai.mover_reactivation%')     ::int AS movers_reactivated
        FROM business_events
        WHERE created_at >= ${since}
          AND event_type LIKE 'kai.%'
      `);
      const e = (eventRows as any).rows?.[0] ?? {};
      const redemptionRows = await db.execute(sql`
        SELECT COUNT(*)::int AS redemptions
        FROM bookings
        WHERE promo_code = 'KAI15'
          AND created_at >= ${since}
      `);
      const kai15 = (redemptionRows as any).rows?.[0]?.redemptions ?? 0;
      res.json({
        customersContacted: e.customers_contacted ?? 0,
        moversReactivated: e.movers_reactivated ?? 0,
        kai15Redemptions: kai15,
        period: '7 days',
      });
    } catch (err) {
      logger.error({ err }, '[Admin] kai/stats failed');
      res.status(500).json({ error: 'Failed to load Kai stats' });
    }
  });

  // ===== SAM CARTER (SALES) =====

  const SAM_ACTIONS = new Set([
    'scan_b2b_prospects',
    'scan_stuck_partners',
    'send_b2b_touch',
    'send_partner_followup',
    'escalate_hot_lead',
    'auto_invite_partner',
    'check_onboarding_progress',
    'onboarding_complete_alert',
  ]);

  // Manually enqueue a Sam action. Scans + touches always run through the
  // queue rather than in-request — matches Riley/Kai pattern.
  app.post("/api/admin/agent/sam/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const action = (req.body?.action ?? '') as string;
      if (!SAM_ACTIONS.has(action)) {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;
      const input = (req.body?.input ?? {}) as Record<string, any>;

      if (dryRun) {
        const { sam } = await import('./agents/sam');
        const result = await sam.run(action, input, { dryRun: true });
        return res.json({ ok: true, dryRun: true, action, result });
      }

      const samQueue = createAgentQueue(QUEUE_NAMES.SALES);
      if (!samQueue) {
        return res.status(503).json({ error: 'SALES queue unavailable (REDIS_URL not configured)' });
      }
      const job = await samQueue.add(action, input);
      res.status(202).json({ ok: true, queued: true, action, jobId: job.id });
    } catch (err) {
      logger.error({ err }, '[Admin] sam/trigger: failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // B2B partner pipeline view. Filters leads where leadType='b2bp'; optional
  // stage query param narrows by dealStage.
  app.get("/api/admin/agent/sam/pipeline", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const stage = typeof req.query.stage === 'string' ? req.query.stage.trim() : '';
      const conditions = [eq(leads.leadType, 'b2bp')];
      if (stage) conditions.push(eq(leads.dealStage, stage));
      const rows = await db
        .select()
        .from(leads)
        .where(and(...conditions))
        .orderBy(desc(leads.updatedAt))
        .limit(200);
      res.json({ count: rows.length, stage: stage || 'all', leads: rows });
    } catch (err) {
      logger.error({ err }, '[Admin] sam/pipeline: failed');
      res.status(500).json({ error: 'Failed to load B2B pipeline' });
    }
  });

  // Update B2B-specific fields on a lead. Auto-hook: when dealStage
  // transitions to 'warm', enqueue escalate_hot_lead so John gets an SMS via
  // Xavier. This is distinct from the narrow /contact PATCH used by Scout.
  const SAM_LEAD_STAGES = new Set(['prospect', 'contacted', 'warm', 'meeting', 'closed', 'lost']);
  const SAM_LEAD_INDUSTRIES = new Set([
    'real_estate', 'property_management', 'corporate', 'university', 'insurance', 'moving_company', 'other',
  ]);
  app.patch("/api/admin/agent/leads/:id/b2b", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const body = req.body ?? {};

      const [existing] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Lead not found' });

      const update: Record<string, any> = { updatedAt: new Date() };
      if (typeof body.companyName === 'string') update.companyName = body.companyName.trim() || null;
      if (typeof body.industry === 'string') {
        if (!SAM_LEAD_INDUSTRIES.has(body.industry)) {
          return res.status(400).json({ error: `Invalid industry: ${body.industry}` });
        }
        update.industry = body.industry;
      }
      if (typeof body.estimatedMonthlyMoves === 'number' && Number.isFinite(body.estimatedMonthlyMoves)) {
        update.estimatedMonthlyMoves = Math.max(0, Math.floor(body.estimatedMonthlyMoves));
      }
      if (typeof body.dealStage === 'string') {
        if (!SAM_LEAD_STAGES.has(body.dealStage)) {
          return res.status(400).json({ error: `Invalid dealStage: ${body.dealStage}` });
        }
        update.dealStage = body.dealStage;
      }
      if (
        typeof body.leadType === 'string' &&
        (body.leadType === 'b2c' || body.leadType === 'b2bm' || body.leadType === 'b2bp')
      ) {
        update.leadType = body.leadType;
      }
      if (typeof body.notes === 'string') update.notes = body.notes;

      const [updated] = await db
        .update(leads)
        .set(update)
        .where(eq(leads.id, req.params.id))
        .returning();

      // Auto-hook: dealStage transitioned INTO 'warm' → enqueue Sam's hot-lead
      // escalation so Xavier SMSes John. Dedup handled inside Sam.
      if (update.dealStage === 'warm' && existing.dealStage !== 'warm') {
        try {
          const samQueue = createAgentQueue(QUEUE_NAMES.SALES);
          if (samQueue) {
            await samQueue.add('escalate_hot_lead', { leadId: updated.id });
          }
        } catch (qErr) {
          logger.warn({ err: qErr, leadId: updated.id }, 'Sam: hot-lead auto-escalation enqueue failed');
        }
      }

      res.json({ lead: updated });
    } catch (err) {
      logger.error({ err }, '[Admin] lead b2b patch failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ===== AEGIS FORD (COMPLIANCE) =====

  const AEGIS_ACTIONS = new Set([
    'scan_expiring_documents',
    'scan_dispatch_eligibility',
    'suspend_mover',
    'reactivate_mover',
  ]);

  // Manually enqueue an Aegis action. Dry-runs bypass the queue and run inline
  // so the admin sees the preview immediately (matches Riley/Kai/Sam pattern).
  app.post("/api/admin/agent/aegis/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const action = (req.body?.action ?? '') as string;
      if (!AEGIS_ACTIONS.has(action)) {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;
      const input = (req.body?.input ?? {}) as Record<string, any>;

      if (dryRun) {
        const { aegis } = await import('./agents/aegis');
        const result = await aegis.run(action, input, { dryRun: true });
        return res.json({ ok: true, dryRun: true, action, result });
      }

      const aegisQueue = createAgentQueue(QUEUE_NAMES.COMPLIANCE);
      if (!aegisQueue) {
        return res.status(503).json({ error: 'COMPLIANCE queue unavailable (REDIS_URL not configured)' });
      }
      const job = await aegisQueue.add(action, input);
      res.status(202).json({ ok: true, queued: true, action, jobId: job.id });
    } catch (err) {
      logger.error({ err }, '[Admin] aegis/trigger: failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Aegis compliance snapshot for the APEX AegisCard.
  app.get("/api/admin/agent/aegis/stats", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const now = new Date();
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const moverCounts = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE pilot_status = 'suspended')                            ::int AS suspended_count,
          COUNT(*) FILTER (
            WHERE is_verified = true
              AND documents_verified = true
              AND (pilot_status IS NULL OR pilot_status <> 'suspended')
          )                                                                             ::int AS compliant_count,
          COUNT(*) FILTER (
            WHERE is_available = true
              AND (is_verified = false OR documents_verified = false)
          )                                                                             ::int AS unverified_in_pool
        FROM movers
      `);
      const m = (moverCounts as any).rows?.[0] ?? {};

      const expiringRows = await db.execute(sql`
        SELECT COUNT(*)::int AS expiring_count
        FROM verification_items
        WHERE status = 'approved'
          AND expiry_date IS NOT NULL
          AND expiry_date <= ${in30Days}
          AND type IN ('DRIVERS_LICENSE', 'INSURANCE', 'VEHICLE_REGISTRATION', 'BACKGROUND_CHECK')
      `);
      const expiringCount = (expiringRows as any).rows?.[0]?.expiring_count ?? 0;

      const recentEvents = await db
        .select()
        .from(businessEvents)
        .where(sql`event_type LIKE 'aegis.%'`)
        .orderBy(desc(businessEvents.createdAt))
        .limit(10);

      res.json({
        suspendedCount: m.suspended_count ?? 0,
        compliantCount: m.compliant_count ?? 0,
        unverifiedInPool: m.unverified_in_pool ?? 0,
        expiringCount,
        recentEvents,
      });
    } catch (err) {
      logger.error({ err }, '[Admin] aegis/stats failed');
      res.status(500).json({ error: 'Failed to load Aegis stats' });
    }
  });

  // ===== NOVA CLARKE (VOICE) =====

  const NOVA_ACTIONS = new Set([
    'call_mover_dispatch',
    'call_lead_conversion',
    'call_mover_cold',
    'call_review_request',
    'check_call_hours',
  ]);

  app.post("/api/admin/agent/nova/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const action = (req.body?.action ?? '') as string;
      if (!NOVA_ACTIONS.has(action)) {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;
      const input = (req.body?.input ?? {}) as Record<string, any>;

      // check_call_hours is a cheap synchronous check — run inline even when
      // dry_run isn't set so the admin sees the answer immediately.
      if (dryRun || action === 'check_call_hours') {
        const result = await nova.run(action, input, { dryRun });
        return res.json({ ok: true, dryRun, action, result });
      }

      const novaQueue = createAgentQueue(QUEUE_NAMES.VOICE_AGENT);
      if (!novaQueue) {
        return res.status(503).json({ error: 'VOICE_AGENT queue unavailable (REDIS_URL not configured)' });
      }
      const job = await novaQueue.add(action, input);
      res.status(202).json({ ok: true, queued: true, action, jobId: job.id });
    } catch (err) {
      logger.error({ err }, '[Admin] nova/trigger: failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/agent/nova/stats", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [callsTodayRows, moversAcceptedRows, bookingsCreatedRows, recentEvents] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(voiceCalls)
          .where(gte(voiceCalls.createdAt, todayStart)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(businessEvents)
          .where(
            and(
              eq(businessEvents.eventType, 'nova.mover_accepted'),
              gte(businessEvents.createdAt, todayStart),
            ),
          ),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(businessEvents)
          .where(
            and(
              eq(businessEvents.eventType, 'nova.booking_created'),
              gte(businessEvents.createdAt, todayStart),
            ),
          ),
        db
          .select()
          .from(businessEvents)
          .where(sql`event_type LIKE 'nova.%'`)
          .orderBy(desc(businessEvents.createdAt))
          .limit(10),
      ]);

      const callHours = nova.checkCallHours();

      res.json({
        callsToday: callsTodayRows[0]?.count ?? 0,
        moversAccepted: moversAcceptedRows[0]?.count ?? 0,
        bookingsCreated: bookingsCreatedRows[0]?.count ?? 0,
        callHoursAllowed: callHours.allowed,
        callHoursReason: callHours.reason ?? null,
        recentEvents,
      });
    } catch (err) {
      logger.error({ err }, '[Admin] nova/stats failed');
      res.status(500).json({ error: 'Failed to load Nova stats' });
    }
  });

  // ===== EMBER LANE (MAGNET) =====

  const EMBER_ACTIONS = new Set([
    'generate_blog_post',
    'generate_gmb_post',
    'respond_to_review',
    'generate_social_content',
    'generate_newsletter',
    'publish_blog_post',
    // Phase 2 — campaigns + video generation
    'create_campaign',
    'generate_video_script',
    'generate_heygen_video',
    'generate_higgsfield_video',
    'generate_creative_brief',
    'run_qa',
    'get_campaign_status',
    'publish_to_social',
  ]);

  app.post("/api/admin/agent/ember/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const action = (req.body?.action ?? '') as string;
      if (!EMBER_ACTIONS.has(action)) {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;
      const input = (req.body?.input ?? {}) as Record<string, any>;

      // Cheap DB-only actions — always inline so admin sees the result immediately.
      const inlineActions = new Set(['publish_blog_post', 'get_campaign_status']);
      if (dryRun || inlineActions.has(action)) {
        const result = await ember.run(action, input, { dryRun });
        return res.json({ ok: true, dryRun, action, result });
      }

      const emberQueue = createAgentQueue(QUEUE_NAMES.MAGNET);
      if (!emberQueue) {
        return res.status(503).json({ error: 'MAGNET queue unavailable (REDIS_URL not configured)' });
      }
      const job = await emberQueue.add(action, input);
      res.status(202).json({ ok: true, queued: true, action, jobId: job.id });
    } catch (err) {
      logger.error({ err }, '[Admin] ember/trigger: failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/agent/ember/stats", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const [
        totalPostsRows,
        publishedPostsRows,
        draftPostsRows,
        gmbTotalRows,
        socialByPlatformRows,
        recentEvents,
        activeCampaignsRows,
        videosGeneratingRows,
        videosReadyRows,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(blogPosts),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(blogPosts)
          .where(eq(blogPosts.status, 'published')),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(blogPosts)
          .where(eq(blogPosts.status, 'draft')),
        db.select({ count: sql<number>`count(*)::int` }).from(gmbPosts),
        db
          .select({
            platform: socialPosts.platform,
            count: sql<number>`count(*)::int`,
          })
          .from(socialPosts)
          .where(eq(socialPosts.status, 'draft'))
          .groupBy(socialPosts.platform),
        db
          .select()
          .from(businessEvents)
          .where(sql`event_type LIKE 'agent.ember.%'`)
          .orderBy(desc(businessEvents.createdAt))
          .limit(10),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(campaigns)
          .where(inArray(campaigns.status, ['draft', 'active'])),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(contentItems)
          .where(eq(contentItems.status, 'generating')),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(contentItems)
          .where(inArray(contentItems.status, ['approved', 'published', 'qa'])),
      ]);

      const socialDraftsByPlatform: Record<string, number> = {
        facebook: 0,
        instagram: 0,
        tiktok: 0,
        linkedin: 0,
      };
      for (const row of socialByPlatformRows) {
        if (row.platform) socialDraftsByPlatform[row.platform] = row.count ?? 0;
      }

      res.json({
        totalPosts: totalPostsRows[0]?.count ?? 0,
        publishedPosts: publishedPostsRows[0]?.count ?? 0,
        draftPosts: draftPostsRows[0]?.count ?? 0,
        gmbPostsTotal: gmbTotalRows[0]?.count ?? 0,
        socialDraftsByPlatform,
        recentEvents,
        activeCampaigns: activeCampaignsRows[0]?.count ?? 0,
        videosGenerating: videosGeneratingRows[0]?.count ?? 0,
        videosReady: videosReadyRows[0]?.count ?? 0,
      });
    } catch (err) {
      logger.error({ err }, '[Admin] ember/stats failed');
      res.status(500).json({ error: 'Failed to load Ember stats' });
    }
  });

  // ===== REID CALLOWAY (DOCOPS) =====

  const REID_ACTIONS = new Set([
    'review_document',
    'run_document_audit',
    'approve_document',
    'reject_document',
    'escalate_document',
    'generate_audit_report',
    'get_kpi_report',
    'daily_audit_sweep',
    'backfill_existing_documents',
  ]);

  app.post("/api/admin/agent/reid/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const action = (req.body?.action ?? '') as string;
      if (!REID_ACTIONS.has(action)) {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;
      const input = (req.body?.input ?? {}) as Record<string, any>;

      const inlineActions = new Set([
        'generate_audit_report',
        'get_kpi_report',
        'approve_document',
        'reject_document',
        'escalate_document',
      ]);
      if (dryRun || inlineActions.has(action)) {
        const result = await reid.run(action, input, { dryRun });
        return res.json({ ok: true, dryRun, action, result });
      }

      const reidQueue = createAgentQueue(QUEUE_NAMES.DOCOPS);
      if (!reidQueue) {
        return res.status(503).json({ error: 'DOCOPS queue unavailable (REDIS_URL not configured)' });
      }
      const job = await reidQueue.add(action, input);
      res.status(202).json({ ok: true, queued: true, action, jobId: job.id });
    } catch (err) {
      logger.error({ err }, '[Admin] reid/trigger: failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/document-audits", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;

      const rawStatus = (req.query.status as string | undefined)?.trim();
      const rawType = (req.query.documentType as string | undefined)?.trim();
      const rawMin = req.query.minScore as string | undefined;
      const rawMax = req.query.maxScore as string | undefined;
      const search = (req.query.search as string | undefined)?.trim();
      const limit = Math.min(Number(req.query.limit ?? 50), 500);
      const offset = Math.max(Number(req.query.offset ?? 0), 0);

      const filters = [] as any[];
      if (rawStatus && rawStatus !== 'all') {
        // status can be comma-separated: "pending_review,escalated"
        const list = rawStatus.split(',').map(s => s.trim()).filter(Boolean);
        if (list.length === 1) filters.push(eq(documentAudits.status, list[0]));
        else if (list.length > 1) filters.push(inArray(documentAudits.status, list));
      }
      if (rawType && rawType !== 'all') {
        filters.push(eq(documentAudits.documentType, rawType));
      }
      if (rawMin !== undefined && rawMin !== '' && !Number.isNaN(Number(rawMin))) {
        filters.push(gte(documentAudits.irregularityScore, Number(rawMin)));
      }
      if (rawMax !== undefined && rawMax !== '' && !Number.isNaN(Number(rawMax))) {
        filters.push(lte(documentAudits.irregularityScore, Number(rawMax)));
      }
      if (search) {
        filters.push(ilike(usersTable.name, `%${search}%`));
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      const rowsQuery = db
        .select({
          id: documentAudits.id,
          moverId: documentAudits.moverId,
          documentType: documentAudits.documentType,
          documentUrl: documentAudits.documentUrl,
          status: documentAudits.status,
          irregularityScore: documentAudits.irregularityScore,
          irregularities: documentAudits.irregularities,
          notes: documentAudits.notes,
          createdAt: documentAudits.createdAt,
          updatedAt: documentAudits.updatedAt,
          escalatedAt: documentAudits.escalatedAt,
          reviewedBy: documentAudits.reviewedBy,
          moverName: usersTable.name,
        })
        .from(documentAudits)
        .leftJoin(moversTable, eq(moversTable.id, documentAudits.moverId))
        .leftJoin(usersTable, eq(usersTable.id, moversTable.userId))
        .orderBy(desc(documentAudits.createdAt))
        .limit(limit)
        .offset(offset);

      const countQuery = db
        .select({ count: sql<number>`count(*)::int` })
        .from(documentAudits)
        .leftJoin(moversTable, eq(moversTable.id, documentAudits.moverId))
        .leftJoin(usersTable, eq(usersTable.id, moversTable.userId));

      const [rows, totalRow] = await Promise.all([
        whereClause ? rowsQuery.where(whereClause) : rowsQuery,
        whereClause ? countQuery.where(whereClause) : countQuery,
      ]);

      res.json({
        audits: rows,
        total: totalRow[0]?.count ?? 0,
        limit,
        offset,
      });
    } catch (err) {
      logger.error({ err }, '[Admin] document-audits list failed');
      res.status(500).json({ error: 'Failed to load audits' });
    }
  });

  app.get("/api/admin/document-audits/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const [row] = await db
        .select({
          id: documentAudits.id,
          moverId: documentAudits.moverId,
          verificationItemId: documentAudits.verificationItemId,
          documentType: documentAudits.documentType,
          documentUrl: documentAudits.documentUrl,
          status: documentAudits.status,
          irregularityScore: documentAudits.irregularityScore,
          irregularities: documentAudits.irregularities,
          checksRun: documentAudits.checksRun,
          auditedBy: documentAudits.auditedBy,
          reviewedBy: documentAudits.reviewedBy,
          approvedAt: documentAudits.approvedAt,
          rejectedAt: documentAudits.rejectedAt,
          rejectionReason: documentAudits.rejectionReason,
          escalatedAt: documentAudits.escalatedAt,
          escalationReason: documentAudits.escalationReason,
          notes: documentAudits.notes,
          createdAt: documentAudits.createdAt,
          updatedAt: documentAudits.updatedAt,
          moverName: usersTable.name,
          moverEmail: usersTable.email,
          moverPhone: usersTable.phone,
          moverVehicle: moversTable.vehicleType,
        })
        .from(documentAudits)
        .leftJoin(moversTable, eq(moversTable.id, documentAudits.moverId))
        .leftJoin(usersTable, eq(usersTable.id, moversTable.userId))
        .where(eq(documentAudits.id, req.params.id))
        .limit(1);

      if (!row) return res.status(404).json({ error: 'Not found' });

      const irregularities = await db
        .select()
        .from(documentIrregularities)
        .where(eq(documentIrregularities.auditId, row.id));

      let documentUrl: string | null = row.documentUrl ?? null;
      if (documentUrl?.startsWith('{')) {
        documentUrl =
          documentUrl
            .replace(/^\{|\}$/g, '')
            .split(',')[0]
            .trim() || null;
      }

      const score = row.irregularityScore ?? 0;
      const recommendation = score === 0 ? 'approve' : score <= 4 ? 'clarification' : 'escalate';

      res.json({
        audit: {
          ...row,
          documentUrl,
          irregularities,
          recommendation,
        },
      });
    } catch (err) {
      logger.error({ err }, '[Admin] document-audit detail failed');
      res.status(500).json({ error: 'Failed to load audit' });
    }
  });

  // POST /api/admin/document-audits/:id/approve
  //
  // Prefers the shared approveVerificationItem pipeline when the audit has a
  // linked verification_items row — same code path as the dashboard PATCH so
  // exactly one mover email fires. Falls back to reid.run('approve_document')
  // for orphan audits (historical rows without verification_item_id, or
  // document types like wcb that have no dashboard counterpart).
  app.post("/api/admin/document-audits/:id/approve", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const reviewer =
        (req.session as any)?.userId ??
        (req.session as any)?.user?.email ??
        'admin';
      const notes = (req.body?.notes as string | undefined) ?? undefined;

      const [audit] = await db
        .select({ id: documentAudits.id, verificationItemId: documentAudits.verificationItemId })
        .from(documentAudits)
        .where(eq(documentAudits.id, req.params.id))
        .limit(1);

      if (!audit) return res.status(404).json({ error: 'Audit not found' });

      if (audit.verificationItemId) {
        const result = await approveVerificationItem(
          audit.verificationItemId,
          'Approved',
          reviewer,
          {
            notes,
            fromReid: true,
            auditId: audit.id,
          },
        );
        if (!result.ok) return res.status(500).json({ error: result.error });
        return res.json({ ok: true, source: 'verification_pipeline', result });
      }

      // Fallback: no linked item — let Reid handle the audit-only approval
      // and its own email side-effect.
      const result = await reid.run('approve_document', {
        auditId: req.params.id,
        reviewedBy: reviewer,
        notes,
      });
      res.json({ ok: true, source: 'reid_agent', result });
    } catch (err) {
      logger.error({ err }, '[Admin] document-audit approve failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/admin/document-audits/:id/reject", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const reason = (req.body?.reason as string | undefined)?.trim();
      if (!reason) return res.status(400).json({ error: 'reason is required' });
      const reviewer =
        (req.session as any)?.userId ??
        (req.session as any)?.user?.email ??
        'admin';

      const [audit] = await db
        .select({ id: documentAudits.id, verificationItemId: documentAudits.verificationItemId })
        .from(documentAudits)
        .where(eq(documentAudits.id, req.params.id))
        .limit(1);

      if (!audit) return res.status(404).json({ error: 'Audit not found' });

      if (audit.verificationItemId) {
        const result = await approveVerificationItem(
          audit.verificationItemId,
          'Rejected',
          reviewer,
          {
            reason,
            fromReid: true,
            auditId: audit.id,
          },
        );
        if (!result.ok) return res.status(500).json({ error: result.error });
        return res.json({ ok: true, source: 'verification_pipeline', result });
      }

      const result = await reid.run('reject_document', {
        auditId: req.params.id,
        reason,
        reviewedBy: reviewer,
      });
      res.json({ ok: true, source: 'reid_agent', result });
    } catch (err) {
      logger.error({ err }, '[Admin] document-audit reject failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/admin/document-audits/:id/clarify", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const reason = (req.body?.reason as string | undefined)?.trim();
      if (!reason) return res.status(400).json({ error: 'reason is required' });
      const reviewer =
        (req.session as any)?.userId ??
        (req.session as any)?.user?.email ??
        'admin';
      const result = await reid.run('request_clarification', {
        auditId: req.params.id,
        reason,
        reviewedBy: reviewer,
      });
      res.json({ ok: true, result });
    } catch (err) {
      logger.error({ err }, '[Admin] document-audit clarify failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/admin/reid/kpi", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const days = Number(req.query.days ?? 30);
      const result = await reid.run('get_kpi_report', { days });
      res.json(result);
    } catch (err) {
      logger.error({ err }, '[Admin] reid kpi failed');
      res.status(500).json({ error: 'Failed to load Reid KPI' });
    }
  });

  // ===== Campaigns admin endpoints =====

  app.get("/api/admin/campaigns", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const rows = await db
        .select({
          id: campaigns.id,
          name: campaigns.name,
          objective: campaigns.objective,
          audience: campaigns.audience,
          platforms: campaigns.platforms,
          status: campaigns.status,
          startDate: campaigns.startDate,
          endDate: campaigns.endDate,
          createdBy: campaigns.createdBy,
          createdAt: campaigns.createdAt,
          updatedAt: campaigns.updatedAt,
          itemCount: sql<number>`(SELECT count(*)::int FROM ${contentItems} WHERE ${contentItems.campaignId} = ${campaigns.id})`,
        })
        .from(campaigns)
        .orderBy(desc(campaigns.createdAt))
        .limit(200);
      res.json({ campaigns: rows });
    } catch (err) {
      logger.error({ err }, '[Admin] campaigns list failed');
      res.status(500).json({ error: 'Failed to load campaigns' });
    }
  });

  app.get("/api/admin/campaigns/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const id = req.params.id;
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
      if (!campaign) return res.status(404).json({ error: 'Not found' });

      const items = await db
        .select()
        .from(contentItems)
        .where(eq(contentItems.campaignId, id))
        .orderBy(desc(contentItems.createdAt));

      res.json({ campaign, items });
    } catch (err) {
      logger.error({ err }, '[Admin] campaign detail failed');
      res.status(500).json({ error: 'Failed to load campaign' });
    }
  });

  app.get("/api/admin/content-items/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const id = req.params.id;
      const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json({ item });
    } catch (err) {
      logger.error({ err }, '[Admin] content item detail failed');
      res.status(500).json({ error: 'Failed to load content item' });
    }
  });

  app.patch("/api/admin/content-items/:id/reset", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      await db
        .update(contentItems)
        .set({
          status: 'draft',
          videoUrl: null,
          thumbnailUrl: null,
          providerJobId: null,
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, req.params.id));

      return res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, '[Admin] reset content item failed');
      res.status(500).json({ error: 'Failed to reset content item' });
    }
  });

  app.post("/api/admin/campaigns/:id/approve/:itemId", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { id: campaignId, itemId } = req.params;

      const [item] = await db
        .select()
        .from(contentItems)
        .where(and(eq(contentItems.id, itemId), eq(contentItems.campaignId, campaignId)))
        .limit(1);

      if (!item) return res.status(404).json({ error: 'Content item not found in this campaign' });

      const approverId = (req as any).user?.id ?? 'admin';
      const now = new Date();

      const [updated] = await db
        .update(contentItems)
        .set({
          status: 'published',
          approvedBy: String(approverId),
          approvedAt: now,
          publishedAt: now,
          updatedAt: now,
        })
        .where(eq(contentItems.id, itemId))
        .returning();

      await emitEvent(
        'ember.content_item_approved',
        'agent',
        'ember',
        { campaignId, itemId, approvedBy: approverId },
        'admin',
      );

      // Auto-publish to social after approval. Text/caption-only posts should
      // ship too — the old videoUrl gate silently dropped copy-only items.
      // TikTok is excluded here because publishToSocial rejects it as
      // unsupported_platform.
      const publishablePlatforms = ['facebook', 'instagram', 'linkedin'];

      const hasContent = !!(item.videoUrl || item.caption || item.script);

      if (
        publishablePlatforms.includes(item.platform ?? '') &&
        hasContent
      ) {
        ember.run('publish_to_social', {
          contentItemId: req.params.itemId,
        }).catch(err =>
          logger.error({ err }, '[Ember] Auto-publish failed'),
        );

        logger.info({
          contentItemId: req.params.itemId,
          platform: item.platform,
          hasVideo: !!item.videoUrl,
        }, '[Ember] Auto-publish triggered');
      }

      res.json({ ok: true, item: updated });
    } catch (err) {
      logger.error({ err }, '[Admin] approve content item failed');
      res.status(500).json({ error: 'Failed to approve content item' });
    }
  });

  // Public blog reads (lervit.com/blog consumes these).
  app.get("/api/blog", async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: blogPosts.id,
          title: blogPosts.title,
          slug: blogPosts.slug,
          excerpt: blogPosts.excerpt,
          category: blogPosts.category,
          tags: blogPosts.tags,
          image: blogPosts.image,
          readTime: blogPosts.readTime,
          oldPath: blogPosts.oldPath,
          publishedAt: blogPosts.publishedAt,
        })
        .from(blogPosts)
        .where(eq(blogPosts.status, 'published'))
        .orderBy(desc(blogPosts.publishedAt))
        .limit(100);
      res.json({ posts: rows });
    } catch (err) {
      logger.error({ err }, '[Blog] listing failed');
      res.status(500).json({ error: 'Failed to load blog posts' });
    }
  });

  app.get("/api/blog/:slug", async (req: Request, res: Response) => {
    try {
      const slug = req.params.slug;
      const [row] = await db
        .select()
        .from(blogPosts)
        .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, 'published')))
        .limit(1);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      logger.error({ err }, '[Blog] slug lookup failed');
      res.status(500).json({ error: 'Failed to load blog post' });
    }
  });

  // Admin content review UIs.
  app.get("/api/admin/blog/posts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const rows = await db
        .select()
        .from(blogPosts)
        .orderBy(desc(blogPosts.createdAt))
        .limit(200);
      res.json({ posts: rows });
    } catch (err) {
      logger.error({ err }, '[Admin] blog list failed');
      res.status(500).json({ error: 'Failed to load blog posts' });
    }
  });

  app.patch("/api/admin/blog/posts/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const id = req.params.id;
      const patch: Record<string, any> = {};
      if (typeof req.body?.status === 'string') patch.status = req.body.status;
      if (typeof req.body?.title === 'string') patch.title = req.body.title;
      if (typeof req.body?.slug === 'string') patch.slug = req.body.slug;
      if (typeof req.body?.excerpt === 'string') patch.excerpt = req.body.excerpt;
      if (typeof req.body?.content === 'string') patch.content = req.body.content;
      if (typeof req.body?.category === 'string') patch.category = req.body.category;
      if (Array.isArray(req.body?.tags)) patch.tags = req.body.tags;
      if (typeof req.body?.seoTitle === 'string') patch.seoTitle = req.body.seoTitle;
      if (typeof req.body?.seoDescription === 'string') patch.seoDescription = req.body.seoDescription;

      if (patch.status === 'published') patch.publishedAt = new Date();
      patch.updatedAt = new Date();

      const [row] = await db.update(blogPosts).set(patch).where(eq(blogPosts.id, id)).returning();
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      logger.error({ err }, '[Admin] blog patch failed');
      res.status(500).json({ error: 'Failed to update blog post' });
    }
  });

  app.get("/api/admin/ember/social-posts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const rows = await db
        .select()
        .from(socialPosts)
        .orderBy(desc(socialPosts.createdAt))
        .limit(200);
      const grouped: Record<string, typeof rows> = { facebook: [], instagram: [], tiktok: [], linkedin: [] };
      for (const r of rows) {
        if (r.platform && grouped[r.platform]) grouped[r.platform].push(r);
      }
      res.json({ posts: rows, byPlatform: grouped });
    } catch (err) {
      logger.error({ err }, '[Admin] social list failed');
      res.status(500).json({ error: 'Failed to load social posts' });
    }
  });

  app.patch("/api/admin/ember/social-posts/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const id = req.params.id;
      const patch: Record<string, any> = {};
      if (typeof req.body?.status === 'string') patch.status = req.body.status;
      if (typeof req.body?.content === 'string') patch.content = req.body.content;
      if (Array.isArray(req.body?.hashtags)) patch.hashtags = req.body.hashtags;
      if (typeof req.body?.approvedBy === 'string') patch.approvedBy = req.body.approvedBy;
      if (patch.status === 'posted') patch.postedAt = new Date();

      const [row] = await db.update(socialPosts).set(patch).where(eq(socialPosts.id, id)).returning();
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      logger.error({ err }, '[Admin] social patch failed');
      res.status(500).json({ error: 'Failed to update social post' });
    }
  });

  app.get("/api/admin/ember/gmb-posts", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const rows = await db
        .select()
        .from(gmbPosts)
        .orderBy(desc(gmbPosts.createdAt))
        .limit(200);
      res.json({ posts: rows });
    } catch (err) {
      logger.error({ err }, '[Admin] gmb list failed');
      res.status(500).json({ error: 'Failed to load GMB posts' });
    }
  });

  // ===== SCOUT REID (HUNTER-D) + ALEX MORGAN (CLOSER-D) =====

  // List leads with filters + pagination.
  app.get("/api/admin/agent/leads", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const source = typeof req.query.source === 'string' ? req.query.source : undefined;
      const sinceParam = typeof req.query.since === 'string' ? req.query.since : undefined;
      // audience: 'movers' keeps only Ryan's supply pipeline;
      //          'customers' excludes it (everything else = demand-side).
      const audience = typeof req.query.audience === 'string' ? req.query.audience : undefined;
      const page = Math.max(1, Number(req.query.page ?? 1));
      const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize ?? 50)));

      const filters: any[] = [];
      if (status) filters.push(eq(leads.status, status));
      if (source) filters.push(eq(leads.sourceChannel, source));
      if (sinceParam) {
        const since = new Date(sinceParam);
        if (!isNaN(since.getTime())) filters.push(sql`${leads.createdAt} >= ${since}`);
      }
      if (audience === 'movers') {
        // Ryan's individual gig workers (b2bm). utmCampaign fallback catches
        // historical rows still on the legacy 'ryan-brooks' tag pre-backfill.
        filters.push(
          or(
            eq(leads.leadType, 'b2bm'),
            eq(leads.utmCampaign, 'ryan-brooks'),
          )!,
        );
      } else if (audience === 'partners') {
        // Sam's B2B fleet-partner prospects (b2bp).
        filters.push(eq(leads.leadType, 'b2bp'));
      } else if (audience === 'customers') {
        // Demand side — quote leads. utmCampaign guard is defence-in-depth
        // against Ryan's legacy rows still stuck at leadType='b2c' pre-backfill.
        filters.push(
          and(
            eq(leads.leadType, 'b2c'),
            or(
              isNull(leads.utmCampaign),
              ne(leads.utmCampaign, 'ryan-brooks'),
            ),
          )!,
        );
      }
      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      const countRows = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(leads)
        .where(whereClause as any);
      const total = countRows[0]?.n ?? 0;

      const rows = await db
        .select()
        .from(leads)
        .where(whereClause as any)
        .orderBy(desc(leads.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      res.json({ data: rows, page, pageSize, total });
    } catch (err) {
      logger.error({ err }, '[Admin] leads list failed');
      res.status(500).json({ error: 'Failed to list leads' });
    }
  });

  // ===== PRIVACY: DATA DELETION REQUEST =====
  // Public unauthenticated endpoint linked from lervit.com/data-deletion.
  // Records the request as a business event + escalates to John via Xavier;
  // 30-day fulfilment happens out-of-band.
  app.post("/api/data-deletion", async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const fbUserId = typeof body.fbUserId === 'string' ? body.fbUserId.trim() : '';

      if (!rawEmail) {
        return res.status(400).json({ error: 'Email required' });
      }
      // Cheap format guard — anything more strict belongs in a shared validator.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      await emitEvent(
        'privacy.deletion_requested',
        'customer',
        rawEmail,
        { name: name || null, email: rawEmail, fbUserId: fbUserId || null },
        'system',
      );

      // Fire-and-forget escalate — never block the response on an SMS.
      import('./agents/xavier')
        .then(({ xavier }) =>
          xavier.run('escalate', {
            issue: `Data deletion request from ${name || 'Unknown'} (${rawEmail})${
              fbUserId ? ` — Facebook ID: ${fbUserId}` : ''
            }`,
            severity: 'low',
            agentName: 'System',
            data: { name, email: rawEmail, fbUserId },
          }),
        )
        .catch((err) =>
          logger.warn({ err }, '[Privacy] Xavier escalation failed for deletion request'),
        );

      logger.info(
        { email: rawEmail, hasName: !!name, hasFbUserId: !!fbUserId },
        '[Privacy] Deletion request received',
      );

      return res.json({
        ok: true,
        message: 'Request received. We will process within 30 days and email confirmation.',
      });
    } catch (err) {
      logger.error({ err }, '[Privacy] deletion request failed');
      return res.status(500).json({ error: 'Failed to record request' });
    }
  });

  // ===== QUOTES =====
  // Anonymous quote persistence. Saved from the /request-move overlay the
  // moment a price is computed — before contact capture — so Alex can email
  // a /quote/:id link that restores the exact quote.

  const QUOTE_TTL_MS = 48 * 60 * 60 * 1000;

  // 6-char base62 slug (~56B combinations — collision-safe at Calgary volume)
  const generateQuoteShortId = (): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  app.post("/api/quotes", async (req: Request, res: Response) => {
    try {
      const b = req.body ?? {};
      const pickupAddress = typeof b.pickupAddress === 'string' ? b.pickupAddress.trim() : '';
      if (!pickupAddress) {
        return res.status(400).json({ error: 'pickupAddress required' });
      }
      const toDec = (v: unknown): string | null => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n.toString() : null;
      };
      const expiresAt = new Date(Date.now() + QUOTE_TTL_MS);

      // Retry-on-collision loop. Collision is astronomically unlikely (6-char base62
      // over Calgary quote volume), but the unique constraint would throw if it hit.
      let quote: typeof quotes.$inferSelect | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const shortId = generateQuoteShortId();
          [quote] = await db.insert(quotes).values({
            shortId,
            pickupAddress,
            dropoffAddress: typeof b.dropoffAddress === 'string' ? b.dropoffAddress : null,
            pickupLat: toDec(b.pickupLat),
            pickupLng: toDec(b.pickupLng),
            dropoffLat: toDec(b.dropoffLat),
            dropoffLng: toDec(b.dropoffLng),
            distanceKm: toDec(b.distanceKm),
            loadSize: typeof b.loadSize === 'string' ? b.loadSize : null,
            itemsJson: b.itemsJson ?? null,
            vehicleType: typeof b.vehicleType === 'string' ? b.vehicleType : null,
            numberOfMovers: Number.isFinite(Number(b.numberOfMovers)) ? Number(b.numberOfMovers) : 1,
            totalPrice: toDec(b.totalPrice),
            baseFee: toDec(b.baseFee),
            distanceFee: toDec(b.distanceFee),
            loadFee: toDec(b.loadFee),
            status: 'pending',
            expiresAt,
          }).returning();
          break;
        } catch (insertErr: any) {
          const msg = String(insertErr?.message ?? '');
          if (attempt < 4 && msg.includes('short_id')) continue;
          throw insertErr;
        }
      }
      if (!quote) throw new Error('quote insert failed after retries');

      // Auto-capture lead from quote when the client attached contact info.
      // Best-effort: a failure here must not block the quote response.
      const email = typeof b.email === 'string' ? b.email.trim() : '';
      const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
      const contactName = typeof b.name === 'string' ? b.name.trim() : '';
      if (email || phone) {
        try {
          const existingLead = await db
            .select()
            .from(leads)
            .where(email ? eq(leads.contactEmail, email) : eq(leads.contactPhone, phone))
            .limit(1);

          if (!existingLead.length) {
            const [newLead] = await db
              .insert(leads)
              .values({
                contactEmail: email || null,
                contactPhone: phone || null,
                contactName: contactName || null,
                sourceChannel: 'quote_form',
                utmCampaign: 'scout-reid',
                leadType: 'b2c',
                intentScore: 85,
                status: 'new',
                quoteId: quote.id,
                notes:
                  `Auto-captured from quote.\n` +
                  `Pickup: ${quote.pickupAddress}\n` +
                  `Dropoff: ${quote.dropoffAddress ?? '—'}\n` +
                  `Price: $${quote.totalPrice ?? '—'}`,
              })
              .returning();
            logger.info(
              { leadId: newLead.id, quoteId: quote.id, email },
              '[quotes] Lead auto-captured',
            );
          } else {
            await db
              .update(leads)
              .set({ quoteId: quote.id, updatedAt: new Date() })
              .where(eq(leads.id, existingLead[0].id));
          }
        } catch (leadErr) {
          logger.warn({ err: leadErr, quoteId: quote.id }, '[quotes] auto lead-capture failed (non-fatal)');
        }
      }

      return res.status(201).json({
        ok: true,
        quoteId: quote.id,
        shortId: quote.shortId,
        expiresAt: quote.expiresAt,
      });
    } catch (err) {
      logger.error({ err }, '[quotes] save failed');
      return res.status(500).json({ error: 'Failed to save quote' });
    }
  });

  // SMS-friendly short quote URL. Resolves shortId to full quote id and redirects.
  app.get("/q/:shortId", async (req: Request, res: Response) => {
    try {
      const { shortId } = req.params;
      if (!/^[a-zA-Z0-9]{6}$/.test(shortId)) {
        return res.redirect('/request-move');
      }
      const [quote] = await db.select({ id: quotes.id })
        .from(quotes)
        .where(eq(quotes.shortId, shortId))
        .limit(1);
      if (!quote) return res.redirect('/request-move');
      return res.redirect(`/quote/${quote.id}`);
    } catch (err) {
      logger.warn({ err }, '[quotes] short-id redirect failed');
      return res.redirect('/request-move');
    }
  });

  app.get("/api/quotes/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const [quote] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
      if (!quote) return res.status(404).json({ error: 'Quote not found' });
      if (new Date() > new Date(quote.expiresAt)) {
        return res.status(410).json({ error: 'Quote expired', expiredAt: quote.expiresAt });
      }
      if (quote.status === 'pending') {
        await db.update(quotes)
          .set({ status: 'viewed', updatedAt: new Date() })
          .where(eq(quotes.id, id));
      }
      return res.json({ ...quote, hasContact: !!quote.leadId });
    } catch (err) {
      logger.error({ err }, '[quotes] fetch failed');
      return res.status(500).json({ error: 'Failed to fetch quote' });
    }
  });

  app.patch("/api/quotes/:id/convert", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { bookingId, leadId } = req.body ?? {};
      await db.update(quotes).set({
        status: 'booked',
        bookingId: bookingId ?? null,
        leadId: leadId ?? null,
        updatedAt: new Date(),
      }).where(eq(quotes.id, id));
      return res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, '[quotes] convert failed');
      return res.status(500).json({ error: 'Failed to convert quote' });
    }
  });

  // Public quote-form capture. Called from the price-estimate overlay in
  // RequestMove when the visitor hasn't authenticated. Creates a warm
  // (intentScore 85) lead and hands it to Alex for immediate follow-up.
  app.post("/api/leads/capture", async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
      const quoteContext = body.quoteContext && typeof body.quoteContext === 'object'
        ? body.quoteContext as {
            totalPrice?: string | null;
            items?: string | null;
            vehicleLabel?: string | null;
            distanceKm?: string | null;
            numberOfMovers?: number;
            pickupAddress?: string | null;
            dropoffAddress?: string | null;
          }
        : null;
      const quoteId = typeof body.quoteId === 'string' && body.quoteId ? body.quoteId : null;

      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!phone && !email) {
        return res.status(400).json({ error: 'phone or email is required' });
      }

      const notesLines: string[] = [];
      if (notes) notesLines.push(notes);
      if (quoteContext?.pickupAddress) notesLines.push(`Pickup: ${quoteContext.pickupAddress}`);
      if (quoteContext?.dropoffAddress) notesLines.push(`Dropoff: ${quoteContext.dropoffAddress}`);
      if (quoteContext?.totalPrice) notesLines.push(`Quote: ${quoteContext.totalPrice}`);
      if (quoteContext?.items) notesLines.push(`Items: ${quoteContext.items}`);
      if (quoteContext?.vehicleLabel) notesLines.push(`Vehicle: ${quoteContext.vehicleLabel}`);
      if (quoteContext?.distanceKm) notesLines.push(`Distance: ${quoteContext.distanceKm}km`);
      if (quoteContext?.numberOfMovers && quoteContext.numberOfMovers > 1) {
        notesLines.push(`Movers: ${quoteContext.numberOfMovers} needed`);
      }
      const finalNotes = notesLines.length > 0 ? notesLines.join('\n') : 'Quote form capture';

      const [row] = await db.insert(leads).values({
        contactName: name,
        contactEmail: email || null,
        contactPhone: phone || null,
        sourceChannel: 'quote_form',
        utmSource: 'quote_form',
        utmCampaign: 'scout-reid',
        leadType: 'b2c',
        intentScore: 85,
        status: 'new',
        notes: finalNotes,
        quoteId,
      }).returning({ id: leads.id });

      if (quoteId) {
        try {
          await db.update(quotes)
            .set({ leadId: row.id, updatedAt: new Date() })
            .where(eq(quotes.id, quoteId));
        } catch (err) {
          logger.warn({ err, quoteId, leadId: row.id }, '[quote_form] quote back-link failed (non-fatal)');
        }
      }

      const alexQueue = createAgentQueue(QUEUE_NAMES.CLOSER_D);
      if (alexQueue) {
        await alexQueue.add('convert_lead', { leadId: row.id });
      } else {
        logger.warn({ leadId: row.id }, '[quote_form] alex queue unavailable — lead not routed');
      }

      res.status(201).json({ ok: true, leadId: row.id });
    } catch (err) {
      logger.error({ err }, '[quote_form] lead capture failed');
      res.status(500).json({ error: 'Failed to capture lead' });
    }
  });

  // Public mover application intake. Called from the /become-a-mover page
  // on the marketing site (website-standalone). Creates a high-intent
  // recruitment lead (intentScore 90) and hands it to Jordan (VETTER)
  // for immediate onboarding follow-up.
  app.post("/api/apply/mover", async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const neighbourhood = typeof body.neighbourhood === 'string' ? body.neighbourhood.trim() : '';
      const vehicleTypeRaw = typeof body.vehicleType === 'string' ? body.vehicleType.trim() : '';
      // Coerce the applicant's free-form vehicle string to a canonical value so
      // downstream reviewers and Ryan/Jordan pipelines see 'car'|'pickup'|'van'|'truck'
      // rather than "F150" / "cargo van 2500" / etc.
      const vehicleType = vehicleTypeRaw
        ? vehicleTypeFromClass(vehicleClassFromVehicleType(vehicleTypeRaw))
        : '';
      const vehicleYear = typeof body.vehicleYear === 'string' ? body.vehicleYear.trim() : '';
      const vehicleMake = typeof body.vehicleMake === 'string' ? body.vehicleMake.trim() : '';
      const canMoveFurniture = body.canMoveFurniture === true || body.canMoveFurniture === 'true';
      const availability: string[] = Array.isArray(body.availability)
        ? body.availability.filter((s: unknown) => typeof s === 'string')
        : [];
      const minJobsPerWeek = typeof body.minJobsPerWeek === 'string' ? body.minJobsPerWeek.trim() : '';
      const referralSource = typeof body.referralSource === 'string' ? body.referralSource.trim() : '';

      if (!name) return res.status(400).json({ error: 'Name is required' });
      if (!phone && !email) return res.status(400).json({ error: 'Phone or email is required' });

      const notes = [
        'Mover Application',
        `Vehicle: ${[vehicleTypeRaw || vehicleType, vehicleYear, vehicleMake].filter(Boolean).join(' ') || 'Not specified'}${vehicleType && vehicleTypeRaw && vehicleType !== vehicleTypeRaw.toLowerCase() ? ` (class → ${vehicleType})` : ''}`,
        `Can move furniture: ${canMoveFurniture ? 'Yes' : 'No'}`,
        `Neighbourhood: ${neighbourhood || 'Not specified'}`,
        `Availability: ${availability.length ? availability.join(', ') : 'Not specified'}`,
        `Min jobs/week: ${minJobsPerWeek || 'Not specified'}`,
        `Referral: ${referralSource || 'Not specified'}`,
      ].join('\n');

      const [lead] = await db.insert(leads).values({
        contactName: name,
        contactEmail: email || null,
        contactPhone: phone || null,
        sourceChannel: 'mover_application',
        utmSource: referralSource || 'direct',
        utmCampaign: 'ryan-brooks',
        leadType: 'b2bm',
        intentScore: 90,
        status: 'new',
        notes,
      }).returning({ id: leads.id });

      const jordanQueue = createAgentQueue(QUEUE_NAMES.VETTER);
      if (jordanQueue) {
        try {
          await jordanQueue.add('onboard_candidate', { leadId: lead.id });
        } catch (queueErr) {
          logger.warn({ err: queueErr, leadId: lead.id }, '[mover_application] jordan enqueue failed');
        }
      } else {
        logger.warn({ leadId: lead.id }, '[mover_application] jordan queue unavailable — lead saved');
      }

      await emitEvent('lead.mover_application', 'lead', lead.id, { vehicleType, neighbourhood });

      return res.status(201).json({ ok: true, leadId: lead.id });
    } catch (err) {
      logger.error({ err }, '[mover_application] failed');
      return res.status(500).json({ error: 'Application failed. Please try again.' });
    }
  });

  // Manually create a lead (admin-entered warm intro, phone call, referral, etc.).
  app.post("/api/admin/agent/leads", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const body = req.body ?? {};
      const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : '';
      const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() || null : null;
      const contactPhone = typeof body.contactPhone === 'string' ? body.contactPhone.trim() || null : null;
      if (!contactEmail && !contactPhone) {
        return res.status(400).json({ error: 'At least one of contactEmail or contactPhone is required' });
      }
      const sourceChannel = typeof body.sourceChannel === 'string' && body.sourceChannel.trim()
        ? body.sourceChannel.trim()
        : 'personal';
      const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
      const intentScore = Math.max(0, Math.min(100, Number(body.intentScore ?? 80)));
      const status = typeof body.status === 'string' && body.status.trim() ? body.status.trim() : 'new';
      const utmCampaign = typeof body.utmCampaign === 'string' && body.utmCampaign.trim()
        ? body.utmCampaign.trim()
        : 'admin-manual';

      // Admin add is dual-purpose: the client sends utmCampaign='ryan-brooks'
      // when the audience tab is 'movers', otherwise it's a customer add.
      // Set leadType explicitly per-branch so the row is correctly classified
      // for the audience filters.
      const isMoverAdd = utmCampaign === 'ryan-brooks';

      const [row] = await db.insert(leads).values({
        contactName: contactName || null,
        contactEmail,
        contactPhone,
        sourceChannel,
        utmSource: sourceChannel,
        utmCampaign,
        leadType: isMoverAdd ? 'b2bm' : 'b2c',
        notes,
        intentScore,
        status,
      }).returning();

      res.status(201).json({ lead: row });
    } catch (err) {
      logger.error({ err }, '[Admin] lead create failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Single lead + its business_events timeline.
  app.get("/api/admin/agent/leads/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const [lead] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      const events = await db
        .select()
        .from(businessEvents)
        .where(and(eq(businessEvents.entityType, 'lead'), eq(businessEvents.entityId, req.params.id)))
        .orderBy(desc(businessEvents.createdAt))
        .limit(200);
      res.json({ lead, events });
    } catch (err) {
      logger.error({ err }, '[Admin] lead detail failed');
      res.status(500).json({ error: 'Failed to load lead' });
    }
  });

  // Manually add contact details to an anonymous lead (URL-only Kijiji/Craigslist rows).
  // Requires at least one of email or phone.
  app.patch("/api/admin/agent/leads/:id/contact", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const body = req.body ?? {};
      const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : '';
      const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : '';
      const contactPhone = typeof body.contactPhone === 'string' ? body.contactPhone.trim() : '';

      if (!contactEmail && !contactPhone) {
        return res.status(400).json({ error: 'At least one of contactEmail or contactPhone is required' });
      }

      const [existing] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Lead not found' });

      const [updated] = await db
        .update(leads)
        .set({
          contactName: contactName || existing.contactName,
          contactEmail: contactEmail || existing.contactEmail,
          contactPhone: contactPhone || existing.contactPhone,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, req.params.id))
        .returning();

      res.json({ lead: updated });
    } catch (err) {
      logger.error({ err }, '[Admin] lead contact patch failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // General lead update — used by the mover candidate card edit view.
  // Accepts any subset of contactName, contactEmail, contactPhone, notes, status.
  // Unlike /contact this also updates notes + status (e.g. mark converted).
  app.patch("/api/admin/agent/leads/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const body = req.body ?? {};
      const patch: Record<string, unknown> = {};

      if (body.contactName !== undefined) {
        patch.contactName = typeof body.contactName === 'string' && body.contactName.trim()
          ? body.contactName.trim()
          : null;
      }
      if (body.contactEmail !== undefined) {
        patch.contactEmail = typeof body.contactEmail === 'string' && body.contactEmail.trim()
          ? body.contactEmail.trim()
          : null;
      }
      if (body.contactPhone !== undefined) {
        patch.contactPhone = typeof body.contactPhone === 'string' && body.contactPhone.trim()
          ? body.contactPhone.trim()
          : null;
      }
      if (body.notes !== undefined) {
        patch.notes = typeof body.notes === 'string' && body.notes.trim()
          ? body.notes.trim()
          : null;
      }
      if (body.status !== undefined) {
        const allowed = new Set(['new', 'contacted', 'converted', 'cold']);
        const status = typeof body.status === 'string' ? body.status.trim() : '';
        if (!allowed.has(status)) {
          return res.status(400).json({ error: `Invalid status: ${status}` });
        }
        patch.status = status;
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No updatable fields provided' });
      }

      patch.updatedAt = new Date();

      const [existing] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Lead not found' });

      const [updated] = await db
        .update(leads)
        .set(patch)
        .where(eq(leads.id, req.params.id))
        .returning();

      res.json({ lead: updated });
    } catch (err) {
      logger.error({ err }, '[Admin] lead patch failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Hard-delete a lead. Used to prune false positives from Scout crawls
  // (out-of-region signals, figurative "moving" language, etc.).
  app.delete("/api/admin/agent/leads/:id", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const deleted = await db
        .delete(leads)
        .where(eq(leads.id, req.params.id))
        .returning({ id: leads.id });
      if (deleted.length === 0) return res.status(404).json({ error: 'Lead not found' });
      res.status(200).json({ ok: true, id: deleted[0].id });
    } catch (err) {
      logger.error({ err }, '[Admin] lead delete failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Manually trigger Scout crawl.
  app.post("/api/admin/agent/scout/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const action = (req.body?.action ?? 'process_signals') as string;
      const allowed = new Set([
        'process_signals',
        'crawl_google_alerts',
        'crawl_kijiji',
        'crawl_google_maps',
        'score_lead',
      ]);
      if (!allowed.has(action)) {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const input = req.body?.input ?? {};

      const queue = createAgentQueue(QUEUE_NAMES.HUNTER_D);
      if (queue) {
        const job = await queue.add(action, input);
        return res.status(202).json({ ok: true, queued: true, action, jobId: job.id });
      }

      // Redis unavailable (local dev without REDIS_URL) — fall back to blocking run.
      const { scout } = await import('./agents/scout');
      const result = await scout.run(action, input);
      res.json({ ok: true, queued: false, action, result });
    } catch (err) {
      logger.error({ err }, '[Admin] scout/trigger failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Manually trigger Alex on a specific lead or booking.
  app.post("/api/admin/agent/alex/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { alex } = await import('./agents/alex');
      const action = (req.body?.action ?? 'convert_lead') as string;
      const dryRun = req.body?.dry_run === true || req.body?.dryRun === true;
      if (action === 'convert_lead' || action === 'send_touch') {
        const leadId = req.body?.leadId ?? req.body?.input?.leadId;
        if (!leadId) return res.status(400).json({ error: 'leadId required' });
        const touchNumber = Number(req.body?.touchNumber ?? req.body?.input?.touchNumber ?? 2);
        const channelOverride = req.body?.channelOverride ?? req.body?.input?.channelOverride;
        const input: Record<string, unknown> = { leadId: String(leadId), touchNumber };
        if (channelOverride === 'email' || channelOverride === 'sms') {
          input.channelOverride = channelOverride;
        }
        const result = await alex.run(action, input, { dryRun });
        return res.json({ ok: true, action, dryRun, result });
      }
      if (action === 'recover_abandoned') {
        const bookingId = req.body?.bookingId ?? req.body?.input?.bookingId;
        const result = await alex.run(
          'recover_abandoned',
          bookingId ? { bookingId: String(bookingId) } : {},
          { dryRun },
        );
        return res.json({ ok: true, action, dryRun, result });
      }
      return res.status(400).json({ error: `Unsupported action: ${action}` });
    } catch (err) {
      logger.error({ err }, '[Admin] alex/trigger failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Alex conversion funnel + touch effectiveness for the last N days.
  app.get("/api/admin/agent/alex/stats", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const days = Math.max(1, Math.min(90, Number(req.query.days ?? 7)));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const funnelRows = await db.execute(sql`
        SELECT
          COUNT(*)                                                   ::int AS total,
          COUNT(*) FILTER (WHERE status = 'new')                     ::int AS new_,
          COUNT(*) FILTER (WHERE status = 'contacted')               ::int AS contacted,
          COUNT(*) FILTER (WHERE status = 'converted')               ::int AS converted,
          COUNT(*) FILTER (WHERE status = 'cold')                    ::int AS cold
        FROM leads
        WHERE created_at >= ${since}
      `);
      const funnel = (funnelRows as any).rows?.[0] ?? { total: 0, new_: 0, contacted: 0, converted: 0, cold: 0 };

      const channelRows = await db.execute(sql`
        SELECT
          COALESCE(payload->>'channel', 'unknown')                   AS channel,
          COUNT(*)                                                   ::int AS touches,
          COUNT(*) FILTER (WHERE (payload->>'delivered') = 'true')   ::int AS delivered
        FROM business_events
        WHERE event_type IN ('lead.contacted','lead.touched')
          AND created_at >= ${since}
        GROUP BY 1
        ORDER BY touches DESC
      `);
      const byChannel = (channelRows as any).rows ?? [];

      res.json({ days, since: since.toISOString(), funnel, byChannel });
    } catch (err) {
      logger.error({ err }, '[Admin] alex/stats failed');
      res.status(500).json({ error: 'Failed to load Alex stats' });
    }
  });

  // ===== RYAN BROOKS (HUNTER-S) + JORDAN HAYES (VETTER) — supply pipeline =====

  // Manually trigger Ryan's supply crawl.
  app.post("/api/admin/agent/ryan/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const action = (req.body?.action ?? 'process_signals') as string;
      const allowed = new Set([
        'process_signals',
        'crawl_kijiji_services',
        'crawl_craigslist_services',
        'crawl_supply_alerts',
        'crawl_google_maps',
        'score_candidate',
      ]);
      if (!allowed.has(action)) {
        return res.status(400).json({ error: `Unsupported action: ${action}` });
      }
      const input = req.body?.input ?? {};

      const queue = createAgentQueue(QUEUE_NAMES.HUNTER_S);
      if (queue) {
        const job = await queue.add(action, input);
        return res.status(202).json({ ok: true, queued: true, action, jobId: job.id });
      }

      // Redis unavailable (local dev without REDIS_URL) — fall back to blocking run.
      const { ryan } = await import('./agents/ryan');
      const result = await ryan.run(action, input);
      res.json({ ok: true, queued: false, action, result });
    } catch (err) {
      logger.error({ err }, '[Admin] ryan/trigger failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Supply funnel — leads created by Ryan (utm_campaign='ryan-brooks').
  app.get("/api/admin/agent/ryan/stats", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const days = Math.max(1, Math.min(90, Number(req.query.days ?? 7)));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const funnelRows = await db.execute(sql`
        SELECT
          COUNT(*)                                                   ::int AS total,
          COUNT(*) FILTER (WHERE status = 'new')                     ::int AS new_,
          COUNT(*) FILTER (WHERE status = 'contacted')               ::int AS contacted,
          COUNT(*) FILTER (WHERE status = 'converted')               ::int AS converted,
          COUNT(*) FILTER (WHERE status = 'cold')                    ::int AS cold
        FROM leads
        WHERE utm_campaign = 'ryan-brooks'
          AND created_at >= ${since}
      `);
      const funnel = (funnelRows as any).rows?.[0] ?? { total: 0, new_: 0, contacted: 0, converted: 0, cold: 0 };

      const sourceRows = await db.execute(sql`
        SELECT
          COALESCE(source_channel, 'unknown') AS source,
          COUNT(*)                            ::int AS count
        FROM leads
        WHERE utm_campaign = 'ryan-brooks'
          AND created_at >= ${since}
        GROUP BY 1
        ORDER BY count DESC
      `);
      const bySource = (sourceRows as any).rows ?? [];

      const channelRows = await db.execute(sql`
        SELECT
          COALESCE(payload->>'channel', 'unknown')                   AS channel,
          COUNT(*)                                                   ::int AS touches,
          COUNT(*) FILTER (WHERE (payload->>'delivered') = 'true')   ::int AS delivered
        FROM business_events
        WHERE event_type IN ('lead.mover_contacted','lead.mover_touched')
          AND created_at >= ${since}
        GROUP BY 1
        ORDER BY touches DESC
      `);
      const byChannel = (channelRows as any).rows ?? [];

      res.json({ days, since: since.toISOString(), funnel, bySource, byChannel });
    } catch (err) {
      logger.error({ err }, '[Admin] ryan/stats failed');
      res.status(500).json({ error: 'Failed to load Ryan stats' });
    }
  });

  // Manually trigger Jordan on a specific candidate lead.
  app.post("/api/admin/agent/jordan/trigger", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      const { jordan } = await import('./agents/jordan');
      const action = (req.body?.action ?? 'onboard_candidate') as string;
      if (action === 'onboard_candidate' || action === 'send_touch') {
        if (!req.body?.leadId) return res.status(400).json({ error: 'leadId required' });

        const [lead] = await db
          .select({ leadType: leads.leadType })
          .from(leads)
          .where(eq(leads.id, String(req.body.leadId)))
          .limit(1);
        if (!lead) return res.status(404).json({ error: 'Lead not found' });
        // Jordan handles individual movers (b2bm) and unclassified/customer
        // leads that happen to be routed to him. Only B2B fleet partners
        // (b2bp) are Sam's exclusive domain.
        if (lead.leadType === 'b2bp') {
          return res.status(400).json({
            error: 'Wrong agent',
            message:
              'Jordan handles individual mover candidates only. Use Sam Carter for B2B fleet partners.',
          });
        }

        const channelOverride = req.body?.channelOverride;
        const input: Record<string, unknown> = {
          leadId: String(req.body.leadId),
          touchNumber: Number(req.body.touchNumber ?? 2),
        };
        if (channelOverride === 'email' || channelOverride === 'sms') {
          input.channelOverride = channelOverride;
        }
        const result = await jordan.run(action, input);
        return res.json({ ok: true, action, result });
      }
      return res.status(400).json({ error: `Unsupported action: ${action}` });
    } catch (err) {
      logger.error({ err }, '[Admin] jordan/trigger failed');
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ===== SPRINT 5: MOVER EARNINGS PDF =====

  app.get("/api/mover/earnings/pdf", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const moversForUser = await storage.getMovers({ userId: user.id });
      if (!moversForUser.length) {
        return res.status(404).json({ error: "Mover profile not found" });
      }
      const mover = moversForUser[0];

      const monthParam = req.query.month as string | undefined;
      let monthLabel = 'All Time';
      let earningsQuery = db
        .select()
        .from(moverEarnings)
        .where(eq(moverEarnings.moverId, mover.id))
        .$dynamic();

      if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        const [year, month] = monthParam.split('-').map(Number);
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);
        earningsQuery = db
          .select()
          .from(moverEarnings)
          .where(and(
            eq(moverEarnings.moverId, mover.id),
            sql`${moverEarnings.createdAt} >= ${start.toISOString()}`,
            sql`${moverEarnings.createdAt} < ${end.toISOString()}`
          ))
          .$dynamic();
        monthLabel = format(start, 'MMMM yyyy');
      }

      const earningsRows = await earningsQuery.orderBy(moverEarnings.createdAt);

      // Enrich with booking info
      const rows: { date: string; pickup: string; dropoff: string; gross: string; fee: string; net: string; status: string }[] = [];
      for (const e of earningsRows) {
        const booking = await storage.getBooking(e.bookingId);
        rows.push({
          date: format(new Date(e.createdAt), 'MMM d, yyyy'),
          pickup: booking?.pickupAddress?.split(',')[0] ?? '—',
          dropoff: booking?.dropoffAddress?.split(',')[0] ?? '—',
          gross: `$${parseFloat(e.grossAmount).toFixed(2)}`,
          fee: `$${parseFloat(e.platformFeeAmount).toFixed(2)}`,
          net: `$${parseFloat(e.netAmount).toFixed(2)}`,
          status: e.status,
        });
      }

      const totalGross = earningsRows.reduce((s, e) => s + parseFloat(e.grossAmount), 0);
      const totalFee = earningsRows.reduce((s, e) => s + parseFloat(e.platformFeeAmount), 0);
      const totalNet = earningsRows.reduce((s, e) => s + parseFloat(e.netAmount), 0);

      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ margin: 50, size: 'A4' });

      const filename = monthParam ? `earnings-${monthParam}.pdf` : 'earnings-all-time.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      doc.pipe(res);

      // Header
      doc.fontSize(20).fillColor('#1D4ED8').font('Helvetica-Bold').text('LervIT', 50, 50);
      doc.fontSize(10).fillColor('#6B7280').font('Helvetica').text('Earnings Statement', 50, doc.y + 2);
      doc.moveDown(0.5);
      doc.fontSize(13).fillColor('#111827').font('Helvetica-Bold').text(`${user.name}  —  ${monthLabel}`);
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(0.5).strokeColor('#E5E7EB').stroke();
      doc.moveDown(0.5);

      // Summary
      doc.fontSize(10).fillColor('#111827').font('Helvetica-Bold').text('Summary', { underline: false });
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').fillColor('#374151');
      doc.text(`Total Jobs: ${rows.length}`);
      doc.text(`Gross Revenue: $${totalGross.toFixed(2)} CAD`);
      doc.text(`Platform Fee: $${totalFee.toFixed(2)} CAD`);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1D4ED8').text(`Net Earnings: $${totalNet.toFixed(2)} CAD`);
      doc.moveDown(0.8);

      // Table headers
      if (rows.length > 0) {
        doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(0.5).strokeColor('#E5E7EB').stroke();
        doc.moveDown(0.3);
        const colX = [50, 110, 230, 330, 390, 450, 505];
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#6B7280');
        doc.text('Date', colX[0], doc.y, { width: 55, continued: true });
        doc.text('Pickup', colX[1] - doc.x + colX[1], doc.y, { width: 115, continued: true });
        doc.text('Dropoff', { width: 95, continued: true });
        doc.text('Gross', { width: 55, continued: true });
        doc.text('Fee', { width: 55, continued: true });
        doc.text('Net', { width: 50, continued: true });
        doc.text('Status', { width: 50 });
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(0.4).strokeColor('#D1D5DB').stroke();
        doc.moveDown(0.2);

        for (const row of rows) {
          doc.fontSize(8).font('Helvetica').fillColor('#111827');
          const y = doc.y;
          doc.text(row.date, colX[0], y, { width: 55, lineBreak: false });
          doc.text(row.pickup, colX[1], y, { width: 115, lineBreak: false });
          doc.text(row.dropoff, colX[2], y, { width: 95, lineBreak: false });
          doc.text(row.gross, colX[3], y, { width: 55, lineBreak: false });
          doc.text(row.fee, colX[4], y, { width: 55, lineBreak: false });
          doc.text(row.net, colX[5], y, { width: 50, lineBreak: false });
          doc.text(row.status, colX[6], y, { width: 50, lineBreak: false });
          doc.moveDown(0.8);
        }

        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(0.5).strokeColor('#E5E7EB').stroke();
        doc.moveDown(0.3);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#1D4ED8')
          .text(`Net Total: $${totalNet.toFixed(2)} CAD`, { align: 'right' });
      } else {
        doc.fontSize(9).fillColor('#6B7280').font('Helvetica').text('No earnings found for this period.');
      }

      doc.moveDown(1);
      doc.fontSize(7).fillColor('#9CA3AF').font('Helvetica')
        .text(`Generated ${format(new Date(), 'MMM d, yyyy')} · LervIT Platform`, { align: 'center' });

      doc.end();
    } catch (error) {
      logEvent.error('mover_earnings_pdf', error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to generate earnings PDF" });
    }
  });

  // ===== SPRINT 6: MOVER AVAILABILITY CALENDAR =====

  app.get("/api/mover/availability", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const month = req.query.month as string | undefined; // YYYY-MM
      let rows;
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const startDate = `${month}-01`;
        const [year, mon] = month.split('-').map(Number);
        const endDate = new Date(year, mon, 0).toISOString().slice(0, 10); // last day of month
        rows = await db.select().from(moverAvailability)
          .where(and(
            eq(moverAvailability.userId, user.id),
            sql`${moverAvailability.availableDate} >= ${startDate}`,
            sql`${moverAvailability.availableDate} <= ${endDate}`
          ))
          .orderBy(moverAvailability.availableDate);
      } else {
        rows = await db.select().from(moverAvailability)
          .where(eq(moverAvailability.userId, user.id))
          .orderBy(moverAvailability.availableDate);
      }
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/mover/availability", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const schema = z.object({
        availableDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
      });
      const body = validateBody(schema, req.body);
      const [row] = await db.insert(moverAvailability)
        .values({ userId: user.id, ...body })
        .onConflictDoUpdate({
          target: [moverAvailability.userId, moverAvailability.availableDate],
          set: { startTime: body.startTime ?? null, endTime: body.endTime ?? null },
        })
        .returning();
      res.json(row);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/mover/availability/:date", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const dateParam = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      await db.delete(moverAvailability)
        .where(and(eq(moverAvailability.userId, user.id), eq(moverAvailability.availableDate, dateParam)));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== SPRINT 6: REFERRAL PROGRAM =====

  app.get("/api/referrals", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const rows = await db.select().from(referrals)
        .where(eq(referrals.referrerId, user.id))
        .orderBy(desc(referrals.createdAt));
      res.json({
        referralCode: user.referralCode,
        referralCredits: user.referralCredits ?? 0,
        referrals: rows,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/referrals/apply", async (req: Request, res: Response) => {
    try {
      if (!requireUser(req, res)) return;
      const user = (req as any).user;
      const schema = z.object({ code: z.string().min(1).max(6).transform(s => s.toUpperCase()) });
      const { code } = validateBody(schema, req.body);

      // Can't use own code
      if (user.referralCode === code) {
        return res.status(400).json({ error: "You cannot use your own referral code" });
      }
      // Already received a referral?
      const existing = await db.select({ id: referrals.id }).from(referrals)
        .where(eq(referrals.referredId, user.id)).limit(1);
      if (existing.length > 0) {
        return res.status(400).json({ error: "You have already used a referral code" });
      }
      // Find referrer
      const [referrer] = await db.select({ id: usersTable.id, referralCode: usersTable.referralCode })
        .from(usersTable).where(eq(usersTable.referralCode, code)).limit(1);
      if (!referrer) {
        return res.status(404).json({ error: "Referral code not found" });
      }
      // Record referral and award credits to referrer
      await db.insert(referrals).values({
        referrerId: referrer.id,
        referredId: user.id,
        code,
        creditAwarded: true,
      });
      await db.update(usersTable)
        .set({ referralCredits: sql`${usersTable.referralCredits} + 20` })
        .where(eq(usersTable.id, referrer.id));
      res.json({ success: true, message: "$20 referral credit applied" });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== SPRINT 6: UPTIME MONITORING =====

  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({ status: "error", error: "Database unreachable" });
    }
  });

  app.get("/api/health/detailed", async (req: Request, res: Response) => {
    try {
      if (!requireAdmin(req, res)) return;
      let dbStatus = "ok";
      try { await db.execute(sql`SELECT 1`); } catch { dbStatus = "error"; }
      const mem = process.memoryUsage();
      res.json({
        status: dbStatus === "ok" ? "ok" : "degraded",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        db: dbStatus,
        memory: {
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
          rssMb: Math.round(mem.rss / 1024 / 1024),
        },
        websockets: {
          connectedMovers: moverWebSocket.getConnectedMoversCount(),
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== ONE-TIME ADMIN PASSWORD RESET =====
  // Only active when ADMIN_RESET_TOKEN env var is set. Remove after use.
  app.post("/api/internal/reset-admin-password", async (req: Request, res: Response) => {
    const token = process.env.ADMIN_RESET_TOKEN;
    if (!token) return res.status(404).json({ error: "Not found" });
    const provided = req.headers['x-reset-token'] as string | undefined;
    if (!provided || provided !== token) return res.status(403).json({ error: "Forbidden" });
    try {
      const bcrypt = await import('bcryptjs');
      const { newPassword } = req.body;
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ error: "newPassword must be at least 8 characters" });
      }
      const hash = await bcrypt.hash(newPassword, 12);
      const result = await db
        .update(usersTable)
        .set({ password: hash })
        .where(and(eq(usersTable.role, 'admin'), eq(usersTable.email, 'admin12@lervit.com')));
      return res.json({ ok: true, message: "Admin password updated. Remove ADMIN_RESET_TOKEN now." });
    } catch (err) {
      return res.status(500).json({ error: "Failed to update password" });
    }
  });

  // Register enterprise partner portal routes
  registerPartnerRoutes(app);
  // Isolated Telnyx voice routes; disabled safely unless voice env is configured.
  registerVoiceRoutes(app);

  const httpServer = createServer(app);

  // Diagnostic: log every HTTP upgrade the process receives, before any
  // WebSocketServer attaches. If this fires but the per-channel
  // "connection opened" log doesn't, ws is dropping the socket between
  // handshake and connection event.
  httpServer.on('upgrade', (req, socket) => {
    console.log('[http] upgrade request:', req.url, 'from', (socket as Socket).remoteAddress);
  });

  // Each WebSocket init is wrapped independently — a failure in one
  // subsystem (mover, customer, admin-voice) previously threw synchronously
  // through the registerRoutes → server.listen chain and, on Railway, the
  // process-level uncaughtException handler classified it as transient
  // (message includes "WebSocket") and swallowed it. Result: no listener,
  // no logs, Railway 502. Fail-open here so the HTTP surface still binds.
  try {
    moverWebSocket.initialize(httpServer);
    logger.info('Mover WebSocket initialized');
  } catch (err) {
    logger.error({ err }, 'Mover WebSocket init FAILED — continuing without it');
  }
  try {
    customerWebSocket.initialize(httpServer);
    logger.info('Customer WebSocket initialized');
  } catch (err) {
    logger.error({ err }, 'Customer WebSocket init FAILED — continuing without it');
  }
  try {
    adminVoiceWebSocket.initialize(httpServer);
    logger.info('Admin voice WebSocket initialized');
  } catch (err) {
    logger.error({ err }, 'Admin voice WebSocket init FAILED — continuing without it');
  }

  // Nova ↔ ElevenLabs audio bridge. Telnyx bidirectional-stream WebSocket
  // connects here; the bridge translates between Telnyx media frames and
  // ElevenLabs Convai's audio protocol. Path is dynamic (per callControlId),
  // so we use noServer:true + manual upgrade routing.
  try {
    const novaBridgeWss = new WebSocketServer({ noServer: true });

    novaBridgeWss.on('connection', (ws, req) => {
      const callControlId = req.url?.split('/').pop() ?? 'unknown';
      const context = novaCallContextStore.get(callControlId);
      logger.info({ callControlId, hasContext: !!context }, '[Bridge] Telnyx connected');
      createNovaBridge(ws, callControlId, context);
    });

    httpServer.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith('/api/nova/stream/')) {
        novaBridgeWss.handleUpgrade(req, socket, head, (ws) => {
          novaBridgeWss.emit('connection', ws, req);
        });
      }
    });

    logger.info('Nova bridge WebSocket initialized');
  } catch (err) {
    logger.error({ err }, 'Nova bridge WebSocket init FAILED — continuing without it');
  }

  return httpServer;
}
