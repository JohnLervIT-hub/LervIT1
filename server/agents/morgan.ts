/**
 * Morgan Price — ORACLE Price Intelligence Agent
 *
 * Primary functions:
 *  1. Dynamic pricing engine — real-time price adjustments based on demand,
 *     time of day, distance, load complexity, and mover availability
 *  2. Competitor price monitoring — track Calgary moving market rates
 *  3. Quote accuracy analysis — compare AI estimates to actual completed prices
 *  4. Revenue optimization — identify margin opportunities and conversion leakage
 *  5. Price intelligence reports — daily/weekly briefings for admin
 *
 * Event subscriptions:
 *  - booking.created      → run accuracy check against AI estimate
 *  - booking.completed    → post-move price accuracy analysis
 *  - morgan.price_check   → on-demand price check for any booking
 *  - morgan.daily_report  → cron-triggered daily price intelligence report
 */

import OpenAI from "openai";
import { db } from "../db";
import { bookings, movers, reviews } from "@shared/schema";
import { eq, and, gte, lte, desc, avg, count, sql } from "drizzle-orm";
import { agentEventBus } from "../lib/agentEventBus";
import { emitEvent } from "../events";
import { logger } from "../logger";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriceAuditResult {
  bookingId: string;
  aiEstimate: number;
  finalPrice: number;
  variancePct: number;
  loadSize: string;
  distance: number;
  flags: string[];
}

interface MarketRate {
  loadSize: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  sampleSize: number;
  period: "7d" | "30d";
}

interface DemandSignal {
  hour: number;
  dayOfWeek: number;
  bookingVelocity: number; // bookings in last 2h
  availableMovers: number;
  demandScore: number; // 0-100
}

interface PriceRecommendation {
  loadSize: string;
  currentBaseFee: number;
  recommendedBaseFee: number;
  reason: string;
  confidence: "low" | "medium" | "high";
}

// ---------------------------------------------------------------------------
// Calgary market baseline rates (competitor intelligence seed)
// These are updated via the competitor monitoring sweep
// ---------------------------------------------------------------------------

const MARKET_BASELINES: Record<string, { min: number; max: number; median: number }> = {
  studio: { min: 159, max: 249, median: 199 },
  "1-bedroom": { min: 199, max: 329, median: 249 },
  "2-bedroom": { min: 279, max: 449, median: 349 },
  "3-bedroom": { min: 349, max: 599, median: 449 },
  "4-bedroom": { min: 449, max: 799, median: 599 },
  "office-small": { min: 299, max: 499, median: 379 },
  "office-large": { min: 499, max: 999, median: 699 },
};

// ---------------------------------------------------------------------------
// Demand scoring
// ---------------------------------------------------------------------------

async function computeDemandSignal(): Promise<DemandSignal> {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const [recentBookings, availableMovers] = await Promise.all([
    db
      .select({ count: count() })
      .from(bookings)
      .where(gte(bookings.createdAt, twoHoursAgo)),
    db
      .select({ count: count() })
      .from(movers)
      .where(and(eq(movers.isVerified, true), eq(movers.isAvailable, true))),
  ]);

  const velocity = Number(recentBookings[0]?.count ?? 0);
  const available = Number(availableMovers[0]?.count ?? 1);
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

  // Demand scoring heuristic (0-100)
  let score = 50;

  // Time-of-day modifier
  if (hour >= 8 && hour <= 11) score += 15; // morning peak
  else if (hour >= 14 && hour <= 17) score += 10; // afternoon
  else if (hour < 7 || hour > 20) score -= 20; // off-hours

  // Weekend modifier
  if (dayOfWeek === 0 || dayOfWeek === 6) score += 15;
  // Friday modifier
  else if (dayOfWeek === 5) score += 8;

  // Supply-demand ratio
  const ratio = velocity / Math.max(available, 1);
  if (ratio > 1.5) score += 20; // high demand vs supply
  else if (ratio > 0.8) score += 10;
  else if (ratio < 0.2) score -= 15; // very low demand

  score = Math.max(0, Math.min(100, score));

  return {
    hour,
    dayOfWeek,
    bookingVelocity: velocity,
    availableMovers: available,
    demandScore: score,
  };
}

