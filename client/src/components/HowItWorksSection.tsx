function IllustrationEnterDetails() {
  return (
    <svg viewBox="0 0 220 170" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Phone frame */}
      <rect x="62" y="8" width="96" height="154" rx="16" fill="#1e1b4b" />
      <rect x="68" y="16" width="84" height="138" rx="10" fill="#ede9fe" />
      {/* Status bar notch */}
      <rect x="90" y="16" width="40" height="8" rx="4" fill="#1e1b4b" />

      {/* Map background tiles */}
      <rect x="68" y="24" width="84" height="52" rx="6" fill="#ddd6fe" />
      <line x1="68" y1="38" x2="152" y2="38" stroke="#c4b5fd" strokeWidth="0.6" />
      <line x1="68" y1="52" x2="152" y2="52" stroke="#c4b5fd" strokeWidth="0.6" />
      <line x1="68" y1="66" x2="152" y2="66" stroke="#c4b5fd" strokeWidth="0.6" />
      <line x1="88" y1="24" x2="88" y2="76" stroke="#c4b5fd" strokeWidth="0.6" />
      <line x1="110" y1="24" x2="110" y2="76" stroke="#c4b5fd" strokeWidth="0.6" />
      <line x1="132" y1="24" x2="132" y2="76" stroke="#c4b5fd" strokeWidth="0.6" />
      {/* Road */}
      <path d="M68 56 Q100 46 152 50" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" />

      {/* Pickup pin (green) */}
      <ellipse cx="92" cy="55" rx="5" ry="2" fill="#059669" opacity="0.3" />
      <path d="M92 32 C87 32 83 36 83 41 C83 47 92 55 92 55 C92 55 101 47 101 41 C101 36 97 32 92 32Z" fill="#10b981" />
      <circle cx="92" cy="41" r="3.5" fill="white" />

      {/* Dropoff pin (violet) */}
      <ellipse cx="130" cy="62" rx="5" ry="2" fill="#7c3aed" opacity="0.3" />
      <path d="M130 39 C125 39 121 43 121 48 C121 54 130 62 130 62 C130 62 139 54 139 48 C139 43 135 39 130 39Z" fill="#7c3aed" />
      <circle cx="130" cy="48" r="3.5" fill="white" />

      {/* Form fields below map */}
      <rect x="72" y="82" width="76" height="14" rx="4" fill="white" />
      <circle cx="81" cy="89" r="3" fill="#10b981" />
      <rect x="87" y="86" width="40" height="2.5" rx="1.5" fill="#d1fae5" />
      <rect x="87" y="90" width="28" height="2" rx="1" fill="#d1fae5" />

      <rect x="72" y="100" width="76" height="14" rx="4" fill="white" />
      <circle cx="81" cy="107" r="3" fill="#7c3aed" />
      <rect x="87" y="104" width="40" height="2.5" rx="1.5" fill="#ede9fe" />
      <rect x="87" y="108" width="28" height="2" rx="1" fill="#ede9fe" />

      {/* Upload photo row */}
      <rect x="72" y="118" width="76" height="14" rx="4" fill="white" />
      <rect x="77" y="122" width="14" height="10" rx="2" fill="#ddd6fe" />
      <path d="M84 130 L84 126 L87 128 Z" fill="#7c3aed" />
      <rect x="95" y="124" width="30" height="2.5" rx="1.5" fill="#ddd6fe" />
      <rect x="95" y="128" width="20" height="2" rx="1" fill="#ddd6fe" />

      {/* CTA button */}
      <rect x="72" y="136" width="76" height="13" rx="4" fill="#7c3aed" />
      <rect x="88" y="140" width="44" height="2.5" rx="1.5" fill="white" opacity="0.9" />
      <rect x="95" y="143.5" width="30" height="2" rx="1" fill="white" opacity="0.5" />

      {/* Home button */}
      <rect x="97" y="151" width="26" height="3" rx="1.5" fill="#4c1d95" />

      {/* Floating camera badge */}
      <circle cx="175" cy="42" r="18" fill="#7c3aed" opacity="0.15" />
      <circle cx="175" cy="42" r="13" fill="#7c3aed" />
      <rect x="170" y="38" width="10" height="8" rx="2" fill="white" />
      <circle cx="175" cy="42" r="2.5" fill="#7c3aed" />

      {/* Floating AI sparkle */}
      <circle cx="43" cy="78" r="16" fill="#10b981" opacity="0.15" />
      <circle cx="43" cy="78" r="11" fill="#10b981" />
      <text x="43" y="82" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">AI</text>
    </svg>
  );
}

