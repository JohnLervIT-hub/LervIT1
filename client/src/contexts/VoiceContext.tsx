import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

export type VoiceStatus = "available" | "unavailable";
export type VoiceCall = {
  appCallId: string; id: string; direction?: string; status?: string; from?: string; to?: string; fromNumber?: string; toNumber?: string;
  telnyxCallControlId?: string; telnyxCallLegId?: string; clientState?: string; customer?: { name?: string; phone?: string };
  booking?: { id?: string; pickupAddress?: string; dropoffAddress?: string }; startedAt?: string; recordingEnabled?: boolean;
  recordingId?: string; duration?: number; durationSeconds?: number; voicemail?: boolean; media?: Array<{ id?: string; url?: string; type?: string }>;
};
type VoiceConfig = { enabled: boolean; callerId?: string; recordingEnabled?: boolean; fallbackEnabled?: boolean; reason?: string };
type Admin = { id: string; name?: string; email?: string; status?: string };
type VoiceContextValue = { config: VoiceConfig; status: VoiceStatus; call: VoiceCall | null; isReady: boolean; isMuted: boolean; isHeld: boolean; elapsed: number; error: string | null; transferPending: boolean; admins: Admin[]; missedUnread: number;
  setStatus: (status: VoiceStatus) => Promise<void>; dial: (to: string, bookingId?: string) => Promise<void>; command: (command: string, digits?: string) => Promise<void>; transfer: (adminId: string) => Promise<void>; clearCall: () => void; requestDevices: () => Promise<void>; resetMissed: () => void; };