// ---------------------------------------------------------------------------
// Quote accuracy analysis
// ---------------------------------------------------------------------------

async function analyzeQuoteAccuracy(bookingId: string): Promise<PriceAuditResult | null> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return null;

  const aiEstimate = Number(booking.aiEstimate ?? 0);
  const finalPrice = Number(booking.price ?? 0);

  if (aiEstimate <= 0 || finalPrice <= 0) return null;

  const variancePct = ((finalPrice - aiEstimate) / aiEstimate) * 100;
  const flags: string[] = [];

  if (Math.abs(variancePct) > 30) flags.push(`HIGH_VARIANCE_${variancePct > 0 ? "OVER" : "UNDER"}`);
  if (variancePct > 50) flags.push("AI_SEVERELY_UNDERQUOTED");
  if (variancePct < -30) flags.push("AI_OVERQUOTED");
  if (Number(booking.distance) > 30 && variancePct > 20) flags.push("DISTANCE_UNDERPRICED");
  if (booking.heavyItem && variancePct > 15) flags.push("HEAVY_ITEM_UNDERWEIGHTED");

  return {
    bookingId,
    aiEstimate,
    finalPrice,
    variancePct: Math.round(variancePct * 10) / 10,
    loadSize: booking.loadSize,
    distance: Number(booking.distance),
    flags,
  };
}

// ---------------------------------------------------------------------------
// Market rate analysis from completed bookings
// ---------------------------------------------------------------------------

async function computeMarketRates(period: "7d" | "30d"): Promise<MarketRate[]> {
  const daysBack = period === "7d" ? 7 : 30;
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      loadSize: bookings.loadSize,
      avgPrice: avg(bookings.price),
      minPrice: sql<number>`MIN(${bookings.price})`,
      maxPrice: sql<number>`MAX(${bookings.price})`,
      sampleSize: count(),
    })
    .from(bookings)
    .where(
      and(
        gte(bookings.createdAt, since),
        eq(bookings.status, "completed"),
        eq(bookings.paymentStatus, "paid")
      )
    )
    .groupBy(bookings.loadSize);

  return rows.map((r) => ({
    loadSize: r.loadSize,
    avgPrice: Math.round(Number(r.avgPrice ?? 0) * 100) / 100,
    minPrice: Math.round(Number(r.minPrice ?? 0) * 100) / 100,
    maxPrice: Math.round(Number(r.maxPrice ?? 0) * 100) / 100,
    sampleSize: Number(r.sampleSize),
    period,
  }));
}

// ---------------------------------------------------------------------------
// Price recommendations
// ---------------------------------------------------------------------------

async function generatePriceRecommendations(
  rates: MarketRate[],
  demand: DemandSignal
): Promise<PriceRecommendation[]> {
  const recommendations: PriceRecommendation[] = [];

  for (const rate of rates) {
    if (rate.sampleSize < 3) continue; // need at least 3 samples

    const baseline = MARKET_BASELINES[rate.loadSize];
    if (!baseline) continue;

    const lervitAvg = rate.avgPrice;
    const marketMedian = baseline.median;
    const demandMultiplier = demand.demandScore > 75 ? 1.1 : demand.demandScore > 50 ? 1.0 : 0.95;

    const recommendedBase = Math.round(marketMedian * demandMultiplier / 10) * 10;
    const currentBase = lervitAvg;
    const diffPct = ((recommendedBase - currentBase) / currentBase) * 100;

    if (Math.abs(diffPct) < 5) continue; // no material change needed

    let reason = "";
    let confidence: "low" | "medium" | "high" = "medium";

    if (diffPct > 10) {
      reason = `LervIT is underpricing vs market by ${Math.round(diffPct)}% for ${rate.loadSize}. Demand score ${demand.demandScore}/100 supports a price lift.`;
      confidence = rate.sampleSize > 10 ? "high" : "medium";
    } else if (diffPct < -10) {
      reason = `LervIT may be overpricing vs market for ${rate.loadSize} (${Math.abs(Math.round(diffPct))}% above median). Monitor conversion rate.`;
      confidence = rate.sampleSize > 10 ? "medium" : "low";
    } else {
      reason = `Minor adjustment for ${rate.loadSize} — align closer to Calgary market median ($${marketMedian}).`;
      confidence = "low";
    }

    recommendations.push({
      loadSize: rate.loadSize,
      currentBaseFee: Math.round(currentBase),
      recommendedBaseFee: recommendedBase,
      reason,
      confidence,
    });
  }

  return recommendations;
}

