import { Link } from "wouter";
import { TrendingUp, DollarSign, ShieldCheck, Mail, Lock, ChevronRight } from "lucide-react";
import partnerTruckImg from "../assets/partner-truck-driver.png";

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
      className="py-16 md:py-24"
    >
      <div className="max-w-[680px] md:max-w-[860px] mx-auto px-4 sm:px-6">

        {/* Badge */}
        <div className="flex justify-center mb-5">
          <span
            className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full"
            style={{
              border: "1px solid rgba(59,130,246,0.5)",
              color: "#93C5FD",
              background: "transparent",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Invitation only
          </span>
        </div>

        {/* Headline */}
        <h2
          className="text-center font-extrabold text-white leading-tight mb-4"
          style={{ fontSize: "clamp(2rem, 6vw, 3.25rem)", letterSpacing: "-0.02em" }}
        >
          Join the Partner Network
        </h2>

        {/* Subtitle */}
        <p
          className="text-center text-base md:text-lg leading-relaxed mb-8 md:mb-10"
          style={{ color: "#A7AFBD" }}
        >
          Partner with LervIT to grow your moving business, get more jobs, and build a stronger reputation in your community.
        </p>

        {/* Main feature card */}
        <div
          className="rounded-[20px] md:rounded-[28px] overflow-hidden mb-3"
          style={{
            background: "linear-gradient(160deg, #111927 0%, #141D28 100%)",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}
        >
          <div className="flex flex-col md:flex-row md:items-center">

            {/* Left — benefits */}
            <div className="flex flex-col gap-7 p-7 md:p-10 md:flex-1">
              {benefits.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex items-start gap-4">
                  <div
                    className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)" }}
                    aria-hidden="true"
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="font-bold text-white text-[15px] leading-snug mb-1">{title}</p>
                    <p className="text-sm leading-relaxed" style={{ color: "#8A95A8" }}>{text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Right — truck illustration */}
            <div className="flex items-end justify-center md:justify-end shrink-0 md:w-[52%] px-4 pb-0 md:pb-0 md:pr-0 order-first md:order-last">
              <img
                src={partnerTruckImg}
                alt="LervIT moving truck with happy driver giving thumbs up"
                className="w-full h-auto object-contain select-none"
                style={{ maxHeight: 360, maxWidth: 460 }}
                draggable={false}
              />
            </div>

          </div>
        </div>

        {/* CTA card — fully clickable */}
        <Link
          href="/contact?topic=partner-network"
          aria-label="Request more information about the LervIT Partner Network"
          data-testid="link-partner-network-cta"
        >
          <div
            className="rounded-[20px] md:rounded-[24px] flex items-center gap-5 px-6 py-5 cursor-pointer transition-opacity hover:opacity-90 active:opacity-75 mb-5"
            style={{
              background: "linear-gradient(160deg, #111927 0%, #141D28 100%)",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "0 12px 36px rgba(0,0,0,0.4)",
            }}
          >
            {/* Mail icon */}
            <div
              className="shrink-0 w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)" }}
              aria-hidden="true"
            >
              <Mail className="w-6 h-6 text-white" />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-base leading-snug mb-0.5">Want to learn more?</p>
              <p className="text-sm leading-relaxed" style={{ color: "#8A95A8" }}>
                Request more information to see how LervIT can help your business grow.
              </p>
            </div>

            {/* Chevron */}
            <ChevronRight
              className="shrink-0 w-6 h-6"
              style={{ color: "#3B82F6" }}
              aria-hidden="true"
            />
          </div>
        </Link>

        {/* Footer note */}
        <div className="flex items-center justify-center gap-2" style={{ color: "#525B6A" }}>
          <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <p className="text-xs">By invitation only. Not accepting direct sign-ups.</p>
        </div>

      </div>
    </section>
  );
}
