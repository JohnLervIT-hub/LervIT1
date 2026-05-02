import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowRight, Package, FileCheck, AlertTriangle, Plus,
  ChevronRight, ExternalLink, DollarSign, Truck,
} from "lucide-react";
import { format } from "date-fns";

function fmt(n: string | number | undefined) {
  return parseFloat(String(n ?? "0")).toLocaleString("en-CA", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "completed" ? "bg-green-500" :
    ["new", "under_review"].includes(status) ? "bg-amber-500" :
    ["cancelled", "rejected"].includes(status) ? "bg-red-400" :
    "bg-blue-500";
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function MetricCard({
  label, value, sub, loading, href,
}: { label: string; value: string | number; sub?: string; loading?: boolean; href?: string }) {
  const inner = (
    <Card className={href ? "hover-elevate cursor-pointer" : ""}>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-8 w-20 mt-1" />
        ) : (
          <p className="text-2xl font-semibold mt-1 tabular-nums leading-none">{value}</p>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function PartnerDashboard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/partner/dashboard"] });
  const { data: ctx } = useQuery<any>({ queryKey: ["/api/partner/me"] });
  const { data: stripeData } = useQuery<any>({ queryKey: ["/api/partner/stripe/status"] });

  const connectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/partner/stripe/connect"),
    onSuccess: (data: any) => { if (data?.url) window.location.href = data.url; },
    onError: () => toast({ title: "Failed to start Stripe onboarding", variant: "destructive" }),
  });

  const dashboardLinkMutation = useMutation({
    mutationFn: () => apiRequest("GET", "/api/partner/stripe/dashboard-link"),
    onSuccess: (data: any) => { if (data?.url) window.open(data.url, "_blank"); },
    onError: () => toast({ title: "Could not open Stripe Dashboard", variant: "destructive" }),
  });

  const stats = data?.stats;
  const partner = data?.partner ?? ctx?.partner;
  const totalEarnings = stats?.totalEarnings ?? "0.00";
  const thisMonthEarnings = stats?.thisMonthEarnings ?? "0.00";
  const pendingEarnings = stats?.pendingEarnings ?? "0.00";
  const recentEarnings: any[] = stats?.recentEarnings ?? [];
  const stripeConnected = stripeData?.status === "active";
  const stripePending = ["pending", "restricted"].includes(stripeData?.status ?? "");

  return (
    <PartnerLayout>
      <div className="p-6 space-y-6 max-w-5xl">

        {/* Page title */}
        <div>
          <h1 className="text-xl font-semibold">{partner?.name ?? "Dashboard"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
        </div>

        {/* Onboarding notice */}
        {partner && partner.status !== "active" && (
          <div className="flex items-center justify-between gap-4 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <p className="text-sm font-medium">Onboarding incomplete</p>
              <p className="text-sm text-muted-foreground hidden sm:block">
                — Complete all steps to go live
              </p>
            </div>
            <Link href="/partner/onboarding">
              <Button size="sm" variant="outline" data-testid="button-go-to-onboarding">
                Continue <ArrowRight className="w-3 h-3 ml-1.5" />
              </Button>
            </Link>
          </div>
        )}

        {/* Stripe status banner */}
        {!stripeConnected && !stripePending && (
          <div className="flex items-center justify-between gap-4 rounded-md border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-sm">Connect Stripe to receive payouts from completed bookings</p>
            </div>
            <Link href="/partner/earnings">
              <Button size="sm" variant="outline" data-testid="button-setup-payouts">Set up payouts</Button>
            </Link>
          </div>
        )}

        {stripePending && (
          <div className="flex items-center justify-between gap-4 rounded-md border border-amber-200 dark:border-amber-800 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <p className="text-sm">Stripe onboarding in progress — finish setup to enable payouts</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              data-testid="button-stripe-continue-dashboard"
            >
              {connectMutation.isPending ? "Loading…" : "Continue setup"}
            </Button>
          </div>
        )}

        {stripeConnected && (
          <div className="flex items-center justify-between gap-4 rounded-md border border-green-200 dark:border-green-800 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <p className="text-sm text-muted-foreground">Stripe payouts active</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dashboardLinkMutation.mutate()}
              disabled={dashboardLinkMutation.isPending}
              data-testid="button-stripe-dashboard-link"
            >
              Stripe Dashboard <ExternalLink className="w-3 h-3 ml-1.5" />
            </Button>
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Active Bookings"
            value={stats?.activeBookings?.length ?? 0}
            sub={stats?.pendingBookings > 0 ? `${stats.pendingBookings} new` : undefined}
            loading={isLoading}
            href="/partner/bookings"
          />
          <MetricCard
            label="Completed"
            value={stats?.completedBookings ?? 0}
            sub="All time"
            loading={isLoading}
          />
          <MetricCard
            label="Total Earned"
            value={`$${fmt(totalEarnings)}`}
            sub="After platform fee"
            loading={isLoading}
            href="/partner/earnings"
          />
          <MetricCard
            label="Open Incidents"
            value={stats?.openIncidents ?? 0}
            sub={stats?.openIncidents > 0 ? "Needs attention" : "None open"}
            loading={isLoading}
            href="/partner/incidents"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          {/* Active bookings list */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-0 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">Active Bookings</CardTitle>
              <Link href="/partner/bookings">
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" data-testid="link-all-bookings">
                  View all <ChevronRight className="w-3 h-3 ml-0.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-3">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (stats?.activeBookings?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
                  <Package className="w-7 h-7" />
                  <p className="text-sm">No active bookings</p>
                </div>
              ) : (
                <div className="space-y-px">
                  {stats.activeBookings.slice(0, 6).map((b: any, idx: number) => (
                    <div key={b.id}>
                      <Link href={`/partner/bookings/${b.id}`}>
                        <div
                          className="flex items-center justify-between py-2.5 px-2 rounded-md hover-elevate cursor-pointer gap-3"
                          data-testid={`row-booking-${b.id}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <StatusDot status={b.enterpriseStatus ?? "new"} />
                            <div className="min-w-0">
                              <p className="text-sm truncate">{b.pickupAddress}</p>
                              <p className="text-xs text-muted-foreground truncate">{b.dropoffAddress}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground hidden sm:block">
                              {formatStatus(b.enterpriseStatus ?? "new")}
                            </span>
                            {b.price && (
                              <span className="text-sm font-medium tabular-nums">
                                ${parseFloat(b.price).toFixed(0)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                      {idx < Math.min(stats.activeBookings.length, 6) - 1 && (
                        <Separator className="opacity-50" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right column */}
          <div className="space-y-4">
            {/* Earnings summary */}
            <Card>
              <CardHeader className="pb-0 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">Earnings</CardTitle>
                <Link href="/partner/earnings">
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" data-testid="link-full-earnings">
                    Details <ChevronRight className="w-3 h-3 ml-0.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="pt-3 space-y-3">
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">This month</span>
                      <span className="text-base font-semibold tabular-nums" data-testid="earnings-month">
                        ${fmt(thisMonthEarnings)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">Total earned</span>
                      <span className="text-sm tabular-nums" data-testid="earnings-total">
                        ${fmt(totalEarnings)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">Pending</span>
                      <span className="text-sm tabular-nums text-muted-foreground" data-testid="earnings-pending">
                        ${fmt(pendingEarnings)}
                      </span>
                    </div>
                    {recentEarnings.length > 0 && (
                      <>
                        <Separator className="opacity-50" />
                        <div className="space-y-1">
                          {recentEarnings.slice(0, 3).map((e: any) => (
                            <div key={e.id} className="flex justify-between items-center gap-2" data-testid={`row-earning-${e.id}`}>
                              <p className="text-xs text-muted-foreground truncate">{e.pickupAddress?.split(",")[0]}</p>
                              <span className="text-xs font-medium tabular-nums shrink-0">${fmt(e.partnerNet)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Team */}
            <Card>
              <CardHeader className="pb-0 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">Team</CardTitle>
                <Link href="/partner/team">
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" data-testid="link-team">
                    Manage <ChevronRight className="w-3 h-3 ml-0.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="pt-3 space-y-2">
                {isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">Available</span>
                      <span className="text-base font-semibold tabular-nums">{stats?.activeTeamMembers ?? 0}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">Total</span>
                      <span className="text-sm tabular-nums">{stats?.totalTeamMembers ?? 0}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Quick links */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground px-1 mb-2">Quick actions</p>
              {[
                { href: "/partner/bookings", label: "View bookings", icon: Package },
                { href: "/partner/team", label: "Add team member", icon: Plus },
                { href: "/partner/compliance", label: "Compliance docs", icon: FileCheck },
                { href: "/partner/incidents", label: "Report incident", icon: AlertTriangle },
              ].map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <button
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm text-muted-foreground hover-elevate text-left"
                    data-testid={`quick-action-${label.split(" ")[0].toLowerCase()}`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {label}
                  </button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PartnerLayout>
  );
}
