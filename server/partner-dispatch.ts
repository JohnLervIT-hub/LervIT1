/**
 * Auto-dispatch to enterprise partners (Gap 1).
 *
 * Given a paid booking, finds every eligible partner (active status, coverage zone
 * match, load size / hours / team availability) and routes the booking to the first
 * one — mirroring the manual admin routing endpoint exactly (enterprisePartnerId,
 * enterpriseStatus="new", audit trail, email + in-app notifications).
 *
 * When no partner qualifies it returns { dispatched: false }. Pass
 * allowFallbackToMover to have it hand the booking to the mover pipeline itself,
 * and notifyAdmin to have it raise an admin alert.
 */

import { db } from "./db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Booking } from "@shared/schema";
import {
  bookings,
  bookingStatusEvents,
  complianceDocs,
  coverageZones,
  inAppNotifications,
  partners,
  partnerAuditLog,
  partnerTeamMembers,
  partnerUsers,
  users,
} from "@shared/schema";
import { notificationService } from "./notifications";
import { dispatchBooking } from "./dispatch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Which mover path to use when partner routing fails and fallback is allowed.
 *
 *   "victor" — route through the Victor agent pipeline. Victor re-fetches the
 *              booking and enforces its own guards: it SKIPS unless the row is
 *              still `pending` with no mover assigned. Correct for the
 *              post-payment path, where the row is `pending`.
 *   "direct" — call dispatchBooking() straight away, bypassing those guards.
 *              Required for the partner-rejection re-route, where the row was
 *              already flipped to `confirmed` by a previous auto-dispatch and
 *              Victor would silently skip it.
 */
export type MoverFallbackStrategy = "victor" | "direct";

/** What happened on the mover-dispatch fallback, for caller-side logging. */
export type MoverFallbackOutcome =
  | "not_attempted" // allowFallbackToMover was false, or the booking is already routed
  | "dispatched"
  | "skipped" // Victor declined (wrong status / mover already assigned)
  | "failed";

export type AutoDispatchResult =
  | { dispatched: true; partnerId: string; partnerName: string }
  | {
      dispatched: false;
      reason: "no_eligible_partners" | "already_routed" | "error";
      error?: string;
      moverFallback: MoverFallbackOutcome;
    };

export type AutoDispatchOptions = {
  /**
   * Alert admins when partner routing fails. Not fired for "already_routed" —
   * that booking has a partner, so nothing failed.
   */
  notifyAdmin?: boolean;
  /**
   * Hand the booking to the mover pipeline when no partner takes it.
   * Defaults to false: callers opt in, so no caller gets a surprise dispatch.
   */
  allowFallbackToMover?: boolean;
  /** Mover path used when allowFallbackToMover is true. Defaults to "victor". */
  moverFallback?: MoverFallbackStrategy;
};

type EligiblePartner = {
  partner: typeof partners.$inferSelect;
  matchedZone: typeof coverageZones.$inferSelect;
  availableTeamCount: number;
};

// ---------------------------------------------------------------------------
// Helpers — extract postal FSA + day-of-week + HH:MM from a booking
// ---------------------------------------------------------------------------

const CANADIAN_POSTAL_FSA = /([A-Za-z]\d[A-Za-z])[\s-]?\d[A-Za-z]\d/;

export function extractPostalFsa(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = address.match(CANADIAN_POSTAL_FSA);
  return m ? m[1].toUpperCase() : null;
}

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function dayOfWeek(date: Date): string {
  return DOW_KEYS[date.getDay()];
}