function IllustrationGetPrice() {
  return (
    <svg viewBox="0 0 220 170" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Receipt / quote card */}
      <rect x="38" y="14" width="144" height="142" rx="14" fill="#1e1b4b" />
      <rect x="44" y="20" width="132" height="130" rx="10" fill="#f5f3ff" />

      {/* Torn receipt top edge */}
      <path d="M44 44 Q50 40 56 44 Q62 40 68 44 Q74 40 80 44 Q86 40 92 44 Q98 40 104 44 Q110 40 116 44 Q122 40 128 44 Q134 40 140 44 Q146 40 152 44 Q158 40 164 44 Q170 40 176 44" stroke="#ddd6fe" strokeWidth="1.5" fill="none" />

      {/* LervIT brand label */}
      <rect x="80" y="26" width="60" height="12" rx="4" fill="#7c3aed" />
      <rect x="88" y="29" width="44" height="2.5" rx="1.5" fill="white" opacity="0.9" />
      <rect x="93" y="32.5" width="34" height="2" rx="1" fill="white" opacity="0.5" />

      {/* Big price display */}
      <text x="110" y="80" textAnchor="middle" fill="#1e1b4b" fontSize="32" fontWeight="800">$149</text>
      <text x="110" y="92" textAnchor="middle" fill="#7c3aed" fontSize="9" fontWeight="600" letterSpacing="1">UPFRONT PRICE</text>

      {/* Breakdown rows */}
      <line x1="52" y1="100" x2="168" y2="100" stroke="#ddd6fe" strokeWidth="1" strokeDasharray="3 2" />
      <rect x="52" y="106" width="50" height="2.5" rx="1.5" fill="#a78bfa" opacity="0.6" />
      <rect x="136" y="106" width="24" height="2.5" rx="1.5" fill="#1e1b4b" opacity="0.5" />
      <rect x="52" y="112" width="40" height="2.5" rx="1.5" fill="#a78bfa" opacity="0.6" />
      <rect x="140" y="112" width="20" height="2.5" rx="1.5" fill="#1e1b4b" opacity="0.5" />
      <rect x="52" y="118" width="55" height="2.5" rx="1.5" fill="#a78bfa" opacity="0.6" />
      <rect x="134" y="118" width="26" height="2.5" rx="1.5" fill="#1e1b4b" opacity="0.5" />
      <line x1="52" y1="125" x2="168" y2="125" stroke="#ddd6fe" strokeWidth="1" />

      {/* Total row */}
      <rect x="52" y="130" width="30" height="3" rx="1.5" fill="#1e1b4b" opacity="0.8" />
      <rect x="128" y="130" width="32" height="3" rx="1.5" fill="#7c3aed" />

      {/* Confirm button */}
      <rect x="52" y="138" width="116" height="8" rx="4" fill="#7c3aed" />
      <rect x="72" y="140.5" width="76" height="2.5" rx="1.5" fill="white" opacity="0.9" />

      {/* Shield badge top-right */}
      <circle cx="178" cy="32" r="16" fill="#10b981" opacity="0.12" />
      <circle cx="178" cy="32" r="12" fill="#10b981" />
      <path d="M178 24 L184 27 L184 33 C184 37 178 40 178 40 C178 40 172 37 172 33 L172 27 Z" fill="white" opacity="0.95" />
      <path d="M175 32 L177 34 L181 30" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* No-calls badge */}
      <circle cx="42" cy="38" r="16" fill="#f59e0b" opacity="0.12" />
      <circle cx="42" cy="38" r="12" fill="#f59e0b" />
      <path d="M38 34 C37 33 37 32 38 31 L39 30 C39.5 29.5 40 30 40 30 L41.5 32 C42 32.5 41.5 33 41.5 33 C41 33.5 41 34 42 35 L45 38 C46 39 46.5 38.5 47 38.5 C47 38.5 47.5 38 48 38.5 L50 40 C50 40 50.5 40.5 50 41 L49 42 C48 43 47 43 46 42 C43 40 39 37 38 34Z" fill="white" />
      <line x1="38" y1="44" x2="46" y2="32" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IllustrationBookAndTrack() {
  return (
    <svg viewBox="0 0 220 170" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Map background */}
      <rect x="24" y="18" width="172" height="110" rx="14" fill="#ddd6fe" />
      {/* Map grid */}
      <line x1="24" y1="46" x2="196" y2="46" stroke="#c4b5fd" strokeWidth="0.7" />
      <line x1="24" y1="74" x2="196" y2="74" stroke="#c4b5fd" strokeWidth="0.7" />
      <line x1="24" y1="102" x2="196" y2="102" stroke="#c4b5fd" strokeWidth="0.7" />
      <line x1="66" y1="18" x2="66" y2="128" stroke="#c4b5fd" strokeWidth="0.7" />
      <line x1="110" y1="18" x2="110" y2="128" stroke="#c4b5fd" strokeWidth="0.7" />
      <line x1="154" y1="18" x2="154" y2="128" stroke="#c4b5fd" strokeWidth="0.7" />

      {/* Route path */}
      <path d="M55 108 Q80 60 150 48" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 3" />

      {/* Destination pin (pulsing rings) */}
      <circle cx="150" cy="48" r="16" fill="#10b981" opacity="0.12" />
      <circle cx="150" cy="48" r="10" fill="#10b981" opacity="0.2" />
      <path d="M150 32 C144 32 139 37 139 43 C139 50 150 58 150 58 C150 58 161 50 161 43 C161 37 156 32 150 32Z" fill="#10b981" />
      <circle cx="150" cy="43" r="4" fill="white" />

      {/* Live truck */}
      <g transform="translate(44,94)">
        {/* Truck body */}
        <rect x="0" y="4" width="26" height="16" rx="3" fill="#7c3aed" />
        <rect x="18" y="0" width="12" height="14" rx="2" fill="#5b21b6" />
        {/* Cab windshield */}
        <rect x="19" y="2" width="9" height="7" rx="1" fill="#a78bfa" opacity="0.7" />
        {/* Wheels */}
        <circle cx="6" cy="21" r="4" fill="#1e1b4b" />
        <circle cx="6" cy="21" r="2" fill="#c4b5fd" />
        <circle cx="22" cy="21" r="4" fill="#1e1b4b" />
        <circle cx="22" cy="21" r="2" fill="#c4b5fd" />
        {/* Package in truck */}
        <rect x="4" y="6" width="12" height="10" rx="1" fill="#a78bfa" />
        <line x1="10" y1="6" x2="10" y2="16" stroke="#7c3aed" strokeWidth="0.8" />
        <line x1="4" y1="11" x2="16" y2="11" stroke="#7c3aed" strokeWidth="0.8" />
      </g>

      {/* Live badge */}
      <rect x="34" y="80" width="34" height="12" rx="6" fill="#ef4444" />
      <circle cx="43" cy="86" r="2.5" fill="white" />
      <rect x="48" y="84" width="14" height="2.5" rx="1.5" fill="white" opacity="0.9" />

      {/* ETA card floating */}
      <rect x="120" y="104" width="68" height="32" rx="8" fill="white" />
      <rect x="126" y="110" width="20" height="2.5" rx="1.5" fill="#a78bfa" />
      <text x="126" y="126" fill="#1e1b4b" fontSize="12" fontWeight="800">12 min</text>
      <rect x="152" y="110" width="30" height="2.5" rx="1.5" fill="#ddd6fe" />
      <rect x="152" y="122" width="24" height="2" rx="1" fill="#ddd6fe" />

      {/* Bottom action strip */}
      <rect x="24" y="130" width="172" height="28" rx="8" fill="#7c3aed" />
      <circle cx="42" cy="144" r="8" fill="#5b21b6" />
      <path d="M39 144 L42 141 L45 144 L42 147 Z" fill="white" />
      <rect x="56" y="140" width="60" height="3" rx="1.5" fill="white" opacity="0.9" />
      <rect x="56" y="145" width="44" height="2.5" rx="1.5" fill="white" opacity="0.5" />
      <rect x="162" y="139" width="26" height="10" rx="5" fill="#10b981" />
      <rect x="166" y="142.5" width="18" height="2.5" rx="1.5" fill="white" opacity="0.9" />

      {/* Verified badge top-right */}
      <circle cx="192" cy="32" r="15" fill="#10b981" opacity="0.12" />
      <circle cx="192" cy="32" r="11" fill="#10b981" />
      <path d="M189 32 L191 34 L195 29" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const steps = [
  {
    number: "01",
    title: "Enter Your Details",
    body: "Enter locations, upload photos of items and get smart price estimates.",
    illustration: <IllustrationEnterDetails />,
    accent: "from-violet-500 to-purple-600",
    accentSolid: "#7c3aed",
    accentLight: "bg-violet-50 dark:bg-violet-950/40",
    accentBorder: "border-violet-200 dark:border-violet-800",
    accentText: "text-violet-600 dark:text-violet-400",
  },
  {
    number: "02",
    title: "Get Your Price",
    body: "See your upfront price before you book. No calls. No negotiation.",
    illustration: <IllustrationGetPrice />,
    accent: "from-emerald-500 to-teal-500",
    accentSolid: "#059669",
    accentLight: "bg-emerald-50 dark:bg-emerald-950/40",
    accentBorder: "border-emerald-200 dark:border-emerald-800",
    accentText: "text-emerald-600 dark:text-emerald-400",
  },
  {
    number: "03",
    title: "Book and Track",
    body: "Confirm your booking, get matched with a verified mover, and track the move live.",
    illustration: <IllustrationBookAndTrack />,
    accent: "from-blue-500 to-indigo-600",
    accentSolid: "#3b82f6",
    accentLight: "bg-blue-50 dark:bg-blue-950/40",
    accentBorder: "border-blue-200 dark:border-blue-800",
    accentText: "text-blue-600 dark:text-blue-400",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-16 md:py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12 md:mb-16 space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold">How LervIT Works</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From quote to mover at your door — in minutes, not hours.
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 relative">
          {/* Connector arrows — desktop only */}
          <div className="hidden md:flex absolute top-[130px] left-[33%] -translate-x-1/2 items-center pointer-events-none z-10">
            <svg width="56" height="20" viewBox="0 0 56 20" fill="none">
              <path d="M0 10 Q14 4 28 10 Q42 16 56 10" stroke="#a78bfa" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
              <path d="M50 7 L56 10 L50 13" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="hidden md:flex absolute top-[130px] left-[67%] -translate-x-1/2 items-center pointer-events-none z-10">
            <svg width="56" height="20" viewBox="0 0 56 20" fill="none">
              <path d="M0 10 Q14 4 28 10 Q42 16 56 10" stroke="#a78bfa" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
              <path d="M50 7 L56 10 L50 13" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {steps.map((step, i) => (
            <div
              key={i}
              className={`relative flex flex-col rounded-2xl border ${step.accentBorder} ${step.accentLight} overflow-hidden group`}
              data-testid={`step-${i}`}
            >
              {/* Step badge */}
              <div className="absolute top-4 right-4 z-10">
                <span className={`text-xs font-bold tabular-nums ${step.accentText} bg-white/70 dark:bg-black/30 px-2 py-0.5 rounded-full border ${step.accentBorder}`}>
                  {step.number}
                </span>
              </div>

              {/* Illustration */}
              <div className="w-full h-[170px] px-4 pt-4 flex items-center justify-center">
                {step.illustration}
              </div>

              {/* Gradient divider */}
              <div className={`h-1 w-full bg-gradient-to-r ${step.accent} opacity-70`} />

              {/* Text content */}
              <div className="flex flex-col gap-2 p-5 flex-1">
                <h3 className="font-bold text-xl leading-snug">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
