import type { Express, Request, Response } from "express";
import crypto from "crypto";
import Telnyx, { TelnyxWebhook } from "telnyx";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { adminVoicePresence, adminVoiceProfiles, bookings, users, voiceCallAttempts, voiceCalls, voiceMedia, voiceTransfers, voiceWebhookEvents } from "@shared/schema";
import { circuitBreakers } from "./circuit-breaker";
import { logger } from "./logger";
import { adminVoiceWebSocket, generateAdminVoiceWebSocketToken } from "./websocket";
import { ObjectStorageService } from "./objectStorage";

const enabled = () => !!(process.env.TELNYX_API_KEY && process.env.TELNYX_PHONE_NUMBER && process.env.TELNYX_VOICE_CONNECTION_ID && process.env.TELNYX_PUBLIC_KEY && process.env.TELNYX_SIP_USERNAME && process.env.TELNYX_SIP_PASSWORD);
const callerId = () => normalize(process.env.TELNYX_PHONE_NUMBER) || "";
export const encodeClientState = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64");
export const PREPARE_TTL_MS = 2 * 60_000;
// Live call rows (initiated/ringing/answered/held) that have not received any
// webhook or client command update within this window are treated as orphaned
// (usually a crashed browser / dropped WebRTC session) and auto-expired so
// they don't block the admin's next prepare with a 409 "active" response.
export const ACTIVE_STALE_TTL_MS = 15 * 60_000;
const ACTIVE_LIVE_STATUSES = ["initiated", "ringing", "answered", "held"] as const;
export function isStalePreparedCall(status: string, createdAt: Date, now = new Date()) {
  return status === "prepared" && createdAt.getTime() <= now.getTime() - PREPARE_TTL_MS;
}
export function shouldRequestCallRecording(eventType: string, recordingEnabled: boolean, requestedAt?: Date | null) {
  return recordingEnabled && eventType === "call.answered" && !requestedAt;
}
export const VOICE_MAX_ATTEMPTS = 8;
export function retryBackoffMs(attempt: number) {
  return Math.min(15 * 60_000, 2_000 * 2 ** Math.max(0, attempt - 1));
}
export function isRetryDue(status: string, nextAttemptAt: Date, leaseUntil: Date | null, now = new Date()) {
  return ["pending", "retry", "processing"].includes(status) && nextAttemptAt <= now && (!leaseUntil || leaseUntil <= now);
}
/** Deterministic input to the transaction-scoped per-parent transfer lock. */
export function transferAdvisoryLockKey(callId: string) {
  return `voice-transfer:${callId}`;
}
export function normalize(value?: string | null) {
  if (!value) return null;
  const clean = value.replace(/[^\d+]/g, "").replace(/^00/, "+");
  if (/^\+\d{8,15}$/.test(clean)) return clean;
  if (/^\d{10}$/.test(clean)) return `+1${clean}`;
  return /^\d{11,15}$/.test(clean) ? `+${clean}` : null;
}
function admin(req: Request, res: Response) {
  if ((req as any).user?.role === "admin") return true;
  res.status(403).json({ error: "Admin access required" }); return false;
}
const publicCall = (call: typeof voiceCalls.$inferSelect, customer?: { id: string; name: string; phone: string | null } | null, booking?: { id: string; status: string } | null) => ({
  ...call, outcome: call.status, from: call.fromNumber, to: call.toNumber, duration: call.durationSeconds, customer: customer || null, booking: booking || null,
});
async function enrich(call: typeof voiceCalls.$inferSelect) {
  const [customer, booking, media] = await Promise.all([
    call.matchedUserId ? db.select({ id: users.id, name: users.name, phone: users.phone }).from(users).where(eq(users.id, call.matchedUserId)).limit(1) : [],
    call.bookingId ? db.select({ id: bookings.id, status: bookings.status }).from(bookings).where(eq(bookings.id, call.bookingId)).limit(1) : [],
    db.select().from(voiceMedia).where(eq(voiceMedia.callId, call.id)),
  ]);
  const safeMedia = media.map(({ storageUrl: _url, privateObjectKey: _key, ...item }) => item);
  return { ...publicCall(call, customer[0], booking[0]), recordingId: media.find((item) => item.kind === "recording")?.id || null, voicemail: safeMedia.find((item) => item.kind === "voicemail") || null, media: safeMedia };
}
function sdk() { return new Telnyx({ apiKey: process.env.TELNYX_API_KEY! }); }
async function requestCallRecording(call: typeof voiceCalls.$inferSelect, eventType: string) {
  if (!call.telnyxCallControlId || !shouldRequestCallRecording(eventType, process.env.TELNYX_VOICE_RECORDING_ENABLED === "true", call.recordingRequestedAt)) return;
  const requestedAt = new Date();
  // This conditional update is the durable provider-command gate across all
  // processes and across distinct answered webhook event IDs.
  const claimed = await db.update(voiceCalls).set({ recordingRequestedAt: requestedAt, updatedAt: requestedAt })
    .where(and(eq(voiceCalls.id, call.id), isNull(voiceCalls.recordingRequestedAt))).returning();
  if (!claimed[0]) return;
  try {
    await circuitBreakers.telnyx.execute(() => sdk().calls.actions.startRecording(call.telnyxCallControlId!, {
      format: "mp3", channels: "dual", command_id: `lervit-record-${call.id}`,
    }));
  } catch (error) {
    // Release only this failed claim, allowing a later answered event/retry to
    // issue the same provider-idempotent command.
    await db.update(voiceCalls).set({ recordingRequestedAt: null, updatedAt: new Date() })
      .where(and(eq(voiceCalls.id, call.id), eq(voiceCalls.recordingRequestedAt, requestedAt)));
    logger.error({ err: error, callId: call.id }, "Call recording request failed; retry enabled");
  }
}
const objectStorage = new ObjectStorageService();
async function downloadRecording(url: string) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Recording download failed (${response.status})`);
  const size = Number(response.headers.get("content-length") || 0);
  if (size > 150 * 1024 * 1024) throw new Error("Recording exceeds storage limit");
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "audio/mpeg" };
}
async function archiveRecording(mediaId: string, callId: string, mediaKey: string, url: string) {
  try {
    const { bytes, contentType } = await downloadRecording(url);
    const safeKey = crypto.createHash("sha256").update(mediaKey).digest("hex");
    const objectKey = `${objectStorage.getPrivateObjectDir().replace(/\/$/, "")}/voice-recordings/${callId}/${safeKey}.mp3`;
    await objectStorage.uploadFile(objectKey, bytes, contentType);
    await db.update(voiceMedia).set({ privateObjectKey: objectKey, storageStatus: "stored", storageUrl: null, contentType, archiveLeaseUntil: null, archiveLastError: null }).where(eq(voiceMedia.id, mediaId));
  } catch (error) {
    const media = (await db.select().from(voiceMedia).where(eq(voiceMedia.id, mediaId)).limit(1))[0];
    const attempts = media?.archiveAttemptCount || 1;
    await db.update(voiceMedia).set({ storageStatus: attempts >= VOICE_MAX_ATTEMPTS ? "failed" : "retry", archiveNextAttemptAt: new Date(Date.now() + retryBackoffMs(attempts)), archiveLeaseUntil: null, archiveLastError: error instanceof Error ? error.message.slice(0, 1000) : "Archive failed" }).where(eq(voiceMedia.id, mediaId));
    logger.error({ err: error, mediaId, callId }, "Voice recording archive pending retry");
  }
}
let voiceRetryWorkerStarted = false;
function startVoiceRetryWorker() {
  if (voiceRetryWorkerStarted) return;
  voiceRetryWorkerStarted = true;
  const timer = setInterval(async () => {
    const now = new Date();
    try {
      const events = await db.select().from(voiceWebhookEvents).where(and(inArray(voiceWebhookEvents.status, ["pending", "retry", "processing"]), lte(voiceWebhookEvents.nextAttemptAt, now), or(isNull(voiceWebhookEvents.leaseUntil), lte(voiceWebhookEvents.leaseUntil, now)))).limit(10);
      for (const candidate of events) {
        const claimed = await claimWebhookEvent(candidate.id);
        if (!claimed) continue;
        try { await processVoiceWebhookEvent(claimed, JSON.parse(claimed.payload)); }
        catch (error) { await queueWebhookRetry(claimed, error); }
      }
      const mediaRows = await db.select().from(voiceMedia).where(and(inArray(voiceMedia.storageStatus, ["pending", "retry"]), lte(voiceMedia.archiveNextAttemptAt, now), or(isNull(voiceMedia.archiveLeaseUntil), lte(voiceMedia.archiveLeaseUntil, now)))).limit(5);
      for (const candidate of mediaRows) {
        const claimed = (await db.update(voiceMedia).set({ archiveLeaseUntil: new Date(Date.now() + 120_000), archiveAttemptCount: sql`${voiceMedia.archiveAttemptCount} + 1` })
          .where(and(eq(voiceMedia.id, candidate.id), inArray(voiceMedia.storageStatus, ["pending", "retry"]), or(isNull(voiceMedia.archiveLeaseUntil), lte(voiceMedia.archiveLeaseUntil, now)))).returning())[0];
        if (!claimed) continue;
        let url = claimed.storageUrl || undefined;
        if (claimed.telnyxRecordingId && !claimed.telnyxRecordingId.startsWith("event:")) {
          try { const fresh = await circuitBreakers.telnyx.execute(() => sdk().recordings.retrieve(claimed.telnyxRecordingId!)); url = fresh.data?.download_urls?.mp3 || fresh.data?.download_urls?.wav || url; } catch (_) {}
        }
        if (url) await archiveRecording(claimed.id, claimed.callId, claimed.telnyxRecordingId || claimed.id, url);
        else await db.update(voiceMedia).set({ storageStatus: claimed.archiveAttemptCount >= VOICE_MAX_ATTEMPTS ? "failed" : "retry", archiveNextAttemptAt: new Date(Date.now() + retryBackoffMs(claimed.archiveAttemptCount)), archiveLeaseUntil: null, archiveLastError: "No provider download URL available" }).where(eq(voiceMedia.id, claimed.id));
      }
      // Routing is deliberately reconciled from persisted deadlines, rather
      // than process-local timers, so a restart cannot strand an inbound call.
      const inbound = await db.select().from(voiceCalls).where(and(eq(voiceCalls.direction, "inbound"), isNull(voiceCalls.adminId), inArray(voiceCalls.routingState, ["pending", "ringing", "fallback_pending", "fallback_processing"]))).limit(20);
      for (const call of inbound) {
        if (call.routingDeadlineAt && call.routingDeadlineAt <= now && ["pending", "ringing"].includes(call.routingState)) {
          const timedOut = await db.update(voiceCalls).set({ routingState: "fallback_pending", routingLeaseUntil: null, updatedAt: now })
            .where(and(eq(voiceCalls.id, call.id), isNull(voiceCalls.adminId), inArray(voiceCalls.routingState, ["pending", "ringing"]), lte(voiceCalls.routingDeadlineAt, now))).returning();
          if (timedOut[0]) await db.update(voiceCallAttempts).set({ status: "timed_out", endedAt: now }).where(and(eq(voiceCallAttempts.callId, call.id), eq(voiceCallAttempts.status, "ringing")));
          if (timedOut[0]) await startFallback(timedOut[0]);
        } else if (call.routingState === "pending" || (call.routingState === "ringing" && !call.routingDeadlineAt)) {
          await fanOutInbound(call);
        } else if (call.routingState.startsWith("fallback")) {
          await startFallback(call);
        }
      }
      const pendingTransfers = await db.select().from(voiceTransfers).where(or(
        eq(voiceTransfers.status, "requested"),
        and(eq(voiceTransfers.status, "dialing"), or(isNull(voiceTransfers.dialLeaseUntil), lte(voiceTransfers.dialLeaseUntil, now))),
      )).limit(10);
      for (const transfer of pendingTransfers) await resumeTransferDial(transfer);
    } catch (error) { logger.error({ err: error }, "Voice retry worker iteration failed"); }
  }, 10_000);
  timer.unref();
}
async function resumeTransferDial(transfer: typeof voiceTransfers.$inferSelect) {
  const now = new Date();
  if (transfer.status !== "requested" && !(transfer.status === "dialing" && (!transfer.dialLeaseUntil || transfer.dialLeaseUntil <= now))) return;
  const parent = (await db.select().from(voiceCalls).where(eq(voiceCalls.id, transfer.callId)).limit(1))[0];
  const target = transfer.targetAdminId ? (await db.select().from(adminVoiceProfiles).where(eq(adminVoiceProfiles.userId, transfer.targetAdminId)).limit(1))[0] : undefined;
  if (!parent || !target?.telnyxSipUsername) return;
  const commandId = transfer.telnyxCommandId || `lervit-transfer-dial-${transfer.id}`;
  const leaseUntil = new Date(now.getTime() + 60_000);
  // Exactly one API request/worker instance owns provider invocation. Expired
  // owners may be reclaimed and replay the same provider-idempotent command.
  const claimed = (await db.update(voiceTransfers).set({ status: "dialing", telnyxCommandId: commandId, dialLeaseUntil: leaseUntil }).where(and(
    eq(voiceTransfers.id, transfer.id),
    or(
      eq(voiceTransfers.status, "requested"),
      and(eq(voiceTransfers.status, "dialing"), or(isNull(voiceTransfers.dialLeaseUntil), lte(voiceTransfers.dialLeaseUntil, now))),
    ),
  )).returning())[0];
  if (!claimed) return;
  try {
    await circuitBreakers.telnyx.execute(() => sdk().calls.dial({ connection_id: process.env.TELNYX_VOICE_CONNECTION_ID!, from: callerId(), to: `sip:${target.telnyxSipUsername}@sip.telnyx.com`, client_state: encodeClientState({ kind: "transfer", transferId: transfer.id }), command_id: commandId }));
    await db.update(voiceTransfers).set({ status: "initiated", dialLeaseUntil: null }).where(and(eq(voiceTransfers.id, transfer.id), eq(voiceTransfers.status, "dialing"), eq(voiceTransfers.telnyxCommandId, commandId), eq(voiceTransfers.dialLeaseUntil, leaseUntil)));
  } catch (error) {
    await db.update(voiceTransfers).set({ status: "requested", dialLeaseUntil: null }).where(and(eq(voiceTransfers.id, transfer.id), eq(voiceTransfers.status, "dialing"), eq(voiceTransfers.telnyxCommandId, commandId), eq(voiceTransfers.dialLeaseUntil, leaseUntil)));
    logger.error({ err: error, transferId: transfer.id, commandId }, "Transfer dial deferred");
  }
}
async function claimWebhookEvent(id: string) {
  const now = new Date();
  return (await db.update(voiceWebhookEvents).set({ status: "processing", leaseUntil: new Date(now.getTime() + 60_000), attemptCount: sql`${voiceWebhookEvents.attemptCount} + 1` })
    .where(and(eq(voiceWebhookEvents.id, id), inArray(voiceWebhookEvents.status, ["pending", "retry", "processing"]), lte(voiceWebhookEvents.nextAttemptAt, now), or(isNull(voiceWebhookEvents.leaseUntil), lte(voiceWebhookEvents.leaseUntil, now)))).returning())[0];
}
async function queueWebhookRetry(row: typeof voiceWebhookEvents.$inferSelect, error: unknown) {
  const failed = row.attemptCount >= VOICE_MAX_ATTEMPTS;
  const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown processing error";
  await db.update(voiceWebhookEvents).set({ status: failed ? "failed" : "retry", nextAttemptAt: new Date(Date.now() + retryBackoffMs(row.attemptCount)), leaseUntil: null, lastError: message, processingError: message }).where(eq(voiceWebhookEvents.id, row.id));
  logger.error({ err: error, eventId: row.telnyxEventId, attempt: row.attemptCount, failed }, "Voice webhook processing deferred");
}

/**
 * Reusable retry processor. Provider delivery performs the full real-time path;
 * retries safely reconcile persisted lifecycle/media effects from the stored payload.
 */
export async function processVoiceWebhookEvent(row: typeof voiceWebhookEvents.$inferSelect, event: any) {
  const eventType = event.data?.event_type || event.event_type || row.eventType;
  const p = event.data?.payload || {};
  const control: string | undefined = p.call_control_id;
  const leg: string | undefined = p.call_leg_id;
  const clientState: string | undefined = p.client_state;
  let stateData: any;
  try { stateData = clientState ? JSON.parse(Buffer.from(clientState, "base64").toString("utf8")) : undefined; } catch (_) {}

  // Transfer legs are never parent calls. A completed transfer is replay-safe;
  // bridge uses a stable provider command ID.
  if (stateData?.kind === "transfer") {
    const transfer = (await db.select().from(voiceTransfers).where(eq(voiceTransfers.id, stateData.transferId)).limit(1))[0];
    if (!transfer) throw new Error("Transfer correlation pending");
    if (eventType === "call.answered" && transfer.status !== "completed") {
      const parent = (await db.select().from(voiceCalls).where(eq(voiceCalls.id, transfer.callId)).limit(1))[0];
      if (!parent?.telnyxCallControlId || !control) throw new Error("Transfer bridge identifiers pending");
      try {
        await circuitBreakers.telnyx.execute(() => sdk().calls.actions.bridge(parent.telnyxCallControlId!, { call_control_id: control, command_id: `lervit-transfer-${transfer.id}` }));
        await db.update(voiceTransfers).set({ status: "completed", completedAt: new Date(), telnyxCommandId: `lervit-transfer-${transfer.id}` }).where(eq(voiceTransfers.id, transfer.id));
      } catch (error) {
        await db.update(voiceTransfers).set({ status: "failed" }).where(eq(voiceTransfers.id, transfer.id));
        throw error;
      }
    } else if (eventType.includes("hangup") && transfer.status !== "completed") {
      await db.update(voiceTransfers).set({ status: "failed" }).where(eq(voiceTransfers.id, transfer.id));
    }
    await db.update(voiceWebhookEvents).set({ callId: transfer.callId, status: "processed", processedAt: new Date(), leaseUntil: null, lastError: null }).where(eq(voiceWebhookEvents.id, row.id));
    return;
  }

  // The first webhook for an agent leg commonly has only client_state. Attach
  // provider IDs atomically before evaluating answer/hangup transitions.
  let attempt = (control || clientState) ? (await db.select().from(voiceCallAttempts).where(or(
    ...(control ? [eq(voiceCallAttempts.telnyxCallControlId, control)] : []),
    ...(clientState ? [eq(voiceCallAttempts.clientState, clientState)] : []),
  )).limit(1))[0] : undefined;
  if (attempt && (control || leg)) {
    attempt = (await db.update(voiceCallAttempts).set({
      telnyxCallControlId: control ? sql`coalesce(${voiceCallAttempts.telnyxCallControlId}, ${control})` : attempt.telnyxCallControlId,
      telnyxCallLegId: leg ? sql`coalesce(${voiceCallAttempts.telnyxCallLegId}, ${leg})` : attempt.telnyxCallLegId,
    }).where(eq(voiceCallAttempts.id, attempt.id)).returning())[0];
  }
  if (attempt) {
    if (eventType === "call.answered") {
      const claimed = await db.update(voiceCalls).set({ adminId: attempt.adminId, status: "answered", answeredAt: new Date(), updatedAt: new Date() })
        .where(and(eq(voiceCalls.id, attempt.callId), isNull(voiceCalls.adminId), inArray(voiceCalls.status, ["initiated", "ringing"]))).returning();
      const parent = claimed[0] || (await db.select().from(voiceCalls).where(eq(voiceCalls.id, attempt.callId)).limit(1))[0];
      if (!parent) throw new Error("Inbound parent call missing");
      if (parent.adminId === attempt.adminId) {
        await db.update(voiceCallAttempts).set({ status: "answered", answeredAt: attempt.answeredAt || new Date() }).where(eq(voiceCallAttempts.id, attempt.id));
        if (!parent.telnyxCallControlId || !control) throw new Error("Inbound bridge identifiers pending");
        await circuitBreakers.telnyx.execute(() => sdk().calls.actions.bridge(parent.telnyxCallControlId!, { call_control_id: control, command_id: `lervit-bridge-${parent.id}` }));
        await requestCallRecording(parent, "call.answered");
        const losers = await db.update(voiceCallAttempts).set({ status: "cancelled", endedAt: new Date() })
          .where(and(eq(voiceCallAttempts.callId, attempt.callId), sql`${voiceCallAttempts.id} <> ${attempt.id}`, inArray(voiceCallAttempts.status, ["ringing", "cancelled"]))).returning();
        await Promise.all(losers.filter((loser) => loser.telnyxCallControlId).map((loser) =>
          circuitBreakers.telnyx.execute(() => sdk().calls.actions.hangup(loser.telnyxCallControlId!, { command_id: `lervit-loser-${loser.id}` }))
        ));
        adminVoiceWebSocket.notify({ type: "voice.call", eventType, call: await enrich(parent) });
      } else {
        await db.update(voiceCallAttempts).set({ status: "cancelled", endedAt: new Date() }).where(eq(voiceCallAttempts.id, attempt.id));
        if (control) await circuitBreakers.telnyx.execute(() => sdk().calls.actions.hangup(control, { command_id: `lervit-loser-${attempt.id}` }));
      }
    } else if (eventType.includes("hangup")) {
      await db.update(voiceCallAttempts).set({ status: "ended", endedAt: new Date() }).where(eq(voiceCallAttempts.id, attempt.id));
    }
    await db.update(voiceWebhookEvents).set({ callId: attempt.callId, status: "processed", processedAt: new Date(), leaseUntil: null, lastError: null }).where(eq(voiceWebhookEvents.id, row.id));
    return;
  }

  let call = control ? (await db.select().from(voiceCalls).where(eq(voiceCalls.telnyxCallControlId, control)).limit(1))[0] : undefined;
  if (!call && leg) call = (await db.select().from(voiceCalls).where(eq(voiceCalls.telnyxCallLegId, leg)).limit(1))[0];
  if (!call && clientState) call = (await db.select().from(voiceCalls).where(eq(voiceCalls.clientState, clientState)).limit(1))[0];
  const from = normalize(p.from || p.from_number) || call?.fromNumber || "unknown";
  const to = normalize(p.to || p.to_number) || call?.toNumber || "unknown";
  if (!call) {
    const customer = from !== "unknown" ? (await db.select().from(users).where(sql`regexp_replace(${users.phone}, '[^0-9]', '', 'g') = ${from.replace(/\D/g, "")}`).limit(1))[0] : undefined;
    const booking = customer ? (await db.select().from(bookings).where(and(eq(bookings.customerId, customer.id), gte(bookings.preferredDate, new Date(Date.now() - 30 * 86400000)))).orderBy(desc(bookings.preferredDate)).limit(1))[0] : undefined;
    const created = await db.insert(voiceCalls).values({ telnyxCallControlId: control, telnyxCallLegId: leg, clientState, direction: p.direction === "outgoing" ? "outbound" : "inbound", status: state(eventType), fromNumber: from, toNumber: to, matchedUserId: customer?.id, bookingId: booking?.id, startedAt: new Date(), lastEventAt: new Date() }).onConflictDoNothing().returning();
    call = created[0];
    if (!call && control) call = (await db.select().from(voiceCalls).where(eq(voiceCalls.telnyxCallControlId, control)).limit(1))[0];
    if (!call && leg) call = (await db.select().from(voiceCalls).where(eq(voiceCalls.telnyxCallLegId, leg)).limit(1))[0];
    if (!call && clientState) call = (await db.select().from(voiceCalls).where(eq(voiceCalls.clientState, clientState)).limit(1))[0];
    if (!call) throw new Error("Unable to persist or correlate call");
    if (eventType === "call.initiated" && call.direction === "inbound") await fanOutInbound(call);
  } else {
    const now = new Date(), duration = Number(p.duration_secs || p.duration_seconds || p.duration_millis / 1000);
    const isHangup = eventType.includes("hangup") || eventType.includes("ended");
    // Caller hangs up while ringing (before any admin bridges): route the parent
    // row directly into 'missed' so it isn't buried under a generic 'completed'.
    const isMissedInbound = isHangup && call.direction === "inbound" && !call.answeredAt && call.status !== "missed"
      && ["pending", "ringing", "fallback_pending", "fallback_processing"].includes(call.routingState);
    const nextStatus = isMissedInbound ? "missed" : state(eventType);
    call = (await db.update(voiceCalls).set({ telnyxCallControlId: control || call.telnyxCallControlId, telnyxCallLegId: leg || call.telnyxCallLegId, status: nextStatus, missedAt: isMissedInbound ? (call.missedAt || now) : call.missedAt, fromNumber: from, toNumber: to, lastEventAt: now, answeredAt: eventType.includes("answered") ? (call.answeredAt || now) : call.answeredAt, endedAt: isHangup ? now : call.endedAt, durationSeconds: Number.isFinite(duration) ? Math.round(duration) : call.durationSeconds, updatedAt: now }).where(eq(voiceCalls.id, call.id)).returning())[0];
    if (isMissedInbound && call) {
      await db.update(voiceCallAttempts).set({ status: "cancelled", endedAt: now })
        .where(and(eq(voiceCallAttempts.callId, call.id), inArray(voiceCallAttempts.status, ["ringing", "timed_out"])));
      adminVoiceWebSocket.notify({ type: "missed_call", call: await enrich(call) });
    }
  }
  await db.update(voiceWebhookEvents).set({ callId: call.id }).where(eq(voiceWebhookEvents.id, row.id));
  if (eventType === "call.recording.saved") {
    const key = p.recording_id || p.id || `event:${crypto.createHash("sha256").update(`${row.telnyxEventId}:${leg || ""}:${control || ""}`).digest("hex")}`;
    const url = p.recording_urls?.mp3 || p.download_urls?.mp3 || p.recording_url || null;
    const inserted = await db.insert(voiceMedia).values({ callId: call.id, kind: call.status === "voicemail" || stateData?.kind === "voicemail" ? "voicemail" : "recording", telnyxRecordingId: key, storageUrl: url, storageStatus: "pending", durationSeconds: Number.isFinite(Number(p.duration_millis)) ? Math.round(Number(p.duration_millis) / 1000) : null, availableAt: new Date() }).onConflictDoNothing().returning();
    const media = inserted[0] || (await db.select().from(voiceMedia).where(eq(voiceMedia.telnyxRecordingId, key)).limit(1))[0];
    if (media && url && !media.privateObjectKey) await archiveRecording(media.id, call.id, key, url);
    else if (media && !url) await db.update(voiceMedia).set({ storageStatus: "retry" }).where(eq(voiceMedia.id, media.id));
  }
  if (eventType.includes("transcription") && p.transcription) {
    const media = (await db.select().from(voiceMedia).where(eq(voiceMedia.callId, call.id)).orderBy(desc(voiceMedia.createdAt)).limit(1))[0];
    if (media) await db.update(voiceMedia).set({ transcription: String(p.transcription) }).where(eq(voiceMedia.id, media.id));
  }
  await requestCallRecording(call, eventType);
  await db.update(voiceWebhookEvents).set({ callId: call.id, status: "processed", processedAt: new Date(), leaseUntil: null, lastError: null }).where(eq(voiceWebhookEvents.id, row.id));
  adminVoiceWebSocket.notify({ type: "voice.call", eventType, call: await enrich(call) });
}
function state(type: string) {
  if (type.includes("answered")) return "answered";
  if (type.includes("hangup") || type.includes("ended")) return "completed";
  if (type.includes("declined")) return "declined";
  return type.replace(/^call\./, "").replaceAll(".", "_");
}
async function startFallback(call: typeof voiceCalls.$inferSelect) {
  if (!call.telnyxCallControlId) return;
  const now = new Date();
  const claimed = (await db.update(voiceCalls).set({
    routingState: "fallback_processing", fallbackRequestedAt: call.fallbackRequestedAt || now,
    routingLeaseUntil: new Date(now.getTime() + 60_000), updatedAt: now,
  }).where(and(eq(voiceCalls.id, call.id), inArray(voiceCalls.routingState, ["pending", "ringing", "fallback_pending", "fallback_processing"]), or(isNull(voiceCalls.routingLeaseUntil), lte(voiceCalls.routingLeaseUntil, now)))).returning())[0];
  if (!claimed) return;
  const fallback = process.env.TELNYX_VOICE_FALLBACK_URI;
  try {
    await circuitBreakers.telnyx.execute(async () => {
      const client = sdk();
      if (fallback) return client.calls.actions.transfer(claimed.telnyxCallControlId!, { to: fallback, command_id: `lervit-fallback-${claimed.id}` });
      // No voicemail/fallback configured — end the ring so it doesn't collapse
      // to auto-answered voicemail; the row is then marked 'missed' below.
      return client.calls.actions.hangup(claimed.telnyxCallControlId!, { command_id: `lervit-missed-${claimed.id}` });
    });
    if (fallback) {
      await db.update(voiceCalls).set({ status: "fallback", routingState: "fallback_started", routingLeaseUntil: null, updatedAt: new Date() }).where(eq(voiceCalls.id, call.id));
    } else {
      await markInboundMissed(claimed.id);
    }
  } catch (error) {
    await db.update(voiceCalls).set({ routingState: "fallback_pending", routingLeaseUntil: null, updatedAt: new Date() }).where(eq(voiceCalls.id, call.id));
    logger.error({ err: error, callId: call.id }, "Voice fallback deferred");
  }
}
/**
 * Atomically transition an inbound call to status='missed' and emit a real-time
 * notification. Idempotent: the conditional update guarantees the notification
 * fires at most once even when the fallback retry loop re-enters.
 */
async function markInboundMissed(callId: string) {
  const now = new Date();
  const missed = (await db.update(voiceCalls).set({
    status: "missed", missedAt: now, endedAt: now,
    routingState: "fallback_started", routingLeaseUntil: null, updatedAt: now,
  }).where(and(eq(voiceCalls.id, callId), sql`${voiceCalls.status} <> 'missed'`)).returning())[0];
  if (!missed) return;
  await db.update(voiceCallAttempts).set({ status: "cancelled", endedAt: now })
    .where(and(eq(voiceCallAttempts.callId, callId), inArray(voiceCallAttempts.status, ["ringing", "timed_out"])));
  try {
    adminVoiceWebSocket.notify({ type: "missed_call", call: await enrich(missed) });
  } catch (error) {
    logger.error({ err: error, callId }, "Missed-call notification deferred");
  }
}
async function fanOutInbound(call: typeof voiceCalls.$inferSelect) {
  if (!enabled() || !call.telnyxCallControlId) return startFallback(call);
  const agents = await db.select({ adminId: adminVoiceProfiles.userId, sip: adminVoiceProfiles.telnyxSipUsername }).from(adminVoiceProfiles)
    .innerJoin(adminVoicePresence, eq(adminVoiceProfiles.userId, adminVoicePresence.userId))
    .where(and(eq(adminVoiceProfiles.enabled, true), eq(adminVoicePresence.status, "available")));
  if (!agents.length) return startFallback(call);
  const timeoutMs = Math.max(5_000, Math.min(Number(process.env.TELNYX_VOICE_RING_TIMEOUT_MS) || 25_000, 120_000));
  const deadline = call.routingDeadlineAt || new Date(Date.now() + timeoutMs);
  await db.update(voiceCalls).set({ routingState: "ringing", routingDeadlineAt: deadline, routingLeaseUntil: null, updatedAt: new Date() }).where(eq(voiceCalls.id, call.id));
  await Promise.all(agents.filter((agent) => agent.sip).map(async (agent) => {
    const clientState = encodeClientState({ kind: "inbound", callId: call.id, adminId: agent.adminId });
    const inserted = await db.insert(voiceCallAttempts).values({ callId: call.id, adminId: agent.adminId, clientState, expiresAt: new Date(Date.now() + timeoutMs) }).onConflictDoNothing().returning();
    const attempt = inserted[0] || (await db.select().from(voiceCallAttempts).where(and(eq(voiceCallAttempts.callId, call.id), eq(voiceCallAttempts.adminId, agent.adminId))).limit(1))[0];
    if (!attempt || attempt.telnyxCallControlId || attempt.status !== "ringing") return;
    try {
      const leg = await circuitBreakers.telnyx.execute(() => sdk().calls.dial({ connection_id: process.env.TELNYX_VOICE_CONNECTION_ID!, from: callerId(), to: `sip:${agent.sip}@sip.telnyx.com`, client_state: clientState, command_id: `lervit-fanout-${attempt.id}` }));
      await db.update(voiceCallAttempts).set({ telnyxCallControlId: leg.data?.call_control_id, telnyxCallLegId: leg.data?.call_leg_id }).where(eq(voiceCallAttempts.id, attempt.id));
    } catch (error) {
      await db.update(voiceCallAttempts).set({ status: "failed", endedAt: new Date() }).where(eq(voiceCallAttempts.id, attempt.id));
      logger.error({ err: error, callId: call.id, adminId: agent.adminId }, "Inbound agent leg failed");
    }
  }));
}

export function registerVoiceRoutes(app: Express) {
  startVoiceRetryWorker();
  app.get("/api/admin/voice/config", (req, res) => {
    if (!admin(req, res)) return;
    const missing = ["TELNYX_API_KEY", "TELNYX_PHONE_NUMBER", "TELNYX_VOICE_CONNECTION_ID", "TELNYX_PUBLIC_KEY", "TELNYX_SIP_USERNAME", "TELNYX_SIP_PASSWORD"].filter((key) => !process.env[key]);
    res.json({ enabled: missing.length === 0, callerId: callerId(), recordingEnabled: process.env.TELNYX_VOICE_RECORDING_ENABLED === "true", fallbackEnabled: true, ...(missing.length ? { reason: `Missing ${missing.join(", ")}` } : {}) });
  });
  app.get("/api/admin/voice/presence", async (req, res) => {
    if (!admin(req, res)) return;
    const row = (await db.select().from(adminVoicePresence).where(eq(adminVoicePresence.userId, (req as any).user.id)).limit(1))[0];
    res.json({ status: row?.status === "available" ? "available" : "unavailable", updatedAt: row?.updatedAt || null });
  });
  const setPresence = async (req: Request, res: Response) => {
    if (!admin(req, res)) return;
    const parsed = z.object({ status: z.enum(["available", "unavailable"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "status must be available or unavailable" });
    const now = new Date(), userId = (req as any).user.id, status = parsed.data.status === "available" ? "available" : "offline";
    await db.insert(adminVoicePresence).values({ userId, status, lastSeenAt: now, updatedAt: now }).onConflictDoUpdate({ target: adminVoicePresence.userId, set: { status, lastSeenAt: now, updatedAt: now } });
    adminVoiceWebSocket.notify({ type: "voice.presence", userId, status: parsed.data.status });
    res.json({ status: parsed.data.status, updatedAt: now });
  };
  app.patch("/api/admin/voice/presence", setPresence);
  app.put("/api/admin/voice/presence", setPresence); // compatibility
  app.get("/api/admin/voice/available-admins", async (req, res) => {
    if (!admin(req, res)) return;
    const rows = await db.select({ id: users.id, name: users.name, presence: adminVoicePresence.status }).from(users)
      .innerJoin(adminVoicePresence, eq(users.id, adminVoicePresence.userId)).where(and(eq(users.role, "admin"), eq(adminVoicePresence.status, "available"))).orderBy(users.name);
    res.json(rows);
  });
  app.get("/api/admin/voice/ws-token", (req, res) => {
    if (!admin(req, res)) return;
    const expiresAt = new Date(Date.now() + 300_000).toISOString();
    res.json({ token: generateAdminVoiceWebSocketToken((req as any).user.id), expiresAt });
  });
  app.post("/api/admin/voice/token", async (req, res) => {
    if (!admin(req, res)) return;
    if (!enabled()) return res.status(503).json({ error: "Telnyx voice is disabled" });
    res.json({
      sipUsername: process.env.TELNYX_SIP_USERNAME,
      sipPassword: process.env.TELNYX_SIP_PASSWORD,
      callerId: callerId(),
      expiresAt: null,
    });
  });
  app.post("/api/admin/voice/calls/prepare", async (req, res) => {
    if (!admin(req, res)) return;
    const parsed = z.object({ to: z.string(), bookingId: z.string().uuid().optional(), idempotencyKey: z.string().min(8).max(128).optional(), clientCallId: z.string().min(8).max(128).optional() }).safeParse(req.body);
    const prepare = parsed.data;
    const to = parsed.success && prepare ? normalize(prepare.to) : null;
    if (!to) return res.status(400).json({ error: "to must be an E.164 phone number" });
    const userId = (req as any).user.id;
    const clientState = encodeClientState({ kind: "outbound", key: prepare!.idempotencyKey || prepare!.clientCallId || crypto.randomUUID() });
    try {
      const result = await db.transaction(async (tx) => {
        // Serialize all prepare requests for an admin, including requests using
        // distinct idempotency keys, before examining active-call state.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`voice-prepare:${userId}`}))`);
        const profile = (await tx.select().from(adminVoiceProfiles).where(and(eq(adminVoiceProfiles.userId, userId), eq(adminVoiceProfiles.enabled, true))).limit(1))[0];
        if (!profile) return { kind: "profile-disabled" as const };
        const now = new Date();
        const activeStaleCutoff = new Date(now.getTime() - ACTIVE_STALE_TTL_MS);
        await tx.update(voiceCalls).set({ status: "expired", endedAt: now, updatedAt: now })
          .where(and(
            eq(voiceCalls.adminId, userId),
            or(
              and(eq(voiceCalls.status, "prepared"), lte(voiceCalls.createdAt, new Date(now.getTime() - PREPARE_TTL_MS))),
              and(inArray(voiceCalls.status, [...ACTIVE_LIVE_STATUSES]), lte(voiceCalls.updatedAt, activeStaleCutoff)),
            ),
          ));
        const prior = (await tx.select().from(voiceCalls).where(eq(voiceCalls.clientState, clientState)).limit(1))[0];
        if (prior) {
          if (prior.adminId !== userId) return { kind: "foreign-key" as const };
          if (prior.status !== "prepared" || isStalePreparedCall(prior.status, prior.createdAt, now)) return { kind: "expired-key" as const };
          return { kind: "existing" as const, call: prior };
        }
        const active = (await tx.select().from(voiceCalls).where(and(eq(voiceCalls.adminId, userId), inArray(voiceCalls.status, ["prepared", "initiated", "ringing", "answered", "held"]))).limit(1))[0];
        if (active) return { kind: "active" as const, call: active };
        const inserted = await tx.insert(voiceCalls).values({ direction: "outbound", status: "prepared", fromNumber: callerId(), toNumber: to, adminId: userId, bookingId: prepare!.bookingId, clientState, metadata: JSON.stringify({ clientState }), startedAt: now }).onConflictDoNothing().returning();
        if (inserted[0]) return { kind: "created" as const, call: inserted[0] };
        // Defensive handling for a database-level uniqueness conflict.
        const conflict = (await tx.select().from(voiceCalls).where(eq(voiceCalls.clientState, clientState)).limit(1))[0];
        if (conflict?.adminId === userId && conflict.status === "prepared" && !isStalePreparedCall(conflict.status, conflict.createdAt, now)) return { kind: "existing" as const, call: conflict };
        return { kind: "foreign-key" as const };
      });
      if (result.kind === "profile-disabled") return res.status(409).json({ error: "Voice profile is disabled" });
      if (result.kind === "foreign-key") return res.status(409).json({ error: "Idempotency key already belongs to another admin" });
      if (result.kind === "expired-key") return res.status(409).json({ error: "Prepared call has expired; use a new idempotency key" });
      if (result.kind === "active") return res.status(409).json({ error: "Admin already has an active call", call: await enrich(result.call) });
      // Browser WebRTC is intentionally the only outbound path; do not call Telnyx /calls here.
      return res.status(result.kind === "created" ? 201 : 200).json({ call: await enrich(result.call), clientState });
    } catch (error) {
      logger.error({ err: error, adminId: userId }, "Voice call preparation failed");
      return res.status(500).json({ error: "Unable to prepare call" });
    }
  });
  app.post("/api/admin/voice/calls/:id/cancel-prepare", async (req, res) => {
    if (!admin(req, res)) return;
    const userId = (req as any).user.id;
    const cancelled = await db.update(voiceCalls).set({ status: "cancelled", endedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(voiceCalls.id, req.params.id), eq(voiceCalls.adminId, userId), eq(voiceCalls.status, "prepared"))).returning();
    if (!cancelled[0]) return res.status(404).json({ error: "Owned prepared call not found" });
    res.json({ call: await enrich(cancelled[0]) });
  });
  // Manual escape hatch when a prior call is stuck in prepared/initiated/ringing/
  // answered/held (e.g. browser crashed before a terminating webhook arrived).
  // Marks all of the requesting admin's such rows as expired so the next prepare
  // is not blocked with a 409 "active" response.
  app.post("/api/admin/voice/calls/clear-active", async (req, res) => {
    if (!admin(req, res)) return;
    const userId = (req as any).user.id;
    const now = new Date();
    const cleared = await db.update(voiceCalls).set({ status: "expired", endedAt: now, updatedAt: now })
      .where(and(eq(voiceCalls.adminId, userId), inArray(voiceCalls.status, ["prepared", ...ACTIVE_LIVE_STATUSES])))
      .returning({ id: voiceCalls.id });
    res.json({ clearedCount: cleared.length, clearedIds: cleared.map((c) => c.id) });
  });
  app.post("/api/admin/voice/calls/:id/commands", async (req, res) => {
    if (!admin(req, res)) return;
    const parsed = z.object({ command: z.enum(["answer", "decline", "hangup", "hold", "resume", "mute", "unmute", "dtmf"]), digits: z.string().regex(/^[0-9*#ABCD]+$/i).max(64).optional() }).superRefine((v, c) => { if (v.command === "dtmf" && !v.digits) c.addIssue({ code: "custom", message: "digits required" }); }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid call command" });
    const call = (await db.select().from(voiceCalls).where(eq(voiceCalls.id, req.params.id)).limit(1))[0];
    if (!call) return res.status(404).json({ error: "Call not found" });
    if (call.adminId !== (req as any).user.id) return res.status(403).json({ error: "Call is not assigned to this admin" });
    const next = parsed.data.command === "answer" ? "answered" : parsed.data.command === "decline" ? "declined" : parsed.data.command === "hangup" ? "completed" : parsed.data.command === "hold" ? "held" : parsed.data.command === "resume" ? "answered" : call.status;
    const now = new Date();
    const updated = (await db.update(voiceCalls).set({ status: next, answeredAt: next === "answered" ? (call.answeredAt || now) : call.answeredAt, endedAt: ["declined", "completed"].includes(next) ? now : call.endedAt, updatedAt: now, metadata: JSON.stringify({ ...(JSON.parse(call.metadata || "{}")), lastCommand: parsed.data.command, digits: parsed.data.command === "dtmf" ? parsed.data.digits : undefined }) }).where(eq(voiceCalls.id, call.id)).returning())[0];
    const payload = await enrich(updated); adminVoiceWebSocket.notify({ type: "voice.call", eventType: `client.${parsed.data.command}`, call: payload });
    res.json({ accepted: true, call: payload }); // client performs the WebRTC command
  });
  app.post("/api/admin/voice/calls/:id/transfer", async (req, res) => {
    if (!admin(req, res)) return;
    const body = z.object({ adminId: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "adminId is required" });
    const call = (await db.select().from(voiceCalls).where(eq(voiceCalls.id, req.params.id)).limit(1))[0];
    const target = (await db.select().from(adminVoiceProfiles).where(and(eq(adminVoiceProfiles.userId, body.data.adminId), eq(adminVoiceProfiles.enabled, true))).limit(1))[0];
    if (!call || !target) return res.status(404).json({ error: "Call or target admin not found" });
    if (call.adminId !== (req as any).user.id) return res.status(403).json({ error: "Call is not assigned to this admin" });
    if (!target.telnyxSipUsername || !call.telnyxCallControlId) return res.status(409).json({ error: "Target is not voice-ready" });
    const header = req.header("Idempotency-Key");
    const requestId = header && /^[A-Za-z0-9._:-]{1,128}$/.test(header) ? header : undefined;
    const creation = await db.transaction(async (tx) => {
      // Serialize the complete active-transfer check/create operation. The lock
      // is transaction-scoped, deterministic per parent call, and releases
      // before the provider dial so a stalled Telnyx request never holds it.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${transferAdvisoryLockKey(call.id)}))`);
      let existing = requestId ? (await tx.select().from(voiceTransfers).where(eq(voiceTransfers.requestId, requestId)).limit(1))[0] : undefined;
      if (existing && (existing.callId !== call.id || existing.initiatedByAdminId !== (req as any).user.id || existing.targetAdminId !== body.data.adminId)) return { conflict: true as const, transfer: existing };
      // A parent may have only one in-flight transfer. This covers duplicate
      // no-key submissions as well as concurrent submissions with distinct keys.
      if (!existing) existing = (await tx.select().from(voiceTransfers).where(and(eq(voiceTransfers.callId, call.id), inArray(voiceTransfers.status, ["requested", "dialing", "initiated", "ringing", "answered"]))).limit(1))[0];
      if (existing) return { conflict: false as const, transfer: existing };
      const inserted = await tx.insert(voiceTransfers).values({
        callId: call.id, initiatedByAdminId: (req as any).user.id, targetAdminId: body.data.adminId,
        status: "requested", requestId, telnyxCommandId: undefined,
      }).onConflictDoNothing().returning();
      existing = inserted[0] || (requestId ? (await tx.select().from(voiceTransfers).where(eq(voiceTransfers.requestId, requestId)).limit(1))[0] : undefined);
      return { conflict: false as const, transfer: existing };
    });
    if (creation.conflict) {
      return res.status(409).json({ error: "Idempotency key is already bound to a different transfer" });
    }
    let transfer = creation.transfer;
    if (!transfer) return res.status(409).json({ error: "Transfer request is already being created" });
    // Provider activity deliberately starts after the advisory-lock transaction
    // commits; retries use the command persisted by resumeTransferDial.
    await resumeTransferDial(transfer);
    transfer = (await db.select().from(voiceTransfers).where(eq(voiceTransfers.id, transfer.id)).limit(1))[0];
    adminVoiceWebSocket.notify({ type: "voice.transfer", call: await enrich(call), transfer });
    res.status(202).json({ transfer, call: await enrich(call) });
  });
  app.get("/api/admin/voice/calls", async (req, res) => {
    if (!admin(req, res)) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200), conditions = [];
    if (typeof req.query.direction === "string" && ["inbound", "outbound"].includes(req.query.direction)) conditions.push(eq(voiceCalls.direction, req.query.direction));
    if (typeof req.query.outcome === "string") conditions.push(eq(voiceCalls.status, req.query.outcome));
    if (typeof req.query.search === "string" && req.query.search.length <= 100) conditions.push(or(ilike(voiceCalls.fromNumber, `%${req.query.search}%`), ilike(voiceCalls.toNumber, `%${req.query.search}%`)));
    const rows = await db.select().from(voiceCalls).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(voiceCalls.createdAt)).limit(limit);
    res.json(await Promise.all(rows.map(enrich)));
  });
  app.get("/api/admin/voice/calls/missed-today", async (req, res) => {
    if (!admin(req, res)) return;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const rows = await db.select({ id: voiceCalls.id }).from(voiceCalls)
      .where(and(eq(voiceCalls.status, "missed"), gte(voiceCalls.missedAt, start)));
    res.json({ count: rows.length });
  });
  app.get("/api/admin/voice/calls/:id", async (req, res) => {
    if (!admin(req, res)) return;
    const call = (await db.select().from(voiceCalls).where(eq(voiceCalls.id, req.params.id)).limit(1))[0];
    if (!call) return res.status(404).json({ error: "Call not found" });
    const transfers = await db.select().from(voiceTransfers).where(eq(voiceTransfers.callId, call.id));
    res.json({ ...(await enrich(call)), transfers });
  });
  app.get("/api/admin/voice/recordings/:id", async (req, res) => {
    if (!admin(req, res)) return;
    const media = (await db.select().from(voiceMedia).where(eq(voiceMedia.id, req.params.id)).limit(1))[0];
    if (!media || !["recording", "voicemail"].includes(media.kind)) return res.status(404).json({ error: "Recording not found" });
    if (!process.env.TELNYX_API_KEY) return res.status(404).json({ error: "Recording is not available" });
    try {
      let bytes: Buffer;
      let contentType = media.contentType || "audio/mpeg";
      if (media.privateObjectKey) {
        const internalUrl = await objectStorage.getSignedDownloadUrl(media.privateObjectKey, 120);
        ({ bytes, contentType } = await downloadRecording(internalUrl));
      } else {
        let providerUrl: string | undefined;
        if (media.telnyxRecordingId && !media.telnyxRecordingId.startsWith("event:")) {
        const recording = await circuitBreakers.telnyx.execute(() => sdk().recordings.retrieve(media.telnyxRecordingId!));
          providerUrl = recording.data?.download_urls?.mp3 || recording.data?.download_urls?.wav;
        }
        providerUrl ||= media.storageUrl || undefined;
        if (!providerUrl) return res.status(404).json({ error: "Recording is pending storage retry" });
        ({ bytes, contentType } = await downloadRecording(providerUrl));
        // Backfill is attempted before returning, but a storage outage does not
        // prevent this authenticated same-origin playback response.
        await archiveRecording(media.id, media.callId, media.telnyxRecordingId || media.id, providerUrl);
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", bytes.length);
      res.setHeader("Cache-Control", "private, no-store");
      res.end(bytes);
    } catch (error) { logger.error({ err: error, mediaId: media.id }, "Recording retrieval failed"); res.status(502).json({ error: "Unable to retrieve recording" }); }
  });
  // Previous names retained for deployed clients.
  app.get("/api/admin/voice/media/:id", (req, res) => res.redirect(307, `/api/admin/voice/recordings/${encodeURIComponent(req.params.id)}`));
  app.post("/api/admin/voice/websocket-token", (req, res) => res.redirect(307, "/api/admin/voice/ws-token"));

  app.post("/api/telnyx/voice-webhook", async (req, res) => {
    // express.raw runs for this path (server/index.ts) so req.body is a Buffer
    // holding the exact signed bytes. JSON.stringify fallback preserves the
    // legacy path in case that middleware ordering ever changes.
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
    if (!process.env.TELNYX_PUBLIC_KEY) return res.status(503).json({ error: "Webhook verification is not configured" });
    // TEMP: TELNYX_SKIP_VERIFY=true bypasses signature verification while we
    // diagnose the ed25519 payload mismatch end-to-end. Remove once resolved.
    if (process.env.TELNYX_SKIP_VERIFY !== "true") {
      try { new TelnyxWebhook(process.env.TELNYX_PUBLIC_KEY).verify(raw, req.headers as unknown as Record<string, string>); } catch (err) {
        console.log("[webhook] verify failed:", err instanceof Error ? err.message : String(err));
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }
    const event: any = Buffer.isBuffer(req.body) ? JSON.parse(raw) : req.body;
    const eventId = event.data?.id || event.id, eventType = event.data?.event_type || event.event_type;
    if (!eventId || !eventType) return res.status(400).json({ error: "Malformed Telnyx event" });
    const inserted = await db.insert(voiceWebhookEvents).values({ telnyxEventId: eventId, eventType, payload: raw, status: "pending", nextAttemptAt: new Date() }).onConflictDoNothing().returning();
    const existing = inserted[0] || (await db.select().from(voiceWebhookEvents).where(eq(voiceWebhookEvents.telnyxEventId, eventId)).limit(1))[0];
    if (existing.status === "processed") return res.json({ received: true, duplicate: true, processed: true });
    const claimed = await claimWebhookEvent(existing.id);
    if (!claimed) return res.status(202).json({ received: true, queued: true });
    try {
      await processVoiceWebhookEvent(claimed, event);
      return res.json({ received: true, processed: true });
    } catch (error) {
      await queueWebhookRetry(claimed, error);
      return res.status(202).json({ received: true, queued: true });
    }
    /* The former delivery-only state machine is intentionally retained in
       source history below but disabled; processVoiceWebhookEvent above is the
       sole executable state machine for both delivery and retry.
    try {
      const p = event.data?.payload || {}, control = p.call_control_id, clientState = p.client_state;
      let clientStateData: any;
      try { clientStateData = clientState ? JSON.parse(Buffer.from(clientState, "base64").toString("utf8")) : undefined; } catch (_) {}
      if (clientStateData?.kind === "transfer" && eventType.includes("answered")) {
        const transfer = (await db.select().from(voiceTransfers).where(eq(voiceTransfers.id, clientStateData.transferId)).limit(1))[0];
        if (transfer) {
          const parent = (await db.select().from(voiceCalls).where(eq(voiceCalls.id, transfer.callId)).limit(1))[0];
          try {
            if (!parent?.telnyxCallControlId || !control) throw new Error("Missing bridge call control id");
            await circuitBreakers.telnyx.execute(() => sdk().calls.actions.bridge(parent.telnyxCallControlId!, { call_control_id: control }));
            await db.update(voiceTransfers).set({ status: "completed", completedAt: new Date() }).where(eq(voiceTransfers.id, transfer.id));
          } catch (error) { await db.update(voiceTransfers).set({ status: "failed" }).where(eq(voiceTransfers.id, transfer.id)); logger.error({ err: error, transferId: transfer.id }, "Transfer bridge failed"); }
        }
        // A transfer leg is not a new customer call.
        await db.update(voiceWebhookEvents).set({ status: "processed", processedAt: new Date(), leaseUntil: null, lastError: null }).where(eq(voiceWebhookEvents.id, saved[0].id));
        return res.json({ received: true });
      }
      // Agent legs have their own control IDs. Claiming is conditional so simultaneous
      // answers cannot assign or bridge the inbound parent twice.
      // Resolve by both provider control ID and signed/decoded client_state before
      // considering parent-call creation. The first webhook often has only state.
      let attempt = (control || clientState)
        ? (await db.select().from(voiceCallAttempts).where(or(
          ...(control ? [eq(voiceCallAttempts.telnyxCallControlId, control)] : []),
          ...(clientState ? [eq(voiceCallAttempts.clientState, clientState)] : []),
        )).limit(1))[0]
        : undefined;
      if (attempt && (control || p.call_leg_id)) {
        await db.update(voiceCallAttempts).set({
          telnyxCallControlId: control ? sql`coalesce(${voiceCallAttempts.telnyxCallControlId}, ${control})` : attempt.telnyxCallControlId,
          telnyxCallLegId: p.call_leg_id ? sql`coalesce(${voiceCallAttempts.telnyxCallLegId}, ${p.call_leg_id})` : attempt.telnyxCallLegId,
        }).where(eq(voiceCallAttempts.id, attempt.id));
        attempt = (await db.select().from(voiceCallAttempts).where(eq(voiceCallAttempts.id, attempt.id)).limit(1))[0];
      }
      if (attempt) {
        if (eventType.includes("answered")) {
          const claimed = await db.update(voiceCalls).set({ adminId: attempt.adminId, status: "answered", answeredAt: new Date(), updatedAt: new Date() })
            .where(and(eq(voiceCalls.id, attempt.callId), isNull(voiceCalls.adminId), inArray(voiceCalls.status, ["initiated", "ringing"]))).returning();
          if (claimed[0]) {
            await db.update(voiceCallAttempts).set({ status: "answered", answeredAt: new Date() }).where(eq(voiceCallAttempts.id, attempt.id));
            await db.update(voiceCallAttempts).set({ status: "cancelled", endedAt: new Date() }).where(and(eq(voiceCallAttempts.callId, attempt.callId), sql`${voiceCallAttempts.id} <> ${attempt.id}`));
            try {
              if (claimed[0].telnyxCallControlId) await circuitBreakers.telnyx.execute(() => sdk().calls.actions.bridge(claimed[0].telnyxCallControlId!, { call_control_id: control! }));
              await requestCallRecording(claimed[0], "call.answered");
              const losers = await db.select().from(voiceCallAttempts).where(and(eq(voiceCallAttempts.callId, attempt.callId), eq(voiceCallAttempts.status, "cancelled")));
              await Promise.all(losers.filter((row) => row.telnyxCallControlId).map((row) => circuitBreakers.telnyx.execute(() => sdk().calls.actions.hangup(row.telnyxCallControlId!, {}))));
            } catch (error) { logger.error({ err: error, callId: attempt.callId }, "Inbound bridge cleanup failed"); }
            await db.update(voiceWebhookEvents).set({ callId: claimed[0].id, status: "processed", processedAt: new Date(), leaseUntil: null, lastError: null }).where(eq(voiceWebhookEvents.id, saved[0].id));
            adminVoiceWebSocket.notify({ type: "voice.call", eventType, call: await enrich(claimed[0]) });
          }
        } else if (eventType.includes("hangup")) await db.update(voiceCallAttempts).set({ status: "ended", endedAt: new Date() }).where(eq(voiceCallAttempts.id, attempt.id));
        await db.update(voiceWebhookEvents).set({ callId: attempt.callId, status: "processed", processedAt: new Date(), leaseUntil: null, lastError: null }).where(eq(voiceWebhookEvents.id, saved[0].id));
        return res.json({ received: true });
      }
      let call = control ? (await db.select().from(voiceCalls).where(eq(voiceCalls.telnyxCallControlId, control)).limit(1))[0] : undefined;
      if (!call && p.call_leg_id) call = (await db.select().from(voiceCalls).where(eq(voiceCalls.telnyxCallLegId, p.call_leg_id)).limit(1))[0];
      if (!call && clientState) {
        call = (await db.select().from(voiceCalls).where(eq(voiceCalls.clientState, clientState)).limit(1))[0];
      }
      const from = normalize(p.from || p.from_number) || call?.fromNumber || "unknown", to = normalize(p.to || p.to_number) || call?.toNumber || "unknown";
      if (!call) {
        const customer = from !== "unknown" ? (await db.select().from(users).where(sql`regexp_replace(${users.phone}, '[^0-9]', '', 'g') = ${from.replace(/\D/g, "")}`).limit(1))[0] : undefined;
        const booking = customer ? (await db.select().from(bookings).where(and(eq(bookings.customerId, customer.id), gte(bookings.preferredDate, new Date(Date.now() - 30 * 86400000)))).orderBy(desc(bookings.preferredDate)).limit(1))[0] : undefined;
        call = (await db.insert(voiceCalls).values({ telnyxCallControlId: control, telnyxCallLegId: p.call_leg_id, direction: p.direction === "outgoing" ? "outbound" : "inbound", status: state(eventType), fromNumber: from, toNumber: to, matchedUserId: customer?.id, bookingId: booking?.id, startedAt: new Date(), lastEventAt: new Date() }).returning())[0];
        if (eventType === "call.initiated" && call.direction === "inbound") await fanOutInbound(call);
      } else {
        const now = new Date(), duration = Number(p.duration_secs || p.duration_seconds || p.duration_millis / 1000);
        call = (await db.update(voiceCalls).set({ telnyxCallControlId: control || call.telnyxCallControlId, telnyxCallLegId: p.call_leg_id || call.telnyxCallLegId, status: state(eventType), fromNumber: from, toNumber: to, lastEventAt: now, answeredAt: eventType.includes("answered") ? (call.answeredAt || now) : call.answeredAt, endedAt: eventType.includes("hangup") || eventType.includes("ended") ? now : call.endedAt, durationSeconds: Number.isFinite(duration) ? Math.round(duration) : call.durationSeconds, updatedAt: now }).where(eq(voiceCalls.id, call.id)).returning())[0];
      }
      if (eventType === "call.recording.saved") {
        const providerMediaKey = p.recording_id || p.id || `event:${crypto.createHash("sha256").update(`${eventId}:${p.call_leg_id || ""}:${p.call_control_id || ""}`).digest("hex")}`;
        const providerUrl = p.recording_urls?.mp3 || p.download_urls?.mp3 || p.recording_url || null;
        const insertedMedia = await db.insert(voiceMedia).values({ callId: call.id, kind: call.status === "voicemail" || clientStateData?.kind === "voicemail" ? "voicemail" : "recording", telnyxRecordingId: providerMediaKey, storageUrl: providerUrl, storageStatus: "pending", durationSeconds: Number.isFinite(Number(p.duration_millis)) ? Math.round(Number(p.duration_millis) / 1000) : null, availableAt: new Date() }).onConflictDoNothing().returning();
        const media = insertedMedia[0] || (await db.select().from(voiceMedia).where(eq(voiceMedia.telnyxRecordingId, providerMediaKey)).limit(1))[0];
        if (media && providerUrl && !media.privateObjectKey) await archiveRecording(media.id, call.id, providerMediaKey, providerUrl);
        else if (media && !providerUrl) await db.update(voiceMedia).set({ storageStatus: "retry" }).where(eq(voiceMedia.id, media.id));
      }
      if (eventType.includes("transcription") && p.transcription) {
        const media = (await db.select().from(voiceMedia).where(eq(voiceMedia.callId, call.id)).orderBy(desc(voiceMedia.createdAt)).limit(1))[0];
        if (media) await db.update(voiceMedia).set({ transcription: String(p.transcription) }).where(eq(voiceMedia.id, media.id));
      }
      // Outbound WebRTC calls arrive here correlated by client_state. Request
      // recording only after Telnyx has assigned the authoritative control ID.
      await requestCallRecording(call, eventType);
      await db.update(voiceWebhookEvents).set({ callId: call.id, status: "processed", processedAt: new Date(), leaseUntil: null, lastError: null }).where(eq(voiceWebhookEvents.id, saved[0].id));
      adminVoiceWebSocket.notify({ type: "voice.call", eventType, call: await enrich(call) });
      res.json({ received: true });
    } catch (error) { await queueWebhookRetry(saved[0], error); res.status(202).json({ received: true, queued: true }); }
    */
  });
}