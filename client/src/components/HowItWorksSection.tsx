import step1Img from "@assets/generated_images/hiw_step1_v2.png";
import step2Img from "@assets/generated_images/hiw_step2_v2.png";
import step3Img from "@assets/generated_images/hiw_step3_v2.png";
import { Zap, BadgeDollarSign, MapPin } from "lucide-react";
import { Link } from "wouter";

const steps = [
  {
    number: "1",
    title: "Enter Your Details",
    body: "Add your pickup and dropoff details to get started.",
    pill: "Instant estimate",
    pillIcon: Zap,
    image: step1Img,
    badgeGradient: "from-violet-600 to-purple-700",
    pillBg: "bg-violet-50 dark:bg-violet-950/50",
    pillText: "text-violet-700 dark:text-violet-300",
    pillBorder: "border-violet-200 dark:border-violet-800",
    glowColor: "rgba(124,58,237,0.12)",
    arrowColor: "#a78bfa",
  },
  {
    number: "2",
    title: "Get Your Price",
    body: "See your upfront price before you book. No calls. No negotiation.",
    pill: "Upfront pricing",
    pillIcon: BadgeDollarSign,
    image: step2Img,
    badgeGradient: "from-blue-500 to-indigo-600",
    pillBg: "bg-blue-50 dark:bg-blue-950/50",
    pillText: "text-blue-700 dark:text-blue-300",
    pillBorder: "border-blue-200 dark:border-blue-800",
    glowColor: "rgba(59,130,246,0.12)",
    arrowColor: "#60a5fa",
  },
  {
    number: "3",
    title: "Book and Track",
    body: "Confirm your booking and track your move live on GPS.",
    pill: "Live GPS tracking",
    pillIcon: MapPin,
    image: step3Img,
    badgeGradient: "from-emerald-500 to-teal-600",
    pillBg: "bg-emerald-50 dark:bg-emerald-950/50",
    pillText: "text-emerald-700 dark:text-emerald-300",
    pillBorder: "border-emerald-200 dark:border-emerald-800",
    glowColor: "rgba(16,185,129,0.12)",
    arrowColor: null,
  },
];

function ConnectorArrow({ color }: { color: string }) {
  return (
    <div className="hidden lg:flex items-center justify-center flex-shrink-0 w-14 self-center mt-8">
      <svg width="56" height="32" viewBox="0 0 56 32" fill="none">
        <path
          d="M2 16 C12 6, 44 26, 54 16"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="4 3"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M46 10 L54 16 L46 22"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
      </svg>
    </div>
  );
}

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="relative py-20 md:py-24 lg:py-32 overflow-hidden"
    >
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/40 to-background pointer-events-none" />
      {/* Faint grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(to right, #6366f1 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12 md:mb-16 space-y-4">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold border border-primary/20">
            Simple 3-step process
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight">
            How LervIT Works
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            From quote to mover at your door —{" "}
            <span className="font-semibold text-foreground">in minutes, not hours.</span>
          </p>
        </div>

        {/* Cards row */}
        <div className="flex flex-col lg:flex-row items-start gap-6 lg:gap-0">
          {steps.map((step, i) => {
            const PillIcon = step.pillIcon;
            return (
              <div
                key={i}
                className="flex lg:flex-row items-start flex-1 min-w-0 w-full"
              >
                {/* Card wrapper — extra top padding gives room for floating badge */}
                <div className="relative flex flex-col flex-1 min-w-0 pt-7">
                  {/* Floating numbered badge */}
                  <div
                    className={`absolute -top-0 left-1/2 -translate-x-1/2 z-10 w-14 h-14 rounded-full bg-gradient-to-br ${step.badgeGradient} flex items-center justify-center shadow-lg`}
                  >
                    <span className="text-white font-extrabold text-2xl leading-none">
                      {step.number}
                    </span>
                  </div>

                  {/* Card */}
                  <div
                    className="flex flex-col h-full rounded-2xl bg-white dark:bg-card border border-border/60 shadow-md transition-shadow duration-300 hover:shadow-xl"
                    data-testid={`step-${i}`}
                    style={{
                      boxShadow: `0 4px 24px 0 ${step.glowColor}, 0 1px 4px 0 rgba(0,0,0,0.06)`,
                    }}
                  >
                    {/* Illustration */}
                    <div className="relative rounded-t-2xl overflow-hidden bg-gradient-to-b from-muted/60 to-muted/20 pt-6 md:pt-6 px-5 md:px-6 pb-3 md:pb-3 flex items-center justify-center min-h-[160px] md:min-h-[170px]">
                      <img
                        src={step.image}
                        alt={step.title}
                        className="w-full max-h-32 md:max-h-48 object-contain drop-shadow-md"
                        draggable={false}
                      />
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-border mx-5 md:mx-6" />

                    {/* Text content */}
                    <div className="flex flex-col gap-2 md:gap-2 px-5 md:px-6 py-4 md:py-4 flex-1">
                      {/* Feature pill */}
                      <span
                        className={`inline-flex items-center gap-1.5 self-start text-xs font-semibold px-2.5 py-1 rounded-full border ${step.pillBg} ${step.pillText} ${step.pillBorder}`}
                      >
                        <PillIcon className="w-3 h-3" />
                        {step.pill}
                      </span>

                      <h3 className="font-display font-bold text-xl leading-snug tracking-tight">{step.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {step.body}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Connector arrow between cards */}
                {step.arrowColor && (
                  <ConnectorArrow color={step.arrowColor} />
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom CTA strip */}
        <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
          <p className="text-muted-foreground text-sm">
            Ready to experience a smarter move?
          </p>
          <Link
            href="/request-move"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold shadow-md hover:opacity-90 transition-opacity"
          >
            Get a free quote
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
