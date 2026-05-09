import React from "react";
import { CheckCircle2, MapPin, ArrowRight, ClipboardCheck, Briefcase, Wallet, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CommunityNetwork() {
  const steps = [
    {
      icon: <ClipboardCheck className="w-6 h-6 text-amber-600" />,
      title: "Step 1: Apply",
      description: "Tell us about your fleet and team."
    },
    {
      icon: <CheckCircle2 className="w-6 h-6 text-amber-600" />,
      title: "Step 2: Get Verified",
      description: "Quick background & insurance check."
    },
    {
      icon: <Briefcase className="w-6 h-6 text-amber-600" />,
      title: "Step 3: Receive Jobs",
      description: "Get dispatched jobs right away."
    },
    {
      icon: <Wallet className="w-6 h-6 text-amber-600" />,
      title: "Step 4: Get Paid",
      description: "Weekly payouts, guaranteed."
    }
  ];

  const qualifications = [
    "Registered business in Alberta",
    "Commercial auto & liability insurance",
    "Minimum 1 active moving truck",
    "Professional moving equipment",
    "Clean background checks for crew",
    "Commitment to high customer ratings"
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50">
      <div className="max-w-6xl w-full mx-auto bg-white/60 backdrop-blur-md rounded-3xl shadow-xl border border-white/50 overflow-hidden">
        
        {/* Header Section */}
        <div className="text-center pt-16 pb-10 px-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-800 font-medium text-sm mb-6">
            <Users className="w-4 h-4" />
            LervIT Partner Network
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
            Join 50+ Partner Companies <br className="hidden md:block" /> Across Calgary
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Grow your moving business by tapping into Calgary's fastest-growing fulfillment network. We find the jobs, handle the payments, and dispatch directly to your fleet.
          </p>
        </div>

        {/* Process Flow */}
        <div className="px-8 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
            {/* Connecting line for desktop */}
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-amber-200 via-orange-300 to-rose-200 -translate-y-1/2 z-0" />
            
            {steps.map((step, index) => (
              <div key={index} className="relative z-10 flex flex-col items-center text-center group">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center mb-4 transition-transform group-hover:-translate-y-1 group-hover:shadow-lg border border-amber-100">
                  {step.icon}
                </div>
                <h4 className="font-semibold text-slate-900 mb-2">{step.title}</h4>
                <p className="text-sm text-slate-500">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Two Column Layout: Qualifications & Visuals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-t border-slate-200/50 bg-white/40">
          
          {/* Left Col: Checklist */}
          <div className="p-10 lg:p-16 flex flex-col justify-center">
            <h3 className="text-2xl font-bold text-slate-900 mb-8">Who Qualifies?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-10">
              {qualifications.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <span className="text-slate-700 font-medium">{item}</span>
                </div>
              ))}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-md shadow-orange-500/20 rounded-full px-8 h-14 text-base font-semibold group">
                Apply Now
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-full h-14 text-slate-600 border-slate-300 hover:bg-slate-50">
                View Requirements
              </Button>
            </div>
          </div>

          {/* Right Col: Map/Network Visual */}
          <div className="p-10 lg:p-16 bg-gradient-to-br from-amber-100/50 to-orange-100/50 flex flex-col items-center justify-center relative overflow-hidden border-l border-slate-200/50">
             {/* Abstract map representation */}
             <div className="relative w-full max-w-sm aspect-square">
                {/* Decorative circles representing areas */}
                <div className="absolute inset-0 m-auto w-[120%] h-[120%] -translate-x-[10%] -translate-y-[10%] rounded-full border border-orange-200/40 animate-[spin_60s_linear_infinite]" />
                <div className="absolute inset-0 m-auto w-[80%] h-[80%] -translate-x-0 -translate-y-0 rounded-full border border-amber-300/30 animate-[spin_40s_linear_infinite_reverse]" />
                
                {/* Pins */}
                <div className="absolute top-1/4 left-1/4 animate-bounce" style={{ animationDelay: '0s', animationDuration: '3s' }}>
                  <div className="relative group cursor-pointer">
                    <div className="absolute -inset-2 bg-amber-400/20 rounded-full blur-sm group-hover:bg-amber-400/40 transition-colors" />
                    <MapPin className="w-8 h-8 text-amber-600 relative z-10" fill="#fde68a" />
                  </div>
                </div>
                <div className="absolute top-1/3 right-1/4 animate-bounce" style={{ animationDelay: '1s', animationDuration: '3.5s' }}>
                  <div className="relative group cursor-pointer">
                    <div className="absolute -inset-2 bg-orange-400/20 rounded-full blur-sm group-hover:bg-orange-400/40 transition-colors" />
                    <MapPin className="w-10 h-10 text-orange-600 relative z-10" fill="#fed7aa" />
                  </div>
                </div>
                <div className="absolute bottom-1/3 left-1/3 animate-bounce" style={{ animationDelay: '0.5s', animationDuration: '2.8s' }}>
                  <div className="relative group cursor-pointer">
                    <div className="absolute -inset-2 bg-rose-400/20 rounded-full blur-sm group-hover:bg-rose-400/40 transition-colors" />
                    <MapPin className="w-7 h-7 text-rose-500 relative z-10" fill="#fecdd3" />
                  </div>
                </div>
                <div className="absolute bottom-1/4 right-1/3 animate-bounce" style={{ animationDelay: '1.5s', animationDuration: '3.2s' }}>
                  <div className="relative group cursor-pointer">
                    <div className="absolute -inset-2 bg-amber-400/20 rounded-full blur-sm group-hover:bg-amber-400/40 transition-colors" />
                    <MapPin className="w-9 h-9 text-amber-500 relative z-10" fill="#fef08a" />
                  </div>
                </div>

                {/* Central connecting hub */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white rounded-full shadow-xl flex items-center justify-center border-4 border-amber-100 z-20">
                  <div className="w-8 h-8 bg-gradient-to-tr from-amber-500 to-orange-500 rounded-full animate-pulse" />
                </div>
             </div>

             <div className="mt-8 text-center relative z-20 bg-white/80 backdrop-blur px-6 py-3 rounded-2xl shadow-sm border border-orange-100">
               <p className="text-orange-800 font-semibold">Covering all 4 quadrants of Calgary</p>
               <p className="text-sm text-orange-600">Join the growing network</p>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default CommunityNetwork;