// ---------------------------------------------------------------------------
// Conversion leak analysis
// ---------------------------------------------------------------------------

async function analyzeConversionLeaks(): Promise<string[]> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [total, abandoned, noMover] = await Promise.all([
    db.select({ count: count() }).from(bookings).where(gte(bookings.createdAt, since7d)),
    db
      .select({ count: count() })
      .from(bookings)
      .where(and(gte(bookings.createdAt, since7d), eq(bookings.status, "expired"))),
    db
      .select({ count: count() })
      .from(bookings)
      .where(
        and(
          gte(bookings.createdAt, since7d),
          eq(bookings.status, "expired"),
          sql`${bookings.moverId} IS NULL`
        )
      ),
  ]);

  const totalCount = Number(total[0]?.count ?? 0);
  const abandonedCount = Number(abandoned[0]?.count ?? 0);
  const noMoverCount = Number(noMover[0]?.count ?? 0);
  const insights: string[] = [];

  if (totalCount > 0) {
    const abandonRate = (abandonedCount / totalCount) * 100;
    if (abandonRate > 20) {
      insights.push(`⚠️ Abandonment rate is ${Math.round(abandonRate)}% (${abandonedCount}/${totalCount} bookings in 7d) — above 20% target`);
    }
    if (noMoverCount > abandonedCount * 0.5) {
      insights.push(`🚚 ${noMoverCount} bookings expired with no mover assigned — supply gap may be causing price-sensitive customers to leave`);
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// AI-powered price intelligence synthesis
// ---------------------------------------------------------------------------

async function synthesizePriceIntelligence(
  rates: MarketRate[],
  recommendations: PriceRecommendation[],
  auditFlags: string[],
  leaks: string[],
  demand: DemandSignal
): Promise<string> {
  const prompt = `You are Morgan Price, LervIT's price intelligence agent. Synthesize this data into a sharp, actionable intelligence brief for the LervIT CEO.

DEMAND SIGNAL (right now):
- Demand score: ${demand.demandScore}/100
- Bookings in last 2h: ${demand.bookingVelocity}
- Available movers: ${demand.availableMovers}
- Time: ${demand.hour}:00, day ${demand.dayOfWeek} (0=Sun)

MARKET RATES (7-day internal data):
${rates.map(r => `- ${r.loadSize}: avg $${r.avgPrice} (n=${r.sampleSize}, range $${r.minPrice}–$${r.maxPrice})`).join("\n")}

PRICE RECOMMENDATIONS:
${recommendations.length > 0 ? recommendations.map(r => `- ${r.loadSize}: $${r.currentBaseFee} → $${r.recommendedBaseFee} (${r.confidence} confidence)\n  ${r.reason}`).join("\n") : "- No material price changes recommended at this time"}

QUOTE ACCURACY FLAGS (recent):
${auditFlags.length > 0 ? auditFlags.map(f => `- ${f}`).join("\n") : "- No accuracy issues detected"}

CONVERSION LEAKS:
${leaks.length > 0 ? leaks.join("\n") : "- No significant conversion leaks detected"}

Write a concise intelligence brief (4-6 bullet points max). Lead with the most important insight. Be direct — this is for a CEO who wants action, not analysis paralysis. End with one recommended action for today.`;

  if (!openai) {
    logger.warn({ agent: "morgan" }, "Morgan: OPENAI_API_KEY unset — skipping AI brief");
    return "AI brief unavailable (OPENAI_API_KEY not configured).";
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 600,
  });

  return response.choices[0].message.content ?? "No intelligence generated.";
}

// ---------------------------------------------------------------------------
// Daily price intelligence report
// ---------------------------------------------------------------------------

async function runDailyReport(): Promise<void> {
  logger.info({ agent: "morgan", action: "daily_report_start" }, "Morgan: starting daily price intelligence report");

  try {
    const [rates7d, rates30d, demand] = await Promise.all([
      computeMarketRates("7d"),
      computeMarketRates("30d"),
      computeDemandSignal(),
    ]);

    const recommendations = await generatePriceRecommendations(rates7d, demand);
    const leaks = await analyzeConversionLeaks();

    // Gather recent audit flags from completed bookings
    const recentCompleted = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, "completed"),
          gte(bookings.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        )
      )
      .limit(20)
      .orderBy(desc(bookings.createdAt));

    const audits = await Promise.all(
      recentCompleted.map((b) => analyzeQuoteAccuracy(b.id))
    );
    const validAudits = audits.filter((a): a is PriceAuditResult => a !== null);
    const allFlags = Array.from(new Set(validAudits.flatMap((a) => a.flags)));

    const brief = await synthesizePriceIntelligence(rates7d, recommendations, allFlags, leaks, demand);

    // Compile full report
    const reportLines = [
      "# 📊 Morgan Price — Daily Intelligence Brief",
      `*Generated ${new Date().toLocaleString("en-CA", { timeZone: "America/Edmonton" })} MT*`,
      "",
      brief,
      "",
      "---",
      "## 7-Day Market Rates (LervIT completed bookings)",
      ...rates7d.map(
        (r) =>
          `- **${r.loadSize}**: avg **$${r.avgPrice}** | range $${r.minPrice}–$${r.maxPrice} | n=${r.sampleSize}`
      ),
      "",
      "## 30-Day Baseline",
      ...rates30d.map(
        (r) =>
          `- **${r.loadSize}**: avg **$${r.avgPrice}** | n=${r.sampleSize}`
      ),
      "",
      recommendations.length > 0
        ? [
            "## Price Recommendations",
            ...recommendations.map(
              (r) =>
                `- **${r.loadSize}**: $${r.currentBaseFee} → $${r.recommendedBaseFee} *(${r.confidence})*\n  ${r.reason}`
            ),
          ].join("\n")
        : "## Price Recommendations\nNo material changes recommended.",
      "",
      allFlags.length > 0
        ? `## Quote Accuracy Issues\n${Array.from(new Set(allFlags)).map((f) => `- \`${f}\``).join("\n")}`
        : "## Quote Accuracy\n✅ No accuracy flags in last 7 days",
    ];

    const reportText = reportLines.join("\n");

    // Emit to event bus for admin notification
    await agentEventBus.emit(
      "morgan.report_ready",
      {
        report: reportText,
        recommendations,
        demandScore: demand.demandScore,
        flagCount: allFlags.length,
      },
      "Morgan Price",
    );

    // Log to business events
    await emitEvent(
      "morgan.daily_report_complete",
      "agent",
      null,
      {
        demandScore: demand.demandScore,
        recommendationCount: recommendations.length,
        flagCount: allFlags.length,
        leakCount: leaks.length,
      },
      "agent",
    );

    logger.info(
      { agent: "morgan", demandScore: demand.demandScore, recommendations: recommendations.length },
      "Morgan: daily report complete"
    );
  } catch (err) {
    logger.error({ agent: "morgan", err }, "Morgan: daily report failed");
  }
}

// ---------------------------------------------------------------------------
// On-demand price check (triggered by morgan.price_check event)
// ---------------------------------------------------------------------------

async function handlePriceCheck(bookingId: string): Promise<void> {
  try {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      logger.warn({ agent: "morgan", bookingId }, "Morgan: booking not found for price check");
      return;
    }

    const demand = await computeDemandSignal();
    const aiEstimate = Number(booking.aiEstimate ?? 0);
    const currentPrice = Number(booking.price ?? 0);
    const market = MARKET_BASELINES[booking.loadSize];

    const signals: string[] = [];

    if (demand.demandScore > 75) signals.push(`High demand (score ${demand.demandScore}) — price can hold or increase`);
    if (demand.availableMovers < 3) signals.push(`Only ${demand.availableMovers} movers available — supply constraint`);
    if (market && currentPrice < market.min) signals.push(`Price $${currentPrice} is below Calgary market floor $${market.min}`);
    if (market && currentPrice > market.max) signals.push(`Price $${currentPrice} is above Calgary market ceiling $${market.max}`);
    if (aiEstimate > 0 && Math.abs((currentPrice - aiEstimate) / aiEstimate) > 0.25) {
      signals.push(`AI estimate $${aiEstimate} diverges from final price $${currentPrice} by ${Math.round(((currentPrice - aiEstimate) / aiEstimate) * 100)}%`);
    }

    await emitEvent(
      "morgan.price_check_complete",
      "booking",
      bookingId,
      {
        currentPrice,
        aiEstimate,
        demandScore: demand.demandScore,
        signals,
        marketFloor: market?.min,
        marketCeiling: market?.max,
      },
      "agent",
    );

    logger.info({ agent: "morgan", bookingId, signals }, "Morgan: price check complete");
  } catch (err) {
    logger.error({ agent: "morgan", bookingId, err }, "Morgan: price check failed");
  }
}

// ---------------------------------------------------------------------------
// Booking completion — post-move accuracy analysis
// ---------------------------------------------------------------------------

async function handleBookingCompleted(bookingId: string): Promise<void> {
  try {
    const result = await analyzeQuoteAccuracy(bookingId);
    if (!result) return;

    if (result.flags.length > 0) {
      logger.warn(
        { agent: "morgan", bookingId, flags: result.flags, variancePct: result.variancePct },
        `Morgan: quote accuracy flags on booking ${bookingId}`
      );

      await emitEvent(
        "morgan.quote_accuracy_flag",
        "booking",
        bookingId,
        {
          aiEstimate: result.aiEstimate,
          finalPrice: result.finalPrice,
          variancePct: result.variancePct,
          flags: result.flags,
          loadSize: result.loadSize,
        },
        "agent",
      );
    }
  } catch (err) {
    logger.error({ agent: "morgan", bookingId, err }, "Morgan: booking.completed handler failed");
  }
}

// ---------------------------------------------------------------------------
// Register subscriptions
// ---------------------------------------------------------------------------

export function registerMorganSubscriptions(): void {
  // Booking completed → post-move accuracy analysis
  agentEventBus.subscribe(
    "booking.completed",
    async (payload: { bookingId: string }) => {
      await handleBookingCompleted(payload.bookingId);
    },
    "Morgan Price",
  );

  // On-demand price check
  agentEventBus.subscribe(
    "morgan.price_check",
    async (payload: { bookingId: string }) => {
      await handlePriceCheck(payload.bookingId);
    },
    "Morgan Price",
  );

  // Daily report trigger (fired from the 6am MT cron in server/index.ts)
  agentEventBus.subscribe(
    "morgan.daily_report",
    async () => {
      await runDailyReport();
    },
    "Morgan Price",
  );

  logger.info({ agent: "morgan" }, "[EventBus] Morgan Price subscribed to booking.completed, morgan.price_check, morgan.daily_report");
}

// ---------------------------------------------------------------------------
// Public API for admin routes and other agents
// ---------------------------------------------------------------------------

export const morganAgent = {
  runDailyReport,
  handlePriceCheck,
  computeDemandSignal,
  computeMarketRates,
  analyzeQuoteAccuracy,
  MARKET_BASELINES,
};
