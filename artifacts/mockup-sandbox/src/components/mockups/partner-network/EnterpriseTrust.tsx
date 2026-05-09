import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ShieldCheck, Clock, Headphones } from "lucide-react";

export function EnterpriseTrust() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Left Column: Content */}
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
              <ShieldCheck className="w-4 h-4" />
              LervIT Partner Network
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 leading-tight">
              Scale your fleet operations with zero marketing spend.
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed max-w-lg">
              Join Calgary's premier dispatch network. We acquire the customers, verify the inventory, and guarantee payment. You focus on what you do best: moving.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-slate-900">Verified Partner Badge</h4>
                <p className="text-sm text-slate-500">Stand out with priority placement on premium enterprise jobs.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-slate-900">SLA Guarantee</h4>
                <p className="text-sm text-slate-500">Protection against last-minute cancellations and inaccurate inventory.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-slate-900">24-Hour Payouts</h4>
                <p className="text-sm text-slate-500">No net-30 terms. Get paid directly to your account the day after the move.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Headphones className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-slate-900">Dedicated Support</h4>
                <p className="text-sm text-slate-500">Direct line to our operations team for active job resolution.</p>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-14 text-base font-medium rounded-lg">
              Apply as Partner
            </Button>
            <p className="text-xs text-slate-400 mt-3">Requires commercial insurance and WCB coverage.</p>
          </div>
        </div>

        {/* Right Column: Stats Block */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="bg-slate-50 border-none shadow-none rounded-2xl sm:col-span-2">
            <CardContent className="p-8 flex flex-col justify-center items-center text-center">
              <div className="text-5xl font-bold tracking-tight text-slate-900 mb-2">1,240+</div>
              <div className="text-sm font-medium text-slate-500 uppercase tracking-wider">Jobs Dispatched</div>
              <div className="mt-4 text-sm text-slate-600 max-w-xs">
                To our enterprise partners in the last 12 months alone.
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-50 border-none shadow-none rounded-2xl">
            <CardContent className="p-8 flex flex-col justify-center items-center text-center h-full">
              <div className="text-4xl font-bold tracking-tight text-slate-900 mb-2">98.5%</div>
              <div className="text-sm font-medium text-slate-500 uppercase tracking-wider">Completion Rate</div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-50 border-none shadow-none rounded-2xl">
            <CardContent className="p-8 flex flex-col justify-center items-center text-center h-full">
              <div className="flex items-center gap-1 text-4xl font-bold tracking-tight text-slate-900 mb-2">
                4.9
                <span className="text-blue-600 text-2xl">★</span>
              </div>
              <div className="text-sm font-medium text-slate-500 uppercase tracking-wider">Partner Rating</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default EnterpriseTrust;
