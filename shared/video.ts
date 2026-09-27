/**
 * Video render length rules, shared by the Higgsfield provider, the Ember agent
 * and the admin UI.
 *
 * This lives in shared/ rather than in the provider because the admin UI has to
 * offer exactly the lengths the API accepts. Two copies of "4 to 15" is how the
 * previous bug worked: the API's own default of 5 had been inlined as `?? 5` in
 * three separate places, no caller ever passed a duration, and so every video
 * the system ever rendered was 5 seconds long.
 *
 * Range and default verified against
 * open.higgsfield.ai/models/bytedance/seedance-2.0/text-to-video (2026-09-26):
 * Seedance 2.0 accepts 4-15s per shot and itself defaults to 5.
 */

export const HIGGSFIELD_MIN_DURATION = 4;
export const HIGGSFIELD_MAX_DURATION = 15;

/**
 * 10s, not the API's 5. Five seconds does not cover even the single Higgsfield
 * hook scene the CreativeOS playbook budgets 0-5s for, and the platform
 * sections there ask for 15-60s of finished video.
 */
export const HIGGSFIELD_DEFAULT_DURATION = 10;

/** The lengths the admin UI offers. Endpoints included so the cap is reachable. */
export const HIGGSFIELD_DURATION_OPTIONS = [4, 5, 6, 8, 10, 12, 15] as const;

/**
 * The one definition of the duration rule, so a stored value and the value sent
 * to the API cannot drift.
 *
 * Out-of-range is clamped rather than rejected: Higgsfield answers an invalid
 * duration with a 4xx, HiggsfieldApiError.permanent treats a 4xx as terminal,
 * and the poller then marks the item failed — losing a whole render to a stale
 * UI value. Missing, non-numeric or non-finite input falls back to the default;
 * fractional input is rounded, since the API takes whole seconds.
 */
export function clampDuration(duration?: number | null): number {
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return HIGGSFIELD_DEFAULT_DURATION;
  }
  return Math.min(
    HIGGSFIELD_MAX_DURATION,
    Math.max(HIGGSFIELD_MIN_DURATION, Math.round(duration)),
  );
}
