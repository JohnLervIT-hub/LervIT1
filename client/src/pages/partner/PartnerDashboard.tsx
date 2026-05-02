import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Package, AlertTriangle, Users, CheckCircle, Clock,
  ChevronRight, ArrowRight, Plus, FileCheck, Truck,
  TrendingUp, Activity,
} from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  assigned: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  en_route_to_pickup: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  in_transit: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function ColorStatCard({
  title, value, sub, icon: Icon, gradient, loading, href,
}: {
  title: string; value: number | string; sub?: string;
  icon: React.ElementType; gradient: string; loading?: boolean; href?: string;
}) {
  const inner = (
    <div className={`rounded-lg p-5 text-white ${gradient} cursor-pointer`} data-testid={`stat-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-white/80">{title}</p>
          {loading ? (
            <div className="h-9 w-16 bg-white/20 rounded animate-pulse mt-1" />
          ) : (
            <p className="text-3xl font-bold mt-1">{value}</p>
          )}
          {sub && <p className="text-xs text-white/70 mt-1">{sub}</p>}
        </div>
        <div className="bg-white/20 rounded-md p-2">
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
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/partner/dashboard"] });
  const { data: ctx } = useQuery<any>({ queryKey: ["/api/partner/me"] });

  const stats = data?.stats;
  const partner = data?.partner ?? ctx?.partner;
  const hasOpenIncidents = (stats?.openIncidents ?? 0) > 0;
  const hasPending = (stats?.pendingBookings ?? 0) > 0;

  return (
    <PartnerLayout>
      <div className="p-6 space-y-6 max-w-6xl">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold">
                {partner?.name ?? "Partner Portal"}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {partner?.name && `${partner.name} · `}Operations Overview
            </p>
          </div>
          {partner?.status === "active" && (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs px-3 py-1">
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

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ColorStatCard
            title="Pending Bookings"
            value={stats?.pendingBookings ?? 0}
            sub={hasPending ? "Awaiting your response" : "All caught up"}
            icon={Clock}
            gradient={hasPending ? "bg-gradient-to-br from-blue-500 to-blue-700" : "bg-gradient-to-br from-slate-500 to-slate-700"}
            loading={isLoading}
            href="/partner/bookings"
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

        {/* Quick actions */}
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

        {/* Main content grid */}
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Active bookings — 2 col */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-500" />
                Active Bookings
              </CardTitle>
              <Link href="/partner/bookings">
                <Button variant="ghost" size="sm" data-testid="link-all-bookings" className="text-xs">
                  View all <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-1">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))
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
                      <Badge className={`text-xs shrink-0 ${STATUS_COLOR[b.enterpriseStatus] ?? ""}`} data-testid={`status-${b.id}`}>
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
                      <span className="font-bold text-green-600 dark:text-green-400 text-lg">{stats?.activeTeamMembers ?? 0}</span>
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

            {/* Performance snapshot */}
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
                      <span className="text-muted-foreground">Pending response</span>
                      <span className={`font-semibold ${hasPending ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {stats?.pendingBookings ?? 0}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PartnerLayout>
  );
}
