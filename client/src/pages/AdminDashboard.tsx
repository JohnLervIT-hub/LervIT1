import { useState, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

const OperationsDashboard = lazy(() => import("@/pages/OperationsDashboard"));
import { AdminDashboardSkeleton } from "@/components/DashboardSkeleton";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Users, Truck, Calendar, DollarSign, TrendingUp, Shield, Clock, CheckCircle, ChevronRight, ChevronDown, Check, MapPin, Package, User as UserIcon, Phone, Mail, ArrowRight, Eye, Box, AlertCircle, Trash2, Loader2, MessageSquare, ShieldCheck, Send, Activity, BarChart3, Target, Percent, Radio, Route, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  createdAt: string;
};

type Mover = {
  id: string;
  vehicleType: string;
  isVerified: boolean;
  rating: string;
  totalMoves: number;
  user: {
    name: string;
    email: string;
  } | null;
};

type Booking = {
  id: string;
  status: string;
  price: string | null;
  createdAt: string;
  preferredDate?: string | null;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  loadSize?: string | null;
  description?: string | null;
  distance?: string | null;
  numberOfMovers?: number | null;
  pickupDifficulty?: string | null;
  dropoffDifficulty?: string | null;
  heavyItem?: boolean | null;
  paymentStatus?: string | null;
  customer: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  mover: {
    id?: string;
    name?: string;
    vehicleType?: string;
    rating?: string;
    user?: {
      id?: string;
      name?: string;
    };
  } | null;
};

// Growth Metrics Types
type GrowthMetrics = {
  overview: {
    totalBookings: number;
    weeklyBookings: number;
    monthlyBookings: number;
    completedBookings: number;
    totalRevenue: string;
    avgBookingValue: string;
    conversionRate: string;
  };
  bookings: {
    paid: number;
    pendingPayment: number;
    failed: number;
    statusBreakdown: {
      pending: number;
      accepted: number;
      in_progress: number;
      completed: number;
      cancelled: number;
    };
  };
  users: {
    totalCustomers: number;
    weeklyNewCustomers: number;
    totalMovers: number;
    weeklyNewMovers: number;
    onlineMovers: number;
    verifiedMovers: number;
    liveGpsMovers: number;
  };
  revenue: {
    totalRevenue: string;
    avgBookingValue: string;
    completedCount: number;
    period: string;
  };
  abandoned: {
    total: number;
    recovered: number;
    pending: number;
    recoveryRate: string;
  };
  fulfilment: {
    totalTrackedMoves: number;
    avgMoveMinutes: number;
    avgMoveHours: number;
    fastestMoveMinutes: number;
    slowestMoveMinutes: number;
    avgCompletedDistanceKm: number | null;
    period: string;
    driverPerformance: {
      name: string;
      moverId: string;
      totalMoves: number;
      avgMinutes: number;
      fastestMinutes: number;
      avgDistanceKm: number | null;
      slowestMinutes: number;
      totalHours: number;
    }[];
  };
  trends: {
    dailyBookings: { date: string; count: number }[];
  };
  generatedAt: string;
};

