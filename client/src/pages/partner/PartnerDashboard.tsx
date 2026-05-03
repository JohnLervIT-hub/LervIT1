import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Package, AlertTriangle, Users, CheckCircle, Clock,
  ChevronRight, ArrowRight, Plus, FileCheck, Truck,
  TrendingUp, Activity, DollarSign, MapPin, ExternalLink, Shield, Star,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_COLOR: Record<string, string> = {
  new:               "bg-blue-500/10 text-blue-600 border-blue-500/20",
  under_review:      "bg-amber-500/10 text-amber-600 border-amber-500/20",
  accepted:          "bg-green-500/10 text-green-600 border-green-500/20",
  rejected:          "bg-red-500/10 text-red-600 border-red-500/20",
  assigned:          "bg-purple-500/10 text-purple-600 border-purple-500/20",
  en_route_to_pickup:"bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  in_transit:        "bg-orange-500/10 text-orange-600 border-orange-500/20",
  arrived_at_dropoff:"bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  delivered:         "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  completed:         "bg-green-500/10 text-green-600 border-green-500/20",
  delayed:           "bg-amber-500/10 text-amber-600 border-amber-500/20",
  issue_reported:    "bg-red-500/10 text-red-600 border-red-500/20",
  cancelled:         "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fmt(n: string | number | undefined) {
  const val = parseFloat(String(n ?? "0"));
  return val.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ColorStatCard({
  title, value, sub, icon: Icon, gradient, loading, href,
}: {
  title: string; value: string | number; sub?: string;
  icon: React.ElementType; gradient: string; loading?: boolean; href?: string;
}) {
  const inner = (
    <div className={`rounded-lg p-5 text-white ${gradient}`} data-testid={`stat-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white/80">{title}</p>
          {loading ? (
            <div className="h-9 w-24 bg-white/20 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-3xl font-bold mt-1 leading-none">{value}</p>
          )}
          {sub && <p className="text-xs text-white/70 mt-1.5">{sub}</p>}
        </div>
        <div className="bg-white/20 rounded-md p-2 shrink-0 ml-3">
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      {href && (
        <div className="flex items-center gap-1 mt-3 text-xs text-white/80 font-medium">
          View details <ChevronRight className="w-3 h-3" />
        </div>
      )}
    </div>
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
  const hasOpenIncidents = (stats?.openIncidents ?? 0) > 0;
  const hasPending = (stats?.pendingBookings ?? 0) > 0;

  const totalEarnings = stats?.totalEarnings ?? "0.00";
  const thisMonthEarnings = stats?.thisMonthEarnings ?? "0.00";
  const pendingEarnings = stats?.pendingEarnings ?? "0.00";
  const recentEarnings: any[] = stats?.recentEarnings ?? [];
  const hasEarnings = parseFloat(totalEarnings) > 0;

  const stripeConnected = stripeData?.status === "active";
  const stripePending = stripeData?.status === "pending" || stripeData?.status === "restricted";
  const totalPaidOut = stripeConnected ? totalEarnings : null;

  return (
    <PartnerLayout>
      <div className="px-6 py-6">
      <div className="space-y-6 max-w-6xl mx-auto">

        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold">{partner?.name ?? "Partner Portal"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Operations &amp; Earnings Overview</p>
          </div>
          {partner?.status === "active" && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
              Active Partner
            </Badge>
          )}
        </div>

        {/* Onboarding banner */}
        {partner && partner.status !== "active" && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 dark:bg-amber-900/30 rounded-md p-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Complete your onboarding to go live</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Status: <span className="capitalize font-medium text-amber-700 dark:text-amber-400">{partner.status?.replace(/_/g, " ")}</span>
                  </p>
                </div>
              </div>
              <Link href="/partner/onboarding">
                <Button size="sm" data-testid="button-go-to-onboarding">
                  Continue Onboarding <ArrowRight className="w-3 h-3 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ── Stripe Connect banner ────────────────────── */}
        {!stripeConnected && !stripePending && (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 rounded-md p-2 shrink-0">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Connect Stripe to receive payouts</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Set up your payout account to receive earnings from completed bookings automatically.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href="/partner/earnings">
                  <Button variant="outline" size="sm" data-testid="button-setup-payouts">
                    Set Up Payouts
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {stripePending && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 dark:bg-amber-900/30 rounded-md p-2">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Stripe onboarding in progress</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Complete setup to enable payouts</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                data-testid="button-stripe-continue-dashboard"
              >
                {connectMutation.isPending ? "Loading..." : "Continue Setup"}
                <ArrowRight className="w-3 h-3 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {stripeConnected && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Stripe payouts active</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dashboardLinkMutation.mutate()}
                disabled={dashboardLinkMutation.isPending}
                data-testid="button-stripe-dashboard-link"
                className="text-xs"
              >
                Open Stripe Dashboard <ExternalLink className="w-3 h-3 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Top stat row ─────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ColorStatCard
            title="Total Earned"
            value={`$${fmt(totalEarnings)}`}
            sub="All completed bookings"
            icon={DollarSign}
            gradient="bg-gradient-to-br from-amber-500 to-orange-600"
            loading={isLoading}
            href="/partner/earnings"
          />
          <ColorStatCard
            title="Active Bookings"
            value={stats?.activeBookings?.length ?? 0}
            sub="In progress now"
            icon={Truck}
            gradient="bg-gradient-to-br from-indigo-500 to-indigo-700"
            loading={isLoading}
            href="/partner/bookings"
          />
          <ColorStatCard
            title="Completed"
            value={stats?.completedBookings ?? 0}
            sub="Successful deliveries"
            icon={CheckCircle}
            gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
            loading={isLoading}
          />
          <ColorStatCard
            title="Open Incidents"
            value={stats?.openIncidents ?? 0}
            sub={hasOpenIncidents ? "Needs attention" : "No open issues"}
            icon={AlertTriangle}
            gradient={hasOpenIncidents ? "bg-gradient-to-br from-red-500 to-red-700" : "bg-gradient-to-br from-slate-500 to-slate-700"}
            loading={isLoading}
            href="/partner/incidents"
          />
        </div>

        {/* ── Earnings breakdown card ───────────────────── */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-500" />
              Earnings Breakdown
            </CardTitle>
            <Link href="/partner/earnings">
              <Button variant="ghost" size="sm" className="text-xs" data-testid="link-full-earnings">
                Full History <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary row — 4 columns */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Earned</p>
                    <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5" data-testid="earnings-total">
                      ${fmt(totalEarnings)}
                    </p>
                    <p className="text-xs text-muted-foreground">all time</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Paid Out</p>
                    <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5" data-testid="earnings-paidout">
                      {totalPaidOut !== null ? `$${fmt(totalPaidOut)}` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {totalPaidOut !== null ? "via Stripe" : "connect Stripe"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">This Month</p>
                    <p className="text-xl font-bold mt-0.5" data-testid="earnings-month">
                      ${fmt(thisMonthEarnings)}
                    </p>
                    <p className="text-xs text-muted-foreground">{format(new Date(), "MMMM yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5" data-testid="earnings-pending">
                      ${fmt(pendingEarnings)}
                    </p>
                    <p className="text-xs text-muted-foreground">from active jobs</p>
                  </div>
                </div>

                {/* Recent earnings list */}
                {recentEarnings.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Recent Completed Jobs
                      </p>
                      <div className="space-y-1">
                        {recentEarnings.map((e: any) => (
                          <Link key={e.id} href={`/partner/bookings/${e.id}`}>
                            <div
                              className="flex items-center justify-between px-3 py-2.5 rounded-md hover-elevate cursor-pointer gap-3"
                              data-testid={`row-earning-${e.id}`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm truncate">{e.pickupAddress}</p>
                                  <p className="text-xs text-muted-foreground truncate">→ {e.dropoffAddress}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                  ${fmt(e.partnerNet)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  of ${fmt(e.price)} · {parseFloat(e.platformFeePercent ?? "15").toFixed(0)}% fee
                                </p>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {!hasEarnings && recentEarnings.length === 0 && (
                  <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
                    <DollarSign className="w-8 h-8" />
                    <p className="text-sm">Earnings will appear once bookings are completed</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Quick actions ─────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/partner/bookings">
              <Button variant="outline" size="sm" data-testid="quick-action-bookings">
                <Package className="w-3.5 h-3.5 mr-1.5" /> View Bookings
              </Button>
            </Link>
            <Link href="/partner/team">
              <Button variant="outline" size="sm" data-testid="quick-action-team">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Team Member
              </Button>
            </Link>
            <Link href="/partner/compliance">
              <Button variant="outline" size="sm" data-testid="quick-action-compliance">
                <FileCheck className="w-3.5 h-3.5 mr-1.5" /> Compliance Docs
              </Button>
            </Link>
            <Link href="/partner/incidents">
              <Button variant="outline" size="sm" data-testid="quick-action-incidents">
                <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> Report Incident
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Bottom grid ───────────────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Active bookings — 2 cols */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-500" />
                Active Bookings
                {hasPending && (
                  <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/20 ml-1">
                    {stats.pendingBookings} new
                  </Badge>
                )}
              </CardTitle>
              <Link href="/partner/bookings">
                <Button variant="ghost" size="sm" data-testid="link-all-bookings" className="text-xs">
                  View all <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-1">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
              ) : (stats?.activeBookings?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
                  <Package className="w-8 h-8" />
                  <p className="text-sm">No active bookings</p>
                </div>
              ) : (
                stats.activeBookings.slice(0, 6).map((b: any) => (
                  <Link key={b.id} href={`/partner/bookings/${b.id}`}>
                    <div
                      className="flex items-center justify-between px-3 py-2.5 rounded-md hover-elevate cursor-pointer gap-3"
                      data-testid={`row-booking-${b.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{b.pickupAddress}</p>
                        <p className="text-xs text-muted-foreground truncate">→ {b.dropoffAddress}</p>
                      </div>
                      <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_COLOR[b.enterpriseStatus] ?? ""}`} data-testid={`status-${b.id}`}>
                        {formatStatus(b.enterpriseStatus ?? "new")}
                      </Badge>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {/* Right column */}
          <div className="space-y-5">
            {/* Team */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-500" />
                  Team
                </CardTitle>
                <Link href="/partner/team">
                  <Button variant="ghost" size="sm" className="text-xs" data-testid="link-team">
                    Manage <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Available now</span>
                      <span className="font-bold text-green-600 dark:text-green-400 text-lg">
                        {stats?.activeTeamMembers ?? 0}
                      </span>
                    </div>
                    <Progress
                      value={stats?.totalTeamMembers ? (stats.activeTeamMembers / stats.totalTeamMembers) * 100 : 0}
                      className="h-2"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{stats?.activeTeamMembers ?? 0} available</span>
                      <span>{stats?.totalTeamMembers ?? 0} total</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Avg. customer rating</span>
                      {stats?.avgRating != null ? (
                        <span className="font-semibold flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          {stats.avgRating.toFixed(1)} / 5
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">No ratings yet</span>
                      )}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Completion rate</span>
                      <span className="font-semibold">
                        {stats?.completedBookings && (stats.completedBookings + (stats.activeBookings?.length ?? 0)) > 0
                          ? Math.round((stats.completedBookings / (stats.completedBookings + (stats.activeBookings?.length ?? 0))) * 100)
                          : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Open incidents</span>
                      <span className={`font-semibold ${hasOpenIncidents ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                        {stats?.openIncidents ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Platform fee</span>
                      <span className="font-semibold text-muted-foreground">15%</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      </div>
    </PartnerLayout>
  );
}