const VoiceContext = createContext<VoiceContextValue | null>(null);
const canonicalId = (raw: any) => raw?.appCallId || raw?.callRecordId || raw?.id || raw?.callId || "";
const decodeClientState = (value?: unknown) => { if (typeof value !== "string" || !value) return null; try { const parsed = JSON.parse(atob(value)); return (parsed?.kind === "inbound" || parsed?.kind === "transfer") && typeof parsed.callId === "string" && parsed.callId.trim() ? parsed : null; } catch { return null; } };
export const resolveVoiceSdkMethod = (command: string) => command === "mute" ? "muteAudio" : command === "unmute" ? "unmuteAudio" : command === "resume" ? "unhold" : command === "decline" ? "hangup" : command;
const normalize = (raw: any, appCallId?: string): VoiceCall => {
  const c = raw?.callRecord || raw?.call || raw || {}; const state = String(c.status || c.state || c.callState || "").toLowerCase();
  const id = appCallId || canonicalId(c); return { ...c, appCallId: id, id, status: state === "new" || state === "incoming" ? "ringing" : state, from: c.from || c.fromNumber || c.callerNumber, to: c.to || c.toNumber || c.destinationNumber, duration: c.duration ?? c.durationSeconds };
};
const matches = (a: VoiceCall, b: any) => [a.telnyxCallControlId, a.telnyxCallLegId, a.clientState].filter(Boolean).some(id => [b?.telnyxCallControlId, b?.telnyxCallLegId, b?.clientState, b?.call_control_id, b?.call_leg_id, b?.client_state].includes(id));

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth(); const qc = useQueryClient(); const isAdmin = user?.role === "admin";
  const { data: fetchedConfig } = useQuery<VoiceConfig>({ queryKey: ["/api/admin/voice/config"], enabled: isAdmin, retry: false }); const config = fetchedConfig || { enabled: false };
  const { data: presence } = useQuery<{ status: VoiceStatus }>({ queryKey: ["/api/admin/voice/presence"], enabled: isAdmin && config.enabled, refetchInterval: 30000 });
  const { data: admins = [] } = useQuery<Admin[]>({ queryKey: ["/api/admin/voice/available-admins"], enabled: isAdmin && config.enabled });
  const [status, setStatusState] = useState<VoiceStatus>("unavailable"); const [call, setCall] = useState<VoiceCall | null>(null); const [isReady, setReady] = useState(false); const [isMuted, setMuted] = useState(false); const [isHeld, setHeld] = useState(false); const [elapsed, setElapsed] = useState(0); const [error, setError] = useState<string | null>(null); const [transferPending, setTransferPending] = useState(false); const [missedUnread, setMissedUnread] = useState(0);
  const resetMissed = useCallback(() => setMissedUnread(0), []);
  const sdkRef = useRef<any>(null); const sdkCallRef = useRef<any>(null); const callIdRef = useRef<string | null>(null); const wsRef = useRef<Socket | null>(null); const wsConnectingRef = useRef(false); const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const startedRef = useRef<number | null>(null); const dialingRef = useRef(false); const dialKeyRef = useRef<string | null>(null);
  useEffect(() => { if (presence?.status) setStatusState(presence.status); }, [presence?.status]);
  useEffect(() => { if (!call) return; const started = startedRef.current || (call.startedAt ? new Date(call.startedAt).getTime() : Date.now()); const tick = () => setElapsed(Math.floor((Date.now() - started) / 1000)); tick(); const t = window.setInterval(tick, 1000); return () => window.clearInterval(t); }, [call?.appCallId, call?.startedAt]);
  const clearCall = useCallback(() => { sdkCallRef.current = null; callIdRef.current = null; setCall(null); setElapsed(0); startedRef.current = null; setMuted(false); setHeld(false); }, []);
  const cancelPrepared = useCallback(async (appCallId?: string) => { if (!appCallId) return; try { await apiRequest("POST", `/api/admin/voice/calls/${appCallId}/cancel-prepare`); } catch { /* cancellation is best effort */ } }, []);
  const clearActiveOnServer = useCallback(async () => { try { await apiRequest("POST", "/api/admin/voice/calls/clear-active"); } catch { /* best effort — unblocks the next prepare */ } }, []);
  const requestDevices = useCallback(async () => { if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is not supported."); const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(t => t.stop()); }, []);
  const setStatus = useCallback(async (next: VoiceStatus) => { if (next === "available") { try { await requestDevices(); } catch { setError("Microphone permission is needed to become Available."); return; } } try { await apiRequest("PATCH", "/api/admin/voice/presence", { status: next }); setStatusState(next); setError(null); qc.invalidateQueries({ queryKey: ["/api/admin/voice/presence"] }); } catch { setError("Presence could not be updated."); } }, [qc, requestDevices]);
  const bindSdkCall = useCallback((sdk: any, context: any, appCallId?: string) => { const decoded = [context?.clientState, context?.client_state, sdk?.clientState, sdk?.client_state, sdk?.options?.clientState, sdk?.options?.client_state, context?.data?.clientState, context?.data?.client_state].map(decodeClientState).find(Boolean); const decodedId = decoded && (decoded.kind !== "inbound" || !decoded.adminId || decoded.adminId === user?.id) ? decoded.callId : ""; const id = appCallId || decodedId || canonicalId(context); callIdRef.current = id || null; sdkCallRef.current = sdk; const initial = normalize(context, id); setCall({ ...initial, status: initial.status || "ringing" }); startedRef.current = Date.now(); sdk?.on?.("telnyx.callUpdate", (event: any) => { const next = normalize(event, id); if (["ended", "hangup", "destroyed", "terminated", "error", "failed"].includes(next.status || "")) { clearCall(); if (id) void cancelPrepared(id); void clearActiveOnServer(); } else setCall(old => old ? { ...old, ...next, appCallId: id || old.appCallId, id: id || old.id } : { ...next, appCallId: id, id }); }); }, [clearCall, cancelPrepared, clearActiveOnServer, user?.id]);
  useEffect(() => {
    if (!isAdmin || !config.enabled || status !== "available") { sdkRef.current?.disconnect?.(); sdkRef.current = null; setReady(false); return; } let cancelled = false;
    (async () => { try { const { sipUsername, sipPassword } = await (await apiRequest("POST", "/api/admin/voice/token")).json(); if (cancelled || !sipUsername || !sipPassword) return; const mod: any = await import("@telnyx/webrtc"); const client = new mod.TelnyxRTC({ login: sipUsername, password: sipPassword }); client.remoteElement = "lervit-voice-audio"; client.on?.("telnyx.ready", () => { setReady(true); setError(null); }); client.on?.("telnyx.error", () => setError("Voice connection needs attention.")); client.on?.("telnyx.notification", (n: any) => { const sdk = n?.call || n?.data?.call; if (sdk) bindSdkCall(sdk, { ...n, ...(n?.data || {}), sdkOptions: sdk?.options }); }); client.connect(); sdkRef.current = client; } catch { if (!cancelled) setError("Microphone connection unavailable. Check browser permissions."); } })();
    return () => { cancelled = true; sdkRef.current?.disconnect?.(); sdkRef.current = null; };
  }, [isAdmin, config.enabled, status, bindSdkCall]);
  const connectWs = useCallback(async () => {
    if (!isAdmin || !config.enabled) return;
    if (wsConnectingRef.current) return;
    if (wsRef.current?.connected) return;
    wsConnectingRef.current = true;
    try {
      const auth = await (await apiRequest("GET", "/api/admin/voice/ws-token")).json();
      if (!auth?.token) throw new Error("no token");
      const socket = io("/admin-voice", { auth: { token: auth.token }, transports: ["polling", "websocket"], reconnection: true, reconnectionDelayMax: 30000, withCredentials: true });
      wsRef.current = socket;
      socket.on("connect", () => setError(null));
      socket.on("message", (d: any) => {
        if (d?.type === "missed_call" && d?.call) {
          setMissedUnread(n => n + 1);
          qc.invalidateQueries({ queryKey: ["/api/admin/voice/calls/missed-today"] });
          qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/admin/voice/calls") });
          const callId = d.call.id || d.call.appCallId;
          const label = d.call.customer?.name || d.call.from || d.call.fromNumber || "Unknown caller";
          toast({
            title: "Missed call",
            description: `From ${label}`,
            duration: Infinity,
            action: callId ? (
              <ToastAction altText="Open call" onClick={() => { window.location.assign(`/admin/voice?callId=${encodeURIComponent(callId)}`); }}>Open</ToastAction>
            ) : undefined,
          });
          return;
        }
        if (d?.call) setCall(old => {
          if (!old || matches(old, d.call)) {
            const id = old?.appCallId || canonicalId(d.call);
            const next = normalize(d.call, id);
            if (["ended", "hangup", "terminated"].includes(next.status || "")) { clearCall(); void clearActiveOnServer(); return null; }
            return { ...old, ...next, appCallId: id, id };
          }
          return old;
        });
      });
      socket.on("connect_error", () => setError("Live call updates are reconnecting."));
    } catch {
      reconnectTimer.current = setTimeout(connectWs, 5000);
    } finally {
      wsConnectingRef.current = false;
    }
  }, [isAdmin, config.enabled, clearCall, clearActiveOnServer, qc]);
  useEffect(() => { connectWs(); return () => { if (reconnectTimer.current) clearTimeout(reconnectTimer.current); wsRef.current?.disconnect(); wsRef.current = null; }; }, [connectWs]);
  const dial = useCallback(async (to: string, bookingId?: string) => { if (dialingRef.current || call || !config.enabled || status !== "available") { if (!call) setError("Set your status to Available before calling."); return; } dialingRef.current = true; const idempotencyKey = dialKeyRef.current || (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`); dialKeyRef.current = idempotencyKey; let preparedId = ""; try { const metadata = await (await apiRequest("POST", "/api/admin/voice/calls/prepare", { to, bookingId, idempotencyKey })).json(); preparedId = metadata?.call?.id || ""; if (!preparedId) throw new Error("prepare response did not include a call id"); const prepared = metadata.call; if (prepared.status === "active" || prepared.status === "connected") { setCall(normalize(prepared, preparedId)); startedRef.current = new Date(prepared.startedAt || Date.now()).getTime(); setError(null); dialKeyRef.current = null; return; } const sdk = sdkRef.current?.newCall?.({ destinationNumber: to, clientState: metadata.clientState }); if (!sdk) throw new Error("SDK unavailable"); bindSdkCall(sdk, { ...prepared, clientState: metadata.clientState, direction: "outbound", to }, preparedId); setError(null); dialKeyRef.current = null; } catch { if (preparedId) await cancelPrepared(preparedId); void clearActiveOnServer(); clearCall(); dialKeyRef.current = null; setError("Call could not be started."); } finally { dialingRef.current = false; } }, [call, config.enabled, status, bindSdkCall, cancelPrepared, clearCall, clearActiveOnServer]);
   const command = useCallback(async (name: string, digits?: string) => { const sdk = sdkCallRef.current; if (!call || !sdk || !call.appCallId || call.appCallId.startsWith("pending-")) { setError("Call context is still syncing."); return; } try { const method = resolveVoiceSdkMethod(name); if (name === "hold" && typeof sdk.toggleHold === "function") await sdk.toggleHold(); else if (typeof sdk[method] === "function") await sdk[method](...(name === "dtmf" ? [digits] : [])); else throw new Error("Unsupported call command"); if (name === "mute" || name === "unmute") setMuted(name === "mute"); if (name === "hold" || name === "resume") setHeld(name === "hold"); if (["hangup", "decline"].includes(name)) { clearCall(); void clearActiveOnServer(); } setError(null); } catch { setError(`Could not ${name} this call.`); return; } try { await apiRequest("POST", `/api/admin/voice/calls/${call.appCallId}/commands`, { command: name, ...(digits ? { digits } : {}) }); } catch { /* local SDK state remains authoritative */ } }, [call, clearCall, clearActiveOnServer]);
   const transfer = useCallback(async (adminId: string) => { if (!call || !adminId || !call.appCallId || call.appCallId.startsWith("pending-")) { setError("Call context is still syncing."); return; } setTransferPending(true); try { if (typeof sdkCallRef.current?.transfer === "function") await sdkCallRef.current.transfer(adminId); await apiRequest("POST", `/api/admin/voice/calls/${call.appCallId}/transfer`, { adminId }); setError(null); } catch { setError("Transfer could not be completed."); } finally { setTransferPending(false); } }, [call]);
  const value = useMemo(() => ({ config, status, call, isReady, isMuted, isHeld, elapsed, error, transferPending, admins, missedUnread, setStatus, dial, command, transfer, clearCall, requestDevices, resetMissed }), [config, status, call, isReady, isMuted, isHeld, elapsed, error, transferPending, admins, missedUnread, setStatus, dial, command, transfer, clearCall, requestDevices, resetMissed]);
  return <VoiceContext.Provider value={value}><audio id="lervit-voice-audio" autoPlay /><>{children}</></VoiceContext.Provider>;
}
export function useVoice() { const value = useContext(VoiceContext); if (!value) throw new Error("useVoice must be used within VoiceProvider"); return value; }