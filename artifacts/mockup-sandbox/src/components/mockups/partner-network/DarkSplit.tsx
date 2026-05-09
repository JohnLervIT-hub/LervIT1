import { TrendingUp, DollarSign, ShieldCheck, Mail, Lock, ChevronRight } from "lucide-react";
import truckImg from "../../../assets/partner_network_truck.png";

const benefits = [
  {
    Icon: TrendingUp,
    title: "More jobs, consistently",
    text: "Get matched with customers who are ready to move — no cold calling, no slow seasons.",
  },
  {
    Icon: DollarSign,
    title: "Grow your revenue",
    text: "Keep more of what you earn and build lasting relationships with repeat customers.",
  },
  {
    Icon: ShieldCheck,
    title: "Trusted network",
    text: "Work alongside verified partners and deliver every move with confidence.",
  },
];

export function DarkSplit() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 md:p-10 font-sans"
      style={{ background: "#080D14" }}
    >
      <div className="w-full max-w-[1100px] mx-auto space-y-4">

        {/* Badge + headline + subtitle — centered above card */}
        <div className="text-center space-y-4 mb-2">
          <span
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium"
            style={{ border: "1px solid rgba(37,99,235,0.5)", color: "#93B4F8", background: "rgba(37,99,235,0.10)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Invitation only
          </span>

          <h2 className="text-white font-extrabold tracking-tight" style={{ fontSize: "clamp(2rem, 4.5vw, 3.2rem)", lineHeight: 1.15 }}>
            Join the Partner Network
          </h2>
          <p className="text-base md:text-lg leading-relaxed max-w-[640px] mx-auto" style={{ color: "#A7AFBD" }}>
            Partner with LervIT to scale your moving business, land more jobs, and build a reputation customers trust.
          </p>
        </div>

        {/* Main feature card */}
        <div
          className="rounded-[24px] overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #101720 0%, #151C26 100%)",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}
        >
          <div className="grid md:grid-cols-2 gap-0">

            {/* Left — benefits */}
            <div className="flex flex-col justify-center gap-8 p-8 md:p-10">
              {benefits.map(({ Icon, title, text }) => (
                <div key={title} className="flex gap-4 items-start">
                  <div
                    className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-base leading-snug mb-1">{title}</p>
                    <p className="text-sm leading-relaxed" style={{ color: "#A7AFBD" }}>{text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Right — truck illustration */}
            <div className="flex items-end justify-center pt-8 md:pt-0 pr-0 overflow-hidden">
              <img
                src={truckImg}
                alt="LervIT truck driver giving thumbs up"
                className="w-full max-w-[480px] h-auto object-contain object-bottom select-none"
                style={{ maxHeight: 400 }}
                draggable={false}
              />
            </div>
          </div>
        </div>

        {/* CTA card */}
        <a
          href="/contact?topic=partner-network"
          aria-label="Request an invitation to the LervIT Partner Network"
          className="block"
        >
          <div
            className="rounded-[20px] p-5 md:p-6 flex items-center gap-4 cursor-pointer transition-opacity hover:opacity-90 active:opacity-75"
            style={{
              background: "linear-gradient(135deg, #101720 0%, #151C26 100%)",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
            }}
          >
            <div
              className="shrink-0 w-13 h-13 rounded-full flex items-center justify-center"
              style={{ width: 52, height: 52, background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}
            >
              <Mail className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-base leading-snug mb-0.5">Want to learn more?</p>
              <p className="text-sm" style={{ color: "#A7AFBD" }}>
                Request an invitation to see how LervIT can grow your business.
              </p>
            </div>
            <ChevronRight className="shrink-0 w-6 h-6" style={{ color: "#2563EB" }} />
          </div>
        </a>

        {/* Footer note */}
        <div className="flex items-center justify-center gap-2 pt-1" style={{ color: "#4B5563" }}>
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <p className="text-xs">By invitation only — not accepting direct sign-ups.</p>
        </div>

      </div>
    </div>
  );
}
