import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DollarSign, ExternalLink, CheckCircle, ArrowRight, Calendar } from "lucide-react";
import { format } from "date-fns";

function fmt(n: string | number | undefined) {
  return parseFloat(String(n ?? "0")).toLocaleString("en-CA", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export default function PartnerEarnings() {
  const { toast } = useToast();

  const { data: dashboard, isLoading: dashLoading } = useQuery<any>({ queryKey: ["/api/partner/dashboard"] });
  const { data: earningsData, isLoading: earningsLoading } = useQuery<any>({ queryKey: ["/api/partner/earnings"] });
  const { data: stripeData, isLoading: stripeLoading } = useQuery<any>({ queryKey: ["/api/partner/stripe/status"] });

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

  const stats = dashboard?.stats;
  const isLoading = dashLoading || earningsLoading;

  const totalEarnings = stats?.totalEarnings ?? "0.00";
  const thisMonthEarnings = stats?.thisMonthEarnings ?? "0.00";
  const pendingEarnings = stats?.pendingEarnings ?? "0.00";
  const allEarnings: any[] = earningsData?.earnings ?? [];

  const stripeStatus = stripeData?.status ?? "not_connected";
  const stripeConnected = stripeStatus === "active";
  const stripePending = ["pending", "restricted"].includes(stripeStatus);
  const totalPaidOut = stripeConnected ? totalEarnings : null;

  return (
    <PartnerLayout>
      <div className="p-6 space-y-6 max-w-4xl">

        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold">Earnings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Revenue from completed bookings and payout settings
          </p>
        </div>

        {/* Stripe status */}
        {!stripeLoading && (
          <>
            {stripeConnected && (
              <div className="flex items-center justify-between gap-4 rounded-md border border-green-200 dark:border-green-800 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <p className="text-sm">Stripe payouts active</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => dashboardMutation.mutate()} disabled={dashboardMutation.isPending} data-testid="button-stripe-dashboard">
                  {dashboardMutation.isPending ? "Opening…" : "Stripe Dashboard"} <ExternalLink className="w-3 h-3 ml-1.5" />
                </Button>
              </div>
            )}

            {stripePending && (
              <div className="flex items-center justify-between gap-4 rounded-md border border-amber-200 dark:border-amber-800 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <p className="text-sm">Stripe onboarding in progress — finish setup to enable payouts</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending} data-testid="button-stripe-continue">
                  {connectMutation.isPending ? "Loading…" : "Continue Setup"} <ArrowRight className="w-3 h-3 ml-1.5" />
                </Button>
              </div>
            )}

            {!stripeConnected && !stripePending && (
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Connect Stripe to receive payouts</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Link your bank account via Stripe Connect Express. Takes about 5 minutes.
                      </p>
                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Secure bank connection</span>
                        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Weekly payouts</span>
                        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Tax documents</span>
                      </div>
                    </div>
                    <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending} data-testid="button-stripe-connect">
                      {connectMutation.isPending ? "Loading…" : "Connect Stripe"}
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Earned", value: `$${fmt(totalEarnings)}`, sub: "All time", testId: "stat-total-earned" },
            { label: "This Month", value: `$${fmt(thisMonthEarnings)}`, sub: format(new Date(), "MMMM yyyy"), testId: "stat-month-earned" },
            { label: "Pending", value: `$${fmt(pendingEarnings)}`, sub: "Active jobs", testId: "stat-pending-earned" },
            { label: "Total Paid Out", value: totalPaidOut !== null ? `$${fmt(totalPaidOut)}` : "—", sub: totalPaidOut !== null ? "via Stripe" : "Connect Stripe", testId: "stat-total-paidout" },
          ].map(({ label, value, sub, testId }) => (
            <Card key={label}>
              <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-semibold mt-1 tabular-nums leading-none" data-testid={testId}>{value}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Earnings history */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Earnings History</h2>
            <span className="text-xs text-muted-foreground">
              {allEarnings.length} completed job{allEarnings.length !== 1 ? "s" : ""}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : allEarnings.length === 0 ? (
            <div className="flex flex-col items-center py-14 gap-2 text-muted-foreground">
              <DollarSign className="w-8 h-8" />
              <p className="text-sm">No completed bookings yet</p>
              <Link href="/partner/bookings">
                <Button variant="outline" size="sm" className="mt-1">View Bookings</Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-md border">
              {allEarnings.map((e: any, idx: number) => (
                <div key={e.id}>
                  <Link href={`/partner/bookings/${e.id}`}>
                    <div
                      className="flex items-center justify-between px-4 py-3 hover-elevate cursor-pointer gap-4"
                      data-testid={`row-earning-${e.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm truncate">{e.pickupAddress}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span className="truncate">{e.dropoffAddress}</span>
                            {e.completedAt && (
                              <>
                                <span>·</span>
                                <span className="flex items-center gap-1 shrink-0">
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(e.completedAt), "MMM d, yyyy")}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums">${fmt(e.partnerNet)}</p>
                        <p className="text-xs text-muted-foreground">
                          of ${fmt(e.price)} · {parseFloat(e.platformFeePercent ?? "15").toFixed(0)}% fee
                        </p>
                      </div>
                    </div>
                  </Link>
                  {idx < allEarnings.length - 1 && <Separator className="opacity-40" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* How payouts work */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">How Payouts Work</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-5">
              {[
                { step: "1", title: "Booking Completed", desc: "Once a booking is marked Completed, your earnings are calculated and credited." },
                { step: "2", title: "Platform Fee Deducted", desc: "LervIT deducts a platform fee (typically 15%). The remainder is your payout." },
                { step: "3", title: "Paid via Stripe", desc: "Payouts are sent to your connected bank account via Stripe Connect on a weekly basis." },
              ].map(({ step, title, desc }) => (
                <div key={step} className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{step}</p>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </PartnerLayout>
  );
}
