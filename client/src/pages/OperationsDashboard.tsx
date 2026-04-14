import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
} from "recharts";
import { TrendingUp, Users, Truck, Clock, CheckCircle2, AlertTriangle, Zap, Star, Target, Activity, Eye, MousePointerClick } from "lucide-react";

// ---- types ----
type AnalyticsSummary = {
  period: string;
  totalEvents: number;
  uniqueSessions: number;
  uniqueUsers: number;
  pageViews: { page: string; views: number }[];
  eventBreakdown: { event: string; count: number }[];
  dailyTrend: { date: string; views: number }[];
  eventFunnel: { label: string; count: number }[];
  recent: { id: string; eventName: string; page: string | null; sessionId: string | null; userId: string | null; createdAt: string }[];
};

type FunnelStep = { label: string; count: number };
type LiveOps = {
  pendingJobs: number;
  inProgressJobs: number;
  pendingMoverAcceptance: number;
  onlineMovers: number;
  liveGpsMovers: number;
  unverifiedMovers: number;
  notifications: { pending: number; accepted: number; declined: number; expired: number; total: number };
  overallAcceptanceRate: number;
};
type MoverPerf = {
  moverId: string;
  name: string;
  email: string | null;
  phone: string | null;
  isAvailable: boolean;
  isVerified: boolean;
  rating: number | null;
  totalOffers: number;
  accepted: number;
  declined: number;
  expired: number;
  acceptanceRate: number | null;
  completedMoves: number;
};
type RevenueCohort = { week: string; revenue: number; bookings: number; avgValue: number };
type AiAccuracy = { avgPriceAccuracy: number | null; avgVolumeAccuracy: number | null; sampleSize: number };
type OpsMetrics = {
  funnel: FunnelStep[];
  liveOps: LiveOps;
  moverPerformance: MoverPerf[];
  revenueCohorts: RevenueCohort[];
  aiAccuracy: AiAccuracy;
  generatedAt: string;
};

// ---- Funnel Bar ----
const FUNNEL_COLORS = ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#ddd6fe", "#ede9fe"];

