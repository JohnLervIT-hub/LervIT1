import { TrendingUp, DollarSign, ShieldCheck, Lock, ArrowRight } from "lucide-react";
import truckImg from "../../../assets/partner_network_truck.png";

const benefits = [
  {
    Icon: TrendingUp,
    title: "More jobs",
    text: "Get matched with customers who are ready to move — no slow seasons.",
  },
  {
    Icon: DollarSign,
    title: "Grow revenue",
    text: "Keep more of what you earn with transparent, fair pricing.",
  },
  {
    Icon: ShieldCheck,
    title: "Trusted network",
    text: "Work alongside verified partners and build lasting credibility.",
  },
];

export function CenteredSpotlight() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 md:p-10 font-sans"
      style={{ background: "#080D14" }}
    >
      <div className="w-full max-w-[1000px] mx-auto">

        {/* Outer card */}
        <div
          className="rounded-[28px] overflow-hidden"
          style={{
            background: "linear-gradient(160deg, #0F1824 0%, #141C28 100%)",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
          }}
        >
          {/* Top area — centered text + truck */}
          <div className="flex flex-col items-center text-center px-8 md:px-16 pt-10 md:pt-14 pb-4">

            {/* Badge */}
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-6"
              style={{ border: "1px solid rgba(37,99,235,0.45)", color: "#93B4F8", background: "rgba(37,99,235,0.10)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Invitation only
            </span>

            {/* Headline */}
            <h2
              className="text-white font-extrabold tracking-tight mb-4"
              style={{ fontSize: "clamp(1.9rem, 4vw, 3rem)", lineHeight: 1.15 }}
            >
              Join the Partner Network
            </h2>

            {/* Subtitle */}
            <p className="text-base md:text-lg leading-relaxed max-w-[560px]" style={{ color: "#A7AFBD" }}>
              Partner with LervIT to scale your moving business, land more jobs, and earn the reputation you deserve.
            </p>

            {/* Truck — centered, prominent */}
            <div className="w-full flex justify-center mt-6">
              <img
                src={truckImg}
                alt="Happy LervIT truck driver giving thumbs up"
                className="w-full object-contain select-none"
                style={{ maxWidth: 520, maxHeight: 320 }}
                draggable={false}
              />
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "0 32px" }} />

          {/* Benefits row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-white/[0.07]">
            {benefits.map(({ Icon, title, text }) => (
              <div key={title} className="flex flex-col items-center text-center gap-3 px-8 py-7">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-base mb-1">{title}</p>
                  <p className="text-sm leading-relaxed" style={{ color: "#8B95A5" }}>{text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA strip */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
          <a
            href="/contact?topic=partner-network"
            aria-label="Request an invitation to the LervIT Partner Network"
            className="flex items-center justify-center gap-3 px-8 py-5 transition-colors hover:bg-white/[0.03] group"
          >
            <span className="text-white font-semibold text-sm">Request an invitation</span>
            <ArrowRight
              className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
              style={{ color: "#2563EB" }}
            />
          </a>
        </div>

        {/* Footer note */}
        <div className="flex items-center justify-center gap-2 mt-5" style={{ color: "#4B5563" }}>
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <p className="text-xs">By invitation only — not accepting direct sign-ups.</p>
        </div>

      </div>
    </div>
  );
}
