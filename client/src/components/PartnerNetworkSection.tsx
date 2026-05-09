import { Link } from "wouter";
import { TrendingUp, DollarSign, ShieldCheck, Mail, Lock, ChevronRight } from "lucide-react";
import moverFlexImg from "@assets/generated_images/mover_go_online_flex.png";

const benefits = [
  {
    icon: TrendingUp,
    title: "More jobs",
    text: "Get consistent leads from people who are ready to move.",
  },
  {
    icon: DollarSign,
    title: "Grow your business",
    text: "Keep more of what you earn and build lasting relationships.",
  },
  {
    icon: ShieldCheck,
    title: "Trusted network",
    text: "Work with a community of verified partners and deliver with confidence.",
  },
];

export default function PartnerNetworkSection() {
  return (
    <section
      data-testid="section-partner-network"
      style={{ background: "#080D14" }}
      className="py-16 md:py-24 lg:py-28"
    >
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8">

        {/* Badge + headline + subtitle */}
        <div className="flex flex-col items-center text-center gap-5 mb-10 md:mb-12">
          <span
            className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full"
            style={{ border: "1px solid rgba(37,99,235,0.55)", color: "#93B4F8", background: "rgba(37,99,235,0.10)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#2563EB" }} />
            Invitation only
          </span>

          <h2
            className="font-display font-extrabold tracking-tight text-white leading-tight"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            Join the Partner Network
          </h2>

          <p
            className="text-base md:text-lg leading-relaxed max-w-[720px]"
            style={{ color: "#A7AFBD" }}
          >
            Partner with LervIT to grow your moving business, get more jobs, and build a stronger reputation in your community.
          </p>
        </div>

        {/* Main feature card */}
        <div
          className="rounded-[20px] md:rounded-[28px] p-6 md:p-10 mb-4"
          style={{
            background: "linear-gradient(135deg, #101720 0%, #151C26 100%)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
          }}
        >
          <div className="flex flex-col md:grid md:grid-cols-2 md:gap-10 md:items-center">

            {/* Truck illustration — top on mobile, right column on desktop */}
            <div className="order-first md:order-last flex items-center justify-center mb-8 md:mb-0">
              {/*
                TODO: Replace with final Partner Network truck illustration showing
                a white LervIT truck with happy blue-uniform driver giving thumbs up
                from driver-side window. Only "LervIT" text on the truck side.
              */}
              <img
                src={moverFlexImg}
                alt="LervIT moving truck with driver"
                className="w-full max-w-[340px] md:max-w-full h-auto object-contain select-none"
                style={{ maxHeight: 340 }}
                draggable={false}
              />
            </div>

            {/* Benefits — bottom on mobile, left column on desktop */}
            <div className="order-last md:order-first flex flex-col gap-7">
              {benefits.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex items-start gap-4">
                  <div
                    className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}
                    aria-hidden="true"
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white text-base leading-snug mb-1">{title}</p>
                    <p className="text-sm leading-relaxed" style={{ color: "#A7AFBD" }}>{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA card */}
        <Link
          href="/contact?topic=partner-network"
          aria-label="Request more information about the LervIT Partner Network"
          data-testid="link-partner-network-cta"
        >
          <div
            className="rounded-[20px] md:rounded-[24px] p-5 md:p-6 flex items-center gap-4 cursor-pointer transition-opacity hover:opacity-90 active:opacity-80 mb-6"
            style={{
              background: "linear-gradient(135deg, #101720 0%, #151C26 100%)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            }}
          >
            {/* Mail icon */}
            <div
              className="shrink-0 w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}
              aria-hidden="true"
            >
              <Mail className="w-6 h-6 text-white" />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-base leading-snug mb-0.5">Want to learn more?</p>
              <p className="text-sm leading-relaxed" style={{ color: "#A7AFBD" }}>
                Request more information to see how LervIT can help your business grow.
              </p>
            </div>

            {/* Chevron */}
            <ChevronRight className="shrink-0 w-6 h-6" style={{ color: "#2563EB" }} aria-hidden="true" />
          </div>
        </Link>

        {/* Footer note */}
        <div className="flex items-center justify-center gap-2" style={{ color: "#6B7280" }}>
          <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <p className="text-xs">By invitation only. Not accepting direct sign-ups.</p>
        </div>
      </div>
    </section>
  );
}