function FunnelBar({ steps }: { steps: FunnelStep[] }) {
  const max = steps[0]?.count ?? 1;
  return (
    <div className="space-y-3 mt-2">
      {steps.map((step, i) => {
        const pct = max > 0 ? Math.round((step.count / max) * 100) : 0;
        const dropPct = i > 0 && steps[i - 1].count > 0
          ? Math.round((1 - step.count / steps[i - 1].count) * 100)
          : null;
        return (
          <div key={step.label}>
            <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
              <span className="text-sm font-medium">{step.label}</span>
              <div className="flex items-center gap-2">
                {dropPct !== null && dropPct > 0 && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    -{dropPct}% drop
                  </Badge>
                )}
                <span className="text-sm font-semibold tabular-nums">{step.count.toLocaleString()}</span>
              </div>
            </div>
            <div className="h-7 rounded-md overflow-hidden bg-muted">
              <div
                className="h-full rounded-md transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: FUNNEL_COLORS[i] ?? "#6366f1" }}
              />
            </div>
            <div className="text-xs text-muted-foreground text-right mt-0.5">{pct}% of started</div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Stat card ----
function StatTile({ label, value, sub, icon: Icon, accent = false }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 flex gap-3 items-start">
        <div className={`p-2 rounded-md ${accent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-bold leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Acceptance rate badge ----
function AcceptanceBadge({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = rate >= 70 ? "text-green-600" : rate >= 40 ? "text-amber-600" : "text-red-600";
  return <span className={`font-semibold tabular-nums text-sm ${color}`}>{rate}%</span>;
}

// ---- Custom recharts tooltip ----
function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border rounded-md p-3 shadow-md text-sm">
      <p className="font-medium mb-1">Week of {label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.dataKey === "revenue" ? `$${p.value.toFixed(0)}` : p.value}
        </p>
      ))}
    </div>
  );
}

export default function OperationsDashboard() {
  const [analyticsRange, setAnalyticsRange] = useState("7");

  const { data, isLoading, error, refetch } = useQuery<OpsMetrics>({
    queryKey: ["/api/admin/ops-metrics"],
    refetchInterval: 30000,
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/admin/analytics-summary", analyticsRange],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics-summary?days=${analyticsRange}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
          <p>Failed to load operations metrics.</p>
        </CardContent>
      </Card>
    );
  }

  const { funnel, liveOps, moverPerformance, revenueCohorts, aiAccuracy } = data;

  const cohortChartData = revenueCohorts.map(c => ({
    week: c.week.slice(5), // MM-DD
    revenue: c.revenue,
    bookings: c.bookings,
    avgValue: c.avgValue,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Operations Intelligence</h2>
          <p className="text-sm text-muted-foreground">
            Refreshes every 30 s &bull; Last updated {new Date(data.generatedAt).toLocaleTimeString()}
          </p>
        </div>
      </div>

      <Tabs defaultValue="analytics">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="analytics" data-testid="tab-ops-analytics">Visitor Analytics</TabsTrigger>
          <TabsTrigger value="funnel" data-testid="tab-ops-funnel">Booking Funnel</TabsTrigger>
          <TabsTrigger value="liveops" data-testid="tab-ops-liveops">Live Ops</TabsTrigger>
          <TabsTrigger value="movers" data-testid="tab-ops-movers">Mover Performance</TabsTrigger>
          <TabsTrigger value="revenue" data-testid="tab-ops-revenue">Revenue Cohorts</TabsTrigger>
        </TabsList>

        {/* ===== VISITOR ANALYTICS ===== */}
        <TabsContent value="analytics" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              Events recorded directly from the app — page visits, booking steps, and payments.
            </p>
            <Select value={analyticsRange} onValueChange={setAnalyticsRange}>
              <SelectTrigger className="w-32" data-testid="select-analytics-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 h</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {analyticsLoading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-lg" />)}
            </div>
          ) : !analyticsData ? (
            <Card><CardContent className="pt-6 text-center text-muted-foreground py-10">Failed to load analytics.</CardContent></Card>
          ) : (
            <>
              {/* Top stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile label="Total Events" value={analyticsData.totalEvents.toLocaleString()} icon={Activity} />
                <StatTile label="Unique Sessions" value={analyticsData.uniqueSessions.toLocaleString()} sub="Browser sessions" icon={Eye} />
                <StatTile label="Logged-in Users" value={analyticsData.uniqueUsers.toLocaleString()} sub="With account" icon={Users} />
              </div>

              {analyticsData.totalEvents === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center py-10">
                    <Activity className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground font-medium">No events recorded yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Events will appear here as customers visit pages and complete bookings.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Daily page view trend */}
                  {analyticsData.dailyTrend.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Daily Page Views</CardTitle>
                        <CardDescription>How many page views per day in the selected period.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={analyticsData.dailyTrend}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip />
                            <Line type="monotone" dataKey="views" name="Page Views" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Page breakdown */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Pages Visited</CardTitle>
                      <CardDescription>Which pages customers are landing on most.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {analyticsData.pageViews.map((p) => {
                          const maxViews = analyticsData.pageViews[0]?.views ?? 1;
                          const pct = Math.round((p.views / maxViews) * 100);
                          return (
                            <div key={p.page} data-testid={`row-page-${p.page}`}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium capitalize">{p.page.replace(/_/g, " ")}</span>
                                <span className="text-muted-foreground tabular-nums">{p.views} views</span>
                              </div>
                              <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Event-based booking funnel */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Booking Funnel (from events)</CardTitle>
                      <CardDescription>Real counts from user actions recorded in the app.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FunnelBar steps={analyticsData.eventFunnel} />
                    </CardContent>
                  </Card>

                  {/* All event type breakdown */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Event Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left">
                              <th className="pb-2 pr-4 font-medium text-muted-foreground">Event</th>
                              <th className="pb-2 font-medium text-muted-foreground text-right">Count</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {analyticsData.eventBreakdown.map((e) => (
                              <tr key={e.event} data-testid={`row-event-${e.event}`}>
                                <td className="py-2 pr-4">
                                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{e.event}</code>
                                </td>
                                <td className="py-2 text-right tabular-nums font-semibold">{e.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recent events feed */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Recent Activity</CardTitle>
                      <CardDescription>Last 50 events across all users.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 max-h-80 overflow-y-auto">
                        {analyticsData.recent.map((e) => (
                          <div key={e.id} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0 flex-wrap" data-testid={`row-recent-${e.id}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <MousePointerClick className="w-3 h-3 text-muted-foreground shrink-0" />
                              <code className="text-xs bg-muted px-1 py-0.5 rounded truncate">{e.eventName}</code>
                              {e.page && <span className="text-xs text-muted-foreground truncate">{e.page}</span>}
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </TabsContent>

        {/* ===== FUNNEL ===== */}
        <TabsContent value="funnel" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Booking Conversion Funnel</CardTitle>
              <CardDescription>Tracks how many users progress through each stage of the booking flow.</CardDescription>
            </CardHeader>
            <CardContent>
              {funnel.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">No booking data yet.</p>
              ) : (
                <FunnelBar steps={funnel} />
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="Total Started"
              value={(funnel[0]?.count ?? 0).toLocaleString()}
              icon={Users}
            />
            <StatTile
              label="Payments Completed"
              value={(funnel[3]?.count ?? 0).toLocaleString()}
              icon={CheckCircle2}
            />
            <StatTile
              label="Moves Completed"
              value={(funnel[5]?.count ?? 0).toLocaleString()}
              icon={Truck}
            />
            <StatTile
              label="End-to-End Rate"
              value={
                funnel[0]?.count > 0
                  ? `${Math.round(((funnel[5]?.count ?? 0) / funnel[0].count) * 100)}%`
                  : "—"
              }
              icon={Target}
            />
            <StatTile
              label="Payment Capture Rate"
              value={
                funnel[2]?.count > 0
                  ? `${Math.round(((funnel[3]?.count ?? 0) / funnel[2].count) * 100)}%`
                  : "—"
              }
              icon={TrendingUp}
            />
            <StatTile
              label="Mover Acceptance Rate"
              value={
                funnel[3]?.count > 0
                  ? `${Math.round(((funnel[4]?.count ?? 0) / funnel[3].count) * 100)}%`
                  : "—"
              }
              icon={Star}
            />
          </div>
        </TabsContent>

        {/* ===== LIVE OPS ===== */}
        <TabsContent value="liveops" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="Jobs Awaiting Mover"
              value={liveOps.pendingJobs}
              sub="Paid, no mover yet"
              icon={Clock}
              accent={liveOps.pendingJobs > 0}
            />
            <StatTile
              label="Moves In Progress"
              value={liveOps.inProgressJobs}
              icon={Truck}
            />
            <StatTile
              label="Online Movers"
              value={liveOps.onlineMovers}
              sub={`${liveOps.liveGpsMovers} with live GPS`}
              icon={Zap}
            />
            <StatTile
              label="Pending Notifications"
              value={liveOps.notifications.pending}
              sub="Waiting for mover response"
              icon={Clock}
              accent={liveOps.notifications.pending > 0}
            />
            <StatTile
              label="Overall Acceptance Rate"
              value={`${liveOps.overallAcceptanceRate}%`}
              sub="Across all time"
              icon={CheckCircle2}
            />
            <StatTile
              label="Unverified Movers"
              value={liveOps.unverifiedMovers}
              sub="Verification incomplete"
              icon={AlertTriangle}
              accent={liveOps.unverifiedMovers > 0}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Notification Outcomes</CardTitle>
              <CardDescription>Breakdown of all job notifications ever sent</CardDescription>
            </CardHeader>
            <CardContent>
              {liveOps.notifications.total === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">No notifications yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={[
                      { name: "Accepted", value: liveOps.notifications.accepted, fill: "#22c55e" },
                      { name: "Declined", value: liveOps.notifications.declined, fill: "#ef4444" },
                      { name: "Expired", value: liveOps.notifications.expired, fill: "#f59e0b" },
                      { name: "Pending", value: liveOps.notifications.pending, fill: "#6366f1" },
                    ]}
                    barCategoryGap="30%"
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
                      {[
                        { fill: "#22c55e" }, { fill: "#ef4444" }, { fill: "#f59e0b" }, { fill: "#6366f1" }
                      ].map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== MOVER PERFORMANCE ===== */}
        <TabsContent value="movers" className="space-y-4 mt-4">
          {moverPerformance.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground py-10">
                No mover performance data yet. It appears once job notifications are sent.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Mover Leaderboard</CardTitle>
                  <CardDescription>Sorted by completed moves. Acceptance rate highlights movers with poor engagement.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 pr-4 font-medium text-muted-foreground">Mover</th>
                          <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Offers</th>
                          <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Accept %</th>
                          <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Declined</th>
                          <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Expired</th>
                          <th className="pb-2 font-medium text-muted-foreground text-right">Completed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {moverPerformance.map((m) => (
                          <tr key={m.moverId} data-testid={`row-mover-perf-${m.moverId}`}>
                            <td className="py-2 pr-4">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">{m.name}</span>
                                {m.isAvailable && (
                                  <Badge className="text-xs py-0" variant="outline">Online</Badge>
                                )}
                                {!m.isVerified && (
                                  <Badge className="text-xs py-0 text-amber-600 border-amber-300" variant="outline">Unverified</Badge>
                                )}
                              </div>
                              {m.email && (
                                <p className="text-xs text-muted-foreground mt-0.5">{m.email}</p>
                              )}
                              {m.phone && (
                                <p className="text-xs text-muted-foreground">{m.phone}</p>
                              )}
                              {m.rating !== null && (
                                <p className="text-xs text-muted-foreground">{m.rating.toFixed(1)} ★</p>
                              )}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">{m.totalOffers}</td>
                            <td className="py-2 pr-4 text-right">
                              <AcceptanceBadge rate={m.acceptanceRate} />
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{m.declined}</td>
                            <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{m.expired}</td>
                            <td className="py-2 text-right tabular-nums font-semibold">{m.completedMoves}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* AI accuracy card */}
              {aiAccuracy.sampleSize > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">AI Estimation Accuracy</CardTitle>
                    <CardDescription>Based on {aiAccuracy.sampleSize} completed moves with both estimated and actual data.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Price Accuracy</p>
                      <p className="text-3xl font-bold">
                        {aiAccuracy.avgPriceAccuracy !== null ? `${aiAccuracy.avgPriceAccuracy}%` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">avg across moves</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Volume Accuracy</p>
                      <p className="text-3xl font-bold">
                        {aiAccuracy.avgVolumeAccuracy !== null ? `${aiAccuracy.avgVolumeAccuracy}%` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">avg across moves</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ===== REVENUE COHORTS ===== */}
        <TabsContent value="revenue" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Weekly Revenue</CardTitle>
              <CardDescription>Last 8 weeks — based on paid bookings by creation date.</CardDescription>
            </CardHeader>
            <CardContent>
              {cohortChartData.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-10">No paid bookings yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={cohortChartData} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip content={<RevenueTooltip />} />
                    <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bookings Per Week</CardTitle>
              <CardDescription>Volume trend over the last 8 weeks.</CardDescription>
            </CardHeader>
            <CardContent>
              {cohortChartData.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-10">No paid bookings yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={cohortChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="bookings" name="Bookings" stroke="#818cf8" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {revenueCohorts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Average Booking Value by Week</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-4 font-medium text-muted-foreground">Week of</th>
                        <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Bookings</th>
                        <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Revenue</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Avg Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[...revenueCohorts].reverse().map((c) => (
                        <tr key={c.week} data-testid={`row-cohort-${c.week}`}>
                          <td className="py-2 pr-4">{c.week}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{c.bookings}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">${c.revenue.toFixed(2)}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">${c.avgValue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
