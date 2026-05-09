import { Link } from "wouter";
import { ShieldCheck, Mail, Lock, ChevronRight } from "lucide-react";
import truckImg from "../assets/generated_images/partner_network_truck.png";
import dashboardImg from "../assets/generated_images/partner_analytics_dashboard.png";

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

        {/* Three benefit cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">

          {/* Card 1 — More jobs (truck driver) */}
          <div
            className="flex flex-col overflow-hidden rounded-[20px]"
            style={{
              background: "linear-gradient(135deg, #101720 0%, #151C26 100%)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div
              className="flex items-end justify-center overflow-hidden"
              style={{ background: "rgba(255,255,255,0.04)", minHeight: 200 }}
            >
              <img
                src={truckImg}
                alt="Happy LervIT truck driver giving thumbs up"
                className="w-full h-full object-contain object-bottom select-none"
                style={{ maxHeight: 220 }}
                draggable={false}
              />
            </div>
            <div className="px-6 py-5 space-y-2">
              <h3 className="font-display font-bold text-base tracking-tight text-white">More jobs</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#A7AFBD" }}>
                Get consistent leads from customers who are ready to move — no cold calling, no slow seasons.
              </p>
            </div>
          </div>

          {/* Card 2 — Grow your business (analytics dashboard) */}
          <div
            className="flex flex-col overflow-hidden rounded-[20px]"
            style={{
              background: "linear-gradient(135deg, #101720 0%, #151C26 100%)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div
              className="flex items-center justify-center overflow-hidden"
              style={{ background: "rgba(255,255,255,0.04)", minHeight: 200 }}
            >
              <img
                src={dashboardImg}
                alt="Analytics dashboard showing revenue growth"
                className="w-full h-full object-contain select-none"
                style={{ maxHeight: 220 }}
                draggable={false}
              />
            </div>
            <div className="px-6 py-5 space-y-2">
              <h3 className="font-display font-bold text-base tracking-tight text-white">Grow your business</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#A7AFBD" }}>
                Keep more of what you earn and track your growth with clear earnings and performance insights.
              </p>
            </div>
          </div>

          {/* Card 3 — Trusted network (icon, stays the same) */}
          <div
            className="flex flex-col overflow-hidden rounded-[20px]"
            style={{
              background: "linear-gradient(135deg, #101720 0%, #151C26 100%)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div
              className="flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.04)", minHeight: 200 }}
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)", boxShadow: "0 0 48px rgba(37,99,235,0.35)" }}
                aria-hidden="true"
              >
                <ShieldCheck className="w-10 h-10 text-white" />
              </div>
            </div>
            <div className="px-6 py-5 space-y-2">
              <h3 className="font-display font-bold text-base tracking-tight text-white">Trusted network</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#A7AFBD" }}>
                Work with a community of verified partners and deliver every move with confidence.
              </p>
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
            className="rounded-[20px] p-5 md:p-6 flex items-center gap-4 cursor-pointer transition-opacity hover:opacity-90 active:opacity-80 mb-6"
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
                Request an invitation to see how LervIT can help your business grow.
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
