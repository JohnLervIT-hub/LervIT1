import { Link } from "wouter";
import { TrendingUp, DollarSign, ShieldCheck, Mail, Lock, ChevronRight } from "lucide-react";
import moverEarningsImg from "@assets/generated_images/mover_earnings_85.png";
import moverFlexImg from "@assets/generated_images/mover_go_online_flex.png";
import moverReputationImg from "@assets/generated_images/mover_reputation_stars.png";

const benefits = [
  {
    icon: TrendingUp,
    img: moverEarningsImg,
    imgAlt: "Mover holding cash — consistent job leads",
    title: "More jobs",
    text: "Get consistent leads from people who are ready to move.",
  },
  {
    icon: DollarSign,
    img: moverFlexImg,
    imgAlt: "Mover going online — grow your business",
    title: "Grow your business",
    text: "Keep more of what you earn and build lasting relationships.",
  },
  {
    icon: ShieldCheck,
    img: moverReputationImg,
    imgAlt: "Mover with 5-star rating — trusted network",
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
        <div className="flex flex-col items-center text-center gap-5 mb-10 md:mb-14">
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

        {/* Benefit cards — 3 col on desktop, 1 col on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {benefits.map(({ icon: Icon, img, imgAlt, title, text }) => (
            <div
              key={title}
              className="flex flex-col rounded-[20px] overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #101720 0%, #151C26 100%)",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 16px 48px rgba(0,0,0,0.40)",
              }}
            >
              {/* Image area */}
              <div
                className="flex items-center justify-center mx-4 mt-4 rounded-[14px]"
                style={{ background: "rgba(255,255,255,0.04)", minHeight: 190 }}
              >
                <img
                  src={img}
                  alt={imgAlt}
                  className="w-full h-full object-contain"
                  style={{ maxHeight: 210 }}
                  draggable={false}
                />
              </div>

              {/* Text area */}
              <div className="px-5 py-5 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}
                    aria-hidden="true"
                  >
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <p className="font-bold text-white text-base leading-snug">{title}</p>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "#A7AFBD" }}>{text}</p>
              </div>
            </div>
          ))}
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
            <div
              className="shrink-0 w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}
              aria-hidden="true"
            >
              <Mail className="w-6 h-6 text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-base leading-snug mb-0.5">Want to learn more?</p>
              <p className="text-sm leading-relaxed" style={{ color: "#A7AFBD" }}>
                Request more information to see how LervIT can help your business grow.
              </p>
            </div>

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