function GrowthDashboard() {
  const { toast } = useToast();
  const [fulfilmentPeriod, setFulfilmentPeriod] = useState<string>('all');
  const [revenuePeriod, setRevenuePeriod] = useState<string>('all');

  const metricsUrl = (() => {
    const params = new URLSearchParams();
    if (fulfilmentPeriod !== 'all') params.set('fulfilmentPeriod', fulfilmentPeriod);
    if (revenuePeriod !== 'all') params.set('revenuePeriod', revenuePeriod);
    const qs = params.toString();
    return qs ? `/api/admin/growth-metrics?${qs}` : `/api/admin/growth-metrics`;
  })();

  const { data: metrics, isLoading, error } = useQuery<GrowthMetrics>({
    queryKey: [metricsUrl],
    refetchInterval: 60000,
  });
  
  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/backfill-performance");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith("/api/admin/growth-metrics") });
      toast({
        title: "Performance Data Updated",
        description: `${data.newlyCreated} new records created from ${data.total} completed bookings.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to backfill performance data.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading growth metrics...</span>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p>Failed to load growth metrics</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <BarChart3 className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wide">Total Bookings</span>
            </div>
            <p className="text-2xl font-bold">{metrics.overview.totalBookings}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.overview.weeklyBookings} this week
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wide">Revenue</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-5 w-5 ml-0.5" data-testid="button-revenue-period">
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setRevenuePeriod('all')} data-testid="option-revenue-all" className="flex items-center justify-between gap-4">
                    All Time {revenuePeriod === 'all' && <Check className="w-3 h-3" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRevenuePeriod('7')} data-testid="option-revenue-7" className="flex items-center justify-between gap-4">
                    Last 7 Days {revenuePeriod === '7' && <Check className="w-3 h-3" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRevenuePeriod('30')} data-testid="option-revenue-30" className="flex items-center justify-between gap-4">
                    Last 30 Days {revenuePeriod === '30' && <Check className="w-3 h-3" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {revenuePeriod !== 'all' && (
                <span className="text-xs ml-1">
                  ({revenuePeriod === '7' ? '7d' : '30d'})
                </span>
              )}
            </div>
            <p className="text-2xl font-bold" data-testid="text-revenue-total">${metrics.revenue?.totalRevenue ?? '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Avg: ${metrics.revenue?.avgBookingValue ?? '—'}
              {(metrics.revenue?.completedCount ?? 0) > 0 && (
                <span className="ml-1">({metrics.revenue!.completedCount} jobs)</span>
              )}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Target className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wide">Conversion</span>
            </div>
            <p className="text-2xl font-bold">{metrics.overview.conversionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.overview.completedBookings} completed
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Percent className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wide">Cart Recovery</span>
            </div>
            <p className="text-2xl font-bold">{metrics.abandoned.recoveryRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.abandoned.recovered}/{metrics.abandoned.total} recovered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Route className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wide">Avg Distance</span>
            </div>
            <p className="text-2xl font-bold" data-testid="text-avg-distance">
              {metrics.fulfilment.avgCompletedDistanceKm !== null
                ? `${metrics.fulfilment.avgCompletedDistanceKm} km`
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">per completed job</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              User Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Total Customers</span>
                <span className="font-medium">{metrics.users.totalCustomers}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">New This Week</span>
                <Badge variant="secondary">+{metrics.users.weeklyNewCustomers}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Total Movers</span>
                <span className="font-medium">{metrics.users.totalMovers}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Online Now</span>
                <Badge className="bg-green-500">{metrics.users.onlineMovers}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Radio className="w-3 h-3" />
                  Live GPS
                </span>
                <Badge className="bg-blue-500">{metrics.users.liveGpsMovers}</Badge>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground">Verified</span>
                <Badge variant="outline">{metrics.users.verifiedMovers}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Booking Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Pending</span>
                <Badge variant="secondary">{metrics.bookings.statusBreakdown.pending}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Accepted</span>
                <Badge className="bg-blue-500">{metrics.bookings.statusBreakdown.accepted}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">In Progress</span>
                <Badge className="bg-amber-500">{metrics.bookings.statusBreakdown.in_progress}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Completed</span>
                <Badge className="bg-green-500">{metrics.bookings.statusBreakdown.completed}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Cancelled</span>
                <Badge variant="destructive">{metrics.bookings.statusBreakdown.cancelled}</Badge>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium text-green-600">{metrics.bookings.paid}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            7-Day Booking Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-24">
            {metrics.trends.dailyBookings.map((day) => (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                <div 
                  className="w-full bg-primary/20 rounded-t"
                  style={{ 
                    height: Math.max(8, day.count * 20),
                    maxHeight: 80 
                  }}
                />
                <span className="text-[10px] text-muted-foreground">{day.date.slice(5)}</span>
                <span className="text-xs font-medium">{day.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Fulfilment Hours
              </CardTitle>
              <CardDescription>
                Time tracking for completed moves by driver
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <Select value={fulfilmentPeriod} onValueChange={setFulfilmentPeriod}>
                  <SelectTrigger className="h-8 text-xs w-32" data-testid="select-fulfilment-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="7">Last 7 Days</SelectItem>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                    <SelectItem value="90">Last 90 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => backfillMutation.mutate()}
                disabled={backfillMutation.isPending}
                data-testid="button-backfill-performance"
              >
                {backfillMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4 mr-1" />
                )}
                Sync Past Moves
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {metrics.fulfilment.totalTrackedMoves === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No completed moves tracked yet</p>
              <p className="text-xs mt-1">Fulfilment data will appear once moves are completed</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold" data-testid="text-total-tracked-moves">{metrics.fulfilment.totalTrackedMoves}</p>
                  <p className="text-xs text-muted-foreground">Tracked Moves</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold" data-testid="text-avg-move-time">
                    {metrics.fulfilment.avgMoveHours >= 1
                      ? `${metrics.fulfilment.avgMoveHours}h`
                      : `${metrics.fulfilment.avgMoveMinutes}m`}
                  </p>
                  <p className="text-xs text-muted-foreground">Avg Move Time</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-green-500" data-testid="text-fastest-move">
                    {metrics.fulfilment.fastestMoveMinutes >= 60
                      ? `${(metrics.fulfilment.fastestMoveMinutes / 60).toFixed(1)}h`
                      : `${metrics.fulfilment.fastestMoveMinutes}m`}
                  </p>
                  <p className="text-xs text-muted-foreground">Fastest Move</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-amber-500" data-testid="text-slowest-move">
                    {metrics.fulfilment.slowestMoveMinutes >= 60
                      ? `${(metrics.fulfilment.slowestMoveMinutes / 60).toFixed(1)}h`
                      : `${metrics.fulfilment.slowestMoveMinutes}m`}
                  </p>
                  <p className="text-xs text-muted-foreground">Slowest Move</p>
                </div>
              </div>

              {metrics.fulfilment.driverPerformance.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Driver Breakdown</h4>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left p-3 font-medium">Driver</th>
                          <th className="text-center p-3 font-medium">Moves</th>
                          <th className="text-center p-3 font-medium">Avg Time</th>
                          <th className="text-center p-3 font-medium hidden sm:table-cell">Fastest</th>
                          <th className="text-center p-3 font-medium hidden sm:table-cell">Slowest</th>
                          <th className="text-center p-3 font-medium hidden md:table-cell">Avg Distance</th>
                          <th className="text-right p-3 font-medium">Total Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.fulfilment.driverPerformance.map((driver) => (
                          <tr key={driver.moverId} className="border-t" data-testid={`row-driver-${driver.moverId}`}>
                            <td className="p-3 font-medium">{driver.name}</td>
                            <td className="p-3 text-center">{driver.totalMoves}</td>
                            <td className="p-3 text-center">
                              {driver.avgMinutes >= 60
                                ? `${(driver.avgMinutes / 60).toFixed(1)}h`
                                : `${driver.avgMinutes}m`}
                            </td>
                            <td className="p-3 text-center text-green-500 hidden sm:table-cell">
                              {driver.fastestMinutes >= 60
                                ? `${(driver.fastestMinutes / 60).toFixed(1)}h`
                                : `${driver.fastestMinutes}m`}
                            </td>
                            <td className="p-3 text-center text-amber-500 hidden sm:table-cell">
                              {driver.slowestMinutes >= 60
                                ? `${(driver.slowestMinutes / 60).toFixed(1)}h`
                                : `${driver.slowestMinutes}m`}
                            </td>
                            <td className="p-3 text-center text-blue-500 hidden md:table-cell">
                              {driver.avgDistanceKm !== null ? `${driver.avgDistanceKm} km` : '—'}
                            </td>
                            <td className="p-3 text-right font-medium">{driver.totalHours}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Abandoned Bookings
          </CardTitle>
          <CardDescription>
            Users who started but didn't complete their booking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-amber-500">{metrics.abandoned.pending}</p>
              <p className="text-xs text-muted-foreground">Pending Follow-up</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-green-500">{metrics.abandoned.recovered}</p>
              <p className="text-xs text-muted-foreground">Recovered</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold">{metrics.abandoned.recoveryRate}%</p>
              <p className="text-xs text-muted-foreground">Recovery Rate</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-right">
        Last updated: {format(new Date(metrics.generatedAt), "MMM d, h:mm a")}
      </p>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const { toast } = useToast();

  const { data: usersResponse, isLoading: usersLoading, error: usersError } = useQuery<{ data: User[], total: number }>({
    queryKey: ["/api/users?limit=200&offset=0"],
  });
  const users = Array.isArray(usersResponse?.data) ? usersResponse.data : [];

  const { data: moversData, isLoading: moversLoading, error: moversError } = useQuery<Mover[]>({
    queryKey: ["/api/movers"],
  });
  const movers = Array.isArray(moversData) ? moversData : [];

  const { data: bookingsData, isLoading: bookingsLoading, error: bookingsError } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
  });
  const bookings = Array.isArray(bookingsData) ? bookingsData : [];

  const { data: openTicketCount } = useQuery<{ count: number }>({
    queryKey: ['/api/admin/support/open-count'],
    refetchInterval: 30000,
  });

  const isLoading = usersLoading || moversLoading || bookingsLoading;
  const hasError = usersError || moversError || bookingsError;

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/admin/cleanup-broken-bookings");
    },
    onSuccess: async (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Cleanup Complete",
        description: response.message || "Broken bookings have been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Cleanup Failed",
        description: "Could not remove broken bookings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const syncCountersMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/sync-mover-counters");
    },
    onSuccess: async (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/movers"] });
      toast({
        title: "Sync Complete",
        description: response.message || "Mover trip counters have been synced.",
      });
    },
    onError: () => {
      toast({
        title: "Sync Failed",
        description: "Could not sync mover trip counters. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-amber-500",
      accepted: "bg-blue-500",
      in_progress: "bg-indigo-500",
      completed: "bg-green-500",
      cancelled: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const getPaymentBadge = (status?: string | null) => {
    if (!status || status === "pending") return <Badge variant="secondary">Unpaid</Badge>;
    if (status === "paid") return <Badge className="bg-green-500">Paid</Badge>;
    if (status === "refunded") return <Badge variant="destructive">Refunded</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  const getLoadSizeLabel = (size?: string | null) => {
    if (!size) return "Unknown";
    const labels: Record<string, string> = {
      boxes: "Boxes Only (1-10 ft³)",
      medium: "Medium Load (11-50 ft³)",
      large: "Large Load (50-170 ft³)",
      apartment: "Full Apartment (170+ ft³)",
    };
    return labels[size] || size;
  };

  const getDifficultyLabel = (difficulty?: string | null) => {
    if (!difficulty) return "Ground Floor";
    const labels: Record<string, string> = {
      ground: "Ground Floor",
      basement: "Basement",
      stairs: "Stairs",
      elevator: "Elevator",
    };
    return labels[difficulty] || difficulty;
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">This page is only available for administrators.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <AdminDashboardSkeleton />;
  }

  if (hasError) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Card className="p-8">
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="w-12 h-12 text-destructive" />
              <h2 className="text-xl font-semibold">Failed to load dashboard data</h2>
              <p className="text-muted-foreground">Please try refreshing the page or check your connection.</p>
              <Button onClick={() => window.location.reload()} data-testid="button-retry-dashboard">
                Try Again
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const totalRevenue = bookings.reduce((sum, b) => sum + (parseFloat(b.price || "0")), 0);
  const completedBookings = bookings.filter(b => b.status === "completed").length;
  const verifiedMovers = movers.filter(m => m.isVerified).length;

  const pendingBookings = bookings.filter(b => b.status === "pending").length;
  const activeBookings = bookings.filter(b => b.status === "in_progress" || b.status === "accepted").length;

  return (
    <div className="min-h-screen pt-24 pb-12 bg-gradient-to-b from-blue-50/50 to-background dark:from-blue-950/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">Admin Dashboard</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => syncCountersMutation.mutate()}
                disabled={syncCountersMutation.isPending}
                data-testid="button-sync-mover-counters"
              >
                {syncCountersMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <TrendingUp className="w-4 h-4 mr-2" />
                )}
                Sync Trip Counters
              </Button>
              <Button
                variant="destructive"
                onClick={() => cleanupMutation.mutate()}
                disabled={cleanupMutation.isPending}
                data-testid="button-cleanup-bookings"
              >
                {cleanupMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Clean Broken Bookings
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground text-lg">Platform overview and management</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Link href="/admin/users" data-testid="link-admin-users">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/25">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-100">Total Users</CardTitle>
                <Users className="w-5 h-5 text-blue-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold" data-testid="stat-total-users">
                  {users?.length || 0}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-blue-200">Registered accounts</p>
                  <ChevronRight className="w-4 h-4 text-blue-200" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/movers?status=verified" data-testid="link-admin-movers">
            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-green-500/25">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-100">Verified Movers</CardTitle>
                <Truck className="w-5 h-5 text-green-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold" data-testid="stat-verified-movers">
                  {verifiedMovers}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-green-200">Active drivers</p>
                  <ChevronRight className="w-4 h-4 text-green-200" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/moves?status=completed" data-testid="link-admin-moves">
            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/25">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-purple-100">Completed Moves</CardTitle>
                <CheckCircle className="w-5 h-5 text-purple-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold" data-testid="stat-completed-bookings">
                  {completedBookings}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-purple-200">Successful deliveries</p>
                  <ChevronRight className="w-4 h-4 text-purple-200" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/revenue" data-testid="link-admin-revenue">
            <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-orange-500/25">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-amber-100">Total Revenue</CardTitle>
                <TrendingUp className="w-5 h-5 text-amber-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold" data-testid="stat-total-revenue">
                  ${totalRevenue.toFixed(2)}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-amber-200">CAD earned</p>
                  <ChevronRight className="w-4 h-4 text-amber-200" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Bookings</CardTitle>
              <Clock className="w-4 h-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{pendingBookings}</div>
              <p className="text-xs text-muted-foreground">Awaiting mover</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Moves</CardTitle>
              <Calendar className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{activeBookings}</div>
              <p className="text-xs text-muted-foreground">Currently in progress</p>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Admin Tools</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Link href="/admin/support" data-testid="link-admin-support">
              <Card className="hover-elevate cursor-pointer h-full relative">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="p-2 rounded-lg bg-rose-500/10">
                    <MessageSquare className="w-5 h-5 text-rose-500" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">Support Tickets</CardTitle>
                    <CardDescription className="text-xs">Manage customer support</CardDescription>
                  </div>
                  {openTicketCount && openTicketCount.count > 0 && (
                    <Badge variant="destructive" className="text-xs" data-testid="badge-open-tickets">
                      {openTicketCount.count} open
                    </Badge>
                  )}
                </CardHeader>
              </Card>
            </Link>
            <Link href="/admin/verification" data-testid="link-admin-verification">
              <Card className="hover-elevate cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Verification</CardTitle>
                    <CardDescription className="text-xs">Review driver documents</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/admin/email-center" data-testid="link-admin-email-center">
              <Card className="hover-elevate cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="p-2 rounded-lg bg-indigo-500/10">
                    <Send className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Email Center</CardTitle>
                    <CardDescription className="text-xs">Send bulk or personal emails</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/admin/payouts" data-testid="link-admin-payouts">
              <Card className="hover-elevate cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <DollarSign className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Mover Payouts</CardTitle>
                    <CardDescription className="text-xs">Process pending earnings</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

        <Tabs defaultValue="bookings">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="movers">Movers</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="growth" data-testid="tab-growth">Growth</TabsTrigger>
            <TabsTrigger value="operations" data-testid="tab-operations">Operations</TabsTrigger>
          </TabsList>

          <TabsContent value="bookings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Bookings</CardTitle>
                <CardDescription>Click on a booking to view full itinerary details</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {!bookings || bookings.length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-muted-foreground">No bookings yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bookings.map((booking) => (
                        <div
                          key={booking.id}
                          className="group p-4 border rounded-lg hover-elevate cursor-pointer transition-all"
                          onClick={() => setSelectedBooking(booking)}
                          data-testid={`booking-row-${booking.id}`}
                        >
                          {/* Header Row: Booker & Status */}
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                <UserIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">
                                  {booking.customer?.name || "Unknown Customer"}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {booking.customer?.email || "No email"}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge className={`${getStatusColor(booking.status)} text-white`}>
                                {booking.status.replace("_", " ")}
                              </Badge>
                              {getPaymentBadge(booking.paymentStatus)}
                            </div>
                          </div>

                          {/* Route Summary */}
                          <div className="flex items-center gap-2 mb-3 text-sm">
                            <MapPin className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="truncate max-w-[180px]">{booking.pickupAddress?.split(",")[0] || "Pickup"}</span>
                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            <MapPin className="w-4 h-4 text-red-500 shrink-0" />
                            <span className="truncate max-w-[180px]">{booking.dropoffAddress?.split(",")[0] || "Dropoff"}</span>
                          </div>

                          {/* Details Row */}
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>{booking.preferredDate ? format(new Date(booking.preferredDate), "MMM d, yyyy") : "No date"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Box className="w-4 h-4" />
                              <span className="capitalize">{booking.loadSize || "Unknown"}</span>
                            </div>
                            {booking.mover && (
                              <div className="flex items-center gap-1">
                                <Truck className="w-4 h-4 text-blue-500" />
                                <span>{booking.mover.user?.name || booking.mover.name || "Assigned"}</span>
                              </div>
                            )}
                            {!booking.mover && (
                              <div className="flex items-center gap-1 text-amber-600">
                                <AlertCircle className="w-4 h-4" />
                                <span>Awaiting mover</span>
                              </div>
                            )}
                            <div className="ml-auto flex items-center gap-2">
                              <span className="font-semibold text-foreground">
                                ${booking.price ? parseFloat(booking.price).toFixed(2) : "0.00"}
                              </span>
                              <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Eye className="w-4 h-4 mr-1" />
                                View
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="movers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Movers</CardTitle>
                <CardDescription>Registered mover accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!movers || movers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No movers registered yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {movers.map((mover) => (
                        <div
                          key={mover.id}
                          className="flex items-center justify-between p-3 border rounded-md"
                          data-testid={`mover-row-${mover.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {mover.user?.name || "Unknown Mover"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {mover.user?.email || "No email"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {mover.vehicleType} • {mover.totalMoves} moves
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {mover.isVerified && (
                              <Badge variant="default">Verified</Badge>
                            )}
                            <span className="text-sm font-medium">
                              {parseFloat(mover.rating).toFixed(1)}★
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
                <CardDescription>Registered user accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!users || users.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No users registered yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {users?.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between p-3 border rounded-md"
                          data-testid={`user-row-${u.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              u.role === 'admin' ? 'bg-purple-100 dark:bg-purple-900/30' :
                              u.role === 'mover' ? 'bg-blue-100 dark:bg-blue-900/30' :
                              'bg-green-100 dark:bg-green-900/30'
                            }`}>
                              <UserIcon className={`w-5 h-5 ${
                                u.role === 'admin' ? 'text-purple-600 dark:text-purple-400' :
                                u.role === 'mover' ? 'text-blue-600 dark:text-blue-400' :
                                'text-green-600 dark:text-green-400'
                              }`} />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{u.name || "Unnamed User"}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="capitalize">
                            {u.role}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="growth" className="space-y-4">
            <GrowthDashboard />
          </TabsContent>

          <TabsContent value="operations" className="space-y-4">
            <Suspense fallback={<div className="space-y-4 animate-pulse">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-lg" />)}</div>}>
              <OperationsDashboard />
            </Suspense>
          </TabsContent>
        </Tabs>

        {/* Booking Detail Dialog */}
        <Dialog open={!!selectedBooking} onOpenChange={(open) => !open && setSelectedBooking(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Booking Details
              </DialogTitle>
              <DialogDescription>
                Full itinerary and booking information
              </DialogDescription>
            </DialogHeader>

            {selectedBooking && (
              <div className="space-y-6">
                {/* Booking ID */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Booking ID:</span>
                  <span className="font-mono font-medium text-foreground" data-testid={`text-booking-id-${selectedBooking.id}`}>
                    #{selectedBooking.id.slice(0, 8).toUpperCase()}
                  </span>
                </div>

                {/* Status & Payment */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={`${getStatusColor(selectedBooking.status)} text-white`}>
                      {selectedBooking.status.replace("_", " ")}
                    </Badge>
                    {getPaymentBadge(selectedBooking.paymentStatus)}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">
                      ${selectedBooking.price ? parseFloat(selectedBooking.price).toFixed(2) : "0.00"} CAD
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Created {format(new Date(selectedBooking.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Customer Info */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Customer</h3>
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <UserIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{selectedBooking.customer?.name || "Unknown"}</p>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-1">
                        {selectedBooking.customer?.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            <span>{selectedBooking.customer.email}</span>
                          </div>
                        )}
                        {selectedBooking.customer?.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            <span>{selectedBooking.customer.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Itinerary */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Itinerary</h3>
                  <div className="space-y-3">
                    {/* Pickup */}
                    <div className="flex gap-3 p-4 border rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-muted-foreground">Pickup Location</p>
                        <p className="font-medium">{selectedBooking.pickupAddress || "Not specified"}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Access: {getDifficultyLabel(selectedBooking.pickupDifficulty)}
                        </p>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
                      </div>
                    </div>

                    {/* Dropoff */}
                    <div className="flex gap-3 p-4 border rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-muted-foreground">Dropoff Location</p>
                        <p className="font-medium">{selectedBooking.dropoffAddress || "Not specified"}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Access: {getDifficultyLabel(selectedBooking.dropoffDifficulty)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Move Details */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Move Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Scheduled Date</span>
                      </div>
                      <p className="font-medium">
                        {selectedBooking.preferredDate 
                          ? format(new Date(selectedBooking.preferredDate), "EEEE, MMM d, yyyy")
                          : "Not scheduled"}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Box className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Load Size</span>
                      </div>
                      <p className="font-medium">{getLoadSizeLabel(selectedBooking.loadSize)}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Movers Required</span>
                      </div>
                      <p className="font-medium">{selectedBooking.numberOfMovers} mover(s)</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Distance</span>
                      </div>
                      <p className="font-medium">
                        {selectedBooking.distance ? `${parseFloat(selectedBooking.distance).toFixed(1)} km` : "Calculating..."}
                      </p>
                    </div>
                  </div>

                  {selectedBooking.heavyItem && (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <AlertCircle className="w-4 h-4" />
                        <span className="font-medium">Heavy items included</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Assigned Mover */}
                {selectedBooking.mover && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Assigned Mover</h3>
                    <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <Truck className="w-6 h-6 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{selectedBooking.mover.user?.name || selectedBooking.mover.name || "Assigned"}</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          {selectedBooking.mover.vehicleType && (
                            <span>{selectedBooking.mover.vehicleType}</span>
                          )}
                          {selectedBooking.mover.rating && (
                            <span>{parseFloat(selectedBooking.mover.rating).toFixed(1)}★</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Description */}
                {selectedBooking.description && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Additional Notes</h3>
                    <div className="p-4 border rounded-lg bg-muted/30">
                      <p className="text-sm">{selectedBooking.description}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
