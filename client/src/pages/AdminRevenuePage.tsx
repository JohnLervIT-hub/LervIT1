import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  ArrowLeft,
  TrendingUp,
  Calendar,
  CreditCard,
  Filter,
  ChevronLeft,
  ChevronRight,
  Percent,
  Truck,
  XCircle,
  AlertTriangle,
  Clock,
  Building2,
} from "lucide-react";
import { format } from "date-fns";

type Booking = {
  id: string;
  status: string;
  price: string | null;
  paymentStatus: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  preferredDate: string;
  createdAt: string;
  customer: {
    id?: string;
    name?: string;
    email?: string;
  } | null;
  mover: {
    id?: string;
    name?: string;
    vehicleType?: string;
  } | null;
};

type RevenueSummary = {
  period: string;
  earned: { count: number; revenue: number; avgBookingValue: number };
  platformFees: number;
  moverPayouts: number;
  cancelled: { count: number; value: number };
  paymentFailed: { count: number; value: number };
  pending: { count: number; revenue: number };
  partner: { count: number; revenue: number };
  revenueThisWeek: number;
  revenueThisMonth: number;
  totalBookings: number;
};

type PeriodKey = "7d" | "30d" | "all";

const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7d": "This Week",
  "30d": "This Month",
  "all": "All Time",
};

// Normalise the many raw payment_status values coming from the DB into
// the four labels the customer-facing table should ever show.
function paymentLabel(raw: string | null | undefined): { label: string; variant: "paid" | "pending" | "failed" | "unknown" } {
  const v = (raw ?? "").toLowerCase();
  if (v === "paid" || v === "succeeded") return { label: "Paid", variant: "paid" };
  if (v === "pending" || v === "pending_payment") return { label: "Pending", variant: "pending" };
  if (v === "failed" || v === "payment_failed") return { label: "Failed", variant: "failed" };
  if (!v) return { label: "Pending", variant: "pending" };
  return { label: v.charAt(0).toUpperCase() + v.slice(1), variant: "unknown" };
}

