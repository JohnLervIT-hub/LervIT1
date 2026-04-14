export function PhasedOrchestration() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-white p-10 font-['Inter']">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-3 bg-[#1c2333] border border-[#30363d] rounded-full px-6 py-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm text-slate-400 font-medium tracking-wide uppercase">LervIT · Agentic Orchestration</span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-tight mb-2">Phase-Gated Architecture</h1>
        <p className="text-slate-400 text-base">Build the right agents at the right scale — no premature complexity</p>
      </div>

      {/* Scale Legend */}
      <div className="flex justify-center gap-4 mb-10">
        {[
          { phase: "Phase 1", gmv: "$0 – $25K GMV", color: "emerald", status: "Build Now" },
          { phase: "Phase 2", gmv: "$25K – $100K GMV", color: "blue", status: "Next" },
          { phase: "Phase 3", gmv: "$100K+ GMV", color: "violet", status: "Future" },
        ].map(({ phase, gmv, color, status }) => (
          <div key={phase} className={`flex items-center gap-3 px-5 py-3 rounded-xl border ${
            color === "emerald" ? "bg-emerald-500/10 border-emerald-500/30" :
            color === "blue" ? "bg-blue-500/10 border-blue-500/30" :
            "bg-violet-500/10 border-violet-500/30"
          }`}>
            <div className={`w-3 h-3 rounded-full ${
              color === "emerald" ? "bg-emerald-400" :
              color === "blue" ? "bg-blue-400" : "bg-violet-400"
            }`} />
            <div>
              <div className={`text-xs font-bold uppercase tracking-wider ${
                color === "emerald" ? "text-emerald-400" :
                color === "blue" ? "text-blue-400" : "text-violet-400"
              }`}>{phase} · {status}</div>
              <div className="text-slate-300 text-sm font-medium">{gmv}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Architecture */}
      <div className="max-w-6xl mx-auto space-y-0">

        {/* ═══ PHASE 3 AGENTS (top — future) ═══ */}
        <PhaseSection
          color="violet"
          phase="Phase 3"
          gmv="$100K+ GMV"
          label="Full Agentic Intelligence"
          badge="Future"
          description="Complete Claude-orchestrated market intelligence. Unlocked when data volume makes demand signals statistically meaningful."
        >
          <div className="grid grid-cols-3 gap-4 mb-4">
            <AgentBox
              color="violet"
              icon="📡"
              title="Demand Intelligence Agent"
              desc="Detects Calgary market demand signals, seasonal patterns, competitor moves"
              gate="Requires 3+ cities or $100K GMV for data validity"
            />
            <AgentBox
              color="violet"
              icon="🎯"
              title="Offer Optimisation Agent"
              desc="Generates compelling listings, promotional hooks, and dynamic offers"
              gate="Requires A/B testing volume to be statistically significant"
            />
            <AgentBox
              color="violet"
              icon="🔭"
              title="Funnel Intelligence Agent"
              desc="Analyses lead funnel depth and competitor acquisition strategies"
              gate="Requires benchmark dataset from Phase 1 + 2 funnels"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <AgentBox
              color="violet"
              icon="🎙️"
              title="Voice Support Agent"
              desc="AI-driven voice handling for inbound customer and mover queries"
              gate="High operational cost — justify at scale only"
            />
            <AgentBox
              color="violet"
              icon="🤖"
              title="Claude Orchestration Service"
              desc="Coordinates all agents with shared memory, fallback circuit breakers, and cost guardrails"
              gate="Single-point-of-failure risk — needs circuit breaker before activation"
            />
          </div>
        </PhaseSection>

        <PhaseGate color="violet" label="Phase Gate 3 · $100K GMV" note="Validate demand signals are data-driven, not noise. Deploy Claude orchestrator with full fallback." />

        {/* ═══ PHASE 2 AGENTS ═══ */}
        <PhaseSection
          color="blue"
          phase="Phase 2"
          gmv="$25K – $100K GMV"
          label="Market Intelligence Layer"
          badge="Next"
          description="Activate once conversion data is proven. These agents compound learnings from Phase 1 retention + conversion signals."
        >
          <div className="grid grid-cols-3 gap-4 mb-4">
            <AgentBox
              color="blue"
              icon="💰"
              title="Pricing Intelligence Agent"
              desc="Augments existing 7-component model with historical win/loss data and competitor rate analysis"
              gate="Needs 200+ completed bookings to train on"
            />
            <AgentBox
              color="blue"
              icon="🚛"
              title="Supply Agent (Full Spec)"
              desc="Mover scoring, availability prediction, incentive triggering, onboarding nudges, fill-rate optimisation"
              gate="Most critical agent — needs dedicated sub-architecture, not a single box"
            />
            <AgentBox
              color="blue"
              icon="🔄"
              title="Sales + Quote Agent"
              desc="Tracks leads across sessions, creates bookings proactively, manages scheduling conflicts"
              gate="Activates once Conversion Agent has 30-day baseline data"
            />
          </div>
          {/* Feedback Loop Banner */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex items-center gap-3">
            <div className="text-blue-400 text-lg">↩</div>
            <div>
              <span className="text-blue-300 text-sm font-semibold">Feedback Loop Added: </span>
              <span className="text-slate-400 text-sm">Post-job review scores + move duration data feed back into Pricing Intelligence Agent. Phase 2 closes the loop missing from original design.</span>
            </div>
          </div>
        </PhaseSection>

        <PhaseGate color="blue" label="Phase Gate 2 · $25K GMV" note="Prove fill rate + acceptance rate. Supply Agent must be fully specced before Phase 2 launches." />

        {/* ═══ PHASE 1 AGENTS (active) ═══ */}
        <PhaseSection
          color="emerald"
          phase="Phase 1"
          gmv="$0 – $25K GMV"
          label="Conversion + Retention Layer"
          badge="Build Now"
          description="Highest ROI per dollar spent. Directly addresses the proven analytics gap: quote-to-booking drop-off and low-frequency retention."
          active
        >
          <div className="grid grid-cols-2 gap-4">
            <AgentBox
              color="emerald"
              icon="⚡"
              title="Conversion Agent"
              desc="Detects quote abandonment. Sends personalised nudges (email + SMS) with social proof, urgency signals, and the LERVIT20 promo trigger. Maps to proven analytics gap."
              highlight="Directly unlocks revenue from existing traffic"
            />
            <AgentBox
              color="emerald"
              icon="🔁"
              title="Post-Job Retention Loop"
              desc="Fires after every completed move: requests Google review, triggers referral code, re-engages customer 6 months later with seasonal reminder. Solves the 1–2x/year frequency problem."
              highlight="Turns one-time movers into recurring revenue + referrals"
            />
          </div>
        </PhaseSection>

        {/* ═══ API WRAPPER ═══ */}
        <div className="relative">
          <div className="h-6 flex items-center justify-center">
            <div className="w-px h-full bg-slate-700" />
          </div>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">API Wrapper Layer · Stable Across All Phases</div>
            <div className="grid grid-cols-5 gap-2">
              {["Get Quote", "Create Booking", "Find Movers", "Send Notification", "Log Error"].map(api => (
                <div key={api} className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-center text-xs text-slate-400 font-mono">
                  {api}
                </div>
              ))}
            </div>
          </div>
          <div className="h-4 flex items-center justify-center">
            <div className="w-px h-full bg-slate-700" />
          </div>
        </div>

        {/* ═══ CORE BACKEND ═══ */}
        <div className="bg-gradient-to-r from-[#1c2b3a] to-[#1a2535] border border-blue-500/30 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-1">Core LervIT Backend · Source of Truth</div>
              <div className="text-slate-500 text-xs">Hosted on Replit · Production-grade · Never replaced by agents</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 text-xs font-medium">Live</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { icon: "💵", label: "Quote Engine", sub: "7-component dynamic pricing + AI predictor" },
              { icon: "📋", label: "Booking System", sub: "Multi-step flow + abandoned tracking" },
              { icon: "📍", label: "Mover Assignment", sub: "Proximity matching + GPS tracking" },
              { icon: "🔔", label: "Notifications", sub: "WebSocket + Email (Resend) + SMS (Telnyx)" },
            ].map(({ icon, label, sub }) => (
              <div key={label} className="bg-[#0d1117]/60 border border-blue-500/20 rounded-lg p-3">
                <div className="text-xl mb-1">{icon}</div>
                <div className="text-sm font-semibold text-white">{label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Data Feedback Banner */}
        <div className="mt-4 bg-[#1c2333] border border-[#30363d] rounded-xl p-4 flex items-start gap-4">
          <div className="text-2xl">⚠️</div>
          <div>
            <div className="text-sm font-bold text-amber-400 mb-1">Missing from Original Design — Add Before Phase 2</div>
            <div className="text-slate-400 text-sm leading-relaxed">
              A <span className="text-white font-medium">shared data layer</span> must sit between the API Wrapper and agents to store: agent decision history, conversation context, A/B test results, pricing experiments, and booking outcome signals. Without it, every Claude API call is stateless and agents cannot compound learnings across sessions.
            </div>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="text-center mt-10 text-slate-600 text-xs">
        LervIT · Phase-Gated Agentic Architecture · April 2026 · Do not build Phase 2 or 3 prematurely
      </div>
    </div>
  );
}

function PhaseSection({
  color, phase, gmv, label, badge, description, active, children
}: {
  color: "emerald" | "blue" | "violet";
  phase: string;
  gmv: string;
  label: string;
  badge: string;
  description: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  const colors = {
    emerald: {
      bg: "bg-emerald-500/5",
      border: "border-emerald-500/30",
      badgeBg: "bg-emerald-500/20",
      badgeText: "text-emerald-300",
      phaseText: "text-emerald-400",
      dot: "bg-emerald-400",
    },
    blue: {
      bg: "bg-blue-500/5",
      border: "border-blue-500/20",
      badgeBg: "bg-blue-500/20",
      badgeText: "text-blue-300",
      phaseText: "text-blue-400",
      dot: "bg-blue-400",
    },
    violet: {
      bg: "bg-violet-500/5",
      border: "border-violet-500/20",
      badgeBg: "bg-violet-500/20",
      badgeText: "text-violet-300",
      phaseText: "text-violet-400",
      dot: "bg-violet-400",
    },
  }[color];

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-6`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${colors.dot} ${active ? "animate-pulse" : ""}`} />
            <span className={`text-xs font-bold uppercase tracking-widest ${colors.phaseText}`}>{phase} · {gmv}</span>
          </div>
          <h2 className="text-xl font-bold text-white">{label}</h2>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">{description}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${colors.badgeBg} ${colors.badgeText}`}>
          {badge}
        </div>
      </div>
      {children}
    </div>
  );
}

function PhaseGate({ color, label, note }: { color: "emerald" | "blue" | "violet"; label: string; note: string }) {
  const lineColor = color === "emerald" ? "border-emerald-500/40" : color === "blue" ? "border-blue-500/40" : "border-violet-500/40";
  const textColor = color === "emerald" ? "text-emerald-400" : color === "blue" ? "text-blue-400" : "text-violet-400";
  const bgColor = color === "emerald" ? "bg-emerald-500/10 border-emerald-500/30" : color === "blue" ? "bg-blue-500/10 border-blue-500/30" : "bg-violet-500/10 border-violet-500/30";

  return (
    <div className="relative py-3 flex items-center gap-4">
      <div className={`flex-1 border-t border-dashed ${lineColor}`} />
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold whitespace-nowrap ${bgColor} ${textColor}`}>
        <span>⛩</span>
        <span>{label}</span>
      </div>
      <div className={`flex-1 border-t border-dashed ${lineColor}`} />
      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-0.5 text-[10px] text-slate-500 whitespace-nowrap text-center px-2">
        {note}
      </div>
    </div>
  );
}

function AgentBox({
  color, icon, title, desc, gate, highlight
}: {
  color: "emerald" | "blue" | "violet";
  icon: string;
  title: string;
  desc: string;
  gate?: string;
  highlight?: string;
}) {
  const colors = {
    emerald: { box: "bg-[#0d1117] border-emerald-500/20", gateText: "text-emerald-500/70", highlightBg: "bg-emerald-500/10 text-emerald-300" },
    blue: { box: "bg-[#0d1117] border-blue-500/20", gateText: "text-blue-500/70", highlightBg: "bg-blue-500/10 text-blue-300" },
    violet: { box: "bg-[#0d1117] border-violet-500/20", gateText: "text-violet-500/70", highlightBg: "bg-violet-500/10 text-violet-300" },
  }[color];

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${colors.box}`}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{icon}</span>
        <div className="text-sm font-bold text-white leading-tight">{title}</div>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
      {gate && (
        <div className={`text-[10px] italic leading-tight ${colors.gateText} border-t border-white/5 pt-2 mt-auto`}>
          ⚠ Gate: {gate}
        </div>
      )}
      {highlight && (
        <div className={`text-[11px] font-semibold rounded-lg px-2 py-1 mt-1 ${colors.highlightBg}`}>
          ✓ {highlight}
        </div>
      )}
    </div>
  );
}
