import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

const OperationsDashboard = lazy(() => import("@/pages/OperationsDashboard"));
import { XavierBriefCard } from "@/components/XavierBriefCard";
import { DemandPipelineCard } from "@/components/DemandPipelineCard";
import { RecruitmentPipelineCard } from "@/components/RecruitmentPipelineCard";
import { VictorNashCard } from "@/components/VictorNashCard";
import { MarkShawCard } from "@/components/MarkShawCard";
import { RileyMorganCard } from "@/components/RileyMorganCard";
import { KaiBennettCard } from "@/components/KaiBennettCard";
import { SamCarterCard } from "@/components/SamCarterCard";
import { AegisCard } from "@/components/AegisCard";
import { ReidCard } from "@/components/ReidCard";
import { NovaCard } from "@/components/NovaCard";
import { EmberCard } from "@/components/EmberCard";
import { AdminDashboardSkeleton } from "@/components/DashboardSkeleton";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Users, Truck, Calendar, DollarSign, TrendingUp, Shield, Clock, CheckCircle, ChevronRight, ChevronDown, ChevronLeft, Check, MapPin, Package, User as UserIcon, Phone, Mail, ArrowRight, Eye, Box, AlertCircle, Trash2, Loader2, MessageSquare, ShieldCheck, Send, Activity, BarChart3, Target, Percent, Radio, Route, Filter, Building2, FileText, BookOpen, Download, ZoomIn, Images, Heart, RefreshCw, Palette } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useVoice } from "@/contexts/VoiceContext";
import { ClickToCall } from "@/components/ClickToCall";

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
  images?: string[] | null;
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

