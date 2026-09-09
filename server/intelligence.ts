/**
 * Intelligence summary builder.
 *
 * Shared between the admin HTTP endpoint (`GET /api/admin/intelligence/summary`)
 * and the APEX agent's daily brief. Same-process callers should invoke
 * `buildIntelligenceSummary()` directly rather than round-tripping through
 * HTTP with a session cookie.
 */

import { db } from './db';
import { kpiTargets } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { logger } from './logger';

export interface IntelligenceSummary {
  generatedAt: string;
  revenue: {
    today: number;
    week: number;
    month: number;
    vs_target: {
      target: number;
      actual: number;
      deltaAbsolute: number;
      deltaPct: number | null;
    } | null;
  };
  bookings: {
    active: number;
    completed_today: number;
    pending: number;
  };
  movers: {
    online: number;
    available: number;
    inactive_7d: number;
  };
  pipeline: {
    new_leads: number;
    conversions_today: number;
  };
  alerts: {
    sla_breaches: number;
    stuck_jobs: number;
    incidents: number;
  };
  kpi_deltas: {
    vs_yesterday: {
      revenue: number;
      completedMoves: number;
    };
    vs_last_week: {
      revenue: number;
    };
  };
  targets: Record<string, number>;
}

export async function buildIntelligenceSummary(): Promise<IntelligenceSummary> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastWeek = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
  const paidStates = ['paid', 'succeeded'];

  let revenueRow: { today: string; week: string; month: string } | undefined;
  try {
    const result = await db.execute(sql`
      SELECT
        COALESCE(SUM(price::numeric) FILTER (WHERE created_at >= ${startOfToday}), 0) AS today,
        COALESCE(SUM(price::numeric) FILTER (WHERE created_at >= ${startOfWeek}),  0) AS week,
        COALESCE(SUM(price::numeric) FILTER (WHERE created_at >= ${startOfMonth}), 0) AS month
      FROM bookings
      WHERE status = 'completed'
        AND payment_status IN (${sql.join(paidStates.map(s => sql`${s}`), sql`, `)})
    `);
    revenueRow = (result as any).rows?.[0];
  } catch (err) {
    logger.error({ err }, 'intelligence: revenue query failed');
    throw err;
  }

  let bookingCounts: { active: number; completed_today: number; pending_payment: number } | undefined;
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending','confirmed','in_progress'))::int AS active,
        COUNT(*) FILTER (WHERE status = 'completed' AND updated_at >= ${startOfToday})::int AS completed_today,
        COUNT(*) FILTER (WHERE status = 'pending_payment')::int AS pending_payment
      FROM bookings
    `);
    bookingCounts = (result as any).rows?.[0];
  } catch (err) {
    logger.error({ err }, 'intelligence: bookingCounts query failed');
    throw err;
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  let moverCounts: { online: number; available: number; inactive_7d: number } | undefined;
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE last_location_update >= ${oneHourAgo})::int AS online,
        COUNT(*) FILTER (WHERE is_available = true)::int AS available,
        COUNT(*) FILTER (WHERE (last_location_update IS NULL OR last_location_update < ${sevenDaysAgo}) AND is_verified = true)::int AS inactive_7d
      FROM movers
    `);
    moverCounts = (result as any).rows?.[0];
  } catch (err) {
    logger.error({ err }, 'intelligence: moverCounts query failed');
    throw err;
  }

  let pipelineCounts: { new_leads: number; conversions_today: number } | undefined;
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'new')::int AS new_leads,
        COUNT(*) FILTER (WHERE status = 'converted' AND updated_at >= ${startOfToday})::int AS conversions_today
      FROM leads
    `);
    pipelineCounts = (result as any).rows?.[0];
  } catch (err) {
    logger.error({ err }, 'intelligence: pipeline query failed');
    throw err;
  }

  let alertCounts: { sla_breaches: number; stuck_jobs: number } | undefined;
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sla_deadline_at IS NOT NULL AND sla_deadline_at < now() AND status IN ('confirmed','in_progress'))::int AS sla_breaches,
        COUNT(*) FILTER (WHERE status = 'in_progress' AND updated_at < ${new Date(now.getTime() - 4 * 60 * 60 * 1000)})::int AS stuck_jobs
      FROM bookings
    `);
    alertCounts = (result as any).rows?.[0];
  } catch (err) {
    logger.error({ err }, 'intelligence: alertCounts query failed');
    throw err;
  }

  let incidentRow: { open_incidents: number } | undefined;
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS open_incidents
      FROM partner_incidents
      WHERE status IN ('open','under_review','escalated')
    `);
    incidentRow = (result as any).rows?.[0];
  } catch (err) {
    logger.error({ err }, 'intelligence: partner_incidents query failed');
    throw err;
  }

  let ydayRow: { revenue: string; completed: number } | undefined;
  try {
    const result = await db.execute(sql`
      SELECT
        COALESCE(SUM(price::numeric), 0) AS revenue,
        COUNT(*)::int AS completed
      FROM bookings
      WHERE status = 'completed'
        AND payment_status IN (${sql.join(paidStates.map(s => sql`${s}`), sql`, `)})
        AND created_at >= ${startOfYesterday}
        AND created_at <  ${startOfToday}
    `);
    ydayRow = (result as any).rows?.[0];
  } catch (err) {
    logger.error({ err }, 'intelligence: yesterday revenue query failed');
    throw err;
  }

  let dayBeforeRow: { revenue: string; completed: number } | undefined;
  try {
    const result = await db.execute(sql`
      SELECT
        COALESCE(SUM(price::numeric), 0) AS revenue,
        COUNT(*)::int AS completed
      FROM bookings
      WHERE status = 'completed'
        AND payment_status IN (${sql.join(paidStates.map(s => sql`${s}`), sql`, `)})
        AND created_at >= ${new Date(startOfYesterday.getTime() - 24 * 60 * 60 * 1000)}
        AND created_at <  ${startOfYesterday}
    `);
    dayBeforeRow = (result as any).rows?.[0];
  } catch (err) {
    logger.error({ err }, 'intelligence: day-before revenue query failed');
    throw err;
  }

  let lastWeekRow: { revenue: string } | undefined;
  try {
    const result = await db.execute(sql`
      SELECT COALESCE(SUM(price::numeric), 0) AS revenue
      FROM bookings
      WHERE status = 'completed'
        AND payment_status IN (${sql.join(paidStates.map(s => sql`${s}`), sql`, `)})
        AND created_at >= ${startOfLastWeek}
        AND created_at <  ${startOfWeek}
    `);
    lastWeekRow = (result as any).rows?.[0];
  } catch (err) {
    logger.error({ err }, 'intelligence: last-week revenue query failed');
    throw err;
  }

  let targetRows: Array<typeof kpiTargets.$inferSelect>;
  try {
    targetRows = await db.select().from(kpiTargets);
  } catch (err) {
    logger.error({ err }, 'intelligence: kpi_targets select failed');
    throw err;
  }
  const targetMap: Record<string, number> = {};
  for (const t of targetRows) targetMap[t.metricName] = Number(t.targetValue);

  const monthRevenue = Number(revenueRow?.month ?? 0);
  const monthlyTarget = targetMap.monthly_revenue ?? null;

  return {
    generatedAt: now.toISOString(),
    revenue: {
      today: Number(revenueRow?.today ?? 0),
      week: Number(revenueRow?.week ?? 0),
      month: monthRevenue,
      vs_target: monthlyTarget !== null
        ? {
            target: monthlyTarget,
            actual: monthRevenue,
            deltaAbsolute: monthRevenue - monthlyTarget,
            deltaPct: monthlyTarget > 0
              ? Math.round(((monthRevenue - monthlyTarget) / monthlyTarget) * 10000) / 100
              : null,
          }
        : null,
    },
    bookings: {
      active: bookingCounts?.active ?? 0,
      completed_today: bookingCounts?.completed_today ?? 0,
      pending: bookingCounts?.pending_payment ?? 0,
    },
    movers: {
      online: moverCounts?.online ?? 0,
      available: moverCounts?.available ?? 0,
      inactive_7d: moverCounts?.inactive_7d ?? 0,
    },
    pipeline: {
      new_leads: pipelineCounts?.new_leads ?? 0,
      conversions_today: pipelineCounts?.conversions_today ?? 0,
    },
    alerts: {
      sla_breaches: alertCounts?.sla_breaches ?? 0,
      stuck_jobs: alertCounts?.stuck_jobs ?? 0,
      incidents: incidentRow?.open_incidents ?? 0,
    },
    kpi_deltas: {
      vs_yesterday: {
        revenue: Number(ydayRow?.revenue ?? 0) - Number(dayBeforeRow?.revenue ?? 0),
        completedMoves: (ydayRow?.completed ?? 0) - (dayBeforeRow?.completed ?? 0),
      },
      vs_last_week: {
        revenue: Number(revenueRow?.week ?? 0) - Number(lastWeekRow?.revenue ?? 0),
      },
    },
    targets: targetMap,
  };
}
