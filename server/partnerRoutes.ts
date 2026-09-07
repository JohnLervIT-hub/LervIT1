/**
 * ============================================================================
 * ENTERPRISE PARTNER PORTAL ROUTES
 * ============================================================================
 * All /api/partner/* endpoints for enterprise fulfillment partners.
 * All /api/admin/partners/* endpoints for Lervit admin partner management.
 *
 * Security:
 * - Partner routes require session auth + partner role
 * - All partner data is scoped to the user's partner_id
 * - Admin routes require admin role
 * ============================================================================
 */

import type { Express, Request, Response } from "express";
import { db } from "./db";
import { z } from "zod";
import { eq, and, desc, inArray, or, sql, isNull, gt, asc, ne } from "drizzle-orm";
import multer from "multer";
import { randomBytes } from "crypto";
import { stripe } from "./config/stripe";
import {
  users,
  bookings,
  partners,
  partnerUsers,
  partnerInvites,
  coverageZones,
  complianceDocs,
  partnerTeamMembers,
  bookingAssignments,
  bookingStatusEvents,
  partnerIncidents,
  proofOfCompletion,
  partnerAuditLog,
  ENTERPRISE_STATUS_TRANSITIONS,
  ENTERPRISE_TO_BOOKING_STATUS,
  insertCoverageZoneSchema,
  insertPartnerTeamMemberSchema,
  insertPartnerIncidentSchema,
  messages,
  inAppNotifications,
  partnerDirectMessages,
  aiIncidentInsights,
  reviews,
  partnerEarnings,
} from "@shared/schema";
import { analyzeIncident, analyzeAuditEntry } from "./ai-support-analyzer";
import { ObjectStorageService } from "./objectStorage";
import { notificationService, formatCalgaryDate } from "./notifications";
import { getBaseUrl } from "./utils/urls";
import { calculatePartnerNet } from "@shared/pricing";

// ============================================================
// Multer setup for file uploads
// ============================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/webp", "image/heic",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed. Use PDF, image, or Word document."));
  },
});

// ============================================================
// Auth Middleware Helpers
// ============================================================

const PARTNER_ROLES = ["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"] as const;
type PartnerRole = typeof PARTNER_ROLES[number];

async function resolvePartnerContext(req: Request): Promise<{
  user: typeof users.$inferSelect;
  partnerUser: typeof partnerUsers.$inferSelect;
  partner: typeof partners.$inferSelect;
} | null> {
  const userId = (req.session as any)?.userId;
  if (!userId) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  if (!PARTNER_ROLES.includes(user.role as PartnerRole)) return null;

  const [partnerUser] = await db
    .select()
    .from(partnerUsers)
    .where(and(eq(partnerUsers.userId, userId), eq(partnerUsers.isActive, true)))
    .limit(1);
  if (!partnerUser) return null;

  const [partner] = await db.select().from(partners).where(eq(partners.id, partnerUser.partnerId)).limit(1);
  if (!partner) return null;

  return { user, partnerUser, partner };
}

function requirePartnerAuth(roles: PartnerRole[] = [...PARTNER_ROLES]) {
  return async (req: Request, res: Response, next: Function) => {
    const ctx = await resolvePartnerContext(req);
    if (!ctx) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(ctx.partnerUser.partnerRole as PartnerRole)) {
      return res.status(403).json({ error: "Insufficient partner role" });
    }
    (req as any).partnerCtx = ctx;
    next();
  };
}

function requireAdminAuth(req: Request, res: Response, next: Function) {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  db.select().from(users).where(eq(users.id, userId)).limit(1).then(([user]) => {
    if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
    (req as any).adminUser = user;
    next();
  }).catch(() => res.status(500).json({ error: "Auth check failed" }));
}

async function logAudit(partnerId: string, actorId: string | undefined, action: string, objectType?: string, objectId?: string, notes?: string) {
  try {
    await db.insert(partnerAuditLog).values({
      partnerId,
      actorId: actorId ?? null,
      action,
      objectType: objectType ?? null,
      objectId: objectId ?? null,
      notes: notes ?? null,
    });
  } catch {
    // Non-blocking
  }
}

// ============================================================
// Register all partner routes
// ============================================================

