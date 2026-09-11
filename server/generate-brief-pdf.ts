import PDFDocument from "pdfkit";
import type { Response } from "express";

const BRAND_BLUE = "#1D4ED8";
const DARK = "#111827";
const MUTED = "#6B7280";
const RULE = "#E5E7EB";
const TABLE_HEADER_BG = "#F3F4F6";

function rule(doc: InstanceType<typeof PDFDocument>, y: number) {
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(0.5).strokeColor(RULE).stroke();
}

function sectionHeading(doc: InstanceType<typeof PDFDocument>, text: string) {
  doc.moveDown(0.6);
  doc
    .fontSize(11)
    .fillColor(BRAND_BLUE)
    .font("Helvetica-Bold")
    .text(text.toUpperCase(), { characterSpacing: 0.8 });
  rule(doc, doc.y + 3);
  doc.moveDown(0.4);
}

function bodyText(doc: InstanceType<typeof PDFDocument>, text: string) {
  doc.fontSize(9).fillColor(DARK).font("Helvetica").text(text, { lineGap: 2 });
}

function bullet(doc: InstanceType<typeof PDFDocument>, text: string) {
  const x = doc.x;
  doc
    .fontSize(9)
    .fillColor(DARK)
    .font("Helvetica")
    .text("•  " + text, x, doc.y, { lineGap: 2, indent: 0 });
}

function subHeading(doc: InstanceType<typeof PDFDocument>, text: string) {
  doc.moveDown(0.35);
  doc.fontSize(9).fillColor(DARK).font("Helvetica-Bold").text(text);
  doc.moveDown(0.1);
}

function table(
  doc: InstanceType<typeof PDFDocument>,
  headers: string[],
  rows: string[][],
  colWidths: number[]
) {
  const startX = 50;
  const rowH = 18;
  const fontSize = 8.5;

  // Header row
  let x = startX;
  doc.rect(startX, doc.y, colWidths.reduce((a, b) => a + b, 0), rowH).fill(TABLE_HEADER_BG);
  headers.forEach((h, i) => {
    doc
      .fontSize(fontSize)
      .fillColor(DARK)
      .font("Helvetica-Bold")
      .text(h, x + 6, doc.y - rowH + 5, { width: colWidths[i] - 10, lineBreak: false });
    x += colWidths[i];
  });
  doc.moveDown(0.15);

  // Data rows
  rows.forEach((row, ri) => {
    const rowY = doc.y;
    if (ri % 2 === 1) {
      doc.rect(startX, rowY, colWidths.reduce((a, b) => a + b, 0), rowH).fill("#FAFAFA");
    }
    x = startX;
    row.forEach((cell, i) => {
      doc
        .fontSize(fontSize)
        .fillColor(i === 0 ? MUTED : DARK)
        .font(i === 0 ? "Helvetica-Bold" : "Helvetica")
        .text(cell, x + 6, rowY + 4, { width: colWidths[i] - 10, lineBreak: false });
      x += colWidths[i];
    });
    // row border
    doc.moveTo(startX, rowY + rowH).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), rowY + rowH).lineWidth(0.3).strokeColor(RULE).stroke();
    doc.y = rowY + rowH + 1;
  });
  doc.moveDown(0.5);
}