function hhmm(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function isEmptyArr(v: unknown): boolean {
  return !Array.isArray(v) || v.length === 0;
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * Find every partner whose coverage zone matches the booking.
 *
 * Rules enforced:
 *   1. partners.status = 'active'
 *   2. coverage_zones.is_active = true
 *   3. Operating day matches booking.preferredDate day-of-week
 *      (null/empty operatingDays = accepts all days)
 *   4. Operating hours cover booking time, OR zone.sameDayAvailable = true
 *   5. Load size matches (null/empty supportedLoadSizes = accepts all)
 *   6. Postal FSA prefix match; falls back to city-in-address match when
 *      postalCodePrefixes is null/empty
 *   7. Partner has ≥1 team member with isAvailable = true
 *   8. booking.enterprisePartnerId is null (skipped by caller when re-routing)
 *
 * Sort order:
 *   - Most available team members first
 *   - Least recently updated partner next (fair distribution — partners who
 *     haven't been touched recently by a routing action get preference)
 */
export async function findEligiblePartners(
  booking: Pick<Booking, "id" | "pickupAddress" | "preferredDate" | "loadSize" | "enterprisePartnerId">,
): Promise<EligiblePartner[]> {
  if (booking.enterprisePartnerId) return [];

  const fsa = extractPostalFsa(booking.pickupAddress);
  const address = (booking.pickupAddress || "").toLowerCase();
  const when = new Date(booking.preferredDate);
  const day = dayOfWeek(when);
  const time = hhmm(when);
  const loadSize = booking.loadSize;

  // Exclude partners who already rejected this booking on a prior routing attempt.
  const priorRejections = await db
    .select({ partnerId: bookingStatusEvents.partnerId })
    .from(bookingStatusEvents)
    .where(and(eq(bookingStatusEvents.bookingId, booking.id), eq(bookingStatusEvents.toStatus, "rejected")));
  const excludedPartnerIds = new Set(
    priorRejections.map((r) => r.partnerId).filter((id): id is string => !!id),
  );

  const rows = await db
    .select({ zone: coverageZones, partner: partners })
    .from(coverageZones)
    .innerJoin(partners, eq(partners.id, coverageZones.partnerId))
    .where(and(eq(coverageZones.isActive, true), eq(partners.status, "active")));

  const candidates: EligiblePartner[] = [];
  const seenPartnerIds = new Set<string>();

  for (const { zone, partner } of rows) {
    if (excludedPartnerIds.has(partner.id)) continue;
    // De-dupe: first matching zone per partner wins
    if (seenPartnerIds.has(partner.id)) continue;

    // Rule 3 — operating day
    if (!isEmptyArr(zone.operatingDays) && !zone.operatingDays!.includes(day)) {
      continue;
    }

    // Rule 4 — operating hours (bypassed if sameDayAvailable)
    if (!zone.sameDayAvailable) {
      const start = zone.operatingHoursStart || "00:00";
      const end = zone.operatingHoursEnd || "23:59";
      if (time < start || time > end) continue;
    }

    // Rule 5 — load size
    if (!isEmptyArr(zone.supportedLoadSizes) && !zone.supportedLoadSizes!.includes(loadSize)) {
      continue;
    }

    // Rule 6 — geographic match (postal FSA preferred, city fallback)
    let geoMatch = false;
    if (!isEmptyArr(zone.postalCodePrefixes)) {
      if (fsa && zone.postalCodePrefixes!.map(p => p.toUpperCase()).includes(fsa)) {
        geoMatch = true;
      }
    } else if (zone.city && address.includes(zone.city.toLowerCase())) {
      geoMatch = true;
    }
    if (!geoMatch) continue;

    // Rule 7 — team availability
    const availableTeam = await db
      .select({ id: partnerTeamMembers.id })
      .from(partnerTeamMembers)
      .where(and(
        eq(partnerTeamMembers.partnerId, partner.id),
        eq(partnerTeamMembers.isAvailable, true),
      ));
    if (availableTeam.length === 0) continue;

    candidates.push({ partner, matchedZone: zone, availableTeamCount: availableTeam.length });
    seenPartnerIds.add(partner.id);
  }

  candidates.sort((a, b) => {
    if (b.availableTeamCount !== a.availableTeamCount) {
      return b.availableTeamCount - a.availableTeamCount;
    }
    // Fair distribution — partner least recently updated wins the tiebreak
    const aT = a.partner.updatedAt ? new Date(a.partner.updatedAt).getTime() : 0;
    const bT = b.partner.updatedAt ? new Date(b.partner.updatedAt).getTime() : 0;
    return aT - bT;
  });

  return candidates;
}

// ---------------------------------------------------------------------------
// Auto-dispatch
// ---------------------------------------------------------------------------

/**
 * Route a booking to the first eligible partner. Mirrors the manual admin
 * routing endpoint exactly (enterprisePartnerId, enterpriseStatus='new',
 * routedToPartnerAt, status='confirmed') and also flags the booking as
 * auto-routed for the audit trail.
 *
 * If no partner qualifies, returns { dispatched: false }. When
 * options.allowFallbackToMover is set the booking is handed to the mover
 * pipeline first (see MoverFallbackStrategy for which path), and the outcome is
 * reported back on result.moverFallback. When options.notifyAdmin is set,
 * admins get an in-app alert describing that outcome.
 */
export async function autoDispatchToPartner(
  booking: Booking,
  options: AutoDispatchOptions = {},
): Promise<AutoDispatchResult> {
  try {
    if (booking.enterprisePartnerId) {
      // Already has a partner — nothing failed, so no mover fallback and no
      // admin alert. Dispatching here would double-book the job.
      return { dispatched: false, reason: "already_routed", moverFallback: "not_attempted" };
    }

    const eligible = await findEligiblePartners(booking);
    if (eligible.length === 0) {
      console.log(`[auto-dispatch] no eligible partners for booking ${booking.id}`);
      return await handlePartnerDispatchFailure(booking, options, "no_eligible_partners");
    }

    const { partner } = eligible[0];
    const now = new Date();
    const alreadyCompleted = booking.status === "completed";
    const initialEnterpriseStatus = alreadyCompleted ? "completed" : "new";
    const newBookingStatus = alreadyCompleted ? "completed" : "confirmed";

    const [updated] = await db
      .update(bookings)
      .set({
        enterprisePartnerId: partner.id,
        enterpriseStatus: initialEnterpriseStatus,
        routedToPartnerAt: now,
        status: newBookingStatus,
        autoRouted: true,
        autoRoutedAt: now,
        routingAttempts: sql`${bookings.routingAttempts} + 1`,
        updatedAt: now,
      })
      .where(eq(bookings.id, booking.id))
      .returning();

    await db.insert(bookingStatusEvents).values({
      bookingId: booking.id,
      partnerId: partner.id,
      fromStatus: null,
      toStatus: initialEnterpriseStatus,
      changedBy: null,
      notes: `Auto-routed to partner: ${partner.name}`,
      customerVisible: false,
    });

    try {
      await db.insert(partnerAuditLog).values({
        partnerId: partner.id,
        actorId: null,
        action: "booking.auto_routed",
        objectType: "booking",
        objectId: booking.id,
        notes: `Auto-dispatched (attempt ${updated.routingAttempts})`,
      });
    } catch (auditErr) {
      console.error("[auto-dispatch] audit log insert failed:", auditErr);
    }

    // Fire notifications (email + in-app) — non-blocking against the return.
    notifyPartnerOfRoutedBooking(partner, updated).catch((e) =>
      console.error("[auto-dispatch] notification failed:", e),
    );

    console.log(`[auto-dispatch] booking ${booking.id} → partner ${partner.id} (${partner.name})`);
    return { dispatched: true, partnerId: partner.id, partnerName: partner.name };
  } catch (err: any) {
    console.error("[auto-dispatch] error:", err);
    return await handlePartnerDispatchFailure(booking, options, "error", err?.message);
  }
}

/**
 * Shared tail for every "no partner took it" path: optionally hand the booking
 * to the mover pipeline, then optionally alert admins. Never throws — a failure
 * in the fallback must not turn into a failure of the caller (the Stripe
 * webhook in particular still has to return 200).
 */
async function handlePartnerDispatchFailure(
  booking: Booking,
  options: AutoDispatchOptions,
  reason: "no_eligible_partners" | "error",
  error?: string,
): Promise<AutoDispatchResult> {
  const moverFallback = options.allowFallbackToMover
    ? await runMoverFallback(booking, options.moverFallback ?? "victor")
    : "not_attempted";

  if (options.notifyAdmin) {
    await notifyAdminsOfDispatchFailure(booking, booking.routingAttempts ?? 0, moverFallback);
  }

  return { dispatched: false, reason, error, moverFallback };
}

async function runMoverFallback(
  booking: Booking,
  strategy: MoverFallbackStrategy,
): Promise<MoverFallbackOutcome> {
  try {
    if (strategy === "direct") {
      await dispatchBooking(booking as any);
      console.log(`[auto-dispatch] booking ${booking.id} → mover dispatch (direct)`);
      return "dispatched";
    }

    // Imported lazily: server/agents/victor pulls in the whole agent stack
    // (queue, SDK clients), and partner-dispatch is loaded on the request path.
    const { victor } = await import("./agents/victor");
    const result: any = await victor.run("dispatch", { bookingId: booking.id });
    if (result?.skipped) {
      console.log(`[auto-dispatch] victor skipped booking ${booking.id}: ${result.reason}`);
      return "skipped";
    }
    console.log(`[auto-dispatch] booking ${booking.id} → mover dispatch (victor)`);
    return "dispatched";
  } catch (err) {
    console.error("[auto-dispatch] mover fallback failed:", err);
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// Notifications — reuse existing pattern from partnerRoutes manual routing
// ---------------------------------------------------------------------------

async function notifyPartnerOfRoutedBooking(
  partner: typeof partners.$inferSelect,
  booking: Booking,
): Promise<void> {
  const baseUrl =
    process.env.BASE_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://app.lervit.com");
  const portalUrl = `${baseUrl}/partner/bookings/${booking.id}`;
  const notifiedEmails = new Set<string>();

  const puRows = await db
    .select({ userId: partnerUsers.userId })
    .from(partnerUsers)
    .where(
      and(
        eq(partnerUsers.partnerId, partner.id),
        eq(partnerUsers.isActive, true),
        inArray(partnerUsers.partnerRole, ["partner_admin", "partner_ops_manager", "partner_dispatcher"]),
      ),
    );

  if (puRows.length) {
    const userIds = puRows.map((r) => r.userId);
    const partnerAdminUsers = await db.select().from(users).where(inArray(users.id, userIds));

    for (const pu of partnerAdminUsers) {
      if (pu.email) {
        notifiedEmails.add(pu.email.toLowerCase());
        notificationService
          .sendPartnerBookingRouted({
            toEmail: pu.email,
            toName: pu.name || "Partner",
            partnerName: partner.name,
            booking,
            portalUrl,
          })
          .catch((e) => console.error("[auto-dispatch] portal-user email failed:", e));
      }

      // In-app notification (reuses inAppNotifications table pattern)
      try {
        await db.insert(inAppNotifications).values({
          userId: pu.id,
          type: "booking_routed",
          title: "New Job Assigned",
          message: `A new booking has been auto-routed to ${partner.name}. Review it in the partner portal.`,
          bookingId: booking.id,
          actionUrl: `/partner/bookings/${booking.id}`,
          isRead: false,
        });
      } catch (inAppErr) {
        console.error("[auto-dispatch] in-app notification failed:", inAppErr);
      }
    }
  }

  if (partner.primaryOpsEmail && !notifiedEmails.has(partner.primaryOpsEmail.toLowerCase())) {
    notifiedEmails.add(partner.primaryOpsEmail.toLowerCase());
    notificationService
      .sendPartnerBookingRouted({
        toEmail: partner.primaryOpsEmail,
        toName: partner.primaryOpsContact || "Ops Team",
        partnerName: partner.name,
        booking,
        portalUrl,
      })
      .catch((e) => console.error("[auto-dispatch] primary-ops email failed:", e));
  }

  if (partner.dispatchEmail && !notifiedEmails.has(partner.dispatchEmail.toLowerCase())) {
    notifiedEmails.add(partner.dispatchEmail.toLowerCase());
    notificationService
      .sendPartnerBookingRouted({
        toEmail: partner.dispatchEmail,
        toName: partner.dispatchContact || "Dispatch",
        partnerName: partner.name,
        booking,
        portalUrl,
      })
      .catch((e) => console.error("[auto-dispatch] dispatch email failed:", e));
  }
}

// ---------------------------------------------------------------------------
// Admin fallback alert (used by rejection re-route after N failures)
// ---------------------------------------------------------------------------

export async function notifyAdminsOfDispatchFailure(
  booking: Booking,
  attempts: number,
  moverFallback: MoverFallbackOutcome = "dispatched",
): Promise<void> {
  const outcomeText: Record<MoverFallbackOutcome, string> = {
    dispatched: "dispatched to movers",
    skipped: "NOT dispatched to movers (mover dispatch declined it) — needs manual routing",
    failed: "NOT dispatched to movers (mover dispatch errored) — needs manual routing",
    not_attempted: "not dispatched to movers — needs manual routing",
  };

  try {
    const admins = await db.select().from(users).where(eq(users.role, "admin"));
    for (const admin of admins) {
      await db.insert(inAppNotifications).values({
        userId: admin.id,
        type: "dispatch_fallback",
        title: "Partner auto-dispatch failed",
        message: `Booking #${booking.id.slice(0, 8)} could not be routed to any partner after ${attempts} attempts — ${outcomeText[moverFallback]}.`,
        bookingId: booking.id,
        actionUrl: `/admin/bookings/${booking.id}`,
        isRead: false,
      });
    }
  } catch (err) {
    console.error("[auto-dispatch] admin fallback notification failed:", err);
  }
}