export function registerPartnerRoutes(app: Express) {

  // =========================================================
  // INVITE ACTIVATION (public — no auth required)
  // =========================================================

  // POST /api/partner/activate
  // Accept invite token, create/link user, activate account
  app.post("/api/partner/activate", async (req: Request, res: Response) => {
    try {
      const { token, name, password } = z.object({
        token: z.string().min(1),
        name: z.string().min(1),
        password: z.string().min(8),
      }).parse(req.body);

      const [invite] = await db
        .select()
        .from(partnerInvites)
        .where(eq(partnerInvites.token, token))
        .limit(1);

      if (!invite) return res.status(404).json({ error: "Invite not found or already used" });
      if (invite.usedAt) return res.status(400).json({ error: "Invite already used" });
      if (new Date() > invite.expiresAt) return res.status(400).json({ error: "Invite has expired" });

      // Check if user with this email already exists
      const { hashPassword } = await import("./auth");
      let [existingUser] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);

      if (existingUser) {
        // Link existing user to partner
        const existingLink = await db.select().from(partnerUsers)
          .where(and(eq(partnerUsers.userId, existingUser.id), eq(partnerUsers.partnerId, invite.partnerId)))
          .limit(1);
        if (existingLink.length === 0) {
          await db.insert(partnerUsers).values({
            userId: existingUser.id,
            partnerId: invite.partnerId,
            partnerRole: invite.role,
            isActive: true,
          });
        }
        // Update role AND name — the name they entered during activation is their chosen display name
        await db.update(users).set({ role: invite.role, name }).where(eq(users.id, existingUser.id));
        existingUser = { ...existingUser, name };
      } else {
        // Create new user
        const hashed = await hashPassword(password);
        const [newUser] = await db.insert(users).values({
          name,
          email: invite.email,
          password: hashed,
          role: invite.role,
          emailVerified: true, // trust invite email
        }).returning();

        await db.insert(partnerUsers).values({
          userId: newUser.id,
          partnerId: invite.partnerId,
          partnerRole: invite.role,
          isActive: true,
        });
        existingUser = newUser;
      }

      // Mark invite used
      await db.update(partnerInvites).set({ usedAt: new Date() }).where(eq(partnerInvites.id, invite.id));

      // Update partner status to onboarding if still invited
      const [partner] = await db.select().from(partners).where(eq(partners.id, invite.partnerId)).limit(1);
      if (partner?.status === "invited") {
        await db.update(partners).set({ status: "onboarding", updatedAt: new Date() }).where(eq(partners.id, invite.partnerId));
      }

      await logAudit(invite.partnerId, existingUser.id, "user.activated", "partner", invite.partnerId);

      // Regenerate session to clear any existing user, then log in the newly activated user
      req.session.regenerate((err) => {
        if (err) {
          return res.json({ success: true, autoLogin: false, message: "Account activated. Please log in." });
        }
        (req.session as any).userId = existingUser.id;
        req.session.save(() => {
          res.json({ success: true, autoLogin: true, partnerId: invite.partnerId });
        });
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Partner] activate error:", err);
      res.status(500).json({ error: "Activation failed" });
    }
  });

  // GET /api/partner/invite-info?token=...
  app.get("/api/partner/invite-info", async (req: Request, res: Response) => {
    try {
      const token = z.string().min(1).parse(req.query.token);
      const [invite] = await db.select({
        id: partnerInvites.id,
        email: partnerInvites.email,
        name: partnerInvites.name,
        role: partnerInvites.role,
        expiresAt: partnerInvites.expiresAt,
        usedAt: partnerInvites.usedAt,
        partnerId: partnerInvites.partnerId,
        partnerName: partners.name,
      }).from(partnerInvites)
        .leftJoin(partners, eq(partnerInvites.partnerId, partners.id))
        .where(eq(partnerInvites.token, token))
        .limit(1);

      if (!invite) return res.status(404).json({ error: "Invite not found" });
      if (invite.usedAt) return res.status(400).json({ error: "Invite already used" });
      if (new Date() > invite.expiresAt) return res.status(400).json({ error: "Invite expired" });

      res.json(invite);
    } catch (err: any) {
      res.status(400).json({ error: "Invalid token" });
    }
  });

  // PATCH /api/partner/profile — update own name and/or avatar photo
  app.patch("/api/partner/profile", requirePartnerAuth(), upload.single("photo"), async (req: Request, res: Response) => {
    try {
      const { user } = (req as any).partnerCtx;
      const updates: Partial<typeof users.$inferSelect> = {};

      if (req.body.name && typeof req.body.name === "string" && req.body.name.trim().length > 0) {
        updates.name = req.body.name.trim();
      }

      if (req.file) {
        const objectStorage = new ObjectStorageService();
        const url = await objectStorage.uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype, user.id);
        updates.avatarUrl = url;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Nothing to update" });
      }

      const [updated] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();
      res.json({ user: updated });
    } catch (err: any) {
      console.error("[Partner] profile update error:", err);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // PATCH /api/partner/logo — upload company logo
  app.patch("/api/partner/logo", requirePartnerAuth(["partner_admin"]), upload.single("logo"), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      if (!req.file.mimetype.startsWith("image/")) return res.status(400).json({ error: "Only image files accepted" });
      const objectStorage = new ObjectStorageService();
      const url = await objectStorage.uploadBuffer(req.file.buffer, `partner-logo.${req.file.originalname.split(".").pop()}`, req.file.mimetype, partner.id);
      const [updated] = await db.update(partners).set({ logoUrl: url, updatedAt: new Date() }).where(eq(partners.id, partner.id)).returning();
      res.json({ partner: updated });
    } catch (err: any) {
      console.error("[Partner] logo upload error:", err);
      res.status(500).json({ error: "Failed to upload logo" });
    }
  });

  // =========================================================
  // PARTNER CONTEXT
  // =========================================================

  // GET /api/partner/me
  app.get("/api/partner/me", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { user, partnerUser, partner } = (req as any).partnerCtx;
      res.json({
        user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
        partnerUser: { id: partnerUser.id, partnerRole: partnerUser.partnerRole },
        partner,
      });
    } catch (err) {
      console.error("[Partner] me error:", err);
      res.status(500).json({ error: "Failed to fetch partner context" });
    }
  });

  // =========================================================
  // PARTNER PROFILE / ONBOARDING
  // =========================================================

  // GET /api/partner/profile
  app.get("/api/partner/profile", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      res.json(partner);
    } catch (err) {
      console.error("[Partner] profile get error:", err);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // PUT /api/partner/profile
  app.put("/api/partner/profile", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        legalName: z.string().min(1).optional(),
        operatingName: z.string().optional(),
        billingEmail: z.string().email().optional(),
        primaryOpsContact: z.string().optional(),
        primaryOpsEmail: z.string().email().optional(),
        primaryOpsPhone: z.string().optional(),
        dispatchContact: z.string().optional(),
        // Allow dispatch email/phone to be set from profile form
        dispatchEmail: z.string().email().optional(),
        dispatchPhone: z.string().optional(),
        escalationContact: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        serviceDescription: z.string().optional(),
      });
      const data = updateSchema.parse(req.body);

      const hasAllRequired = !!(data.name || partner.name) &&
        !!(data.legalName || partner.legalName) &&
        !!(data.billingEmail || partner.billingEmail) &&
        !!(data.primaryOpsContact || partner.primaryOpsContact) &&
        !!(data.address || partner.address);

      const [updated] = await db.update(partners)
        .set({ ...data, profileComplete: hasAllRequired, updatedAt: new Date() })
        .where(eq(partners.id, partner.id))
        .returning();

      await logAudit(partner.id, user.id, "profile.updated", "partner", partner.id);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // GET /api/partner/onboarding
  app.get("/api/partner/onboarding", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;

      const [zones, docs, team, lastRejection] = await Promise.all([
        db.select().from(coverageZones).where(eq(coverageZones.partnerId, partner.id)),
        db.select().from(complianceDocs).where(eq(complianceDocs.partnerId, partner.id)),
        db.select().from(partnerTeamMembers).where(eq(partnerTeamMembers.partnerId, partner.id)),
        db.select({ notes: partnerAuditLog.notes, createdAt: partnerAuditLog.createdAt })
          .from(partnerAuditLog)
          .where(and(eq(partnerAuditLog.partnerId, partner.id), eq(partnerAuditLog.action, "partner.rejected")))
          .orderBy(desc(partnerAuditLog.createdAt))
          .limit(1),
      ]);

      const steps = [
        { key: "profile", label: "Company Profile", complete: partner.profileComplete, description: "Business name, contacts, address" },
        { key: "coverage", label: "Coverage Zones", complete: partner.coverageComplete, description: "Service areas and capacity" },
        { key: "compliance", label: "Compliance Documents", complete: partner.complianceComplete, description: "Insurance, registration, certifications" },
        { key: "dispatch", label: "Dispatch Setup", complete: partner.dispatchComplete, description: "How you receive and handle bookings" },
        { key: "team", label: "Team Members", complete: team.length > 0, description: "Add your drivers and crews" },
        { key: "terms", label: "Terms & Agreement", complete: partner.termsAccepted, description: "Partner service agreement" },
        { key: "review", label: "Lervit Review", complete: partner.status === "active", description: "Lervit reviews your submission" },
      ];

      const completedCount = steps.filter(s => s.complete).length;

      res.json({
        partner,
        steps,
        completedCount,
        totalSteps: steps.length,
        percentComplete: Math.round((completedCount / steps.length) * 100),
        zones,
        docs,
        team,
        readyForReview: partner.profileComplete && partner.coverageComplete && partner.complianceComplete && partner.dispatchComplete && partner.termsAccepted,
        lastRejectionReason: lastRejection[0]?.notes ?? null,
        lastRejectionAt: lastRejection[0]?.createdAt ?? null,
      });
    } catch (err) {
      console.error("[Partner] onboarding get error:", err);
      res.status(500).json({ error: "Failed to fetch onboarding status" });
    }
  });

  // POST /api/partner/onboarding/submit
  app.post("/api/partner/onboarding/submit", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
    const { partner, user } = (req as any).partnerCtx;
    if (!partner.profileComplete || !partner.coverageComplete || !partner.complianceComplete || !partner.termsAccepted) {
      return res.status(400).json({ error: "Complete all required onboarding steps before submitting" });
    }
    const submittedAt = new Date();
    const [updated] = await db.update(partners)
      .set({ status: "pending_approval", updatedAt: submittedAt })
      .where(eq(partners.id, partner.id))
      .returning();
    await logAudit(partner.id, user.id, "onboarding.submitted", "partner", partner.id);

    // Notify all admin users about the pending application
    const baseUrl = getBaseUrl();
    db.select({ id: users.id, email: users.email }).from(users).where(eq(users.role, "admin")).then((admins) => {
      for (const admin of admins) {
        if (admin.email) {
          notificationService.sendAdminPartnerPendingApproval({
            adminEmail: admin.email,
            partnerName: user.name || user.email || 'Partner',
            companyName: partner.name,
            submittedAt,
            adminReviewUrl: `${baseUrl}/admin/partners/${partner.id}`,
          }).catch(e => console.error("[onboarding submit] admin email failed:", e));
        }
        db.insert(inAppNotifications).values({
          userId: admin.id,
          type: "status_update",
          title: "Partner Application Pending Review",
          message: `${partner.name} has submitted their onboarding application and is awaiting approval.`,
          actionUrl: `/admin/partners/${partner.id}`,
          isRead: false,
        }).catch(e => console.error("[onboarding submit] admin in-app notify failed:", e));
      }
    }).catch(e => console.error("[onboarding submit] fetch admins failed:", e));

    res.json(updated);
    } catch (err) {
      console.error("[Partner] onboarding submit error:", err);
      res.status(500).json({ error: "Failed to submit onboarding" });
    }
  });

  // =========================================================
  // COVERAGE ZONES
  // =========================================================

  // GET /api/partner/coverage
  app.get("/api/partner/coverage", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const zones = await db.select().from(coverageZones).where(eq(coverageZones.partnerId, partner.id)).orderBy(desc(coverageZones.createdAt));
      res.json(zones);
    } catch (err) {
      console.error("[Partner] coverage list error:", err);
      res.status(500).json({ error: "Failed to fetch coverage zones" });
    }
  });

  // POST /api/partner/coverage
  app.post("/api/partner/coverage", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const data = insertCoverageZoneSchema.omit({ partnerId: true }).parse(req.body);
      const [zone] = await db.insert(coverageZones).values({ ...data, partnerId: partner.id }).returning();
      await db.update(partners).set({ coverageComplete: true, updatedAt: new Date() }).where(eq(partners.id, partner.id));
      await logAudit(partner.id, user.id, "coverage.created", "coverage_zone", zone.id);
      res.status(201).json(zone);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to create coverage zone" });
    }
  });

  // PUT /api/partner/coverage/:id
  app.put("/api/partner/coverage/:id", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [zone] = await db.select().from(coverageZones)
        .where(and(eq(coverageZones.id, req.params.id), eq(coverageZones.partnerId, partner.id)))
        .limit(1);
      if (!zone) return res.status(404).json({ error: "Zone not found" });

      const data = insertCoverageZoneSchema.omit({ partnerId: true }).partial().parse(req.body);
      const [updated] = await db.update(coverageZones).set({ ...data, updatedAt: new Date() })
        .where(eq(coverageZones.id, zone.id)).returning();
      await logAudit(partner.id, user.id, "coverage.updated", "coverage_zone", zone.id);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to update coverage zone" });
    }
  });

  // DELETE /api/partner/coverage/:id
  app.delete("/api/partner/coverage/:id", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [zone] = await db.select().from(coverageZones)
        .where(and(eq(coverageZones.id, req.params.id), eq(coverageZones.partnerId, partner.id)))
        .limit(1);
      if (!zone) return res.status(404).json({ error: "Zone not found" });
      await db.delete(coverageZones).where(eq(coverageZones.id, zone.id));
      await logAudit(partner.id, user.id, "coverage.deleted", "coverage_zone", zone.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[Partner] coverage delete error:", err);
      res.status(500).json({ error: "Failed to delete coverage zone" });
    }
  });

  // =========================================================
  // COMPLIANCE DOCUMENTS
  // =========================================================

  // GET /api/partner/compliance
  app.get("/api/partner/compliance", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const docs = await db.select().from(complianceDocs).where(eq(complianceDocs.partnerId, partner.id)).orderBy(desc(complianceDocs.createdAt));
      res.json(docs);
    } catch (err) {
      console.error("[Partner] compliance list error:", err);
      res.status(500).json({ error: "Failed to fetch compliance documents" });
    }
  });

  // POST /api/partner/compliance/upload
  app.post("/api/partner/compliance/upload", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), upload.single("file"), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const docType = z.enum([
        "insurance_certificate", "cargo_liability", "business_registration",
        "compliance_attestation", "vehicle_registration", "drivers_abstract"
      ]).parse(req.body.docType);

      const expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;

      const objectStorage = new ObjectStorageService();
      const ext = req.file.originalname.split(".").pop() || "bin";
      const privateDir = objectStorage.getPrivateObjectDir();
      const objectKey = `${privateDir}/compliance/${partner.id}/${Date.now()}-${docType}.${ext}`;
      const fileUrl = await objectStorage.uploadFile(objectKey, req.file.buffer, req.file.mimetype);

      const [doc] = await db.insert(complianceDocs).values({
        partnerId: partner.id,
        docType,
        fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        expiryDate: expiryDate ?? undefined,
        reviewStatus: "pending",
        uploadedBy: user.id,
      }).returning();

      // Mark compliance complete if at least 2 docs uploaded
      const allDocs = await db.select().from(complianceDocs).where(eq(complianceDocs.partnerId, partner.id));
      if (allDocs.length >= 2) {
        await db.update(partners).set({ complianceComplete: true, updatedAt: new Date() }).where(eq(partners.id, partner.id));
      }

      await logAudit(partner.id, user.id, "compliance.uploaded", "compliance_doc", doc.id, docType);
      res.status(201).json(doc);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Partner] compliance upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // GET /api/partner/compliance/:id/file — generate a 15-min signed download URL for the partner's own compliance doc
  app.get("/api/partner/compliance/:id/file", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const [doc] = await db.select().from(complianceDocs)
        .where(and(eq(complianceDocs.id, req.params.id), eq(complianceDocs.partnerId, partner.id)))
        .limit(1);
      if (!doc) return res.status(404).json({ error: "Document not found" });
      if (!doc.fileUrl) return res.status(404).json({ error: "No file attached to this document" });
      const objectStorage = new ObjectStorageService();
      const signedUrl = await objectStorage.getSignedDownloadUrl(doc.fileUrl, 900);
      res.redirect(302, signedUrl);
    } catch (err) {
      console.error("[Partner] compliance file download error:", err);
      res.status(500).json({ error: "Could not generate download link" });
    }
  });

  // DELETE /api/partner/compliance/:id
  app.delete("/api/partner/compliance/:id", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [doc] = await db.select().from(complianceDocs)
        .where(and(eq(complianceDocs.id, req.params.id), eq(complianceDocs.partnerId, partner.id)))
        .limit(1);
      if (!doc) return res.status(404).json({ error: "Document not found" });
      if (doc.reviewStatus === "approved") return res.status(400).json({ error: "Cannot delete approved documents" });
      await db.delete(complianceDocs).where(eq(complianceDocs.id, doc.id));
      await logAudit(partner.id, user.id, "compliance.deleted", "compliance_doc", doc.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[Partner] compliance delete error:", err);
      res.status(500).json({ error: "Failed to delete compliance document" });
    }
  });

  // =========================================================
  // DISPATCH SETUP
  // =========================================================

  // PUT /api/partner/dispatch
  app.put("/api/partner/dispatch", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const data = z.object({
        dispatchMethod: z.enum(["manual", "auto", "hybrid"]).optional(),
        dispatchPhone: z.string().optional(),
        dispatchEmail: z.string().email().optional(),
        dispatchNotes: z.string().optional(),
      }).parse(req.body);

      const [updated] = await db.update(partners)
        .set({ ...data, dispatchComplete: true, updatedAt: new Date() })
        .where(eq(partners.id, partner.id))
        .returning();
      await logAudit(partner.id, user.id, "dispatch.updated", "partner", partner.id);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to update dispatch settings" });
    }
  });

  // =========================================================
  // TERMS ACCEPTANCE
  // =========================================================

  // POST /api/partner/terms/accept
  app.post("/api/partner/terms/accept", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [updated] = await db.update(partners)
        .set({ termsAccepted: true, termsAcceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(partners.id, partner.id))
        .returning();
      await logAudit(partner.id, user.id, "terms.accepted", "partner", partner.id);
      res.json(updated);
    } catch (err) {
      console.error("[Partner] terms accept error:", err);
      res.status(500).json({ error: "Failed to accept terms" });
    }
  });

  // =========================================================
  // TEAM MEMBERS
  // =========================================================

  // GET /api/partner/team
  app.get("/api/partner/team", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const team = await db.select().from(partnerTeamMembers)
        .where(eq(partnerTeamMembers.partnerId, partner.id))
        .orderBy(desc(partnerTeamMembers.createdAt));
      res.json(team);
    } catch (err) {
      console.error("[Partner] team list error:", err);
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });

  // POST /api/partner/team
  app.post("/api/partner/team", requirePartnerAuth(["partner_admin", "partner_ops_manager", "partner_dispatcher"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const data = insertPartnerTeamMemberSchema.omit({ partnerId: true }).parse(req.body);
      const [member] = await db.insert(partnerTeamMembers).values({ ...data, partnerId: partner.id }).returning();
      await logAudit(partner.id, user.id, "team.created", "partner_team_member", member.id);
      res.status(201).json(member);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to create team member" });
    }
  });

  // PUT /api/partner/team/:id
  app.put("/api/partner/team/:id", requirePartnerAuth(["partner_admin", "partner_ops_manager", "partner_dispatcher"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [member] = await db.select().from(partnerTeamMembers)
        .where(and(eq(partnerTeamMembers.id, req.params.id), eq(partnerTeamMembers.partnerId, partner.id)))
        .limit(1);
      if (!member) return res.status(404).json({ error: "Team member not found" });
      const data = insertPartnerTeamMemberSchema.omit({ partnerId: true }).partial().parse(req.body);
      const [updated] = await db.update(partnerTeamMembers).set(data).where(eq(partnerTeamMembers.id, member.id)).returning();
      await logAudit(partner.id, user.id, "team.updated", "partner_team_member", member.id);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Partner] team update error:", err);
      res.status(500).json({ error: "Failed to update team member" });
    }
  });

  // DELETE /api/partner/team/:id
  app.delete("/api/partner/team/:id", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [member] = await db.select().from(partnerTeamMembers)
        .where(and(eq(partnerTeamMembers.id, req.params.id), eq(partnerTeamMembers.partnerId, partner.id)))
        .limit(1);
      if (!member) return res.status(404).json({ error: "Team member not found" });
      await db.delete(partnerTeamMembers).where(eq(partnerTeamMembers.id, member.id));
      await logAudit(partner.id, user.id, "team.deleted", "partner_team_member", member.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[Partner] team delete error:", err);
      res.status(500).json({ error: "Failed to delete team member" });
    }
  });

  // POST /api/partner/team/:id/driver-photo
  app.post("/api/partner/team/:id/driver-photo", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), upload.single("file"), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
      if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: "Only image files are accepted" });

      const [member] = await db.select().from(partnerTeamMembers)
        .where(and(eq(partnerTeamMembers.id, req.params.id), eq(partnerTeamMembers.partnerId, partner.id)))
        .limit(1);
      if (!member) return res.status(404).json({ error: "Team member not found" });

      const objectStorage = new ObjectStorageService();
      const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
      const url = await objectStorage.uploadBuffer(req.file.buffer, `driver.${ext}`, req.file.mimetype, partner.id);
      const [updated] = await db.update(partnerTeamMembers)
        .set({ driverPhoto: url })
        .where(eq(partnerTeamMembers.id, member.id))
        .returning();
      await logAudit(partner.id, user.id, "team.driver_photo_uploaded", "partner_team_member", member.id);
      res.json(updated);
    } catch (err) {
      console.error("[Partner] driver photo upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // POST /api/partner/team/:id/vehicle-photo
  app.post("/api/partner/team/:id/vehicle-photo", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), upload.single("file"), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
      if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: "Only image files are accepted" });

      const [member] = await db.select().from(partnerTeamMembers)
        .where(and(eq(partnerTeamMembers.id, req.params.id), eq(partnerTeamMembers.partnerId, partner.id)))
        .limit(1);
      if (!member) return res.status(404).json({ error: "Team member not found" });

      const objectStorage = new ObjectStorageService();
      const ext = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/webp" ? "webp" : "jpg";
      const url = await objectStorage.uploadBuffer(req.file.buffer, `vehicle.${ext}`, req.file.mimetype, partner.id);
      const [updated] = await db.update(partnerTeamMembers)
        .set({ vehiclePhoto: url })
        .where(eq(partnerTeamMembers.id, member.id))
        .returning();
      await logAudit(partner.id, user.id, "team.vehicle_photo_uploaded", "partner_team_member", member.id);
      res.json(updated);
    } catch (err) {
      console.error("[Partner] vehicle photo upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // =========================================================
  // BOOKING INBOX
  // =========================================================

  // GET /api/partner/bookings
  app.get("/api/partner/bookings", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const statusFilter = req.query.status as string | undefined;

      let query = db.select().from(bookings).where(eq(bookings.enterprisePartnerId, partner.id));
      const all = await query.orderBy(desc(bookings.routedToPartnerAt));

      const filtered = statusFilter
        ? all.filter(b => b.enterpriseStatus === statusFilter)
        : all;

      res.json(filtered);
    } catch (err) {
      console.error("[Partner] bookings list error:", err);
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  });

  // GET /api/partner/bookings/:id
  app.get("/api/partner/bookings/:id", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
    const { partner } = (req as any).partnerCtx;
    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const [rawAssignment] = await db.select().from(bookingAssignments)
      .where(and(eq(bookingAssignments.bookingId, booking.id), eq(bookingAssignments.partnerId, partner.id)))
      .orderBy(desc(bookingAssignments.assignedAt)).limit(1);

    // Enrich assignment with driver photo, completed move count, and avg rating
    let assignment: typeof rawAssignment & { driverPhoto?: string | null; completedMoves?: number | null; avgRating?: number | null } | null = null;
    if (rawAssignment) {
      let driverPhoto: string | null = null;
      let completedMoves: number | null = null;
      let avgRating: number | null = null;
      if (rawAssignment.teamMemberId) {
        const [tm] = await db.select({ driverPhoto: partnerTeamMembers.driverPhoto })
          .from(partnerTeamMembers)
          .where(eq(partnerTeamMembers.id, rawAssignment.teamMemberId))
          .limit(1);
        driverPhoto = tm?.driverPhoto ?? null;

        // Count completed moves for this team member
        const allAssigned = await db.select({ bookingId: bookingAssignments.bookingId })
          .from(bookingAssignments)
          .where(eq(bookingAssignments.teamMemberId, rawAssignment.teamMemberId));
        if (allAssigned.length > 0) {
          const assignedIds = allAssigned.map(a => a.bookingId);
          const completed = await db.select({ id: bookings.id })
            .from(bookings)
            .where(and(inArray(bookings.id, assignedIds), eq(bookings.enterpriseStatus, "completed")));
          completedMoves = completed.length;

          // Compute average customer rating across all assigned bookings that have a review
          const driverReviews = await db.select({ rating: reviews.rating })
            .from(reviews)
            .where(inArray(reviews.bookingId, assignedIds));
          if (driverReviews.length > 0) {
            const sum = driverReviews.reduce((acc, r) => acc + r.rating, 0);
            avgRating = Math.round((sum / driverReviews.length) * 10) / 10;
          }
        } else {
          completedMoves = 0;
        }
      }
      assignment = { ...rawAssignment, driverPhoto, completedMoves, avgRating };
    }

    const events = await db.select().from(bookingStatusEvents)
      .where(eq(bookingStatusEvents.bookingId, booking.id))
      .orderBy(desc(bookingStatusEvents.createdAt));

    const incidents = await db.select().from(partnerIncidents)
      .where(and(eq(partnerIncidents.bookingId, booking.id), eq(partnerIncidents.partnerId, partner.id)))
      .orderBy(desc(partnerIncidents.createdAt));

    const proofs = await db.select().from(proofOfCompletion)
      .where(and(eq(proofOfCompletion.bookingId, booking.id), eq(proofOfCompletion.partnerId, partner.id)))
      .orderBy(desc(proofOfCompletion.uploadedAt));

    res.json({ booking, assignment, events, incidents, proofs });
    } catch (err) {
      console.error("[Partner] booking detail error:", err);
      res.status(500).json({ error: "Failed to fetch booking" });
    }
  });

  // GET /api/partner/bookings/:id/events
  app.get("/api/partner/bookings/:id/events", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const [booking] = await db.select().from(bookings)
        .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
        .limit(1);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      const events = await db.select().from(bookingStatusEvents)
        .where(eq(bookingStatusEvents.bookingId, booking.id))
        .orderBy(desc(bookingStatusEvents.createdAt));
      res.json(events);
    } catch (err) {
      console.error("[Partner] booking events error:", err);
      res.status(500).json({ error: "Failed to fetch booking events" });
    }
  });

  // POST /api/partner/bookings/:id/accept
  app.post("/api/partner/bookings/:id/accept", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), async (req: Request, res: Response) => {
    try {
    const { partner, user } = (req as any).partnerCtx;
    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const allowedStatuses = ["new", "under_review"];
    if (!allowedStatuses.includes(booking.enterpriseStatus || "")) {
      return res.status(400).json({ error: `Cannot accept from status: ${booking.enterpriseStatus}` });
    }

    const fromStatus = booking.enterpriseStatus;
    const [updated] = await db.update(bookings)
      .set({ enterpriseStatus: "accepted", enterpriseAcceptedAt: new Date(), status: "accepted", updatedAt: new Date() })
      .where(eq(bookings.id, booking.id))
      .returning();

    await db.insert(bookingStatusEvents).values({
      bookingId: booking.id,
      partnerId: partner.id,
      fromStatus,
      toStatus: "accepted",
      changedBy: user.id,
      notes: req.body.notes ?? null,
      customerVisible: true,
    });

    await logAudit(partner.id, user.id, "booking.accepted", "booking", booking.id);

    // Notify customer that their booking has been accepted
    db.select().from(users).where(eq(users.id, booking.customerId)).limit(1).then(([customer]) => {
      if (customer?.email) {
        notificationService.sendPartnerJobAccepted(customer, updated, partner.name)
          .catch(e => console.error("[Customer notify] accept notification failed:", e));
      }
    }).catch(e => console.error("[Customer notify] fetch customer failed:", e));

    res.json(updated);
    } catch (err) {
      console.error("[Partner] booking accept error:", err);
      res.status(500).json({ error: "Failed to accept booking" });
    }
  });

  // POST /api/partner/bookings/:id/reject
  app.post("/api/partner/bookings/:id/reject", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [booking] = await db.select().from(bookings)
        .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
        .limit(1);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const allowedStatuses = ["new", "under_review"];
      if (!allowedStatuses.includes(booking.enterpriseStatus || "")) {
        return res.status(400).json({ error: `Cannot reject from status: ${booking.enterpriseStatus}` });
      }

      const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
      const fromStatus = booking.enterpriseStatus;

      const [updated] = await db.update(bookings)
        .set({
          enterpriseStatus: "rejected",
          enterpriseRejectedAt: new Date(),
          enterpriseRejectionReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id))
        .returning();

      await db.insert(bookingStatusEvents).values({
        bookingId: booking.id,
        partnerId: partner.id,
        fromStatus,
        toStatus: "rejected",
        changedBy: user.id,
        notes: reason,
        customerVisible: false,
      });

      await logAudit(partner.id, user.id, "booking.rejected", "booking", booking.id, reason);

      // Notify LervIT admins that partner rejected the job
      db.select().from(users).where(eq(users.role, "admin")).then((admins) => {
        for (const admin of admins) {
          if (admin.email) {
            notificationService.sendAdminPartnerCancelledAlert({
              adminEmail: admin.email,
              partnerName: partner.name,
              booking: updated,
              newStatus: "rejected",
              reason,
            }).catch(e => console.error("[Admin notify] partner reject alert failed:", e));
          }
        }
      }).catch(e => console.error("[Admin notify] fetch admins failed:", e));

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Partner] booking reject error:", err);
      res.status(500).json({ error: "Failed to reject booking" });
    }
  });

  // POST /api/partner/bookings/:id/assign
  app.post("/api/partner/bookings/:id/assign", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [booking] = await db.select().from(bookings)
        .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
        .limit(1);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const allowedStatuses = ["accepted", "assigned"];
      if (!allowedStatuses.includes(booking.enterpriseStatus || "")) {
        return res.status(400).json({ error: `Cannot assign from status: ${booking.enterpriseStatus}` });
      }

      const data = z.object({
        teamMemberId: z.string().optional(),
        driverName: z.string().optional(),
        driverPhone: z.string().optional(),
        teamName: z.string().optional(),
        vehicleType: z.string().optional(),
        vehiclePlate: z.string().optional(),
        estimatedArrival: z.string().optional(),
        notes: z.string().optional(),
      }).parse(req.body);

      // Validate team member belongs to partner
      if (data.teamMemberId) {
        const [tm] = await db.select().from(partnerTeamMembers)
          .where(and(eq(partnerTeamMembers.id, data.teamMemberId), eq(partnerTeamMembers.partnerId, partner.id)))
          .limit(1);
        if (!tm) return res.status(404).json({ error: "Team member not found" });
      }

      const [assignment] = await db.insert(bookingAssignments).values({
        bookingId: booking.id,
        partnerId: partner.id,
        teamMemberId: data.teamMemberId ?? null,
        driverName: data.driverName ?? null,
        driverPhone: data.driverPhone ?? null,
        teamName: data.teamName ?? null,
        vehicleType: data.vehicleType ?? null,
        vehiclePlate: data.vehiclePlate ?? null,
        estimatedArrival: data.estimatedArrival ? new Date(data.estimatedArrival) : null,
        assignedBy: user.id,
        notes: data.notes ?? null,
      }).returning();

      const fromStatus = booking.enterpriseStatus;
      const [updatedBooking] = await db.update(bookings)
        .set({ enterpriseStatus: "assigned", status: "assigned", updatedAt: new Date() })
        .where(eq(bookings.id, booking.id))
        .returning();

      await db.insert(bookingStatusEvents).values({
        bookingId: booking.id,
        partnerId: partner.id,
        fromStatus,
        toStatus: "assigned",
        changedBy: user.id,
        notes: `Assigned to: ${data.driverName || data.teamName || "team member"}`,
        customerVisible: true,
      });

      await logAudit(partner.id, user.id, "booking.assigned", "booking", booking.id);

      // Notify customer that a driver has been assigned
      db.select().from(users).where(eq(users.id, booking.customerId)).limit(1).then(([customer]) => {
        if (customer?.email) {
          notificationService.sendPartnerDriverAssigned({
            customer,
            booking: updatedBooking,
            partnerName: partner.name,
            driverName: data.driverName ?? null,
            driverPhone: data.driverPhone ?? null,
            vehicleType: data.vehicleType ?? null,
            vehiclePlate: data.vehiclePlate ?? null,
            teamName: data.teamName ?? null,
          }).catch(e => console.error("[Customer notify] driver assigned notification failed:", e));
        }
      }).catch(e => console.error("[Customer notify] fetch customer failed:", e));

      // Notify the assigned driver via SMS. Team members aren't platform users
      // (no userId on partner_team_members), so SMS is the only channel available.
      // Prefer the team member's phone on file, fall back to the phone typed into the form.
      (async () => {
        try {
          let driverPhone = data.driverPhone ?? null;
          let driverName = data.driverName ?? null;
          if (data.teamMemberId) {
            const [tm] = await db.select().from(partnerTeamMembers)
              .where(eq(partnerTeamMembers.id, data.teamMemberId))
              .limit(1);
            if (tm) {
              driverPhone = tm.phone ?? driverPhone;
              driverName = driverName ?? tm.name;
            }
          }
          if (driverPhone) {
            await notificationService.sendSMS({
              to: driverPhone,
              message: `LervIT New Job: You have been assigned a move on ${formatCalgaryDate(updatedBooking.preferredDate)}. Pickup: ${updatedBooking.pickupAddress}. Log in to your portal for details.`,
              type: 'booking_update',
            });
          } else {
            console.warn(`[Partner assign] Driver has no phone — SMS skipped (booking ${booking.id})`);
          }
        } catch (e) {
          console.error("[Partner assign] driver SMS failed:", e);
        }
      })();

      res.json({ booking: updatedBooking, assignment });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to assign booking" });
    }
  });

  // POST /api/partner/bookings/:id/status
  app.post("/api/partner/bookings/:id/status", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [booking] = await db.select().from(bookings)
        .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
        .limit(1);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const { status, notes } = z.object({
        status: z.string().min(1),
        notes: z.string().optional(),
      }).parse(req.body);

      const currentStatus = booking.enterpriseStatus || "new";
      const validNext = ENTERPRISE_STATUS_TRANSITIONS[currentStatus] || [];
      if (!validNext.includes(status)) {
        return res.status(400).json({
          error: `Invalid transition from '${currentStatus}' to '${status}'`,
          validTransitions: validNext,
        });
      }

      // Map to customer-visible booking status
      const bookingStatus = ENTERPRISE_TO_BOOKING_STATUS[status];
      const statusUpdate: Record<string, any> = {
        enterpriseStatus: status,
        updatedAt: new Date(),
      };
      if (bookingStatus) statusUpdate.status = bookingStatus;
      if (status === "accepted") statusUpdate.enterpriseAcceptedAt = new Date();
      if (status === "rejected") {
        statusUpdate.enterpriseRejectedAt = new Date();
        statusUpdate.enterpriseRejectionReason = notes;
      }

      const [updated] = await db.update(bookings).set(statusUpdate).where(eq(bookings.id, booking.id)).returning();

      const customerVisible = !!bookingStatus && bookingStatus !== booking.status;
      await db.insert(bookingStatusEvents).values({
        bookingId: booking.id,
        partnerId: partner.id,
        fromStatus: currentStatus,
        toStatus: status,
        changedBy: user.id,
        notes: notes ?? null,
        customerVisible,
      });

      await logAudit(partner.id, user.id, `booking.status.${status}`, "booking", booking.id, notes);

      // Notify LervIT admins when partner cancels a job
      if (status === "cancelled") {
        db.select().from(users).where(eq(users.role, "admin")).then((admins) => {
          for (const admin of admins) {
            if (admin.email) {
              notificationService.sendAdminPartnerCancelledAlert({
                adminEmail: admin.email,
                partnerName: partner.name,
                booking: updated,
                newStatus: "cancelled",
                reason: notes,
              }).catch(e => console.error("[Admin notify] partner cancel alert failed:", e));
            }
          }
        }).catch(e => console.error("[Admin notify] fetch admins failed:", e));
      }

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  // =========================================================
  // INCIDENTS
  // =========================================================

  // GET /api/partner/incidents
  app.get("/api/partner/incidents", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const incidents = await db.select().from(partnerIncidents)
        .where(eq(partnerIncidents.partnerId, partner.id))
        .orderBy(desc(partnerIncidents.createdAt));
      res.json(incidents);
    } catch (err) {
      console.error("[Partner] incidents list error:", err);
      res.status(500).json({ error: "Failed to fetch incidents" });
    }
  });

  // POST /api/partner/bookings/:id/incidents
  app.post("/api/partner/bookings/:id/incidents", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), upload.array("files", 5), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [booking] = await db.select().from(bookings)
        .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
        .limit(1);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      const data = insertPartnerIncidentSchema.omit({ partnerId: true, bookingId: true, reportedBy: true }).parse(req.body);

      // Upload any attached files
      let fileUrls: string[] = [];
      const files = req.files as Express.Multer.File[] | undefined;
      if (files && files.length > 0) {
        const objectStorage = new ObjectStorageService();
        for (const file of files) {
          const ext = file.originalname.split(".").pop() || "bin";
          const key = `.private/incidents/${partner.id}/${booking.id}/${Date.now()}.${ext}`;
          const url = await objectStorage.uploadFile(key, file.buffer, file.mimetype);
          fileUrls.push(url);
        }
      }

      const [incident] = await db.insert(partnerIncidents).values({
        ...data,
        bookingId: booking.id,
        partnerId: partner.id,
        reportedBy: user.id,
        fileUrls: fileUrls.length > 0 ? fileUrls : null,
        escalationFlag: data.severity === "critical",
      }).returning();

      // If critical, also update enterprise status to issue_reported
      if (data.severity === "critical" && booking.enterpriseStatus && !["completed", "cancelled"].includes(booking.enterpriseStatus)) {
        const currentStatus = booking.enterpriseStatus;
        if (ENTERPRISE_STATUS_TRANSITIONS[currentStatus]?.includes("issue_reported")) {
          await db.update(bookings).set({ enterpriseStatus: "issue_reported", updatedAt: new Date() }).where(eq(bookings.id, booking.id));
          await db.insert(bookingStatusEvents).values({
            bookingId: booking.id,
            partnerId: partner.id,
            fromStatus: currentStatus,
            toStatus: "issue_reported",
            changedBy: user.id,
            notes: `Critical incident reported: ${data.title}`,
            customerVisible: true,
          });
        }
      }

      await logAudit(partner.id, user.id, "incident.created", "partner_incident", incident.id, data.title);

      // Notify all admin users so the incident appears in their support queue
      const adminUsers = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      const severity = data.severity ?? "medium";
      const severityLabel = severity === "critical" ? "CRITICAL" : severity.charAt(0).toUpperCase() + severity.slice(1);
      const preview = `[${severityLabel}] ${partner.name} — ${data.title}`;
      for (const admin of adminUsers) {
        db.insert(inAppNotifications).values({
          userId: admin.id,
          type: "new_message",
          title: `Partner Incident: ${data.category.replace(/_/g, " ")}`,
          message: preview.length > 100 ? preview.slice(0, 100) + "..." : preview,
          bookingId: booking.id,
          actionUrl: `/admin/support`,
          isRead: false,
        }).catch(e => console.error("[incident notify admin]", e));
      }

      res.status(201).json(incident);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Partner] incident create error:", err);
      res.status(500).json({ error: "Failed to create incident" });
    }
  });

  // PUT /api/partner/incidents/:id
  app.put("/api/partner/incidents/:id", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [incident] = await db.select().from(partnerIncidents)
        .where(and(eq(partnerIncidents.id, req.params.id), eq(partnerIncidents.partnerId, partner.id)))
        .limit(1);
      if (!incident) return res.status(404).json({ error: "Incident not found" });
      const data = z.object({
        status: z.enum(["open", "under_review", "resolved", "escalated"]).optional(),
        resolutionNotes: z.string().optional(),
      }).parse(req.body);

      const update: Record<string, any> = { ...data, updatedAt: new Date() };
      if (data.status === "resolved") {
        update.resolvedAt = new Date();
        update.resolvedBy = user.id;
      }

      const [updated] = await db.update(partnerIncidents).set(update).where(eq(partnerIncidents.id, incident.id)).returning();
      await logAudit(partner.id, user.id, "incident.updated", "partner_incident", incident.id);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to update incident" });
    }
  });

  // =========================================================
  // PROOF OF COMPLETION
  // =========================================================

  // POST /api/partner/bookings/:id/proof
  app.post("/api/partner/bookings/:id/proof", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), upload.single("file"), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;
      const [booking] = await db.select().from(bookings)
        .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
        .limit(1);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const proofType = z.enum(["photo", "signature", "document"]).parse(req.body.proofType || "photo");
      const notes = req.body.notes as string | undefined;

      const objectStorage = new ObjectStorageService();
      const ext = req.file.originalname.split(".").pop() || "bin";
      const key = `.private/proof/${partner.id}/${booking.id}/${Date.now()}.${ext}`;
      const fileUrl = await objectStorage.uploadFile(key, req.file.buffer, req.file.mimetype);

      const [proof] = await db.insert(proofOfCompletion).values({
        bookingId: booking.id,
        partnerId: partner.id,
        fileUrl,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        proofType,
        notes: notes ?? null,
        uploadedBy: user.id,
      }).returning();

      await logAudit(partner.id, user.id, "proof.uploaded", "booking", booking.id);
      res.status(201).json(proof);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Partner] proof upload error:", err);
      res.status(500).json({ error: "Proof upload failed" });
    }
  });

  // GET /api/partner/proof/:proofId/file — signed download/view URL for proof files
  app.get("/api/partner/proof/:proofId/file", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const [proof] = await db.select().from(proofOfCompletion)
        .where(and(eq(proofOfCompletion.id, req.params.proofId), eq(proofOfCompletion.partnerId, partner.id)))
        .limit(1);
      if (!proof) return res.status(404).json({ error: "Proof not found" });
      if (!proof.fileUrl) return res.status(404).json({ error: "No file attached" });
      const objectStorage = new ObjectStorageService();
      const signedUrl = await objectStorage.getSignedDownloadUrl(proof.fileUrl, 900);
      res.redirect(302, signedUrl);
    } catch (err) {
      console.error("[Partner] proof file download error:", err);
      res.status(500).json({ error: "Could not generate file link" });
    }
  });

  // =========================================================
  // STRIPE CONNECT
  // =========================================================

  // POST /api/partner/stripe/connect — create or resume Stripe Connect Express onboarding
  app.post("/api/partner/stripe/connect", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { user, partner } = (req as any).partnerCtx;
      let stripeAccountId = partner.stripeAccountId;

      if (!stripeAccountId) {
        // Create a new Stripe Express account for the partner company
        const account = await stripe.accounts.create({
          type: "express",
          country: "CA",
          email: partner.billingEmail ?? user.email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_type: "company",
          business_profile: {
            name: partner.legalName,
            url: "https://lervit.com",
            product_description: "Enterprise moving and delivery fulfillment services",
            mcc: "4214",
          },
          metadata: {
            partnerId: partner.id,
            userId: user.id,
          },
        });
        stripeAccountId = account.id;

        await db.update(partners)
          .set({ stripeAccountId, stripeConnectStatus: "pending", updatedAt: new Date() })
          .where(eq(partners.id, partner.id));
      }

      const baseUrl = req.headers.origin || `https://${req.headers.host}`;
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${baseUrl}/partner/earnings?stripe_refresh=true`,
        return_url: `${baseUrl}/partner/earnings?stripe_success=true`,
        type: "account_onboarding",
      });

      res.json({ url: accountLink.url });
    } catch (err: any) {
      console.error("[Partner] Stripe connect error:", err);
      res.status(500).json({ error: err.message ?? "Failed to start Stripe onboarding" });
    }
  });

  // GET /api/partner/stripe/status — return current Stripe Connect status
  app.get("/api/partner/stripe/status", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      if (!partner.stripeAccountId) {
        return res.json({ status: "not_connected", payoutsEnabled: false, chargesEnabled: false });
      }

      // Sync live status from Stripe
      const acct = await stripe.accounts.retrieve(partner.stripeAccountId);
      const status = acct.details_submitted
        ? acct.payouts_enabled ? "active" : "restricted"
        : "pending";

      await db.update(partners)
        .set({
          stripeConnectStatus: status,
          stripePayoutsEnabled: acct.payouts_enabled ?? false,
          stripeDetailsSubmitted: acct.details_submitted ?? false,
          updatedAt: new Date(),
        })
        .where(eq(partners.id, partner.id));

      res.json({
        status,
        payoutsEnabled: acct.payouts_enabled,
        chargesEnabled: acct.charges_enabled,
        detailsSubmitted: acct.details_submitted,
        currentlyDue: acct.requirements?.currently_due ?? [],
      });
    } catch (err: any) {
      console.error("[Partner] Stripe status error:", err);
      res.status(500).json({ error: "Failed to fetch Stripe status" });
    }
  });

  // GET /api/partner/stripe/dashboard-link — Stripe Express dashboard link
  app.get("/api/partner/stripe/dashboard-link", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      if (!partner.stripeAccountId) {
        return res.status(400).json({ error: "No Stripe account connected" });
      }
      const loginLink = await stripe.accounts.createLoginLink(partner.stripeAccountId);
      res.json({ url: loginLink.url });
    } catch (err: any) {
      console.error("[Partner] Stripe dashboard link error:", err);
      res.status(500).json({ error: "Failed to generate Stripe dashboard link" });
    }
  });

  // GET /api/partner/earnings — full earnings history (all completed bookings)
  //
  // Merges the booking snapshot (address, price) with the partnerEarnings row
  // (Stripe transfer state) when one exists. Completed bookings without a
  // partnerEarnings row (older data, or a partner that has not yet had
  // recordPartnerEarnings run) still appear with computed net + payoutStatus="not_recorded".
  app.get("/api/partner/earnings", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const allBookings = await db.select().from(bookings)
        .where(and(eq(bookings.enterprisePartnerId, partner.id), eq(bookings.enterpriseStatus, "completed")))
        .orderBy(desc(bookings.updatedAt));

      const partnerFeeOverride = partner.platformFeePercent != null ? parseFloat(partner.platformFeePercent as any) : null;
      const partnerNet = (b: typeof allBookings[0]): number => calculatePartnerNet(
        parseFloat(b.price ?? "0"),
        parseFloat((b as any).platformFeePercent ?? "15"),
        partnerFeeOverride,
        parseFloat((b as any).platformFeeAmount ?? "0"),
      ).partnerNet;

      const earningsRows = allBookings.length > 0
        ? await db.select().from(partnerEarnings)
            .where(and(
              eq(partnerEarnings.partnerId, partner.id),
              inArray(partnerEarnings.bookingId, allBookings.map(b => b.id)),
            ))
        : [];
      const earningByBookingId = new Map(earningsRows.map(r => [r.bookingId, r]));

      const earnings = allBookings.map(b => {
        const row = earningByBookingId.get(b.id);
        return {
          id: b.id,
          pickupAddress: b.pickupAddress,
          dropoffAddress: b.dropoffAddress,
          price: b.price,
          partnerNet: row?.partnerNetAmount ?? partnerNet(b).toFixed(2),
          platformFeePercent: row?.platformFeePercent ?? (b as any).platformFeePercent ?? "15.00",
          platformFeeAmount: row?.platformFeeAmount ?? (b as any).platformFeeAmount ?? null,
          completedAt: b.updatedAt,
          // Payout tracking (only populated once recordPartnerEarnings has run)
          payoutStatus: row?.status ?? "not_recorded", // pending | processing | paid | failed | not_recorded
          stripeTransferId: row?.stripeTransferId ?? null,
          paidAt: row?.paidAt ?? null,
          failureReason: row?.failureReason ?? null,
        };
      });

      res.json({ earnings });
    } catch (err) {
      console.error("[Partner] earnings history error:", err);
      res.status(500).json({ error: "Failed to fetch earnings" });
    }
  });

  // =========================================================
  // DASHBOARD
  // =========================================================

  // GET /api/partner/dashboard
  app.get("/api/partner/dashboard", requirePartnerAuth(), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const allBookings = await db.select().from(bookings).where(eq(bookings.enterprisePartnerId, partner.id));
      const incidents = await db.select().from(partnerIncidents).where(eq(partnerIncidents.partnerId, partner.id));
      const team = await db.select().from(partnerTeamMembers).where(eq(partnerTeamMembers.partnerId, partner.id));

      const activeStatuses = ["new", "under_review", "accepted", "assigned", "en_route_to_pickup", "arrived_at_pickup", "picked_up", "in_transit", "arrived_at_dropoff", "delivered", "delayed", "issue_reported"];

      // Earnings helpers — partner net = price minus platform fee
      const partnerFeeOverride = partner.platformFeePercent != null ? parseFloat(partner.platformFeePercent as any) : null;
      const partnerNet = (b: typeof allBookings[0]): number => calculatePartnerNet(
        parseFloat(b.price ?? "0"),
        parseFloat((b as any).platformFeePercent ?? "15"),
        partnerFeeOverride,
        parseFloat((b as any).platformFeeAmount ?? "0"),
      ).partnerNet;

      const completedBookings = allBookings.filter(b => b.enterpriseStatus === "completed");
      const activeBookingsList = allBookings.filter(b => activeStatuses.includes(b.enterpriseStatus || ""));

      // Current calendar month boundaries
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const thisMonthCompleted = completedBookings.filter(b => {
        const d = b.updatedAt ? new Date(b.updatedAt) : null;
        return d && d >= monthStart && d <= monthEnd;
      });

      const totalEarnings = completedBookings.reduce((sum, b) => sum + partnerNet(b), 0);
      const thisMonthEarnings = thisMonthCompleted.reduce((sum, b) => sum + partnerNet(b), 0);
      const pendingEarnings = activeBookingsList.reduce((sum, b) => sum + partnerNet(b), 0);

      // Last 5 completed bookings with their earnings for the earnings list
      const recentEarnings = completedBookings
        .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
        .slice(0, 5)
        .map(b => ({
          id: b.id,
          pickupAddress: b.pickupAddress,
          dropoffAddress: b.dropoffAddress,
          price: b.price,
          partnerNet: partnerNet(b).toFixed(2),
          platformFeePercent: (b as any).platformFeePercent ?? "15.00",
          completedAt: b.updatedAt,
        }));

      // Average customer rating across all partner booking reviews
      let avgRating: number | null = null;
      if (allBookings.length > 0) {
        const bookingIds = allBookings.map(b => b.id);
        const partnerReviews = await db.select({ rating: reviews.rating })
          .from(reviews)
          .where(inArray(reviews.bookingId, bookingIds));
        if (partnerReviews.length > 0) {
          const sum = partnerReviews.reduce((acc, r) => acc + r.rating, 0);
          avgRating = Math.round((sum / partnerReviews.length) * 10) / 10;
        }
      }

      const stats = {
        totalBookings: allBookings.length,
        activeBookings: activeBookingsList,
        pendingBookings: allBookings.filter(b => ["new", "under_review"].includes(b.enterpriseStatus || "")).length,
        completedBookings: completedBookings.length,
        cancelledBookings: allBookings.filter(b => b.enterpriseStatus === "cancelled").length,
        openIncidents: incidents.filter(i => ["open", "under_review"].includes(i.status)).length,
        criticalIncidents: incidents.filter(i => i.severity === "critical" && i.status !== "resolved").length,
        activeTeamMembers: team.filter(t => t.isAvailable).length,
        totalTeamMembers: team.length,
        avgRating,
        // Earnings
        totalEarnings: totalEarnings.toFixed(2),
        thisMonthEarnings: thisMonthEarnings.toFixed(2),
        pendingEarnings: pendingEarnings.toFixed(2),
        recentEarnings,
      };

      res.json({ partner, stats });
    } catch (err) {
      console.error("[Partner] dashboard error:", err);
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  });

  // =========================================================
  // PARTNER SELF-SERVICE USER MANAGEMENT
  // =========================================================

  // GET /api/partner/users — list all portal users for this partner
  app.get("/api/partner/users", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner, user: me } = (req as any).partnerCtx;
      const rows = await db
        .select({
          puId: partnerUsers.id,
          partnerRole: partnerUsers.partnerRole,
          isActive: partnerUsers.isActive,
          createdAt: partnerUsers.createdAt,
          userId: users.id,
          name: users.name,
          email: users.email,
        })
        .from(partnerUsers)
        .innerJoin(users, eq(users.id, partnerUsers.userId))
        .where(and(eq(partnerUsers.partnerId, partner.id), eq(partnerUsers.isActive, true)))
        .orderBy(asc(partnerUsers.createdAt));

      // Also include pending (unused) invites
      const pendingInvites = await db.select().from(partnerInvites)
        .where(and(
          eq(partnerInvites.partnerId, partner.id),
          isNull(partnerInvites.usedAt),
          gt(partnerInvites.expiresAt, new Date()),
        ));

      res.json({ users: rows, pendingInvites, myUserId: me.id });
    } catch (err) {
      console.error("[Partner] list users error:", err);
      res.status(500).json({ error: "Failed to list users" });
    }
  });

  // POST /api/partner/users/invite — invite a new portal user
  app.post("/api/partner/users/invite", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner, user: inviter } = (req as any).partnerCtx;
      const data = z.object({
        email: z.string().email(),
        name: z.string().min(1),
        role: z.enum(["partner_dispatcher", "partner_ops_manager", "partner_viewer"]),
      }).parse(req.body);

      // Check not already a user
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(partnerUsers, eq(partnerUsers.userId, users.id))
        .where(and(eq(users.email, data.email), eq(partnerUsers.partnerId, partner.id)))
        .limit(1);
      if (existing) return res.status(409).json({ error: "This email already has portal access." });

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const [invite] = await db.insert(partnerInvites).values({
        partnerId: partner.id,
        email: data.email,
        name: data.name,
        role: data.role,
        token,
        expiresAt,
        invitedBy: inviter.id,
      }).returning();

      await logAudit(partner.id, inviter.id, "user.invited", "partner_user", invite.id,
        `Invited ${data.email} as ${data.role}`);

      const activationUrl = `${getBaseUrl()}/partner/activate?token=${token}`;

      // Fire-and-forget — don't block response on email delivery
      notificationService.sendPartnerUserInvite({
        toEmail: data.email,
        toName: data.name,
        partnerName: partner.name,
        inviterName: inviter.name ?? inviter.email,
        role: data.role,
        activationUrl,
      }).catch(err => console.error("[Partner] invite email error:", err));

      res.status(201).json({ invite: { ...invite, activationUrl: `/partner/activate?token=${token}` } });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Partner] invite user error:", err);
      res.status(500).json({ error: "Failed to send invite" });
    }
  });

  // PUT /api/partner/users/:id/role — change a portal user's role
  app.put("/api/partner/users/:id/role", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner, user: me } = (req as any).partnerCtx;
      const { role } = z.object({
        role: z.enum(["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"]),
      }).parse(req.body);

      const [pu] = await db.select().from(partnerUsers)
        .where(and(eq(partnerUsers.id, req.params.id), eq(partnerUsers.partnerId, partner.id)))
        .limit(1);
      if (!pu) return res.status(404).json({ error: "User not found" });
      if (pu.userId === me.id) return res.status(400).json({ error: "Cannot change your own role" });

      await db.update(partnerUsers).set({ partnerRole: role }).where(eq(partnerUsers.id, pu.id));
      await logAudit(partner.id, me.id, "user.role_changed", "partner_user", pu.id,
        `Role changed to ${role}`);
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to update role" });
    }
  });

  // DELETE /api/partner/users/:id — revoke a portal user's access
  app.delete("/api/partner/users/:id", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner, user: me } = (req as any).partnerCtx;
      const [pu] = await db.select().from(partnerUsers)
        .where(and(eq(partnerUsers.id, req.params.id), eq(partnerUsers.partnerId, partner.id)))
        .limit(1);
      if (!pu) return res.status(404).json({ error: "User not found" });
      if (pu.userId === me.id) return res.status(400).json({ error: "Cannot remove yourself" });

      await db.update(partnerUsers).set({ isActive: false }).where(eq(partnerUsers.id, pu.id));
      await logAudit(partner.id, me.id, "user.removed", "partner_user", pu.id, "Portal access revoked");
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to remove user" });
    }
  });

  // DELETE /api/partner/invites/:id — cancel a pending invite
  app.delete("/api/partner/invites/:id", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      await db.delete(partnerInvites)
        .where(and(eq(partnerInvites.id, req.params.id), eq(partnerInvites.partnerId, partner.id)));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to cancel invite" });
    }
  });

  // GET /api/partner/audit-log
  app.get("/api/partner/audit-log", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const logs = await db.select().from(partnerAuditLog)
        .where(eq(partnerAuditLog.partnerId, partner.id))
        .orderBy(desc(partnerAuditLog.createdAt))
        .limit(100);
      res.json(logs);
    } catch (err) {
      console.error("[Partner] audit log error:", err);
      res.status(500).json({ error: "Failed to fetch audit log" });
    }
  });

  // POST /api/partner/audit-log/:id/analyze
  app.post("/api/partner/audit-log/:id/analyze", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;
      const { id } = req.params;

      const [entry] = await db.select().from(partnerAuditLog)
        .where(and(eq(partnerAuditLog.id, id), eq(partnerAuditLog.partnerId, partner.id)))
        .limit(1);

      if (!entry) return res.status(404).json({ error: "Audit log entry not found" });

      // Resolve actor name if present
      let actorName: string | null = null;
      if (entry.actorId) {
        const [actor] = await db.select({ name: users.name, email: users.email })
          .from(users).where(eq(users.id, entry.actorId)).limit(1);
        actorName = actor?.name || actor?.email || null;
      }

      const result = await analyzeAuditEntry({
        id: entry.id,
        action: entry.action,
        notes: entry.notes,
        objectType: entry.objectType,
        objectId: entry.objectId,
        actorName,
        createdAt: entry.createdAt,
        partnerName: partner.name,
      });

      res.json(result);
    } catch (err) {
      console.error("[AuditAI] Route error:", err);
      res.status(500).json({ error: "Failed to analyze audit entry" });
    }
  });

  // =========================================================
  // LERVIT ADMIN — PARTNER MANAGEMENT
  // =========================================================

  // POST /api/admin/partners/invite
  app.post("/api/admin/partners/invite", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const data = z.object({
        name: z.string().min(1),
        legalName: z.string().min(1),
        adminEmail: z.string().email(),
        adminName: z.string().min(1),
        role: z.enum(["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"]).default("partner_admin"),
      }).parse(req.body);

      const adminUser = (req as any).adminUser;

      // Create partner
      const [partner] = await db.insert(partners).values({
        name: data.name,
        legalName: data.legalName,
        status: "invited",
      }).returning();

      // Create invite token (expires in 7 days)
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [invite] = await db.insert(partnerInvites).values({
        partnerId: partner.id,
        email: data.adminEmail,
        role: data.role,
        token,
        expiresAt,
        invitedBy: adminUser.id,
      }).returning();

      await logAudit(partner.id, adminUser.id, "partner.invited", "partner", partner.id, `Invited: ${data.adminEmail}`);

      const baseUrl = getBaseUrl();
      const activationUrl = `${baseUrl}/partner/activate?token=${token}`;

      notificationService.sendPartnerAdminInvite({
        toEmail: data.adminEmail,
        toName: data.adminName,
        partnerName: data.name,
        legalName: data.legalName,
        inviterName: adminUser.name || adminUser.email || 'LervIT',
        activationUrl,
      }).catch(e => console.error("[Admin] partner invite email failed:", e));

      res.status(201).json({
        partner,
        invite: { ...invite, activationUrl },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Admin] partner invite error:", err);
      res.status(500).json({ error: "Failed to create partner invite" });
    }
  });

  // GET /api/admin/partners/pending-count
  app.get("/api/admin/partners/pending-count", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(partners)
        .where(eq(partners.status, "pending_approval"));
      res.json({ count: result?.count ?? 0 });
    } catch (err) {
      console.error("[Admin] pending partner count error:", err);
      res.status(500).json({ error: "Failed to fetch pending partner count" });
    }
  });

  // GET /api/admin/partners
  app.get("/api/admin/partners", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      const allPartners = await db.select().from(partners).orderBy(desc(partners.createdAt));

      // Enrich each partner with team member count + completed job stats
      const enriched = await Promise.all(allPartners.map(async (p) => {
        const [teamCount] = await db.select({ count: sql<number>`count(*)::int` })
          .from(partnerTeamMembers).where(eq(partnerTeamMembers.partnerId, p.id));
        const completedBookings = await db.select({
          price: bookings.price,
          platformFeeAmount: bookings.platformFeeAmount,
          platformFeePercent: bookings.platformFeePercent,
        })
          .from(bookings)
          .where(and(eq(bookings.enterprisePartnerId, p.id), eq(bookings.enterpriseStatus, "completed")));

        const partnerFeeOverride = p.platformFeePercent != null ? parseFloat(p.platformFeePercent as any) : null;
        const calcNet = (b: any): number => calculatePartnerNet(
          parseFloat(b.price ?? "0"),
          parseFloat(b.platformFeePercent ?? "15"),
          partnerFeeOverride,
          parseFloat(b.platformFeeAmount ?? "0"),
        ).partnerNet;

        const totalEarned = completedBookings.reduce((sum, b) => sum + parseFloat(b.price ?? "0"), 0);
        const totalPartnerNet = completedBookings.reduce((sum, b) => sum + calcNet(b), 0);

        return {
          ...p,
          teamMemberCount: teamCount?.count ?? 0,
          completedJobCount: completedBookings.length,
          totalEarned: totalEarned.toFixed(2),
          partnerNet: totalPartnerNet.toFixed(2),
        };
      }));

      res.json(enriched);
    } catch (err) {
      console.error("[Admin] partners list error:", err);
      res.status(500).json({ error: "Failed to fetch partners" });
    }
  });

  // GET /api/admin/partners/:id
  app.get("/api/admin/partners/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const [partner] = await db.select().from(partners).where(eq(partners.id, req.params.id)).limit(1);
      if (!partner) return res.status(404).json({ error: "Partner not found" });

      const pUsers = await db.select({
        id: partnerUsers.id,
        partnerRole: partnerUsers.partnerRole,
        isActive: partnerUsers.isActive,
        createdAt: partnerUsers.createdAt,
        userId: partnerUsers.userId,
        userName: users.name,
        userEmail: users.email,
      }).from(partnerUsers)
        .leftJoin(users, eq(partnerUsers.userId, users.id))
        .where(eq(partnerUsers.partnerId, partner.id));

      const docs = await db.select().from(complianceDocs).where(eq(complianceDocs.partnerId, partner.id));
      const zones = await db.select().from(coverageZones).where(eq(coverageZones.partnerId, partner.id));
      const invites = await db.select().from(partnerInvites).where(eq(partnerInvites.partnerId, partner.id));
      const bookingsList = await db.select().from(bookings).where(eq(bookings.enterprisePartnerId, partner.id)).orderBy(desc(bookings.createdAt)).limit(30);
      const team = await db.select().from(partnerTeamMembers).where(eq(partnerTeamMembers.partnerId, partner.id)).orderBy(partnerTeamMembers.name);

      // Enrich bookings with their latest assignment
      const enrichedBookings = await Promise.all(bookingsList.map(async (b) => {
        const [assignment] = await db.select().from(bookingAssignments)
          .where(eq(bookingAssignments.bookingId, b.id))
          .orderBy(desc(bookingAssignments.assignedAt)).limit(1);
        return { ...b, assignment: assignment ?? null };
      }));

      // Earnings summary — separate unlimited query on enterpriseStatus, matching partner portal logic
      const completedForEarnings = await db.select().from(bookings)
        .where(and(eq(bookings.enterprisePartnerId, partner.id), eq(bookings.enterpriseStatus, "completed")));

      const partnerFeeOverride = partner.platformFeePercent != null ? parseFloat(partner.platformFeePercent as any) : null;
      const calcPartnerNet = (b: any): number => calculatePartnerNet(
        parseFloat(b.price ?? "0"),
        parseFloat(b.platformFeePercent ?? "15"),
        partnerFeeOverride,
        parseFloat(b.platformFeeAmount ?? "0"),
      ).partnerNet;

      const totalEarned = completedForEarnings.reduce((s, b) => s + parseFloat(b.price ?? "0"), 0);
      const totalPartnerNet = completedForEarnings.reduce((s, b) => s + calcPartnerNet(b), 0);
      const totalPlatformFee = totalEarned - totalPartnerNet;

      res.json({
        partner, users: pUsers, docs, zones, invites,
        recentBookings: enrichedBookings,
        team,
        earnings: {
          totalEarned: totalEarned.toFixed(2),
          platformFee: totalPlatformFee.toFixed(2),
          partnerNet: totalPartnerNet.toFixed(2),
          completedJobs: completedForEarnings.length,
          activeJobs: bookingsList.filter(b => ["confirmed","accepted","in_progress"].includes(b.status)).length,
        },
      });
    } catch (err) {
      console.error("[Admin] partner detail error:", err);
      res.status(500).json({ error: "Failed to fetch partner" });
    }
  });

  // PUT /api/admin/partners/:id
  app.put("/api/admin/partners/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const data = z.object({
        adminNotes: z.string().optional(),
        status: z.enum(["invited", "onboarding", "pending_approval", "active", "suspended"]).optional(),
      }).parse(req.body);

      const [updated] = await db.update(partners).set({ ...data, updatedAt: new Date() })
        .where(eq(partners.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Partner not found" });

      await logAudit(updated.id, adminUser.id, "partner.updated", "partner", updated.id);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to update partner" });
    }
  });

  // PUT /api/admin/partners/:id/activate
  app.put("/api/admin/partners/:id/activate", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const [partner] = await db.select().from(partners).where(eq(partners.id, req.params.id)).limit(1);
      if (!partner) return res.status(404).json({ error: "Partner not found" });
      if (partner.status === "active") return res.status(400).json({ error: "Partner is already active" });

      const [updated] = await db.update(partners)
        .set({ status: "active", activatedAt: new Date(), activatedBy: adminUser.id, updatedAt: new Date() })
        .where(eq(partners.id, partner.id))
        .returning();

      await logAudit(partner.id, adminUser.id, "partner.activated", "partner", partner.id);

      // Notify partner admin users that they are now live
      const baseUrl = getBaseUrl();
      db
        .select({ userId: partnerUsers.userId, email: users.email, name: users.name })
        .from(partnerUsers)
        .innerJoin(users, eq(users.id, partnerUsers.userId))
        .where(and(
          eq(partnerUsers.partnerId, partner.id),
          eq(partnerUsers.isActive, true),
          eq(partnerUsers.partnerRole, "partner_admin"),
        ))
        .then((puRows) => {
          for (const pu of puRows) {
            if (pu.email) {
              notificationService.sendPartnerActivated({
                partnerEmail: pu.email,
                partnerName: pu.name || pu.email,
                companyName: partner.name,
                dashboardUrl: `${baseUrl}/partner/dashboard`,
              }).catch(e => console.error("[activate] partner email failed:", e));
            }
            db.insert(inAppNotifications).values({
              userId: pu.userId,
              type: "status_update",
              title: "Your Partner Application Has Been Approved",
              message: `${partner.name} is now active on LervIT. You can start receiving and fulfilling jobs.`,
              actionUrl: `/partner/dashboard`,
              isRead: false,
            }).catch(e => console.error("[activate] partner in-app notify failed:", e));
          }
        })
        .catch(e => console.error("[activate] fetch partner users failed:", e));

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to activate partner" });
    }
  });

  // PUT /api/admin/partners/:id/reject
  app.put("/api/admin/partners/:id/reject", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const { reason } = z.object({ reason: z.string().min(1, "Rejection reason is required") }).parse(req.body);

      const [partner] = await db.select().from(partners).where(eq(partners.id, req.params.id)).limit(1);
      if (!partner) return res.status(404).json({ error: "Partner not found" });
      if (partner.status !== "pending_approval") return res.status(400).json({ error: "Only partners in pending_approval status can be rejected" });

      const [updated] = await db.update(partners)
        .set({ status: "onboarding", updatedAt: new Date() })
        .where(eq(partners.id, partner.id))
        .returning();

      await logAudit(partner.id, adminUser.id, "partner.rejected", "partner", partner.id, reason);

      // Notify all active partner_admin users of the rejection.
      // Notifications are awaited so the admin gets a 500 if delivery fails rather than
      // a silent success that leaves partners uninformed of the rejection reason.
      const baseUrl = getBaseUrl();

      const puRows = await db
        .select({ userId: partnerUsers.userId, email: users.email, name: users.name })
        .from(partnerUsers)
        .innerJoin(users, eq(users.id, partnerUsers.userId))
        .where(and(
          eq(partnerUsers.partnerId, partner.id),
          eq(partnerUsers.isActive, true),
          eq(partnerUsers.partnerRole, "partner_admin"),
        ));

      await Promise.all(puRows.map(async (pu) => {
        // In-app notification: full rejection reason visible in the partner portal
        // notification bell; actionUrl navigates to /partner/onboarding on click.
        await db.insert(inAppNotifications).values({
          userId: pu.userId,
          type: "partner_rejected",
          title: "Application Rejected — Action Required",
          message: `Your application for ${partner.name} was not approved. Reason: ${reason}. Please update your details and re-submit.`,
          actionUrl: `/partner/onboarding`,
          isRead: false,
        });

        // Email notification (non-blocking — email failures should not fail the API call)
        if (pu.email) {
          notificationService.sendPartnerApplicationRejected({
            partnerEmail: pu.email,
            partnerName: pu.name || pu.email,
            companyName: partner.name,
            reason,
            onboardingUrl: `${baseUrl}/partner/onboarding`,
          }).catch(e => console.error("[reject] partner email failed:", e));
        }
      }));

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to reject partner" });
    }
  });

  // PUT /api/admin/partners/:id/suspend
  app.put("/api/admin/partners/:id/suspend", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
      const [updated] = await db.update(partners)
        .set({ status: "suspended", suspendedAt: new Date(), suspendedReason: reason, updatedAt: new Date() })
        .where(eq(partners.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Partner not found" });
      await logAudit(updated.id, adminUser.id, "partner.suspended", "partner", updated.id, reason);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to suspend partner" });
    }
  });

  // POST /api/admin/partners/:id/invite-user
  app.post("/api/admin/partners/:id/invite-user", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const [partner] = await db.select().from(partners).where(eq(partners.id, req.params.id)).limit(1);
      if (!partner) return res.status(404).json({ error: "Partner not found" });

      const data = z.object({
        email: z.string().email(),
        role: z.enum(["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"]),
      }).parse(req.body);

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [invite] = await db.insert(partnerInvites).values({
        partnerId: partner.id,
        email: data.email,
        role: data.role,
        token,
        expiresAt,
        invitedBy: adminUser.id,
      }).returning();

      const baseUrl = getBaseUrl();
      const activationUrl = `${baseUrl}/partner/activate?token=${token}`;

      notificationService.sendPartnerUserInvite({
        toEmail: data.email,
        toName: data.email.split('@')[0],
        partnerName: partner.name,
        inviterName: adminUser.name || adminUser.email || 'LervIT',
        role: data.role,
        activationUrl,
      }).catch(e => console.error("[Admin] invite-user email failed:", e));

      res.status(201).json({ invite, activationUrl });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to invite user" });
    }
  });

  // PUT /api/admin/compliance/:docId/review
  app.put("/api/admin/compliance/:docId/review", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const data = z.object({
        reviewStatus: z.enum(["approved", "rejected", "under_review"]),
        reviewNotes: z.string().optional(),
      }).superRefine((val, ctx) => {
        if (val.reviewStatus === "rejected" && !val.reviewNotes?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Review notes are required when rejecting a document", path: ["reviewNotes"] });
        }
      }).parse(req.body);

      const [doc] = await db.select().from(complianceDocs).where(eq(complianceDocs.id, req.params.docId)).limit(1);
      if (!doc) return res.status(404).json({ error: "Document not found" });

      const [updated] = await db.update(complianceDocs)
        .set({ ...data, reviewedBy: adminUser.id, reviewedAt: new Date(), updatedAt: new Date() })
        .where(eq(complianceDocs.id, doc.id))
        .returning();

      await logAudit(doc.partnerId, adminUser.id, `compliance.${data.reviewStatus}`, "compliance_doc", doc.id, data.reviewNotes);

      // Notify partner admin users about the compliance doc review
      if (data.reviewStatus === "approved" || data.reviewStatus === "rejected") {
        const baseUrl = getBaseUrl();
        const puRows = await db
          .select({ userId: partnerUsers.userId, email: users.email, name: users.name })
          .from(partnerUsers)
          .innerJoin(users, eq(users.id, partnerUsers.userId))
          .where(and(
            eq(partnerUsers.partnerId, doc.partnerId),
            eq(partnerUsers.isActive, true),
            eq(partnerUsers.partnerRole, "partner_admin"),
          ));
        for (const pu of puRows) {
          if (pu.email) {
            notificationService.sendPartnerComplianceDocReviewed({
              partnerEmail: pu.email,
              partnerName: pu.name || pu.email,
              docType: doc.docType,
              outcome: data.reviewStatus,
              reviewNotes: data.reviewNotes,
              complianceUrl: `${baseUrl}/partner/compliance`,
            }).catch(e => console.error("[compliance review] partner email failed:", e));
          }
          db.insert(inAppNotifications).values({
            userId: pu.userId,
            type: "status_update",
            title: `Compliance Document ${data.reviewStatus === "approved" ? "Approved" : "Rejected"}`,
            message: `Your ${doc.docType.replace(/_/g, " ")} document has been ${data.reviewStatus}${data.reviewNotes ? `: ${data.reviewNotes}` : "."}`,
            actionUrl: `/partner/compliance`,
            isRead: false,
          }).catch(e => console.error("[compliance review] partner in-app notify failed:", e));
        }
      }

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to review document" });
    }
  });

  // GET /api/admin/compliance/:docId/file — generate a 15-min signed download URL for a compliance doc
  app.get("/api/admin/compliance/:docId/file", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const [doc] = await db.select().from(complianceDocs).where(eq(complianceDocs.id, req.params.docId)).limit(1);
      if (!doc) return res.status(404).json({ error: "Document not found" });
      if (!doc.fileUrl) return res.status(404).json({ error: "No file attached to this document" });

      const objectStorage = new ObjectStorageService();
      const signedUrl = await objectStorage.getSignedDownloadUrl(doc.fileUrl, 900); // 15 min
      // Redirect the browser directly to the signed GCS URL
      res.redirect(302, signedUrl);
    } catch (err) {
      console.error("[Admin] compliance file download error:", err);
      res.status(500).json({ error: "Could not generate download link" });
    }
  });

  // POST /api/admin/partners/:id/compliance/upload — admin uploads a compliance doc on behalf of a partner
  app.post("/api/admin/partners/:id/compliance/upload", requireAdminAuth, upload.single("file"), async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const [partner] = await db.select().from(partners).where(eq(partners.id, req.params.id)).limit(1);
      if (!partner) return res.status(404).json({ error: "Partner not found" });

      const docType = z.enum([
        "insurance_certificate", "cargo_liability", "business_registration",
        "compliance_attestation", "vehicle_registration", "drivers_abstract"
      ]).parse(req.body.docType);

      const reviewStatus = z.enum(["approved", "pending", "under_review"]).default("approved").parse(req.body.reviewStatus ?? "approved");
      const expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;

      let fileUrl: string | null = null;
      let fileName: string | null = null;
      let fileSize: number | null = null;

      if (req.file) {
        const objectStorage = new ObjectStorageService();
        const ext = req.file.originalname.split(".").pop() || "bin";
        const privateDir = objectStorage.getPrivateObjectDir();
        const objectKey = `${privateDir}/compliance/${partner.id}/${Date.now()}-${docType}.${ext}`;
        fileUrl = await objectStorage.uploadFile(objectKey, req.file.buffer, req.file.mimetype);
        fileName = req.file.originalname;
        fileSize = req.file.size;
      } else if (req.body.fileName) {
        // Admin can also record a doc without a file (manual entry)
        fileName = req.body.fileName;
      }

      const [doc] = await db.insert(complianceDocs).values({
        partnerId: partner.id,
        docType,
        fileUrl: fileUrl ?? undefined,
        fileName: fileName ?? undefined,
        fileSize: fileSize ?? undefined,
        expiryDate: expiryDate ?? undefined,
        reviewStatus,
        reviewedBy: reviewStatus === "approved" ? adminUser.id : undefined,
        reviewedAt: reviewStatus === "approved" ? new Date() : undefined,
        uploadedBy: adminUser.id,
      }).returning();

      // Update partner compliance status if enough docs
      const allDocs = await db.select().from(complianceDocs).where(eq(complianceDocs.partnerId, partner.id));
      if (allDocs.length >= 2) {
        await db.update(partners).set({ complianceComplete: true, updatedAt: new Date() }).where(eq(partners.id, partner.id));
      }

      await logAudit(partner.id, adminUser.id, "compliance.uploaded", "compliance_doc", doc.id, `admin-upload:${docType}`);
      res.status(201).json(doc);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Admin] compliance upload error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // DELETE /api/admin/partners/:partnerId/compliance/:docId — admin removes a compliance doc
  app.delete("/api/admin/partners/:partnerId/compliance/:docId", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const [doc] = await db.select().from(complianceDocs)
        .where(and(eq(complianceDocs.id, req.params.docId), eq(complianceDocs.partnerId, req.params.partnerId)))
        .limit(1);
      if (!doc) return res.status(404).json({ error: "Document not found" });
      await db.delete(complianceDocs).where(eq(complianceDocs.id, doc.id));
      await logAudit(req.params.partnerId, adminUser.id, "compliance.deleted", "compliance_doc", doc.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // POST /api/admin/bookings/:id/route-to-partner
  app.post("/api/admin/bookings/:id/route-to-partner", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const { partnerId } = z.object({ partnerId: z.string().min(1) }).parse(req.body);

      const [booking] = await db.select().from(bookings).where(eq(bookings.id, req.params.id)).limit(1);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const [partner] = await db.select().from(partners).where(and(eq(partners.id, partnerId), eq(partners.status, "active"))).limit(1);
      if (!partner) return res.status(404).json({ error: "Active partner not found" });

      if (booking.enterprisePartnerId) {
        return res.status(400).json({ error: "Booking is already routed to a partner" });
      }

      // If the booking is already completed, keep it completed on both fields;
      // otherwise start the enterprise workflow fresh.
      const alreadyCompleted = booking.status === "completed";
      const initialEnterpriseStatus = alreadyCompleted ? "completed" : "new";
      const newBookingStatus = alreadyCompleted ? "completed" : "confirmed";

      const [updated] = await db.update(bookings)
        .set({
          enterprisePartnerId: partnerId,
          enterpriseStatus: initialEnterpriseStatus,
          routedToPartnerAt: new Date(),
          status: newBookingStatus,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id))
        .returning();

      await db.insert(bookingStatusEvents).values({
        bookingId: booking.id,
        partnerId,
        fromStatus: null,
        toStatus: initialEnterpriseStatus,
        changedBy: adminUser.id,
        notes: `Routed to partner: ${partner.name}`,
        customerVisible: false,
      });

      await logAudit(partnerId, adminUser.id, "booking.routed", "booking", booking.id, `Routed by admin`);

      // Notify partner users + configured ops/dispatch contacts about the new job
      const baseUrl = getBaseUrl();
      db.select({ userId: partnerUsers.userId })
        .from(partnerUsers)
        .where(and(
          eq(partnerUsers.partnerId, partnerId),
          eq(partnerUsers.isActive, true),
          inArray(partnerUsers.partnerRole, ["partner_admin", "partner_ops_manager", "partner_dispatcher"]),
        ))
        .then(async (puRows) => {
          const portalUrl = `${baseUrl}/partner/bookings/${booking.id}`;
          const notifiedEmails = new Set<string>();

          // Email all portal users with admin/ops/dispatcher roles
          if (puRows.length) {
            const userIds = puRows.map(r => r.userId);
            const partnerAdminUsers = await db.select().from(users).where(inArray(users.id, userIds));
            for (const pu of partnerAdminUsers) {
              if (pu.email) {
                notifiedEmails.add(pu.email.toLowerCase());
                notificationService.sendPartnerBookingRouted({
                  toEmail: pu.email,
                  toName: pu.name || 'Partner',
                  partnerName: partner.name,
                  booking: updated,
                  portalUrl,
                }).catch(e => console.error("[Partner notify] routing email failed:", e));
              }
            }
          }

          // Also directly email the Primary Ops contact if set and not already notified
          if (partner.primaryOpsEmail && !notifiedEmails.has(partner.primaryOpsEmail.toLowerCase())) {
            notifiedEmails.add(partner.primaryOpsEmail.toLowerCase());
            notificationService.sendPartnerBookingRouted({
              toEmail: partner.primaryOpsEmail,
              toName: partner.primaryOpsContact || 'Ops Team',
              partnerName: partner.name,
              booking: updated,
              portalUrl,
            }).catch(e => console.error("[Partner notify] ops contact routing email failed:", e));
          }

          // Also directly email the Dispatch contact if set and not already notified
          if (partner.dispatchEmail && !notifiedEmails.has(partner.dispatchEmail.toLowerCase())) {
            notificationService.sendPartnerBookingRouted({
              toEmail: partner.dispatchEmail,
              toName: partner.dispatchContact || 'Dispatch',
              partnerName: partner.name,
              booking: updated,
              portalUrl,
            }).catch(e => console.error("[Partner notify] dispatch contact routing email failed:", e));
          }
        })
        .catch(e => console.error("[Partner notify] fetch partner users failed:", e));

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Admin] route booking error:", err);
      res.status(500).json({ error: "Failed to route booking" });
    }
  });

  // ============================================================
  // ADMIN — PARTNER INCIDENTS VIEW & MANAGEMENT
  // ============================================================

  // GET /api/admin/partner-incidents — all incidents across all partners
  app.get("/api/admin/partner-incidents", requireAdminAuth, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: partnerIncidents.id,
          bookingId: partnerIncidents.bookingId,
          partnerId: partnerIncidents.partnerId,
          category: partnerIncidents.category,
          severity: partnerIncidents.severity,
          status: partnerIncidents.status,
          title: partnerIncidents.title,
          notes: partnerIncidents.notes,
          escalationFlag: partnerIncidents.escalationFlag,
          fileUrls: partnerIncidents.fileUrls,
          resolutionNotes: partnerIncidents.resolutionNotes,
          resolvedAt: partnerIncidents.resolvedAt,
          createdAt: partnerIncidents.createdAt,
          updatedAt: partnerIncidents.updatedAt,
          partnerName: partners.name,
          reporterName: users.name,
        })
        .from(partnerIncidents)
        .innerJoin(partners, eq(partners.id, partnerIncidents.partnerId))
        .leftJoin(users, eq(users.id, partnerIncidents.reportedBy))
        .orderBy(
          // critical + escalated first, then by date
          sql`CASE WHEN ${partnerIncidents.severity} = 'critical' THEN 0
                   WHEN ${partnerIncidents.severity} = 'high' THEN 1
                   WHEN ${partnerIncidents.severity} = 'medium' THEN 2
                   ELSE 3 END`,
          desc(partnerIncidents.createdAt),
        );

      res.json(rows);
    } catch (err) {
      console.error("[Admin] partner incidents list error:", err);
      res.status(500).json({ error: "Failed to fetch incidents" });
    }
  });

  // POST /api/admin/partner-incidents/:id/ai-analyze — AI copilot analysis for an incident
  app.post("/api/admin/partner-incidents/:id/ai-analyze", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const incidentId = req.params.id;

      const rows = await db
        .select({
          incident: partnerIncidents,
          partnerName: partners.name,
          reporterName: users.name,
        })
        .from(partnerIncidents)
        .innerJoin(partners, eq(partners.id, partnerIncidents.partnerId))
        .leftJoin(users, eq(users.id, partnerIncidents.reportedBy))
        .where(eq(partnerIncidents.id, incidentId))
        .limit(1);

      if (!rows.length) return res.status(404).json({ error: "Incident not found" });
      const { incident, partnerName, reporterName } = rows[0];

      // Return cached analysis if less than 1 hour old
      const [cached] = await db
        .select()
        .from(aiIncidentInsights)
        .where(eq(aiIncidentInsights.incidentId, incidentId))
        .orderBy(desc(aiIncidentInsights.createdAt))
        .limit(1);

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (cached && cached.createdAt > oneHourAgo) {
        return res.json({ ...cached, cached: true });
      }

      const start = Date.now();
      const analysis = await analyzeIncident({
        incident: {
          id: incident.id,
          category: incident.category,
          severity: incident.severity,
          status: incident.status,
          title: incident.title,
          notes: incident.notes,
          escalationFlag: incident.escalationFlag,
          createdAt: incident.createdAt,
        },
        partnerName: partnerName ?? "Unknown Partner",
        bookingId: incident.bookingId,
        reporterName: reporterName ?? undefined,
      });

      const [saved] = await db.insert(aiIncidentInsights).values({
        incidentId,
        summary: analysis.summary,
        severity_assessment: analysis.severity_assessment,
        rootCause: analysis.rootCause,
        recommendations: analysis.recommendations,
        partnerCommunication: analysis.partnerCommunication,
        internalNotes: analysis.internalNotes,
        escalationAdvice: analysis.escalationAdvice,
        confidence: analysis.confidence,
        processingTimeMs: Date.now() - start,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).returning();

      res.json({ ...saved, cached: false });
    } catch (err) {
      console.error("[incident ai-analyze]", err);
      res.status(500).json({ error: "Failed to analyze incident" });
    }
  });

  // PUT /api/admin/partner-incidents/:id — admin updates status / adds resolution notes
  app.put("/api/admin/partner-incidents/:id", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const { status, resolutionNotes } = z.object({
        status: z.enum(["open", "under_review", "resolved", "escalated"]).optional(),
        resolutionNotes: z.string().max(2000).optional(),
      }).parse(req.body);

      const [existing] = await db.select().from(partnerIncidents).where(eq(partnerIncidents.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ error: "Incident not found" });

      const update: Record<string, any> = { updatedAt: new Date() };
      if (status) update.status = status;
      if (resolutionNotes !== undefined) update.resolutionNotes = resolutionNotes;
      if (status === "resolved" && !existing.resolvedAt) {
        update.resolvedAt = new Date();
        update.resolvedBy = adminUser.id;
      }

      const [updated] = await db.update(partnerIncidents).set(update).where(eq(partnerIncidents.id, req.params.id)).returning();

      // Notify the partner that the incident status changed
      const partnerUserRows = await db
        .select({ userId: partnerUsers.userId })
        .from(partnerUsers)
        .where(and(
          eq(partnerUsers.partnerId, existing.partnerId),
          eq(partnerUsers.isActive, true),
          inArray(partnerUsers.partnerRole, ["partner_admin", "partner_ops_manager"]),
        ));
      for (const pu of partnerUserRows) {
        db.insert(inAppNotifications).values({
          userId: pu.userId,
          type: "new_message",
          title: `Incident Update: ${existing.title.slice(0, 50)}`,
          message: `Status changed to ${status ?? existing.status}`,
          bookingId: existing.bookingId,
          actionUrl: `/partner/incidents`,
          isRead: false,
        }).catch(() => {});
      }

      await logAudit(existing.partnerId, adminUser.id, "incident.status_updated", "partner_incident", existing.id, status);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Admin] incident update error:", err);
      res.status(500).json({ error: "Failed to update incident" });
    }
  });

  // ============================================================
  // ADMIN ↔ PARTNER DIRECT MESSAGING
  // ============================================================

  // GET /api/admin/partners/:id/messages — fetch full thread
  app.get("/api/admin/partners/:id/messages", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const [partner] = await db.select().from(partners).where(eq(partners.id, req.params.id)).limit(1);
      if (!partner) return res.status(404).json({ error: "Partner not found" });

      const msgs = await db
        .select({
          id: partnerDirectMessages.id,
          partnerId: partnerDirectMessages.partnerId,
          senderId: partnerDirectMessages.senderId,
          senderRole: partnerDirectMessages.senderRole,
          text: partnerDirectMessages.text,
          createdAt: partnerDirectMessages.createdAt,
          readAt: partnerDirectMessages.readAt,
          senderName: users.name,
        })
        .from(partnerDirectMessages)
        .innerJoin(users, eq(users.id, partnerDirectMessages.senderId))
        .where(eq(partnerDirectMessages.partnerId, partner.id))
        .orderBy(asc(partnerDirectMessages.createdAt));

      res.json(msgs);
    } catch (err) {
      console.error("[Admin] partner messages get error:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // POST /api/admin/partners/:id/messages — admin sends a message to partner
  app.post("/api/admin/partners/:id/messages", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const [partner] = await db.select().from(partners).where(eq(partners.id, req.params.id)).limit(1);
      if (!partner) return res.status(404).json({ error: "Partner not found" });

      const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(req.body);

      const [msg] = await db.insert(partnerDirectMessages).values({
        partnerId: partner.id,
        senderId: adminUser.id,
        senderRole: "admin",
        text,
      }).returning();

      // Notify all active partner portal users
      const puRows = await db
        .select({ userId: partnerUsers.userId })
        .from(partnerUsers)
        .where(and(
          eq(partnerUsers.partnerId, partner.id),
          eq(partnerUsers.isActive, true),
          inArray(partnerUsers.partnerRole, ["partner_admin", "partner_ops_manager", "partner_dispatcher"]),
        ));

      const preview = text.length > 80 ? text.slice(0, 80) + "..." : text;
      for (const pu of puRows) {
        db.insert(inAppNotifications).values({
          userId: pu.userId,
          type: "new_message",
          title: `Message from LervIT Admin`,
          message: preview,
          actionUrl: `/partner/messages`,
          isRead: false,
        }).catch(e => console.error("[admin→partner notify]", e));
      }

      res.json({ ...msg, senderName: adminUser.name });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Admin] partner messages post error:", err);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // POST /api/admin/partners/:id/messages/mark-read — admin marks partner replies as read
  app.post("/api/admin/partners/:id/messages/mark-read", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      await db
        .update(partnerDirectMessages)
        .set({ readAt: new Date() })
        .where(and(
          eq(partnerDirectMessages.partnerId, req.params.id),
          isNull(partnerDirectMessages.readAt),
          ne(partnerDirectMessages.senderId, adminUser.id),
        ));
      res.json({ ok: true });
    } catch (err) {
      console.error("[Admin] mark messages read error:", err);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // ============================================================
  // PARTNER MESSAGING ROUTES
  // ============================================================

  // GET /api/partner/messages — list all booking conversations for this partner
  app.get("/api/partner/messages", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"]), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;

      const partnerBookingRows = await db.select({
        id: bookings.id,
        pickupAddress: bookings.pickupAddress,
        dropoffAddress: bookings.dropoffAddress,
        preferredDate: bookings.preferredDate,
        status: bookings.status,
        enterpriseStatus: bookings.enterpriseStatus,
        customerId: bookings.customerId,
      }).from(bookings).where(eq(bookings.enterprisePartnerId, partner.id));

      if (!partnerBookingRows.length) return res.json([]);

      const bookingIds = partnerBookingRows.map(b => b.id);

      const allMessages = await db.select().from(messages)
        .where(inArray(messages.bookingId, bookingIds))
        .orderBy(desc(messages.createdAt));

      if (!allMessages.length) return res.json([]);

      // Identify partner user IDs so we can flag incoming (customer) messages
      const partnerUserRows = await db.select({ userId: partnerUsers.userId })
        .from(partnerUsers).where(eq(partnerUsers.partnerId, partner.id));
      const partnerUserIds = new Set(partnerUserRows.map(r => r.userId));

      // Group messages by booking
      type ConvEntry = { lastMessage: typeof allMessages[0]; unreadCount: number };
      const convMap = new Map<string, ConvEntry>();
      for (const msg of allMessages) {
        if (!convMap.has(msg.bookingId)) {
          convMap.set(msg.bookingId, { lastMessage: msg, unreadCount: 0 });
        }
        if (!partnerUserIds.has(msg.senderId) && !msg.readAt) {
          convMap.get(msg.bookingId)!.unreadCount++;
        }
      }

      // Fetch customer names
      const customerIds = Array.from(new Set(partnerBookingRows.map(b => b.customerId)));
      const customerRows = await db.select({ id: users.id, name: users.name })
        .from(users).where(inArray(users.id, customerIds));
      const customerMap = Object.fromEntries(customerRows.map(u => [u.id, u.name]));

      // Build conversation list (only bookings with messages)
      const conversations = partnerBookingRows
        .filter(b => convMap.has(b.id))
        .map(b => ({
          bookingId: b.id,
          booking: b,
          customerName: customerMap[b.customerId] || "Customer",
          lastMessage: convMap.get(b.id)!.lastMessage,
          unreadCount: convMap.get(b.id)!.unreadCount,
        }))
        .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());

      res.json(conversations);
    } catch (err) {
      console.error("[Partner] messages list error:", err);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // GET /api/partner/messages/unread-count — total unread for badge
  app.get("/api/partner/messages/unread-count", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"]), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;

      const partnerBookingIds = await db.select({ id: bookings.id })
        .from(bookings).where(eq(bookings.enterprisePartnerId, partner.id));
      if (!partnerBookingIds.length) return res.json({ count: 0 });

      const ids = partnerBookingIds.map(b => b.id);
      const partnerUserRows = await db.select({ userId: partnerUsers.userId })
        .from(partnerUsers).where(eq(partnerUsers.partnerId, partner.id));
      const partnerUserIds = partnerUserRows.map(r => r.userId);

      const unread = await db.select({ id: messages.id })
        .from(messages)
        .where(and(
          inArray(messages.bookingId, ids),
          isNull(messages.readAt),
          partnerUserIds.length > 0 ? sql`${messages.senderId} NOT IN (${sql.join(partnerUserIds.map(id => sql`${id}`), sql`, `)})` : sql`true`,
        ));

      res.json({ count: unread.length });
    } catch (err) {
      console.error("[Partner] messages unread count error:", err);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // GET /api/partner/bookings/:id/messages — get thread for a booking
  app.get("/api/partner/bookings/:id/messages", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"]), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;

      const [booking] = await db.select().from(bookings)
        .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
        .limit(1);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const msgs = await db.select().from(messages)
        .where(eq(messages.bookingId, booking.id))
        .orderBy(asc(messages.createdAt));

      const userIds = Array.from(new Set(msgs.map(m => m.senderId)));
      const senderRows = userIds.length
        ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
        : [];
      const senderMap = Object.fromEntries(senderRows.map(u => [u.id, u.name]));

      // Get partner user ids to label messages
      const partnerUserRows = await db.select({ userId: partnerUsers.userId })
        .from(partnerUsers).where(eq(partnerUsers.partnerId, partner.id));
      const partnerUserIds = new Set(partnerUserRows.map(r => r.userId));

      res.json(msgs.map(m => ({
        ...m,
        senderName: senderMap[m.senderId] || "Unknown",
        isPartnerMessage: partnerUserIds.has(m.senderId),
      })));
    } catch (err) {
      console.error("[Partner] booking messages get error:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // POST /api/partner/bookings/:id/messages — send a message as partner
  app.post("/api/partner/bookings/:id/messages", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;

      const [booking] = await db.select().from(bookings)
        .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
        .limit(1);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(req.body);

      const [msg] = await db.insert(messages).values({
        bookingId: booking.id,
        senderId: user.id,
        text,
      }).returning();

      // Notify the customer that the partner has replied
      if (booking.customerId) {
        const messagePreview = text.length > 80 ? text.slice(0, 80) + "..." : text;
        db.insert(inAppNotifications).values({
          userId: booking.customerId,
          type: "new_message",
          title: `New message from ${partner.name}`,
          message: messagePreview,
          bookingId: booking.id,
          actionUrl: `/messages/${booking.id}`,
          isRead: false,
        }).catch(e => console.error("[Partner msg] customer notify failed:", e));
      }

      res.json({ ...msg, senderName: user.name, isPartnerMessage: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // GET /api/partner/direct-messages — LervIT admin thread for this partner
  app.get("/api/partner/direct-messages", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"]), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;

      const msgs = await db
        .select({
          id: partnerDirectMessages.id,
          partnerId: partnerDirectMessages.partnerId,
          senderId: partnerDirectMessages.senderId,
          senderRole: partnerDirectMessages.senderRole,
          text: partnerDirectMessages.text,
          createdAt: partnerDirectMessages.createdAt,
          readAt: partnerDirectMessages.readAt,
          senderName: users.name,
        })
        .from(partnerDirectMessages)
        .innerJoin(users, eq(users.id, partnerDirectMessages.senderId))
        .where(eq(partnerDirectMessages.partnerId, partner.id))
        .orderBy(asc(partnerDirectMessages.createdAt));

      res.json(msgs);
    } catch (err) {
      console.error("[Partner] direct messages get error:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // GET /api/partner/direct-messages/unread-count
  app.get("/api/partner/direct-messages/unread-count", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"]), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;

      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(partnerDirectMessages)
        .where(and(
          eq(partnerDirectMessages.partnerId, partner.id),
          eq(partnerDirectMessages.senderRole, "admin"),
          isNull(partnerDirectMessages.readAt),
        ));

      res.json({ count: row?.count ?? 0 });
    } catch (err) {
      console.error("[Partner] direct messages unread count error:", err);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // POST /api/partner/direct-messages — partner sends a reply to admin
  app.post("/api/partner/direct-messages", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;

      const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(req.body);

      const [msg] = await db.insert(partnerDirectMessages).values({
        partnerId: partner.id,
        senderId: user.id,
        senderRole: "partner",
        text,
      }).returning();

      // Notify all admin users
      const adminRows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"));

      const preview = text.length > 80 ? text.slice(0, 80) + "..." : text;
      for (const admin of adminRows) {
        db.insert(inAppNotifications).values({
          userId: admin.id,
          type: "new_message",
          title: `Reply from ${partner.name}`,
          message: preview,
          actionUrl: `/admin/partners/${partner.id}`,
          isRead: false,
        }).catch(e => console.error("[partner→admin notify]", e));
      }

      res.json({ ...msg, senderName: user.name });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Partner] direct message send error:", err);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // POST /api/partner/direct-messages/mark-read — partner marks admin messages as read
  app.post("/api/partner/direct-messages/mark-read", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"]), async (req: Request, res: Response) => {
    try {
      const { partner } = (req as any).partnerCtx;

      await db
        .update(partnerDirectMessages)
        .set({ readAt: new Date() })
        .where(and(
          eq(partnerDirectMessages.partnerId, partner.id),
          eq(partnerDirectMessages.senderRole, "admin"),
          isNull(partnerDirectMessages.readAt),
        ));

      res.json({ ok: true });
    } catch (err) {
      console.error("[Partner] direct messages mark-read error:", err);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // POST /api/partner/messages/:bookingId/mark-read — mark incoming messages as read
  app.post("/api/partner/messages/:bookingId/mark-read", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager", "partner_viewer"]), async (req: Request, res: Response) => {
    try {
      const { partner, user } = (req as any).partnerCtx;

      const [booking] = await db.select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.id, req.params.bookingId), eq(bookings.enterprisePartnerId, partner.id)))
        .limit(1);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      await db.update(messages)
        .set({ readAt: new Date() })
        .where(and(
          eq(messages.bookingId, booking.id),
          isNull(messages.readAt),
          ne(messages.senderId, user.id),
        ));

      res.json({ ok: true });
    } catch (err) {
      console.error("[Partner] messages mark-read error:", err);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });
}