export function generateTechnicalBriefPdf(res: Response) {
  const doc = new PDFDocument({ margin: 50, size: "A4", compress: true });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="LervIT-Technical-Brief.pdf"');
  doc.pipe(res);

  // ── Cover Header ──────────────────────────────────────────────
  doc
    .rect(0, 0, doc.page.width, 90)
    .fill(BRAND_BLUE);

  doc
    .fontSize(24)
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .text("LervIT", 50, 22, { lineBreak: false });

  doc
    .fontSize(10)
    .fillColor("rgba(255,255,255,0.75)")
    .font("Helvetica")
    .text("Smart Moving Platform", 50, 52);

  doc
    .fontSize(8)
    .fillColor("rgba(255,255,255,0.6)")
    .text("Technical Brief  ·  Version 1.0  ·  May 2026  ·  Confidential", 50, 68);

  doc.y = 110;

  // ── What Is LervIT ───────────────────────────────────────────
  sectionHeading(doc, "What Is LervIT?");
  bodyText(
    doc,
    "LervIT is a mobile-first, two-sided moving marketplace operating in Calgary, Alberta. It connects " +
    "customers who need to move with vetted freelance movers and enterprise fulfillment partners — " +
    "matching them by proximity, price, vehicle type, and availability in real time. The platform is " +
    "designed to scale from individual gig-economy movers to white-label enterprise dispatch contracts."
  );

  // ── Platform Architecture ─────────────────────────────────────
  sectionHeading(doc, "Platform Architecture");
  table(
    doc,
    ["Layer", "Technology"],
    [
      ["Frontend", "React 18, TypeScript, Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui"],
      ["Backend", "Express.js (Node.js, TypeScript, ESM), Zod validation, Pino structured logging"],
      ["Database", "PostgreSQL via Neon (serverless), Drizzle ORM, shared TypeScript schema"],
      ["Payments", "Stripe + Stripe Connect (customer charges, mover escrow payouts, webhook verification)"],
      ["AI", "OpenAI GPT-4o (Vision Engine, Auto-Quote, Support Copilot, Audit Copilot)"],
      ["Realtime", "WebSocket server (mover notifications, token auth, audio alerts)"],
      ["Comms", "Resend (email), Telnyx (SMS + OTP)"],
      ["Maps", "Google Maps Distance Matrix API (proximity matching, ETA, driving distance)"],
      ["Storage", "Object Storage (driver photos, vehicle photos, compliance docs, proof of completion)"],
      ["Observability", "Pino JSON logs, analytics event table, Operations Intelligence dashboard"],
      ["Background Jobs", "node-cron (booking expiry, notification cleanup, abandoned booking reminders)"],
    ],
    [120, 380]
  );

  // ── Core Features ─────────────────────────────────────────────
  sectionHeading(doc, "Core Features");

  subHeading(doc, "Customer Side");
  [
    "Multi-step booking flow with mandatory load photo upload and AI load estimation",
    "Uber-style proximity matching — top 5 movers ranked by driving distance (15–50 km radius)",
    "Real-time GPS tracking with live ETA and 6-stage move progress indicators",
    "Saved payment cards, promo codes (LERVIT10, 10% off first Move), and Stripe-secured checkout",
    "Abandoned booking recovery with automated email/SMS reminders (up to 3 per booking)",
  ].forEach((b) => bullet(doc, b));

  subHeading(doc, "Mover Side");
  [
    "Job notification system with 10-minute acceptance window and audio alerts",
    "Stripe Connect onboarding with automated progressive reminders (24 h, 3 days, 7 days)",
    "Earnings dashboard, payout history, and 7-type driver verification with admin review",
    "Live GPS sharing (30-second updates, Live badge visible to customers within 1 hour)",
    "Vehicle classification and smart load-matching (car → pickup → van → truck)",
  ].forEach((b) => bullet(doc, b));

  subHeading(doc, "Admin Portal");
  [
    "Growth dashboard: bookings, revenue, conversion rate, fulfilment hours, 7-day trend chart",
    "Operations Intelligence: booking funnel, live ops, mover performance leaderboard, revenue cohorts (auto-refresh 30 s)",
    "Visitor analytics: page views, session tracking, booking funnel from client events",
    "AI Support Copilot: GPT-4o ticket analysis with priority classification, root cause, and dual-output responses",
    "Single-session enforcement for admin accounts",
  ].forEach((b) => bullet(doc, b));

  // ── Enterprise Partner Portal ─────────────────────────────────
  sectionHeading(doc, "Enterprise Partner Portal (MoveDeck v1)");
  bodyText(doc, "A fully isolated portal at /partner/* for enterprise fulfillment companies (pilot: OOMovers Inc.).");
  doc.moveDown(0.3);
  [
    "Role-based access: partner_admin, partner_dispatcher, partner_ops_manager, partner_viewer",
    "Full booking lifecycle management: accept, reject, assign to driver/crew, status transitions",
    "Compliance document upload and review workflow (insurance, cargo liability, registration, etc.)",
    "Incident reporting and resolution tracking",
    "Team and driver CRUD with vehicle details, photos, and internal notes",
    "AI Audit Copilot: on-demand GPT-4o analysis per audit entry with insight, recommendation, and risk flag",
    "Partner-scoped audit log with CSV export and direct admin messaging",
  ].forEach((b) => bullet(doc, b));

  // ── AI Capabilities ───────────────────────────────────────────
  sectionHeading(doc, "AI Capabilities");
  table(
    doc,
    ["Feature", "Model", "Status"],
    [
      ["Vision Engine 2.0 — furniture ID from photos", "GPT-4o Vision", "Active"],
      ["Auto-Quote Predictor — instant price estimate with confidence", "GPT-4o", "Active"],
      ["Support Copilot — ticket analysis, priority, dual response", "GPT-4o", "Active"],
      ["Audit Copilot — per-entry operational insight + risk flag", "GPT-4o", "Active"],
      ["Price Breakdown Explainer", "GPT-4o", "Feature-flagged off"],
    ],
    [270, 100, 100]
  );

  // ── Security & Reliability ────────────────────────────────────
  sectionHeading(doc, "Security & Reliability");
  [
    "Stripe webhook signature verification and idempotency checks on all payment events",
    "Circuit breaker pattern on all external API calls",
    "Neon pool error listener — FATAL/transient DB errors log a warning and recover without a server restart",
    "uncaughtException handler distinguishes transient infrastructure errors from fatal application errors",
    "Session-based auth with connect-pg-simple, IP-scoped partner data access, production seed endpoint blocked",
    "All partner routes are scoped to the authenticated partner — cross-tenant data access is not possible",
  ].forEach((b) => bullet(doc, b));

  // ── Key Numbers ───────────────────────────────────────────────
  sectionHeading(doc, "Key Numbers (Production — May 2026)");
  table(
    doc,
    ["Metric", "Value"],
    [
      ["Registered users", "71"],
      ["Total bookings", "37"],
      ["Completed moves", "16"],
      ["Analytics events tracked", "913"],
      ["Enterprise partners onboarded", "1 (OOMovers pilot)"],
    ],
    [280, 220]
  );

  // ── Footer note ───────────────────────────────────────────────
  doc.moveDown(0.5);
  doc
    .fontSize(8)
    .fillColor(MUTED)
    .font("Helvetica-Oblique")
    .text(
      "LervIT is built and maintained as a monorepo. Frontend, backend, and shared types are fully TypeScript end-to-end. " +
      "Contact the engineering team for API documentation or integration enquiries.",
      { align: "center" }
    );

  // page footer
  const pageBottom = doc.page.height - 30;
  rule(doc, pageBottom - 10);
  doc
    .fontSize(7.5)
    .fillColor(MUTED)
    .font("Helvetica")
    .text("© 2026 LervIT Inc. · Confidential", 50, pageBottom - 5, { align: "left" })
    .text("lervit.com", 0, pageBottom - 5, { align: "right" });

  doc.end();
}