type AdminBookingsResponse = {
  data: Booking[];
  total: number;
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

type SurveyRow = {
  id: string;
  bookingId: string;
  npsScore: number;
  easeRating: number;
  moverRating: number;
  comments: string | null;
  submittedAt: string;
  userName: string;
  userEmail: string;
};

type SurveySummary = {
  totalSurveys: number;
  avgNpsScore: number | null;
  avgEaseRating: number | null;
  avgMoverRating: number | null;
};

function FeedbackTab() {
  const { data: summary } = useQuery<SurveySummary>({ queryKey: ["/api/admin/surveys/summary"] });
  const { data: surveysData } = useQuery<{ data: SurveyRow[]; total: number }>({ queryKey: ["/api/admin/surveys"] });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Surveys", value: summary?.totalSurveys ?? "—" },
          { label: "Avg NPS", value: summary?.avgNpsScore != null ? `${summary.avgNpsScore}/10` : "—" },
          { label: "Avg Ease", value: summary?.avgEaseRating != null ? `${summary.avgEaseRating}/5` : "—" },
          { label: "Avg Mover", value: summary?.avgMoverRating != null ? `${summary.avgMoverRating}/5` : "—" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Surveys {surveysData?.total != null && <span className="text-muted-foreground font-normal text-sm">({surveysData.total} total)</span>}</CardTitle>
        </CardHeader>
        <CardContent>
          {!surveysData?.data?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No surveys submitted yet</p>
          ) : (
            <div className="space-y-2">
              {surveysData.data.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b last:border-0 text-sm">
                  <div>
                    <p className="font-medium">{row.userName}</p>
                    <p className="text-xs text-muted-foreground">{row.userEmail} · {format(new Date(row.submittedAt), "MMM d, yyyy")}</p>
                    {row.comments && <p className="text-xs text-muted-foreground mt-0.5 italic">"{row.comments}"</p>}
                  </div>
                  <div className="flex gap-2 text-xs">
                    <Badge variant="outline">NPS {row.npsScore}/10</Badge>
                    <Badge variant="outline">Ease {row.easeRating}/5</Badge>
                    <Badge variant="outline">Mover {row.moverRating}/5</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GrowthDashboard() {
  const { toast } = useToast();
  const [fulfilmentPeriod, setFulfilmentPeriod] = useState<string>('all');
  const [revenuePeriod, setRevenuePeriod] = useState<string>('all');
  // Preview dialog for agent dry-runs: shows who would be contacted before
  // firing the real outreach batch.
  const [preview, setPreview] = useState<{
    agent: string;
    action: string;
    result: any;
    onConfirm: () => void;
  } | null>(null);

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

  const recoverAbandonedMutation = useMutation({
    mutationFn: async (dryRun: boolean = false) => {
      const res = await apiRequest("POST", "/api/admin/agent/alex/trigger", {
        action: "recover_abandoned",
        input: {},
        dry_run: dryRun,
      });
      const data = await res.json();
      return { ...data, requestedDryRun: dryRun };
    },
    onSuccess: (data) => {
      if (data?.requestedDryRun) {
        setPreview({
          agent: 'Alex Morgan',
          action: 'recover_abandoned',
          result: data.result,
          onConfirm: () => {
            setPreview(null);
            recoverAbandonedMutation.mutate(false);
          },
        });
        return;
      }
      toast({ title: "Alex Morgan", description: "Recovery emails queued for abandoned bookings" });
      queryClient.invalidateQueries({
        predicate: q => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith("/api/admin/growth-metrics"),
      });
    },
    onError: (err: any) => {
      toast({ title: "Recovery failed", description: err?.message, variant: "destructive" });
    },
  });

  const winbackDormantMutation = useMutation({
    mutationFn: async (dryRun: boolean = false) => {
      const res = await apiRequest("POST", "/api/admin/agent/kai/trigger", {
        action: "scan_dormant_customers",
        input: {},
        dry_run: dryRun,
      });
      const data = await res.json();
      return { ...data, requestedDryRun: dryRun };
    },
    onSuccess: (data) => {
      if (data?.requestedDryRun) {
        setPreview({
          agent: 'Kai Bennett',
          action: 'scan_dormant_customers',
          result: data.result,
          onConfirm: () => {
            setPreview(null);
            winbackDormantMutation.mutate(false);
          },
        });
        return;
      }
      toast({ title: "Kai Bennett", description: "Winback scan queued — KAI15 emails sending" });
    },
    onError: (err: any) => {
      toast({ title: "Winback failed", description: err?.message, variant: "destructive" });
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
                <Badge className="bg-green-500 text-white">{metrics.users.onlineMovers}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Radio className="w-3 h-3" />
                  Live GPS
                </span>
                <Badge className="bg-blue-500 text-white">{metrics.users.liveGpsMovers}</Badge>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground">Verified</span>
                <Badge variant="outline">{metrics.users.verifiedMovers}</Badge>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => winbackDormantMutation.mutate(true)}
                disabled={winbackDormantMutation.isPending}
                data-testid="button-kai-winback-dormant-preview"
              >
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                Preview
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => winbackDormantMutation.mutate(false)}
                disabled={winbackDormantMutation.isPending}
                data-testid="button-kai-winback-dormant"
              >
                {winbackDormantMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Heart className="w-3.5 h-3.5 mr-1.5" />}
                Winback Dormant Customers → Kai
              </Button>
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
                <Badge className="bg-blue-500 text-white">{metrics.bookings.statusBreakdown.accepted}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">In Progress</span>
                <Badge className="bg-amber-500 text-white">{metrics.bookings.statusBreakdown.in_progress}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Completed</span>
                <Badge className="bg-green-500 text-white">{metrics.bookings.statusBreakdown.completed}</Badge>
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
            {(metrics.trends?.dailyBookings ?? []).map((day) => (
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
                        {(metrics.fulfilment?.driverPerformance ?? []).map((driver) => (
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
          <div className="flex justify-center gap-2 mt-4 pt-4 border-t">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => recoverAbandonedMutation.mutate(true)}
              disabled={recoverAbandonedMutation.isPending || metrics.abandoned.pending === 0}
              data-testid="button-alex-recover-abandoned-preview"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              Preview
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => recoverAbandonedMutation.mutate(false)}
              disabled={recoverAbandonedMutation.isPending || metrics.abandoned.pending === 0}
              data-testid="button-alex-recover-abandoned"
            >
              {recoverAbandonedMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Recover Abandoned ({metrics.abandoned.pending}) → Alex
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-right">
        Last updated: {format(new Date(metrics.generatedAt), "MMM d, h:mm a")}
      </p>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              {preview?.agent} — preview
            </DialogTitle>
            <DialogDescription>
              Dry run for <code className="text-xs bg-muted px-1 py-0.5 rounded">{preview?.action}</code>. Nothing has been sent yet.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3 pt-1">
              <div className="flex gap-4 text-sm">
                <div className="flex-1 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {Array.isArray(preview.result?.wouldContact) ? preview.result.wouldContact.length : 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Would contact</div>
                </div>
                <div className="flex-1 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {Array.isArray(preview.result?.wouldSkip) ? preview.result.wouldSkip.length : 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Would skip (already contacted)</div>
                </div>
              </div>
              {Array.isArray(preview.result?.wouldSkip) && preview.result.wouldSkip.length > 0 && (
                <div className="max-h-40 overflow-y-auto border rounded-md p-2 text-xs space-y-1">
                  {preview.result.wouldSkip.slice(0, 20).map((s: any, i: number) => (
                    <div key={i} className="flex justify-between text-muted-foreground">
                      <span className="truncate">{s.userId ?? s.moverId ?? s.bookingId ?? '(id)'}</span>
                      <span className="ml-2 shrink-0">{s.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPreview(null)} data-testid="button-preview-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={preview.onConfirm}
                  disabled={!Array.isArray(preview.result?.wouldContact) || preview.result.wouldContact.length === 0}
                  data-testid="button-preview-confirm"
                >
                  Send to {Array.isArray(preview.result?.wouldContact) ? preview.result.wouldContact.length : 0}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [bookingFilter, setBookingFilter] = useState<string>("all");
  const [adminPreviewImages, setAdminPreviewImages] = useState<string[]>([]);
  const [adminPreviewIndex, setAdminPreviewIndex] = useState(0);
  const [adminShowPreview, setAdminShowPreview] = useState(false);
  const { toast } = useToast();
  const { dial } = useVoice();

  const { data: canvaStatus } = useQuery<{ connected: boolean; expiresAt: string | null }>({
    queryKey: ["/api/canva/status"],
  });

  // The Canva OAuth callback redirects back here with ?success/?error — see
  // /api/canva/callback. Report it, then strip the param so a refresh does
  // not replay the toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    if (!success && !error) return;

    const canvaErrors: Record<string, string> = {
      canva_auth_failed: "Canva did not authorize the connection. Try again.",
      canva_state_mismatch: "That Canva link expired. Start the connection again.",
      canva_token_failed:
        "Canva rejected the token exchange. Check CANVA_CLIENT_ID and CANVA_CLIENT_SECRET.",
    };

    if (success === "canva_connected") {
      queryClient.invalidateQueries({ queryKey: ["/api/canva/status"] });
      toast({
        title: "Canva connected",
        description: "The token is stored and refreshes itself — nothing to paste into Railway.",
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error && canvaErrors[error]) {
      toast({
        title: "Canva connection failed",
        description: canvaErrors[error],
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const { data: usersResponse, isLoading: usersLoading, error: usersError } = useQuery<{ data: User[], total: number }>({
    queryKey: ["/api/users?limit=200&offset=0"],
  });
  const users = Array.isArray(usersResponse?.data) ? usersResponse.data : [];

  const { data: moversData, isLoading: moversLoading, error: moversError } = useQuery<Mover[]>({
    queryKey: ["/api/movers"],
  });
  const movers = Array.isArray(moversData) ? moversData : [];

  const { data: bookingsData, isLoading: bookingsLoading, error: bookingsError } = useQuery<Booking[]>({
    queryKey: ["/api/bookings", { limit: 200, offset: 0 }],
    queryFn: async () => {
      const response = await fetch("/api/bookings?limit=200&offset=0", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}`);
      }
      const payload: AdminBookingsResponse | Booking[] = await response.json();
      return Array.isArray(payload) ? payload : payload.data;
    },
    refetchInterval: 30000,
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
    if (!status || status === "pending") return <Badge variant="secondary" className="text-xs py-0">Unpaid</Badge>;
    if (status === "paid" || status === "succeeded") return <Badge className="bg-green-500 text-white text-xs py-0">Paid</Badge>;
    if (status === "refunded") return <Badge variant="destructive" className="text-xs py-0">Refunded</Badge>;
    return <Badge variant="secondary" className="text-xs py-0">{status}</Badge>;
  };

  const getLoadSizeLabel = (size?: string | null) => {
    if (!size) return "Unknown";
    const labels: Record<string, string> = {
      boxes: "Boxes Only (0-20 ft³)",
      medium: "Medium Load (21-180 ft³)",
      large: "Large Load (181-300 ft³)",
      apartment: "Full Apartment (300+ ft³)",
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

  // Earned revenue: only bookings that are completed AND actually paid.
  // Excludes cancelled/failed/pending bookings whose price was set at creation but never collected.
  const earnedRevenue = bookings
    .filter(b => b.status === "completed" && (b.paymentStatus === "paid" || b.paymentStatus === "succeeded"))
    .reduce((sum, b) => sum + (parseFloat(b.price || "0")), 0);
  const completedBookings = bookings.filter(b => b.status === "completed").length;
  const verifiedMovers = movers.filter(m => m.isVerified).length;

  const pendingBookings = bookings.filter(b => b.status === "pending" && (b.paymentStatus === "paid" || b.paymentStatus === "succeeded")).length;
  const activeBookings = bookings.filter(b => b.status === "in_progress" || b.status === "accepted").length;

  const filteredBookings = bookingFilter === "all"
    ? bookings
    : bookings.filter(b => b.status === bookingFilter);

  const bookingStatusCounts: Record<string, number> = {
    pending: bookings.filter(b => b.status === "pending").length,
    confirmed: bookings.filter(b => b.status === "confirmed").length,
    in_progress: bookings.filter(b => b.status === "in_progress").length,
    completed: bookings.filter(b => b.status === "completed").length,
    cancelled: bookings.filter(b => b.status === "cancelled").length,
  };

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-lg">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                LervIT · Platform Admin
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => syncCountersMutation.mutate()} disabled={syncCountersMutation.isPending} data-testid="button-sync-mover-counters">
              {syncCountersMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5 mr-1.5" />}
              Sync Counters
            </Button>
            <Button variant="destructive" size="sm" onClick={() => cleanupMutation.mutate()} disabled={cleanupMutation.isPending} data-testid="button-cleanup-bookings">
              {cleanupMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
              Clean Bookings
            </Button>
          </div>
        </div>

        {/* ── Primary KPI Tiles ── */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
          <Link href="/admin/users" data-testid="link-admin-users">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 cursor-pointer hover-elevate">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-blue-100 uppercase tracking-wide">Total Users</CardTitle>
                <Users className="w-4 h-4 text-blue-200" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold tabular-nums" data-testid="stat-total-users">{usersResponse?.total ?? users?.length ?? 0}</div>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-blue-200">Registered accounts</p>
                  <ChevronRight className="w-3.5 h-3.5 text-blue-200" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/movers?status=verified" data-testid="link-admin-movers">
            <Card className="bg-gradient-to-br from-emerald-500 to-green-600 text-white border-0 cursor-pointer hover-elevate">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-green-100 uppercase tracking-wide">Verified Movers</CardTitle>
                <Truck className="w-4 h-4 text-green-200" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold tabular-nums" data-testid="stat-verified-movers">{verifiedMovers}</div>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-green-200">{movers.length} registered total</p>
                  <ChevronRight className="w-3.5 h-3.5 text-green-200" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/moves?status=completed" data-testid="link-admin-moves">
            <Card className="bg-gradient-to-br from-violet-500 to-purple-600 text-white border-0 cursor-pointer hover-elevate">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-purple-100 uppercase tracking-wide">Completed Moves</CardTitle>
                <CheckCircle className="w-4 h-4 text-purple-200" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold tabular-nums" data-testid="stat-completed-bookings">{completedBookings}</div>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-purple-200">Successful deliveries</p>
                  <ChevronRight className="w-3.5 h-3.5 text-purple-200" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/revenue" data-testid="link-admin-revenue">
            <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0 cursor-pointer hover-elevate">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-amber-100 uppercase tracking-wide">Earned Revenue</CardTitle>
                <TrendingUp className="w-4 h-4 text-amber-200" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-3xl font-bold tabular-nums" data-testid="stat-total-revenue">${earnedRevenue.toFixed(2)}</div>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-amber-200">CAD earned</p>
                  <ChevronRight className="w-3.5 h-3.5 text-amber-200" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* ── Live Platform Health Strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden mb-6 border">
          <div className="bg-card px-4 py-3 flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full shrink-0 ${pendingBookings > 0 ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground/25'}`} />
            <div>
              <p className="text-xl font-bold tabular-nums leading-tight">{pendingBookings}</p>
              <p className="text-xs text-muted-foreground">Paid · Awaiting Mover</p>
            </div>
          </div>
          <div className="bg-card px-4 py-3 flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full shrink-0 ${activeBookings > 0 ? 'bg-blue-500 animate-pulse' : 'bg-muted-foreground/25'}`} />
            <div>
              <p className="text-xl font-bold tabular-nums leading-tight">{activeBookings}</p>
              <p className="text-xs text-muted-foreground">Active Moves</p>
            </div>
          </div>
          <div className="bg-card px-4 py-3 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full shrink-0 bg-muted-foreground/25" />
            <div>
              <p className="text-xl font-bold tabular-nums leading-tight">{bookings.length}</p>
              <p className="text-xs text-muted-foreground">Total Bookings</p>
            </div>
          </div>
          <Link href="/admin/support" className="bg-card px-4 py-3 flex items-center gap-3 hover-elevate">
            <div className={`w-2 h-2 rounded-full shrink-0 ${(openTicketCount?.count ?? 0) > 0 ? 'bg-rose-500 animate-pulse' : 'bg-muted-foreground/25'}`} />
            <div>
              <p className={`text-xl font-bold tabular-nums leading-tight ${(openTicketCount?.count ?? 0) > 0 ? 'text-rose-500' : ''}`} data-testid="badge-open-tickets">
                {openTicketCount?.count ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Open Tickets</p>
            </div>
          </Link>
        </div>

        {/* ── Quick Access ── */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Quick Access</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/support" data-testid="link-admin-support">
              <Button variant="outline" size="sm" className="gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-rose-500" />
                Support
                {openTicketCount && openTicketCount.count > 0 && (
                  <Badge variant="destructive" className="text-xs py-0 px-1.5 ml-0.5">
                    {openTicketCount.count}
                  </Badge>
                )}
              </Button>
            </Link>
            <Link href="/admin/verification" data-testid="link-admin-verification">
              <Button variant="outline" size="sm" className="gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Verification
              </Button>
            </Link>
            <Link href="/admin/email-center" data-testid="link-admin-email-center">
              <Button variant="outline" size="sm" className="gap-2">
                <Send className="w-3.5 h-3.5 text-indigo-500" />
                Email Center
              </Button>
            </Link>
            <Link href="/admin/payouts" data-testid="link-admin-payouts">
              <Button variant="outline" size="sm" className="gap-2">
                <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                Payouts
              </Button>
            </Link>
            <Link href="/admin/partners" data-testid="link-admin-partners">
              <Button variant="outline" size="sm" className="gap-2">
                <Building2 className="w-3.5 h-3.5 text-violet-500" />
                Partners
              </Button>
            </Link>
            {/* Off-origin OAuth redirect — a real navigation, not a wouter Link. */}
            <a href="/api/canva/auth" data-testid="link-connect-canva">
              <Button variant="outline" size="sm" className="gap-2">
                <Palette className="w-3.5 h-3.5 text-cyan-500" />
                {canvaStatus?.connected ? "Reconnect Canva" : "Connect Canva"}
                {canvaStatus?.connected && (
                  <Badge variant="secondary" className="text-xs py-0 px-1.5 ml-0.5">
                    Connected
                  </Badge>
                )}
              </Button>
            </a>
          </div>
        </div>

        {/* ── Data Tabs ── */}
        <Tabs defaultValue="bookings">
          <TabsList className="flex-wrap h-auto gap-1 mb-1">
            <TabsTrigger value="bookings">
              Bookings
              {bookings.length > 0 && <span className="ml-1.5 text-xs opacity-50 tabular-nums">{bookings.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="movers">
              Movers
              {movers.length > 0 && <span className="ml-1.5 text-xs opacity-50 tabular-nums">{movers.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="users">
              Users
              {users.length > 0 && <span className="ml-1.5 text-xs opacity-50 tabular-nums">{users.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="growth" data-testid="tab-growth">Growth</TabsTrigger>
            <TabsTrigger value="operations" data-testid="tab-operations">Operations</TabsTrigger>
            <TabsTrigger value="feedback" data-testid="tab-feedback">Feedback</TabsTrigger>
            <TabsTrigger value="apex" data-testid="tab-apex">APEX</TabsTrigger>
          </TabsList>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">All Bookings</CardTitle>
                    <CardDescription>Click a booking to view full itinerary</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(["all", "pending", "confirmed", "in_progress", "completed", "cancelled"] as const).map(s => (
                      <Button
                        key={s}
                        variant={bookingFilter === s ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setBookingFilter(s)}
                        className="text-xs capitalize h-7 px-2.5"
                      >
                        {s === "all" ? "All" : s.replace("_", " ")}
                        <span className="ml-1 opacity-50 tabular-nums">
                          {s === "all" ? bookings.length : (bookingStatusCounts[s] ?? 0)}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredBookings.length === 0 ? (
                  <div className="text-center py-10">
                    <Package className="w-10 h-10 mx-auto text-muted-foreground/25 mb-3" />
                    <p className="text-muted-foreground text-sm">No {bookingFilter !== "all" ? bookingFilter.replace("_", " ") : ""} bookings</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="group flex items-start gap-3 p-4 border rounded-lg hover-elevate cursor-pointer"
                        onClick={() => setSelectedBooking(booking)}
                        data-testid={`booking-row-${booking.id}`}
                      >
                        <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${getStatusColor(booking.status)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm truncate">{booking.customer?.name || "Unknown Customer"}</p>
                              <p className="text-xs text-muted-foreground truncate">{booking.customer?.email}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <p className="font-bold text-sm tabular-nums">${booking.price ? parseFloat(booking.price).toFixed(2) : "0.00"}</p>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs capitalize text-muted-foreground">{booking.status.replace("_", " ")}</span>
                                {getPaymentBadge(booking.paymentStatus)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground min-w-0">
                            <MapPin className="w-3 h-3 text-green-500 shrink-0" />
                            <span className="truncate">{booking.pickupAddress?.split(",")[0] || "Pickup"}</span>
                            <ArrowRight className="w-3 h-3 shrink-0 opacity-40" />
                            <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                            <span className="truncate">{booking.dropoffAddress?.split(",")[0] || "Dropoff"}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                            <span>{booking.preferredDate ? format(new Date(booking.preferredDate), "MMM d, yyyy 'at' h:mm a") : "No date"}</span>
                            <span className="capitalize">{booking.loadSize || "Unknown load"}</span>
                            {booking.mover ? (
                              <span className="flex items-center gap-1">
                                <Truck className="w-3 h-3 text-primary" />
                                {booking.mover.user?.name || booking.mover.name || "Assigned"}
                              </span>
                            ) : (booking as any).partnerAssignment?.driverName ? (
                              <span className="flex items-center gap-1">
                                <Truck className="w-3 h-3 text-primary" />
                                {(booking as any).partnerAssignment.driverName}
                              </span>
                            ) : booking.status === "pending" ? (
                              <span className="flex items-center gap-1 text-blue-500">
                                <Clock className="w-3 h-3" />
                                Matching mover
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <AlertCircle className="w-3 h-3" />
                                No mover assigned
                              </span>
                            )}
                          </div>
                        </div>
                        <Eye className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors mt-1 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Movers Tab */}
          <TabsContent value="movers" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">All Movers</CardTitle>
                <CardDescription>{movers.length} registered · {verifiedMovers} verified</CardDescription>
              </CardHeader>
              <CardContent>
                {movers.length === 0 ? (
                  <div className="text-center py-10">
                    <Truck className="w-10 h-10 mx-auto text-muted-foreground/25 mb-3" />
                    <p className="text-muted-foreground text-sm">No movers registered yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {movers.map((mover) => (
                      <div key={mover.id} className="flex items-center gap-3 p-3 border rounded-lg" data-testid={`mover-row-${mover.id}`}>
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Truck className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{mover.user?.name || "Unknown Mover"}</p>
                          <p className="text-xs text-muted-foreground truncate">{mover.user?.email}</p>
                          <p className="text-xs text-muted-foreground">{mover.vehicleType} · {mover.totalMoves} moves</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold tabular-nums text-muted-foreground">{parseFloat(mover.rating).toFixed(1)}★</span>
                          {mover.isVerified ? (
                            <Badge variant="default" className="text-xs py-0">Verified</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs py-0">Pending</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">All Users</CardTitle>
                <CardDescription>{users.length} registered accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {!users || users.length === 0 ? (
                    <div className="text-center py-10">
                      <Users className="w-10 h-10 mx-auto text-muted-foreground/25 mb-3" />
                      <p className="text-muted-foreground text-sm">No users registered yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {users?.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-3 p-3 border rounded-lg"
                          data-testid={`user-row-${u.id}`}
                        >
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                            u.role === 'admin' ? 'bg-purple-500/10' :
                            u.role === 'mover' ? 'bg-primary/10' :
                            'bg-emerald-500/10'
                          }`}>
                            <UserIcon className={`w-4 h-4 ${
                              u.role === 'admin' ? 'text-purple-500' :
                              u.role === 'mover' ? 'text-primary' :
                              'text-emerald-500'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{u.name || "Unnamed User"}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            {u.phone && <div className="text-xs"><ClickToCall phone={u.phone} /></div>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground tabular-nums">{format(new Date(u.createdAt), "MMM d, yyyy")}</span>
                            <Badge variant="secondary" className="text-xs py-0 capitalize">{u.role}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Growth Tab */}
          <TabsContent value="growth" className="space-y-4 mt-4">
            <GrowthDashboard />
          </TabsContent>

          {/* Operations Tab */}
          <TabsContent value="operations" className="space-y-4 mt-4">
            <Suspense fallback={
              <div className="space-y-4 animate-pulse">
                {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-lg" />)}
              </div>
            }>
              <OperationsDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="feedback" className="space-y-4 mt-4">
            <FeedbackTab />
          </TabsContent>

          <TabsContent value="apex" className="space-y-4 mt-4">
            {/* Xavier at top — command center */}
            <XavierBriefCard />

            {/* Demand + Supply row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DemandPipelineCard />
              <RecruitmentPipelineCard />
            </div>

            {/* Operations row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VictorNashCard />
              <MarkShawCard />
            </div>

            {/* Lifecycle row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <RileyMorganCard />
              <KaiBennettCard />
            </div>

            {/* Sales — full width */}
            <SamCarterCard />

            {/* Compliance — full width */}
            <AegisCard />

            {/* Document Intelligence — full width */}
            <ReidCard />

            {/* Voice — full width */}
            <NovaCard />

            {/* Content & Marketing — full width */}
            <EmberCard />
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
                          <button type="button" onClick={() => dial(selectedBooking.customer?.phone || "", selectedBooking.id)} className="flex items-center gap-1 text-primary hover:underline">
                            <Phone className="w-4 h-4" />
                            <span>{selectedBooking.customer?.phone}</span>
                          </button>
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
                          ? format(new Date(selectedBooking.preferredDate), "EEEE, MMM d, yyyy 'at' h:mm a")
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

                {/* Load Photos */}
                {selectedBooking.images && selectedBooking.images.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide flex items-center gap-2">
                      <Images className="w-4 h-4" />
                      Load Photos ({selectedBooking.images.length})
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedBooking.images.map((url: string, idx: number) => (
                        <button
                          key={idx}
                          className="relative aspect-square rounded-md overflow-hidden border border-border group focus:outline-none focus:ring-2 focus:ring-primary"
                          onClick={() => {
                            setAdminPreviewImages(selectedBooking.images ?? []);
                            setAdminPreviewIndex(idx);
                            setAdminShowPreview(true);
                          }}
                          aria-label={`View load photo ${idx + 1} of ${(selectedBooking.images ?? []).length}`}
                        >
                          <img
                            src={url.toLowerCase().includes(".heic") || url.toLowerCase().includes(".heif") ? `${url}?f=jpg` : url}
                            alt={`Load photo ${idx + 1}`}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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

        {/* Load photo lightbox */}
        <Dialog open={adminShowPreview} onOpenChange={setAdminShowPreview}>
          <DialogContent className="max-w-3xl p-2 bg-black/95 border-none">
            <DialogTitle className="sr-only">Load photo preview</DialogTitle>
            <DialogDescription className="sr-only">
              Photo {adminPreviewIndex + 1} of {adminPreviewImages.length}
            </DialogDescription>
            <div className="relative flex items-center justify-center min-h-[60vh]">
              {adminPreviewImages[adminPreviewIndex] && (
                <img
                  src={adminPreviewImages[adminPreviewIndex]}
                  alt={`Load photo ${adminPreviewIndex + 1}`}
                  className="max-h-[75vh] max-w-full object-contain rounded"
                />
              )}
              {adminPreviewImages.length > 1 && (
                <>
                  <button
                    onClick={() => setAdminPreviewIndex(i => (i - 1 + adminPreviewImages.length) % adminPreviewImages.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setAdminPreviewIndex(i => (i + 1) % adminPreviewImages.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/70 text-xs">
                    {adminPreviewIndex + 1} / {adminPreviewImages.length}
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
