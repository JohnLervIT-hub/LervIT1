import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  DollarSign, ExternalLink, CheckCircle, Clock,
  ArrowRight, Calendar, TrendingUp, Shield, ChevronRight,
} from "lucide-react";
import { format } from "date-fns";

function fmt(n: string | number | undefined) {
  const val = parseFloat(String(n ?? "0"));
  return val.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function GradientStat({ label, value, sub, gradient, icon: Icon, loading, testId }: {
  label: string; value: string; sub: string; gradient: string;
  icon: React.ElementType; loading?: boolean; testId?: string;
}) {
  return (
    <div className={`rounded-lg p-5 text-white ${gradient}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white/80 uppercase tracking-wide">{label}</p>
          {loading ? (
            <div className="h-8 w-24 bg-white/20 rounded animate-pulse mt-1.5" />
          ) : (
            <p className="text-2xl font-bold mt-1 leading-none" data-testid={testId}>{value}</p>
          )}
          <p className="text-xs text-white/65 mt-1.5">{sub}</p>
        </div>
        <div className="bg-white/20 rounded-md p-2 shrink-0 ml-3">
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </div>
  );
}

function StripeConnectCard({ stripeStatus, onConnect, onDashboard, isConnecting, isDashboard }: {
  stripeStatus: any; onConnect: () => void; onDashboard: () => void;
  isConnecting: boolean; isDashboard: boolean;
}) {
  const connected = stripeStatus?.status === "active";
  const pending = stripeStatus?.status === "pending";
  const restricted = stripeStatus?.status === "restricted";

  if (connected) {
    return (
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded-md p-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-sm">Stripe Payouts Connected</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Payouts are {stripeStatus?.payoutsEnabled ? "enabled" : "pending verification"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onDashboard} disabled={isDashboard} data-testid="button-stripe-dashboard">
            {isDashboard ? "Opening..." : "Open Stripe Dashboard"}
            <ExternalLink className="w-3 h-3 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  if (pending || restricted) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 dark:bg-amber-900/30 rounded-md p-2">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-sm">
                {restricted ? "Stripe Account Restricted" : "Stripe Onboarding In Progress"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {restricted ? "Complete pending requirements to enable payouts" : "Finish setting up your payout account"}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={onConnect} disabled={isConnecting} data-testid="button-stripe-continue">
            {isConnecting ? "Loading..." : "Continue Setup"}
            <ArrowRight className="w-3 h-3 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card px-5 py-5">
      <div className="flex items-start gap-4">
        <div className="bg-primary/10 rounded-md p-2.5 shrink-0">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Connect Stripe to Receive Payouts</p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Link your Stripe account to receive earnings directly. Takes about 5 minutes.
          </p>
          <div className="flex flex-wrap gap-4 mt-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Secure bank connection</span>
            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Automated payouts</span>
            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Tax documents included</span>
          </div>
        </div>
        <Button onClick={onConnect} disabled={isConnecting} data-testid="button-stripe-connect" className="shrink-0">
          {isConnecting ? "Loading..." : "Connect Stripe"}
          <ArrowRight className="w-3 h-3 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

export default function PartnerEarnings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: dashboard, isLoading: dashLoading } = useQuery<any>({ queryKey: ["/api/partner/dashboard"] });
  const { data: earningsData, isLoading: earningsLoading } = useQuery<any>({ queryKey: ["/api/partner/earnings"] });
  const { data: stripeData, isLoading: stripeLoading } = useQuery<any>({ queryKey: ["/api/partner/stripe/status"] });

  const stats = dashboard?.stats;
  const isLoading = dashLoading || earningsLoading;

  const connectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/partner/stripe/connect"),
    onSuccess: (data: any) => { if (data?.url) window.location.href = data.url; },
    onError: () => toast({ title: "Failed to start Stripe onboarding", variant: "destructive" }),
  });

  const dashboardMutation = useMutation({
    mutationFn: () => apiRequest("GET", "/api/partner/stripe/dashboard-link"),
    onSuccess: (data: any) => { if (data?.url) window.open(data.url, "_blank"); },
    onError: () => toast({ title: "Could not open Stripe Dashboard", variant: "destructive" }),
  });

  const totalEarnings = stats?.totalEarnings ?? "0.00";
  const thisMonthEarnings = stats?.thisMonthEarnings ?? "0.00";
  const pendingEarnings = stats?.pendingEarnings ?? "0.00";
  const allEarnings: any[] = earningsData?.earnings ?? [];
  const stripeStatus = stripeData ?? { status: "not_connected", payoutsEnabled: false };
  const totalPaidOut = stripeStatus?.status === "active" ? totalEarnings : null;

  return (
    <PartnerLayout>
      {/* ── Gradient page header ─────────────────────── */}
      <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 px-6 py-7">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-md p-2">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Earnings</h1>
              <p className="text-sm text-white/75 mt-0.5">Revenue from completed bookings and payout settings</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────── */}
      <div className="px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-5">

          {/* Stripe Connect card */}
          {!stripeLoading && (
            <StripeConnectCard
              stripeStatus={stripeStatus}
              onConnect={() => connectMutation.mutate()}
              onDashboard={() => dashboardMutation.mutate()}
              isConnecting={connectMutation.isPending}
              isDashboard={dashboardMutation.isPending}
            />
          )}

          {/* Gradient stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <GradientStat
              label="Total Earned"
              value={`$${fmt(totalEarnings)}`}
              sub="All completed bookings"
              gradient="bg-gradient-to-br from-amber-500 to-orange-600"
              icon={DollarSign}
              loading={isLoading}
              testId="stat-total-earned"
            />
            <GradientStat
              label="This Month"
              value={`$${fmt(thisMonthEarnings)}`}
              sub={format(new Date(), "MMMM yyyy")}
              gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
              icon={Calendar}
              loading={isLoading}
              testId="stat-month-earned"
            />
            <GradientStat
              label="Pending"
              value={`$${fmt(pendingEarnings)}`}
              sub="Active jobs (estimated)"
              gradient="bg-gradient-to-br from-violet-500 to-purple-700"
              icon={Clock}
              loading={isLoading}
              testId="stat-pending-earned"
            />
            <GradientStat
              label="Total Paid Out"
              value={totalPaidOut !== null ? `$${fmt(totalPaidOut)}` : "—"}
              sub={totalPaidOut !== null ? "via Stripe Connect" : "Connect Stripe to track"}
              gradient={totalPaidOut !== null ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-slate-500 to-slate-700"}
              icon={CheckCircle}
              loading={isLoading}
              testId="stat-total-paidout"
            />
          </div>

          {/* Earnings history */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                Earnings History
              </CardTitle>
              <Badge className="text-xs bg-muted text-muted-foreground">
                {allEarnings.length} completed job{allEarnings.length !== 1 ? "s" : ""}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 px-4 pb-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : allEarnings.length === 0 ? (
                <div className="flex flex-col items-center py-14 gap-2 text-muted-foreground">
                  <DollarSign className="w-10 h-10" />
                  <p className="text-sm font-medium">No completed bookings yet</p>
                  <p className="text-xs">Earnings appear here once jobs are completed</p>
                  <Link href="/partner/bookings">
                    <Button variant="outline" size="sm" className="mt-2">View Bookings</Button>
                  </Link>
                </div>
              ) : (
                allEarnings.map((e: any, idx: number) => (
                  <div key={e.id}>
                    <Link href={`/partner/bookings/${e.id}`}>
                      <div className="flex items-center justify-between px-6 py-4 hover-elevate cursor-pointer gap-4" data-testid={`row-earning-${e.id}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="bg-emerald-100 dark:bg-emerald-900/20 rounded-md p-1.5 shrink-0">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{e.pickupAddress}</p>
                              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                              <p className="text-sm text-muted-foreground truncate">{e.dropoffAddress}</p>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              {e.completedAt && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-2.5 h-2.5" />
                                  {format(new Date(e.completedAt), "MMM d, yyyy")}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">#{e.id.slice(-6).toUpperCase()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">${fmt(e.partnerNet)}</p>
                          <p className="text-xs text-muted-foreground">of ${fmt(e.price)} · {parseFloat(e.platformFeePercent ?? "15").toFixed(0)}% fee</p>
                        </div>
                      </div>
                    </Link>
                    {idx < allEarnings.length - 1 && <Separator />}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* How payouts work */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                How Payouts Work
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-5">
                {[
                  { n: "1", title: "Booking Completed", desc: "When a booking is marked Completed, earnings are calculated and credited to your balance." },
                  { n: "2", title: "Platform Fee Deducted", desc: "LervIT deducts a platform fee (typically 15%) from the booking price. The remainder is your payout." },
                  { n: "3", title: "Paid via Stripe", desc: "Payouts are sent to your connected bank account via Stripe Connect on a weekly rolling basis." },
                ].map(({ n, title, desc }) => (
                  <div key={n} className="flex gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">{n}</div>
                    <div>
                      <p className="font-semibold text-sm">{title}</p>
                      <p className="text-muted-foreground text-xs leading-relaxed mt-1">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </PartnerLayout>
  );
}