export default function AdminRevenuePage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data: summary, isLoading: summaryLoading } = useQuery<RevenueSummary>({
    queryKey: ["/api/admin/revenue/summary", period],
    queryFn: async () => {
      const r = await fetch(`/api/admin/revenue/summary?period=${period}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      return r.json();
    },
  });

  const { data: bookings, isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
  });

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">This page is only available for administrators.</p>
        </div>
      </div>
    );
  }

  // "In Progress (Paid)" = customer has paid but the move hasn't been marked
  // completed yet. This is the honest replacement for the old "Paid Not
  // Completed" label — it's operational risk, not refund liability.
  const inProgressPaidBookings = (bookings ?? []).filter(b =>
    (b.paymentStatus === "paid" || b.paymentStatus === "succeeded") &&
    b.status !== "completed" &&
    b.status !== "cancelled"
  );
  const inProgressPaidAmount = inProgressPaidBookings.reduce(
    (sum, b) => sum + parseFloat(b.price || "0"),
    0
  );

  // Completed-and-paid bookings for the table — same filter the server uses
  // for earned_revenue, so the "Filtered Total" reconciles with the KPI card.
  const completedPaidBookings = (bookings ?? []).filter(b =>
    b.status === "completed" && (b.paymentStatus === "paid" || b.paymentStatus === "succeeded")
  );
  // The server applies the same period filter on the summary, so the row
  // count here can differ slightly from summary.earned.count when we still
  // only have the raw booking list; that's fine — the KPI numbers come from
  // the server, this table is just the drill-down.
  const filteredTableBookings = completedPaidBookings.filter(b => {
    if (period === "all") return true;
    const cutoffMs = period === "7d" ? 7 : 30;
    const cutoff = new Date(Date.now() - cutoffMs * 24 * 60 * 60 * 1000);
    // Same proxy the server uses (updated_at on the row -> createdAt on
    // the enriched shape isn't guaranteed either way, but preferredDate is
    // the closest client-visible completion signal).
    const ref = b.preferredDate || b.createdAt;
    return ref ? new Date(ref) >= cutoff : true;
  });
  const filteredTableTotal = filteredTableBookings.reduce(
    (sum, b) => sum + parseFloat(b.price || "0"),
    0
  );

  const fmt = (n: number | undefined) => `$${(n ?? 0).toFixed(2)}`;

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-admin">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Command Center
            </Button>
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 rounded-lg">
                <DollarSign className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Revenue Overview</h1>
                <p className="text-sm text-muted-foreground">Track earnings, fees, and payouts</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Period:</span>
              <Select value={period} onValueChange={(v) => { setPeriod(v as PeriodKey); setCurrentPage(1); }}>
                <SelectTrigger className="w-[130px]" data-testid="select-filter-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">This Week</SelectItem>
                  <SelectItem value="30d">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ── Primary KPI row — all respond to the period selector ── */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
          <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-amber-100">Earned Revenue</CardTitle>
              <DollarSign className="w-5 h-5 text-amber-200" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums" data-testid="stat-total-revenue">
                {fmt(summary?.earned.revenue)}
              </div>
              <p className="text-xs text-amber-200 mt-1">
                {summary?.earned.count ?? 0} completed &amp; paid · {PERIOD_LABEL[period]}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Platform Fees</CardTitle>
              <Percent className="w-4 h-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-emerald-600" data-testid="stat-platform-fees">
                {fmt(summary?.platformFees)}
              </div>
              <p className="text-xs text-muted-foreground">LervIT commission</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mover Payouts</CardTitle>
              <Truck className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-blue-600" data-testid="stat-mover-payouts">
                {fmt(summary?.moverPayouts)}
              </div>
              <p className="text-xs text-muted-foreground">Paid to movers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Avg. Booking</CardTitle>
              <CreditCard className="w-4 h-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-purple-600" data-testid="stat-avg-booking">
                {fmt(summary?.earned.avgBookingValue)}
              </div>
              <p className="text-xs text-muted-foreground">Per completed &amp; paid move</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Fixed-window snapshots (independent of the period selector) ── */}
        <div className="grid gap-4 md:grid-cols-3 mb-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last 7 Days</CardTitle>
              <TrendingUp className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-green-600">{fmt(summary?.revenueThisWeek)}</div>
              <p className="text-xs text-muted-foreground">Completed &amp; paid</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last 30 Days</CardTitle>
              <Calendar className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-blue-600">{fmt(summary?.revenueThisMonth)}</div>
              <p className="text-xs text-muted-foreground">Completed &amp; paid</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Partner Revenue</CardTitle>
              <Building2 className="w-4 h-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-indigo-600" data-testid="stat-partner-revenue">
                {fmt(summary?.partner.revenue)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary?.partner.count ?? 0} jobs fulfilled by partners
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Not-earned buckets — counts / uncollected exposure ── */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending Payment</CardTitle>
              <Clock className="w-4 h-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-amber-600" data-testid="stat-pending-payment">
                {fmt(summary?.pending.revenue)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary?.pending.count ?? 0} bookings started, not paid yet
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cancelled Bookings</CardTitle>
              <XCircle className="w-4 h-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-rose-600" data-testid="stat-cancelled">
                {summary?.cancelled.count ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Not counted as revenue</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment Failed</CardTitle>
              <AlertTriangle className="w-4 h-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-orange-600" data-testid="stat-payment-failed">
                {summary?.paymentFailed.count ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Not counted as revenue</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">In Progress (Paid)</CardTitle>
              <Clock className="w-4 h-4 text-sky-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-sky-600" data-testid="stat-in-progress-paid">
                {fmt(inProgressPaidAmount)}
              </div>
              <p className="text-xs text-muted-foreground">
                {inProgressPaidBookings.length} paid, move not yet completed
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-muted-foreground" />
              Completed &amp; Paid Moves
            </CardTitle>
            <span className="text-sm text-muted-foreground">{PERIOD_LABEL[period]}</span>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Filtered Total (completed &amp; paid):</span>
              <span className="text-lg font-bold text-green-600" data-testid="stat-filtered-total">{fmt(filteredTableTotal)}</span>
            </div>
            {(bookingsLoading || summaryLoading) ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : filteredTableBookings.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Mover</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTableBookings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((b) => {
                      const pay = paymentLabel(b.paymentStatus);
                      return (
                        <TableRow key={b.id} data-testid={`row-revenue-${b.id}`}>
                          <TableCell>
                            {b.preferredDate ? format(new Date(b.preferredDate), "MMM d, yyyy") : "N/A"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {b.customer?.name || "Unknown Customer"}
                          </TableCell>
                          <TableCell>
                            {b.mover?.name || "N/A"}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <div className="truncate text-sm" title={b.pickupAddress}>
                              {b.pickupAddress?.split(",")[0] || "N/A"}
                            </div>
                            <div className="truncate text-xs text-muted-foreground" title={b.dropoffAddress}>
                              → {b.dropoffAddress?.split(",")[0] || "N/A"}
                            </div>
                          </TableCell>
                          <TableCell className="font-bold text-green-600">
                            ${parseFloat(b.price || "0").toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {pay.variant === "paid" ? (
                              <Badge className="bg-green-500 text-white">{pay.label}</Badge>
                            ) : pay.variant === "failed" ? (
                              <Badge className="bg-rose-500 text-white">{pay.label}</Badge>
                            ) : (
                              <Badge variant="secondary">{pay.label}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredTableBookings.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-4 border-t border-border mt-2">
                    <span className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredTableBookings.length)} of {filteredTableBookings.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      {Array.from({ length: Math.ceil(filteredTableBookings.length / PAGE_SIZE) }, (_, i) => i + 1).map(page => (
                        <Button
                          key={page}
                          variant={page === currentPage ? "default" : "outline"}
                          size="icon"
                          onClick={() => setCurrentPage(page)}
                          data-testid={`button-page-${page}`}
                          className="w-9"
                        >
                          {page}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredTableBookings.length / PAGE_SIZE), p + 1))}
                        disabled={currentPage === Math.ceil(filteredTableBookings.length / PAGE_SIZE)}
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No completed &amp; paid moves in {PERIOD_LABEL[period].toLowerCase()}</p>
                {period !== "all" && completedPaidBookings.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPeriod("all")}
                    className="mt-2 text-primary"
                  >
                    View all completed &amp; paid moves
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
