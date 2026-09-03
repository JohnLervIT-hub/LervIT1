import { useEffect, useState } from "react";
import { PhoneCall, PhoneOff, Mic, MicOff, Pause, Play, Settings2, Radio, AlertTriangle, UserRound, X, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useVoice } from "@/contexts/VoiceContext";
import { Link } from "wouter";

const fmt = (n: number) => `${Math.floor(n / 60).toString().padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;

export default function AdminVoiceWidget() {
  const v = useVoice();
  const [minimized, setMinimized] = useState(true);
  const [number, setNumber] = useState("");
  const [digits, setDigits] = useState("");
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [transferId, setTransferId] = useState("");

  const activeCall = v.call;
  const callStatus = activeCall?.status;
  const active = !!activeCall && (callStatus === "active" || callStatus === "ringing" || callStatus === "connected");

  useEffect(() => { if (active) setMinimized(false); }, [active]);

  if (!v.config) return null;
  if (!v.config.enabled) return setupDismissed
    ? <button onClick={() => setSetupDismissed(false)} className="fixed bottom-4 right-4 z-[4000] rounded-full bg-card border shadow-xl p-3 text-amber-700" aria-label="Show voice setup status"><Settings2 className="h-4 w-4" /></button>
    : <div className="fixed bottom-4 right-4 z-[4000] max-w-xs rounded-xl border bg-card p-3 shadow-xl text-xs text-muted-foreground"><div className="flex items-start gap-2"><Settings2 className="h-4 w-4 text-amber-600 shrink-0" /><span>Voice setup required{v.config.reason ? `: ${v.config.reason}` : "."}</span><button onClick={() => setSetupDismissed(true)} aria-label="Dismiss voice setup message" className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button></div></div>;

  if (minimized && !active) {
    return (
      <button
        onClick={() => setMinimized(false)}
        aria-label="Expand LervIT voice"
        className="fixed bottom-4 right-4 z-[4000] flex items-center justify-center gap-2 rounded-full shadow-2xl voice-shell text-slate-100 px-4 transition-all hover:scale-105"
        style={{ width: 120, height: 40 }}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${v.status === "available" ? "bg-teal-300 voice-pulse" : "bg-slate-500"}`} />
        <span className="text-sm font-semibold">Voice</span>
      </button>
    );
  }

  return <div className={`fixed bottom-4 right-4 z-[4000] w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border shadow-2xl voice-shell text-slate-100 transition-all ${active ? "ring-2 ring-teal-300/40" : ""}`}>
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-rose-400 voice-pulse" : v.status === "available" ? "bg-teal-300 voice-pulse" : "bg-slate-500"}`} />
        <span className="text-sm font-semibold">LervIT voice</span>
        <span className="text-[11px] text-slate-300 truncate">{active ? "On call" : v.status === "available" ? "Available" : "Unavailable"}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href="/admin/voice" className="text-slate-300 hover:text-white" aria-label="Open voice console"><Radio className="h-4 w-4" /></Link>
        {!active && <button onClick={() => setMinimized(true)} aria-label="Minimize voice" className="text-slate-300 hover:text-white"><X className="h-4 w-4" /></button>}
      </div>
    </div>
    {v.error && <div className="px-4 py-2 bg-amber-500/15 text-amber-100 text-xs flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{v.error}</div>}
    {active ? <div className="p-4"><div className="flex items-center gap-3"><div className="h-11 w-11 rounded-full bg-teal-300/20 flex items-center justify-center"><UserRound className="h-5 w-5 text-teal-200" /></div><div className="min-w-0 flex-1"><p className="font-semibold truncate">{activeCall.customer?.name || activeCall.from || activeCall.to || "Unknown caller"}</p><p className="text-xs text-slate-300">{activeCall.direction === "outbound" ? "Outbound call" : "Incoming call"} · <span className="font-mono">{fmt(v.elapsed)}</span></p></div><Badge className="bg-rose-400/20 text-rose-100 border-0">{activeCall.recordingEnabled ? "REC" : "LIVE"}</Badge></div>{activeCall.status === "ringing" && <div className="grid grid-cols-2 gap-2 mt-4"><Button onClick={() => v.command("answer")} className="bg-teal-400 text-slate-950 hover:bg-teal-300"><PhoneCall className="h-4 w-4 mr-2" />Answer</Button><Button onClick={() => v.command("decline")} className="bg-rose-500 hover:bg-rose-600"><PhoneOff className="h-4 w-4 mr-2" />Decline</Button></div>}<div className="grid grid-cols-4 gap-2 mt-4"><Button size="icon" variant="ghost" onClick={() => v.command(v.isMuted ? "unmute" : "mute")} className="text-slate-100 hover:bg-white/10">{v.isMuted ? <MicOff /> : <Mic />}</Button><Button size="icon" variant="ghost" onClick={() => v.command(v.isHeld ? "resume" : "hold")} className="text-slate-100 hover:bg-white/10">{v.isHeld ? <Play /> : <Pause />}</Button><Button size="icon" variant="ghost" onClick={() => setDigits(digits ? "" : "keypad")} className="text-slate-100 hover:bg-white/10"><Settings2 /></Button><Button size="icon" onClick={() => v.command("hangup")} className="bg-rose-500 hover:bg-rose-600"><PhoneOff /></Button></div>{v.admins.length > 0 && <div className="flex gap-2 mt-3"><select value={transferId} onChange={e => setTransferId(e.target.value)} className="min-w-0 flex-1 rounded-md bg-white/10 border border-white/15 px-2 text-xs text-white"><option value="" className="text-slate-900">Transfer to…</option>{v.admins.map(a => <option key={a.id} value={a.id} className="text-slate-900">{a.name || a.email || a.id}</option>)}</select><Button size="icon" variant="ghost" disabled={!transferId} onClick={() => v.transfer(transferId)} className="text-slate-100 hover:bg-white/10"><ArrowRightLeft className="h-4 w-4" /></Button></div>}{digits === "keypad" && <div className="grid grid-cols-3 gap-1 mt-3">{["1","2","3","4","5","6","7","8","9","*","0","#"].map(d => <Button key={d} variant="ghost" className="text-slate-100 hover:bg-white/10" onClick={() => v.command("dtmf", d)}>{d}</Button>)}</div>}</div> : <div className="p-4"><div className="flex gap-2"><Input value={number} onChange={e => setNumber(e.target.value)} placeholder="Phone number" className="bg-white/10 border-white/15 text-white placeholder:text-slate-400" onKeyDown={e => e.key === "Enter" && v.dial(number)} /><Button size="icon" onClick={() => v.dial(number)} disabled={!number || v.status !== "available"} className="bg-teal-400 text-slate-950 hover:bg-teal-300"><PhoneCall /></Button></div><div className="flex items-center justify-between mt-3 text-xs text-slate-300"><span>{v.isReady ? "Browser audio connected" : "Connecting audio…"}</span><button onClick={() => v.setStatus(v.status === "available" ? "unavailable" : "available")} className="text-teal-200 font-medium">{v.status === "available" ? "Go unavailable" : "Become available"}</button></div></div>}
  </div>;
}
