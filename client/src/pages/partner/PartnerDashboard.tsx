import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  AlertTriangle,
  Users,
  CheckCircle,
  Clock,
  TrendingUp,
  ChevronRight,
  ArrowRight,
} from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  assigned: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  en_route_to_pickup: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  arrived_at_pickup: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  picked_up: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  in_transit: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  arrived_at_dropoff: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  delayed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  issue_reported: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-1" data-testid={`stat-${title.toLowerCase().replace(/\s/g, "-")}`}>
                {value}
              </p>
            )}
          </div>
          <div className={`p-3 rounded-md ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PartnerDashboard() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/partner/dashboard"] });
  const { data: ctx } = useQuery<any>({ queryKey: ["/api/partner/me"] });

  const stats = data?.stats;
  const partner = data?.partner ?? ctx?.partner;

  return (
    <PartnerLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">
            {isLoading ? "Dashboard" : `Welcome, ${partner?.name ?? "Partner"}`}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Here's an overview of your operations
          </p>
        </div>

        {/* Onboarding banner */}
        {partner && partner.status !== "active" && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Complete your onboarding to go live</p>
                    <p className="text-xs text-muted-foreground">
                      Status: <span className="capitalize font-medium">{partner.status?.replace(/_/g, " ")}</span>
                    </p>
                  </div>
                </div>
                <Link href="/partner/onboarding">
                  <Button size="sm" data-testid="button-go-to-onboarding">
                    Continue Onboarding <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Pending Bookings"
            value={stats?.pendingBookings ?? 0}
            icon={Clock}
            color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            loading={isLoading}
          />
          <StatCard
            title="Active Bookings"
            value={stats?.activeBookings?.length ?? 0}
            icon={Package}
            color="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
            loading={isLoading}
          />
          <StatCard
            title="Completed"
            value={stats?.completedBookings ?? 0}
            icon={CheckCircle}
            color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            loading={isLoading}
          />
          <StatCard
            title="Open Incidents"
            value={stats?.openIncidents ?? 0}
            icon={AlertTriangle}
            color={
              (stats?.openIncidents ?? 0) > 0
                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                : "bg-muted text-muted-foreground"
            }
            loading={isLoading}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Active bookings */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Active Bookings</CardTitle>
              <Link href="/partner/bookings">
                <Button variant="ghost" size="sm" data-testid="link-all-bookings">
                  View all <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))
              ) : (stats?.activeBookings?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No active bookings</p>
              ) : (
                stats.activeBookings.slice(0, 5).map((b: any) => (
                  <Link key={b.id} href={`/partner/bookings/${b.id}`}>
                    <div
                      className="flex items-center justify-between p-3 rounded-md hover-elevate cursor-pointer"
                      data-testid={`row-booking-${b.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{b.pickupAddress}</p>
                        <p className="text-xs text-muted-foreground truncate">→ {b.dropoffAddress}</p>
                      </div>
                      <Badge
                        className={`text-xs shrink-0 ml-2 ${STATUS_COLOR[b.enterpriseStatus] ?? ""}`}
                        data-testid={`status-${b.id}`}
                      >
                        {formatStatus(b.enterpriseStatus ?? "new")}
                      </Badge>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {/* Team overview */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Team Overview</CardTitle>
              <Link href="/partner/team">
                <Button variant="ghost" size="sm" data-testid="link-team">
                  Manage <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center">
                    <div className="flex items-center justify-center w-12 h-12 rounded-md bg-green-100 dark:bg-green-900/30">
                      <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-2xl font-bold mt-2">{stats?.activeTeamMembers ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Available</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted">
                      <Users className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-bold mt-2">{stats?.totalTeamMembers ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PartnerLayout>
  );
}
