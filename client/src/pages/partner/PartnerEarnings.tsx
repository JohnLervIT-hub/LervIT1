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
  DollarSign, ExternalLink, CheckCircle, AlertCircle, Clock,
  ArrowRight, MapPin, Calendar, TrendingUp, Shield,
} from "lucide-react";
import { format } from "date-fns";

function fmt(n: string | number | undefined) {
  const val = parseFloat(String(n ?? "0"));
  return val.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded-md p-2.5">
                <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">Stripe Payouts Connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Payouts are {stripeStatus?.payoutsEnabled ? "enabled" : "pending verification"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onDashboard}
              disabled={isDashboard}
              data-testid="button-stripe-dashboard"
            >
              {isDashboard ? "Opening..." : "Open Stripe Dashboard"}
              <ExternalLink className="w-3 h-3 ml-1.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pending || restricted) {
    return (
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 dark:bg-amber-900/30 rounded-md p-2.5">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">
                  {restricted ? "Stripe Account Restricted" : "Stripe Onboarding In Progress"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {restricted
                    ? "Complete pending requirements to enable payouts"
                    : "Finish setting up your payout account to receive payments"}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={onConnect}
              disabled={isConnecting}
              data-testid="button-stripe-continue"
            >
              {isConnecting ? "Loading..." : "Continue Setup"}
              <ArrowRight className="w-3 h-3 ml-1.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 rounded-md p-2.5 shrink-0">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Connect Stripe to Receive Payouts</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Link your Stripe account to receive earnings directly from completed bookings.
              Stripe Connect Express takes about 5 minutes to set up.
            </p>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Secure bank connection</span>
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Automated payouts</span>
              <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Tax documents included</span>
            </div>
          </div>
          <Button
            onClick={onConnect}
            disabled={isConnecting}
            data-testid="button-stripe-connect"
            className="shrink-0"
          >
            {isConnecting ? "Loading..." : "Connect Stripe"}
            <ArrowRight className="w-3 h-3 ml-1.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
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
    onSuccess: (data: any) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: () => toast({ title: "Failed to start Stripe onboarding", variant: "destructive" }),
  });

  const dashboardMutation = useMutation({
    mutationFn: () => apiRequest("GET", "/api/partner/stripe/dashboard-link"),
    onSuccess: (data: any) => {
      if (data?.url) window.open(data.url, "_blank");
    },
    onError: () => toast({ title: "Could not open Stripe Dashboard", variant: "destructive" }),
  });

  const totalEarnings = stats?.totalEarnings ?? "0.00";
  const thisMonthEarnings = stats?.thisMonthEarnings ?? "0.00";
  const pendingEarnings = stats?.pendingEarnings ?? "0.00";
  const allEarnings: any[] = earningsData?.earnings ?? [];
  const stripeStatus = stripeData ?? { status: "not_connected", payoutsEnabled: false };
  const totalPaidOut = stripeStatus?.status === "active"
    ? totalEarnings
    : null;

  return (
    <PartnerLayout>
      <div className="p-6 space-y-6 max-w-5xl">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-500" />
              <h1 className="text-2xl font-bold">Earnings</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Revenue from completed bookings and payout settings
            </p>
          </div>
        </div>

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

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Total Earned",
              value: `$${fmt(totalEarnings)}`,
              sub: "All completed bookings",
              color: "text-amber-600 dark:text-amber-400",
              testId: "stat-total-earned",
            },
            {
              label: "This Month",
              value: `$${fmt(thisMonthEarnings)}`,
              sub: format(new Date(), "MMMM yyyy"),
              color: "text-foreground",
              testId: "stat-month-earned",
            },
            {
              label: "Pending",
              value: `$${fmt(pendingEarnings)}`,
              sub: "Active jobs (estimated)",
              color: "text-blue-600 dark:text-blue-400",
              testId: "stat-pending-earned",
            },
            {
              label: "Total Paid Out",
              value: totalPaidOut !== null ? `$${fmt(totalPaidOut)}` : "—",
              sub: totalPaidOut !== null ? "via Stripe Connect" : "Connect Stripe to track",
              color: "text-emerald-600 dark:text-emerald-400",
              testId: "stat-total-paidout",
            },
          ].map(({ label, value, sub, color, testId }) => (
            <Card key={label}>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">{label}</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <p className={`text-2xl font-bold mt-0.5 ${color}`} data-testid={testId}>{value}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Full earnings history */}
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
              <div className="space-y-1 px-4 pb-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : allEarnings.length === 0 ? (
              <div className="flex flex-col items-center py-14 gap-2 text-muted-foreground">
                <DollarSign className="w-10 h-10" />
                <p className="text-sm font-medium">No completed bookings yet</p>
                <p className="text-xs">Earnings will appear here once jobs are completed</p>
                <Link href="/partner/bookings">
                  <Button variant="outline" size="sm" className="mt-2">
                    View Bookings
                  </Button>
                </Link>
              </div>
            ) : (
              <div>
                {allEarnings.map((e: any, idx: number) => (
                  <div key={e.id}>
                    <Link href={`/partner/bookings/${e.id}`}>
                      <div
                        className="flex items-center justify-between px-6 py-4 hover-elevate cursor-pointer gap-4"
                        data-testid={`row-earning-${e.id}`}
                      >
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
                              <span className="text-xs text-muted-foreground">
                                Booking #{e.id.slice(-6).toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                            ${fmt(e.partnerNet)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            of ${fmt(e.price)} · {parseFloat(e.platformFeePercent ?? "15").toFixed(0)}% fee
                          </p>
                        </div>
                      </div>
                    </Link>
                    {idx < allEarnings.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
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
            <div className="grid sm:grid-cols-3 gap-5 text-sm">
              <div>
                <p className="font-medium mb-1">1. Booking Completed</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  When a booking status is marked as Completed, the earnings are calculated and credited to your balance.
                </p>
              </div>
              <div>
                <p className="font-medium mb-1">2. Platform Fee Deducted</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  LervIT deducts a platform fee (typically 15%) from the booking price. The remainder is your payout.
                </p>
              </div>
              <div>
                <p className="font-medium mb-1">3. Paid via Stripe</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Payouts are sent to your connected bank account via Stripe Connect on a weekly rolling basis.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </PartnerLayout>
  );
}
