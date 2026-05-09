import React from "react";
import { ArrowRight, BarChart3, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BoldPartnership() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-8 text-white relative overflow-hidden font-sans">
      {/* Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="max-w-6xl w-full mx-auto relative z-10 py-12 lg:py-24">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium tracking-wide uppercase mb-4">
            <Zap className="w-4 h-4" /> LervIT Enterprise
          </div>
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
            Join the LervIT <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              Partner Network
            </span>
          </h2>
          <p className="text-lg md:text-xl text-slate-400 leading-relaxed">
            Turn downtime into revenue. Receive pre-vetted, high-value enterprise and commercial moving jobs dispatched directly to your fleet.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {[
            {
              icon: <BarChart3 className="w-8 h-8 text-blue-400" />,
              title: "Zero CAC Pipeline",
              description:
                "Stop paying for dead leads. Receive confirmed, prepaid jobs matched exactly to your fleet's capacity and schedule.",
            },
            {
              icon: <ShieldCheck className="w-8 h-8 text-emerald-400" />,
              title: "Guaranteed Payouts",
              description:
                "Payments are escrowed before the move starts. Net-7 automated payouts directly to your business account. Zero risk.",
            },
            {
              icon: <Zap className="w-8 h-8 text-indigo-400" />,
              title: "Smart Dispatch",
              description:
                "Our AI matching engine optimizes your routes. Fill empty return trips and idle truck hours to maximize fleet utilization.",
            },
          ].map((benefit, i) => (
            <div
              key={i}
              className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors group"
            >
              <div className="bg-slate-800/50 w-16 h-16 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {benefit.icon}
              </div>
              <h3 className="text-xl font-bold mb-3">{benefit.title}</h3>
              <p className="text-slate-400 leading-relaxed">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div className="text-center space-y-8">
          <Button
            size="lg"
            className="h-14 px-8 text-lg font-bold bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 border-0 shadow-[0_0_40px_-10px_rgba(59,130,246,0.5)] transition-all hover:shadow-[0_0_60px_-10px_rgba(59,130,246,0.7)]"
          >
            Apply to Become a Partner <ArrowRight className="ml-2 w-5 h-5" />
          </Button>

          {/* Social Proof / Logos */}
          <div className="pt-12 border-t border-slate-800">
            <p className="text-sm text-slate-500 font-medium uppercase tracking-widest mb-6">
              Trusted by Top Commercial Movers in Calgary
            </p>
            <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
              <span className="text-xl font-bold font-serif tracking-tighter">FROST LOGISTICS</span>
              <span className="text-xl font-black tracking-widest">APEX VANLINES</span>
              <span className="text-xl font-bold italic">Summit Transit</span>
              <span className="text-xl font-extrabold">VECTOR<span className="font-light">MOVES</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BoldPartnership;