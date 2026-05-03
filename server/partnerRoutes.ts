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
import { eq, and, desc, inArray, or, sql, isNull, gt, asc } from "drizzle-orm";
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
} from "@shared/schema";
import { ObjectStorageService } from "./objectStorage";

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
        // Update role
        await db.update(users).set({ role: invite.role }).where(eq(users.id, existingUser.id));
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

  // =========================================================
  // PARTNER CONTEXT
  // =========================================================

  // GET /api/partner/me
  app.get("/api/partner/me", requirePartnerAuth(), async (req: Request, res: Response) => {
    const { user, partnerUser, partner } = (req as any).partnerCtx;
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
      partnerUser: { id: partnerUser.id, partnerRole: partnerUser.partnerRole },
      partner,
    });
  });

  // =========================================================
  // PARTNER PROFILE / ONBOARDING
  // =========================================================

  // GET /api/partner/profile
  app.get("/api/partner/profile", requirePartnerAuth(), async (req: Request, res: Response) => {
    const { partner } = (req as any).partnerCtx;
    res.json(partner);
  });

  // PUT /api/partner/profile
  app.put("/api/partner/profile", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    try {
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        legalName: z.string().min(1).optional(),
        operatingName: z.string().optional(),
        billingEmail: z.string().email().optional(),
        primaryOpsContact: z.string().optional(),
        dispatchContact: z.string().optional(),
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
    const { partner } = (req as any).partnerCtx;

    const zones = await db.select().from(coverageZones).where(eq(coverageZones.partnerId, partner.id));
    const docs = await db.select().from(complianceDocs).where(eq(complianceDocs.partnerId, partner.id));
    const team = await db.select().from(partnerTeamMembers).where(eq(partnerTeamMembers.partnerId, partner.id));

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
    });
  });

  // POST /api/partner/onboarding/submit
  app.post("/api/partner/onboarding/submit", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    if (!partner.profileComplete || !partner.coverageComplete || !partner.complianceComplete || !partner.termsAccepted) {
      return res.status(400).json({ error: "Complete all required onboarding steps before submitting" });
    }
    const [updated] = await db.update(partners)
      .set({ status: "pending_approval", updatedAt: new Date() })
      .where(eq(partners.id, partner.id))
      .returning();
    await logAudit(partner.id, user.id, "onboarding.submitted", "partner", partner.id);
    res.json(updated);
  });

  // =========================================================
  // COVERAGE ZONES
  // =========================================================

  // GET /api/partner/coverage
  app.get("/api/partner/coverage", requirePartnerAuth(), async (req: Request, res: Response) => {
    const { partner } = (req as any).partnerCtx;
    const zones = await db.select().from(coverageZones).where(eq(coverageZones.partnerId, partner.id)).orderBy(desc(coverageZones.createdAt));
    res.json(zones);
  });

  // POST /api/partner/coverage
  app.post("/api/partner/coverage", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    try {
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
    const { partner, user } = (req as any).partnerCtx;
    try {
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
    const { partner, user } = (req as any).partnerCtx;
    const [zone] = await db.select().from(coverageZones)
      .where(and(eq(coverageZones.id, req.params.id), eq(coverageZones.partnerId, partner.id)))
      .limit(1);
    if (!zone) return res.status(404).json({ error: "Zone not found" });
    await db.delete(coverageZones).where(eq(coverageZones.id, zone.id));
    await logAudit(partner.id, user.id, "coverage.deleted", "coverage_zone", zone.id);
    res.json({ success: true });
  });

  // =========================================================
  // COMPLIANCE DOCUMENTS
  // =========================================================

  // GET /api/partner/compliance
  app.get("/api/partner/compliance", requirePartnerAuth(), async (req: Request, res: Response) => {
    const { partner } = (req as any).partnerCtx;
    const docs = await db.select().from(complianceDocs).where(eq(complianceDocs.partnerId, partner.id)).orderBy(desc(complianceDocs.createdAt));
    res.json(docs);
  });

  // POST /api/partner/compliance/upload
  app.post("/api/partner/compliance/upload", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), upload.single("file"), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const docType = z.enum([
        "insurance_certificate", "cargo_liability", "business_registration",
        "compliance_attestation", "vehicle_registration", "drivers_abstract"
      ]).parse(req.body.docType);

      const expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;

      const objectStorage = new ObjectStorageService();
      const ext = req.file.originalname.split(".").pop() || "bin";
      const objectKey = `.private/compliance/${partner.id}/${Date.now()}-${docType}.${ext}`;
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

  // DELETE /api/partner/compliance/:id
  app.delete("/api/partner/compliance/:id", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    const [doc] = await db.select().from(complianceDocs)
      .where(and(eq(complianceDocs.id, req.params.id), eq(complianceDocs.partnerId, partner.id)))
      .limit(1);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (doc.reviewStatus === "approved") return res.status(400).json({ error: "Cannot delete approved documents" });
    await db.delete(complianceDocs).where(eq(complianceDocs.id, doc.id));
    await logAudit(partner.id, user.id, "compliance.deleted", "compliance_doc", doc.id);
    res.json({ success: true });
  });

  // =========================================================
  // DISPATCH SETUP
  // =========================================================

  // PUT /api/partner/dispatch
  app.put("/api/partner/dispatch", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    try {
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
    const { partner, user } = (req as any).partnerCtx;
    const [updated] = await db.update(partners)
      .set({ termsAccepted: true, termsAcceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(partners.id, partner.id))
      .returning();
    await logAudit(partner.id, user.id, "terms.accepted", "partner", partner.id);
    res.json(updated);
  });

  // =========================================================
  // TEAM MEMBERS
  // =========================================================

  // GET /api/partner/team
  app.get("/api/partner/team", requirePartnerAuth(), async (req: Request, res: Response) => {
    const { partner } = (req as any).partnerCtx;
    const team = await db.select().from(partnerTeamMembers)
      .where(eq(partnerTeamMembers.partnerId, partner.id))
      .orderBy(desc(partnerTeamMembers.createdAt));
    res.json(team);
  });

  // POST /api/partner/team
  app.post("/api/partner/team", requirePartnerAuth(["partner_admin", "partner_ops_manager", "partner_dispatcher"]), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    try {
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
    const { partner, user } = (req as any).partnerCtx;
    const [member] = await db.select().from(partnerTeamMembers)
      .where(and(eq(partnerTeamMembers.id, req.params.id), eq(partnerTeamMembers.partnerId, partner.id)))
      .limit(1);
    if (!member) return res.status(404).json({ error: "Team member not found" });
    try {
      const data = insertPartnerTeamMemberSchema.omit({ partnerId: true }).partial().parse(req.body);
      const [updated] = await db.update(partnerTeamMembers).set(data).where(eq(partnerTeamMembers.id, member.id)).returning();
      await logAudit(partner.id, user.id, "team.updated", "partner_team_member", member.id);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to update team member" });
    }
  });

  // DELETE /api/partner/team/:id
  app.delete("/api/partner/team/:id", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    const [member] = await db.select().from(partnerTeamMembers)
      .where(and(eq(partnerTeamMembers.id, req.params.id), eq(partnerTeamMembers.partnerId, partner.id)))
      .limit(1);
    if (!member) return res.status(404).json({ error: "Team member not found" });
    await db.delete(partnerTeamMembers).where(eq(partnerTeamMembers.id, member.id));
    await logAudit(partner.id, user.id, "team.deleted", "partner_team_member", member.id);
    res.json({ success: true });
  });

  // POST /api/partner/team/:id/driver-photo
  app.post("/api/partner/team/:id/driver-photo", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), upload.single("file"), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: "Only image files are accepted" });

    const [member] = await db.select().from(partnerTeamMembers)
      .where(and(eq(partnerTeamMembers.id, req.params.id), eq(partnerTeamMembers.partnerId, partner.id)))
      .limit(1);
    if (!member) return res.status(404).json({ error: "Team member not found" });

    try {
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
    const { partner, user } = (req as any).partnerCtx;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ error: "Only image files are accepted" });

    const [member] = await db.select().from(partnerTeamMembers)
      .where(and(eq(partnerTeamMembers.id, req.params.id), eq(partnerTeamMembers.partnerId, partner.id)))
      .limit(1);
    if (!member) return res.status(404).json({ error: "Team member not found" });

    try {
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
    const { partner } = (req as any).partnerCtx;
    try {
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
    const { partner } = (req as any).partnerCtx;
    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const [assignment] = await db.select().from(bookingAssignments)
      .where(and(eq(bookingAssignments.bookingId, booking.id), eq(bookingAssignments.partnerId, partner.id)))
      .orderBy(desc(bookingAssignments.assignedAt)).limit(1);

    const events = await db.select().from(bookingStatusEvents)
      .where(eq(bookingStatusEvents.bookingId, booking.id))
      .orderBy(desc(bookingStatusEvents.createdAt));

    const incidents = await db.select().from(partnerIncidents)
      .where(and(eq(partnerIncidents.bookingId, booking.id), eq(partnerIncidents.partnerId, partner.id)))
      .orderBy(desc(partnerIncidents.createdAt));

    const proofs = await db.select().from(proofOfCompletion)
      .where(and(eq(proofOfCompletion.bookingId, booking.id), eq(proofOfCompletion.partnerId, partner.id)))
      .orderBy(desc(proofOfCompletion.uploadedAt));

    res.json({ booking, assignment: assignment ?? null, events, incidents, proofs });
  });

  // GET /api/partner/bookings/:id/events
  app.get("/api/partner/bookings/:id/events", requirePartnerAuth(), async (req: Request, res: Response) => {
    const { partner } = (req as any).partnerCtx;
    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    const events = await db.select().from(bookingStatusEvents)
      .where(eq(bookingStatusEvents.bookingId, booking.id))
      .orderBy(desc(bookingStatusEvents.createdAt));
    res.json(events);
  });

  // POST /api/partner/bookings/:id/accept
  app.post("/api/partner/bookings/:id/accept", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), async (req: Request, res: Response) => {
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
      .set({ enterpriseStatus: "accepted", enterpriseAcceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, booking.id))
      .returning();

    await db.insert(bookingStatusEvents).values({
      bookingId: booking.id,
      partnerId: partner.id,
      fromStatus,
      toStatus: "accepted",
      changedBy: user.id,
      notes: req.body.notes ?? null,
      customerVisible: false,
    });

    await logAudit(partner.id, user.id, "booking.accepted", "booking", booking.id);
    res.json(updated);
  });

  // POST /api/partner/bookings/:id/reject
  app.post("/api/partner/bookings/:id/reject", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), async (req: Request, res: Response) => {
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
    res.json(updated);
  });

  // POST /api/partner/bookings/:id/assign
  app.post("/api/partner/bookings/:id/assign", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const allowedStatuses = ["accepted", "assigned"];
    if (!allowedStatuses.includes(booking.enterpriseStatus || "")) {
      return res.status(400).json({ error: `Cannot assign from status: ${booking.enterpriseStatus}` });
    }

    try {
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
        .set({ enterpriseStatus: "assigned", updatedAt: new Date() })
        .where(eq(bookings.id, booking.id))
        .returning();

      await db.insert(bookingStatusEvents).values({
        bookingId: booking.id,
        partnerId: partner.id,
        fromStatus,
        toStatus: "assigned",
        changedBy: user.id,
        notes: `Assigned to: ${data.driverName || data.teamName || "team member"}`,
        customerVisible: false,
      });

      await logAudit(partner.id, user.id, "booking.assigned", "booking", booking.id);
      res.json({ booking: updatedBooking, assignment });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to assign booking" });
    }
  });

  // POST /api/partner/bookings/:id/status
  app.post("/api/partner/bookings/:id/status", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    try {
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
    const { partner } = (req as any).partnerCtx;
    const incidents = await db.select().from(partnerIncidents)
      .where(eq(partnerIncidents.partnerId, partner.id))
      .orderBy(desc(partnerIncidents.createdAt));
    res.json(incidents);
  });

  // POST /api/partner/bookings/:id/incidents
  app.post("/api/partner/bookings/:id/incidents", requirePartnerAuth(["partner_admin", "partner_dispatcher", "partner_ops_manager"]), upload.array("files", 5), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    try {
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
      res.status(201).json(incident);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Partner] incident create error:", err);
      res.status(500).json({ error: "Failed to create incident" });
    }
  });

  // PUT /api/partner/incidents/:id
  app.put("/api/partner/incidents/:id", requirePartnerAuth(["partner_admin", "partner_ops_manager"]), async (req: Request, res: Response) => {
    const { partner, user } = (req as any).partnerCtx;
    const [incident] = await db.select().from(partnerIncidents)
      .where(and(eq(partnerIncidents.id, req.params.id), eq(partnerIncidents.partnerId, partner.id)))
      .limit(1);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    try {
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
    const { partner, user } = (req as any).partnerCtx;
    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, req.params.id), eq(bookings.enterprisePartnerId, partner.id)))
      .limit(1);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    try {
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

  // =========================================================
  // STRIPE CONNECT
  // =========================================================

  // POST /api/partner/stripe/connect — create or resume Stripe Connect Express onboarding
  app.post("/api/partner/stripe/connect", requirePartnerAuth(["partner_admin"]), async (req: Request, res: Response) => {
    const { user, partner } = (req as any).partnerCtx;
    try {
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
    const { partner } = (req as any).partnerCtx;
    try {
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
    const { partner } = (req as any).partnerCtx;
    try {
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
  app.get("/api/partner/earnings", requirePartnerAuth(), async (req: Request, res: Response) => {
    const { partner } = (req as any).partnerCtx;
    try {
      const allBookings = await db.select().from(bookings)
        .where(and(eq(bookings.enterprisePartnerId, partner.id), eq(bookings.enterpriseStatus, "completed")))
        .orderBy(desc(bookings.updatedAt));

      const partnerNet = (b: typeof allBookings[0]): number => {
        const price = parseFloat(b.price ?? "0");
        const fee = parseFloat((b as any).platformFeeAmount ?? "0");
        if (fee > 0) return Math.max(0, price - fee);
        const feePercent = parseFloat((b as any).platformFeePercent ?? "15");
        return Math.max(0, price * (1 - feePercent / 100));
      };

      const earnings = allBookings.map(b => ({
        id: b.id,
        pickupAddress: b.pickupAddress,
        dropoffAddress: b.dropoffAddress,
        price: b.price,
        partnerNet: partnerNet(b).toFixed(2),
        platformFeePercent: (b as any).platformFeePercent ?? "15.00",
        platformFeeAmount: (b as any).platformFeeAmount ?? null,
        completedAt: b.updatedAt,
      }));

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
    const { partner } = (req as any).partnerCtx;
    try {
      const allBookings = await db.select().from(bookings).where(eq(bookings.enterprisePartnerId, partner.id));
      const incidents = await db.select().from(partnerIncidents).where(eq(partnerIncidents.partnerId, partner.id));
      const team = await db.select().from(partnerTeamMembers).where(eq(partnerTeamMembers.partnerId, partner.id));

      const activeStatuses = ["new", "under_review", "accepted", "assigned", "en_route_to_pickup", "arrived_at_pickup", "picked_up", "in_transit", "arrived_at_dropoff", "delivered", "delayed", "issue_reported"];

      // Earnings helpers — partner net = price minus platform fee
      const partnerNet = (b: typeof allBookings[0]): number => {
        const price = parseFloat(b.price ?? "0");
        const fee = parseFloat((b as any).platformFeeAmount ?? "0");
        if (fee > 0) return Math.max(0, price - fee);
        const feePercent = parseFloat((b as any).platformFeePercent ?? "15");
        return Math.max(0, price * (1 - feePercent / 100));
      };

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
        role: data.role,
        token,
        expiresAt,
        invitedBy: inviter.id,
      }).returning();

      await logAudit(partner.id, inviter.id, "user.invited", "partner_user", invite.id,
        `Invited ${data.email} as ${data.role}`);

      res.status(201).json({ invite: { ...invite, activationUrl: `/partner-activate?token=${token}` } });
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
    const { partner } = (req as any).partnerCtx;
    const logs = await db.select().from(partnerAuditLog)
      .where(eq(partnerAuditLog.partnerId, partner.id))
      .orderBy(desc(partnerAuditLog.createdAt))
      .limit(100);
    res.json(logs);
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

      res.status(201).json({
        partner,
        invite: { ...invite, activationUrl: `/partner/activate?token=${token}` },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Admin] partner invite error:", err);
      res.status(500).json({ error: "Failed to create partner invite" });
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
        const completedBookings = await db.select({ price: bookings.price })
          .from(bookings)
          .where(and(eq(bookings.enterprisePartnerId, p.id), eq(bookings.status, "completed")));
        const totalEarned = completedBookings.reduce((sum, b) => sum + parseFloat(b.price ?? "0"), 0);
        return {
          ...p,
          teamMemberCount: teamCount?.count ?? 0,
          completedJobCount: completedBookings.length,
          totalEarned: totalEarned.toFixed(2),
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

      // Earnings summary
      const completedBookings = bookingsList.filter(b => b.status === "completed");
      const totalEarned = completedBookings.reduce((s, b) => s + parseFloat(b.price ?? "0"), 0);
      const platformFee = totalEarned * 0.15;
      const partnerNet = totalEarned - platformFee;

      res.json({
        partner, users: pUsers, docs, zones, invites,
        recentBookings: enrichedBookings,
        team,
        earnings: {
          totalEarned: totalEarned.toFixed(2),
          platformFee: platformFee.toFixed(2),
          partnerNet: partnerNet.toFixed(2),
          completedJobs: completedBookings.length,
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

      const [updated] = await db.update(partners)
        .set({ status: "active", activatedAt: new Date(), activatedBy: adminUser.id, updatedAt: new Date() })
        .where(eq(partners.id, partner.id))
        .returning();

      await logAudit(partner.id, adminUser.id, "partner.activated", "partner", partner.id);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to activate partner" });
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

      res.status(201).json({ invite, activationUrl: `/partner/activate?token=${token}` });
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
      }).parse(req.body);

      const [doc] = await db.select().from(complianceDocs).where(eq(complianceDocs.id, req.params.docId)).limit(1);
      if (!doc) return res.status(404).json({ error: "Document not found" });

      const [updated] = await db.update(complianceDocs)
        .set({ ...data, reviewedBy: adminUser.id, reviewedAt: new Date(), updatedAt: new Date() })
        .where(eq(complianceDocs.id, doc.id))
        .returning();

      await logAudit(doc.partnerId, adminUser.id, `compliance.${data.reviewStatus}`, "compliance_doc", doc.id, data.reviewNotes);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: "Failed to review document" });
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

      const [updated] = await db.update(bookings)
        .set({
          enterprisePartnerId: partnerId,
          enterpriseStatus: "new",
          routedToPartnerAt: new Date(),
          status: "confirmed",
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id))
        .returning();

      await db.insert(bookingStatusEvents).values({
        bookingId: booking.id,
        partnerId,
        fromStatus: null,
        toStatus: "new",
        changedBy: adminUser.id,
        notes: `Routed to partner: ${partner.name}`,
        customerVisible: false,
      });

      await logAudit(partnerId, adminUser.id, "booking.routed", "booking", booking.id, `Routed by admin`);
      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("[Admin] route booking error:", err);
      res.status(500).json({ error: "Failed to route booking" });
    }
  });
}
