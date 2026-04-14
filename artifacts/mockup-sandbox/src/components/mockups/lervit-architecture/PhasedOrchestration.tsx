export function PhasedOrchestration() {
  return (
    <div className="bg-[#0d1117] text-white font-['Inter'] w-full" style={{ minWidth: 1440 }}>
      <div className="px-10 pt-8 pb-6">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-[#1c2333] border border-[#30363d] rounded-full px-5 py-1.5 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-slate-400 font-semibold tracking-widest uppercase">LervIT · Agentic Orchestration</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Phase-Gated Architecture</h1>
          <p className="text-slate-500 text-sm">Build the right agents at the right scale — no premature complexity</p>
        </div>

        {/* Phase legend badges */}
        <div className="flex justify-center gap-3 mb-6">
          {[
            { label: "Phase 1 · Build Now", gmv: "$0 – $25K GMV", dot: "bg-emerald-400", ring: "border-emerald-500/40 bg-emerald-500/10", text: "text-emerald-400" },
            { label: "Phase 2 · Next", gmv: "$25K – $100K GMV", dot: "bg-blue-400", ring: "border-blue-500/40 bg-blue-500/10", text: "text-blue-400" },
            { label: "Phase 3 · Future", gmv: "$100K+ GMV", dot: "bg-violet-400", ring: "border-violet-500/40 bg-violet-500/10", text: "text-violet-400" },
          ].map(l => (
            <div key={l.label} className={`flex items-center gap-2 px-4 py-2 rounded-full border ${l.ring}`}>
              <div className={`w-2 h-2 rounded-full ${l.dot}`} />
              <span className={`text-xs font-bold ${l.text}`}>{l.label}</span>
              <span className="text-slate-500 text-xs">·</span>
              <span className="text-slate-300 text-xs">{l.gmv}</span>
            </div>
          ))}
        </div>

        {/* ── 3-COLUMN PHASE LAYOUT ── */}
        <div className="grid grid-cols-3 gap-4 mb-3">

          {/* PHASE 1 */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Phase 1 · $0 – $25K GMV</span>
                </div>
                <h2 className="text-base font-bold text-white">Conversion + Retention Layer</h2>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">Build Now</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">Highest ROI per dollar. Directly addresses the proven analytics gap: quote-to-booking drop-off and low-frequency retention.</p>

            <AgentCard color="emerald" icon="⚡" title="Conversion Agent"
              desc="Detects quote abandonment. Sends personalised nudges (email + SMS) with social proof, urgency signals, and LERVIT20 promo trigger."
              highlight="Unlocks revenue from existing traffic" />

            <AgentCard color="emerald" icon="🔁" title="Post-Job Retention Loop"
              desc="After every completed move: requests Google review, triggers referral code, re-engages customer 6 months later with seasonal reminder."
              highlight="Turns one-time movers into recurring + referrals" />

            <div className="mt-auto pt-2 border-t border-emerald-500/20 text-[10px] text-emerald-500/70 italic">
              ✓ Start here — no other agents needed until $25K GMV is proven
            </div>
          </div>

          {/* PHASE 2 */}
          <div className="rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Phase 2 · $25K – $100K GMV</span>
                </div>
                <h2 className="text-base font-bold text-white">Market Intelligence Layer</h2>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300">Next</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">Activate once conversion data is proven. Agents compound learnings from Phase 1 retention and conversion signals.</p>

            <AgentCard color="blue" icon="💰" title="Pricing Intelligence Agent"
              desc="Augments existing 7-component model with historical win/loss data and competitor rate analysis."
              gate="Needs 200+ completed bookings to train on" />

            <AgentCard color="blue" icon="🚛" title="Supply Agent (Full Sub-Architecture)"
              desc="Mover scoring, availability prediction, incentive triggering, onboarding nudges, fill-rate optimisation."
              gate="Most critical agent — not a single box. Needs own spec." />

            <AgentCard color="blue" icon="🔄" title="Sales + Quote Agent"
              desc="Tracks leads across sessions, creates bookings proactively, manages scheduling conflicts."
              gate="Activates once Conversion Agent has 30-day baseline data" />

            <div className="mt-auto pt-2 border-t border-blue-500/20">
              <div className="flex items-center gap-1.5 text-[10px] text-blue-400/80">
                <span>↩</span>
                <span className="font-semibold">Feedback Loop Added:</span>
                <span className="text-slate-500">Post-job scores feed back into Pricing Intelligence Agent</span>
              </div>
            </div>
          </div>

          {/* PHASE 3 */}
          <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-2 h-2 rounded-full bg-violet-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Phase 3 · $100K+ GMV</span>
                </div>
                <h2 className="text-base font-bold text-white">Full Agentic Intelligence</h2>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-300">Future</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">Complete Claude-orchestrated market intelligence. Unlocked when data volume makes demand signals statistically meaningful.</p>

            <AgentCard color="violet" icon="📡" title="Demand Intelligence Agent"
              desc="Detects Calgary market demand signals, seasonal patterns, competitor moves."
              gate="Requires 3+ cities or $100K GMV for data validity" />

            <AgentCard color="violet" icon="🎯" title="Offer Optimisation Agent"
              desc="Generates compelling listings, promotional hooks, and dynamic offers."
              gate="Requires A/B testing volume to be statistically significant" />

            <AgentCard color="violet" icon="🔭" title="Funnel Intelligence Agent"
              desc="Analyses lead funnel depth and competitor acquisition strategies."
              gate="Requires benchmark dataset from Phase 1 + 2 funnels" />

            <AgentCard color="violet" icon="🤖" title="Claude Orchestration Service"
              desc="Coordinates all agents with shared memory, fallback circuit breakers, and cost guardrails."
              gate="Single point of failure — needs circuit breaker before activation" />
          </div>
        </div>

        {/* Phase Gate Connectors */}
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-3 bg-emerald-500/30" />
            <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-dashed border-emerald-500/40 bg-emerald-500/5 text-[10px] font-bold text-emerald-400 whitespace-nowrap">
              ⛩ Phase Gate 1 — Prove fill rate + acceptance rate
            </div>
            <div className="w-px h-3 bg-blue-500/30" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-3 bg-blue-500/30" />
            <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-dashed border-blue-500/40 bg-blue-500/5 text-[10px] font-bold text-blue-400 whitespace-nowrap">
              ⛩ Phase Gate 2 — Demand signals must be data-driven, not noise
            </div>
            <div className="w-px h-3 bg-violet-500/30" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-3 bg-violet-500/30" />
            <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-dashed border-violet-500/40 bg-violet-500/5 text-[10px] font-bold text-violet-400 whitespace-nowrap">
              ⛩ Phase Gate 3 — Full orchestrator with fallback deployed
            </div>
            <div className="w-px h-3 bg-slate-700" />
          </div>
        </div>

        {/* API Wrapper */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3 mb-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">API Wrapper Layer · Stable Across All Phases</div>
          <div className="grid grid-cols-5 gap-2">
            {["Get Quote", "Create Booking", "Find Movers", "Send Notification", "Log Error"].map(api => (
              <div key={api} className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-center text-xs text-slate-400 font-mono">{api}</div>
            ))}
          </div>
        </div>

        {/* Core Backend + Warning — side by side */}
        <div className="grid grid-cols-3 gap-3 mb-2">
          <div className="col-span-2 bg-gradient-to-r from-[#1c2b3a] to-[#1a2535] border border-blue-500/30 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Core LervIT Backend · Source of Truth · Never Replaced by Agents</div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-emerald-400 text-[10px] font-medium">Live</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { icon: "💵", label: "Quote Engine", sub: "7-component pricing + AI" },
                { icon: "📋", label: "Booking System", sub: "Multi-step + abandoned tracking" },
                { icon: "📍", label: "Mover Assignment", sub: "Proximity matching + GPS" },
                { icon: "🔔", label: "Notifications", sub: "WebSocket + Email + SMS" },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="bg-[#0d1117]/60 border border-blue-500/20 rounded-lg p-2">
                  <div className="text-base mb-0.5">{icon}</div>
                  <div className="text-[11px] font-semibold text-white">{label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/25 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <span>⚠️</span>
              <span className="text-xs font-bold text-amber-400">Add Before Phase 2</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              A shared <span className="text-white font-medium">data layer</span> must sit between the API Wrapper and agents — storing decision history, conversation context, A/B results, and booking signals. Without it, every agent call is stateless and cannot compound learnings.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-slate-600">
          LervIT · Phase-Gated Agentic Architecture · April 2026 · Do not build Phase 2 or 3 prematurely
        </div>
      </div>
    </div>
  );
}

function AgentCard({
  color, icon, title, desc, gate, highlight
}: {
  color: "emerald" | "blue" | "violet";
  icon: string;
  title: string;
  desc: string;
  gate?: string;
  highlight?: string;
}) {
  const c = {
    emerald: { box: "bg-[#0d1117] border-emerald-500/20", gate: "text-emerald-500/60", hi: "bg-emerald-500/10 text-emerald-300" },
    blue:    { box: "bg-[#0d1117] border-blue-500/20",    gate: "text-blue-500/60",    hi: "bg-blue-500/10 text-blue-300" },
    violet:  { box: "bg-[#0d1117] border-violet-500/20",  gate: "text-violet-500/60",  hi: "bg-violet-500/10 text-violet-300" },
  }[color];

  return (
    <div className={`rounded-xl border p-3 ${c.box}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <span className="text-xs font-bold text-white leading-tight">{title}</span>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
      {gate && (
        <div className={`text-[10px] italic mt-1.5 pt-1.5 border-t border-white/5 ${c.gate}`}>
          ⚠ Gate: {gate}
        </div>
      )}
      {highlight && (
        <div className={`text-[10px] font-semibold rounded-md px-2 py-1 mt-1.5 ${c.hi}`}>
          ✓ {highlight}
        </div>
      )}
    </div>
  );
}
