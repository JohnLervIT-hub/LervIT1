/**
 * Nova mid-call memory — read/write helpers for `leads.call_context`.
 *
 * Nova's calls are conducted by the ElevenLabs agent over the Telnyx media
 * stream, so the only stage transitions this process can observe are the ones
 * that come back to us as HTTP: the Telnyx call webhook (answer, hangup) and
 * the in-call tool endpoints the agent invokes (`/api/nova/send-signup`,
 * `/api/nova/signup`, `/api/nova/collect-email`, `/api/nova/send-link`). Each
 * of those calls `recordCallStage`, and `call_mover_cold` reads the result on
 * the next attempt so a dropped call resumes instead of replaying the intro.
 *
 * `stage` is monotonic: it records the furthest point any call with this lead
 * reached, so a retry that drops during its own intro does not erase the fact
 * that the first call already got them qualified. Everything else is a plain
 * merge — the webhook and a tool endpoint can land in either order and neither
 * should clobber what the other learned.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { leads, type LeadCallContext } from '@shared/schema';
import { logger } from '../logger';

export type NovaCallStage = NonNullable<LeadCallContext['stage']>;

/** Drop-recovery re-dials allowed per lead before we stop calling. */
export const MAX_CALL_RETRIES = 3;

/** Hangup causes that read as "the line failed", not "they hung up on us". */
export const RETRYABLE_HANGUP_CAUSES = new Set([
  'NORMAL_CLEARING',
  'LOST_CONNECTION',
  'MEDIA_TIMEOUT',
]);

/** A call that ended this fast never got through the pitch. */
export const DROPPED_CALL_MAX_SECONDS = 45;

// How far through the call each stage is. An objection and a qualification sit
// at the same depth — which of the two came last is not what the resume needs
// to know, and `objection` carries the detail either way.
const STAGE_RANK: Record<NovaCallStage, number> = {
  intro: 1,
  qualified: 2,
  objection: 2,
  booking_attempted: 3,
};

/**
 * Merge a stage transition into `leads.call_context`.
 *
 * `lastSaidAt` is stamped here so every caller agrees on its meaning (the
 * moment Nova last reached this stage). `stage` is only advanced, never walked
 * back. Never throws — losing mid-call memory degrades the next call's
 * opening, it must not fail the call in progress or the webhook ack.
 */
export async function recordCallStage(
  leadId: string,
  patch: Partial<LeadCallContext>,
): Promise<void> {
  try {
    const [row] = await db
      .select({ callContext: leads.callContext })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    const current = row?.callContext ?? null;

    const next: LeadCallContext = {
      ...(current ?? {}),
      ...patch,
      // A lead Nova has called but never retried still has a budget of 0 —
      // the field is what the hangup handler counts against.
      retryCount: patch.retryCount ?? current?.retryCount ?? 0,
      lastSaidAt: new Date().toISOString(),
    };

    // Keep the furthest stage reached across every call with this lead.
    const currentStage = current?.stage;
    if (
      currentStage &&
      (!patch.stage || STAGE_RANK[patch.stage] <= STAGE_RANK[currentStage])
    ) {
      next.stage = currentStage;
    }

    await db
      .update(leads)
      .set({ callContext: next, updatedAt: new Date() })
      .where(eq(leads.id, leadId));
  } catch (err) {
    logger.warn({ err, leadId, stage: patch.stage }, '[Nova] call_context write failed');
  }
}

/**
 * Start a fresh conversation memory for a first dial.
 *
 * A replace, not a merge: `recordCallStage` never walks `stage` back, which is
 * what a retry needs and what a new call must not inherit — a lead pitched
 * weeks ago would otherwise be greeted with "picking up where we left off".
 */
export async function startCallContext(leadId: string): Promise<void> {
  await db
    .update(leads)
    .set({
      callContext: { retryCount: 0, lastSaidAt: new Date().toISOString() },
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId))
    .catch((err) =>
      logger.warn({ err, leadId }, '[Nova] call_context reset failed'),
    );
}

/** Stages that mean the pitch already landed — a resume skips re-pitching. */
const PITCHED_STAGES: NovaCallStage[] = ['qualified', 'objection', 'booking_attempted'];

/**
 * Opening line + goal for a call that is picking up a dropped one.
 *
 * Returned as plain strings so they can be handed to whichever prompt path
 * applies: the bridge's `conversation_initiation_client_data` override, or the
 * `script` in the dial metadata.
 */
export function buildResumeBrief(
  ctx: LeadCallContext,
  name: string,
): { opening: string; goal: string } {
  const pitched = ctx.stage ? PITCHED_STAGES.includes(ctx.stage) : false;

  const opening =
    `Hey ${name}, it's Nova from LervIT again — we got disconnected there. ` +
    (pitched ? 'Picking up where we left off.' : 'Is now still a good time?');

  const goal = ctx.objection
    ? `They already heard the pitch and raised this objection: ${ctx.objection}. ` +
      'Address that objection only, then send the signup link.'
    : ctx.stage === 'booking_attempted'
      ? 'They were already signing up when the call dropped. Do not re-pitch — ' +
        'confirm their email and re-send the signup link, then let them go.'
      : ctx.stage === 'qualified' || ctx.stage === 'objection'
        ? 'They already heard the pitch and were interested. Skip the intro and ' +
          'go straight to taking their email and sending the signup link.'
        : 'The last call dropped during the intro. Re-introduce briefly, then pitch.';

  return { opening, goal };
}
