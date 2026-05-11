import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Calendar, ChevronRight, Search, Package, Clock, Download } from "lucide-react";
import { format } from "date-fns";
import { downloadCsv } from "@/lib/exportCsv";

const STATUS_COLOR: Record<string, string> = {
  new:               "bg-blue-500/10 text-blue-600 border-blue-500/20",
  under_review:      "bg-amber-500/10 text-amber-600 border-amber-500/20",
  accepted:          "bg-green-500/10 text-green-600 border-green-500/20",
  rejected:          "bg-red-500/10 text-red-600 border-red-500/20",
  assigned:          "bg-purple-500/10 text-purple-600 border-purple-500/20",
  en_route_to_pickup:"bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  arrived_at_pickup: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  picked_up:         "bg-teal-500/10 text-teal-600 border-teal-500/20",
  in_transit:        "bg-orange-500/10 text-orange-600 border-orange-500/20",
  arrived_at_dropoff:"bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  delivered:         "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  completed:         "bg-green-500/10 text-green-600 border-green-500/20",
  delayed:           "bg-amber-500/10 text-amber-600 border-amber-500/20",
  issue_reported:    "bg-red-500/10 text-red-600 border-red-500/20",
  cancelled:         "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

const STATUS_BAR: Record<string, string> = {
  new:               "bg-blue-500",
  under_review:      "bg-amber-500",
  accepted:          "bg-green-500",
  rejected:          "bg-red-400",
  assigned:          "bg-purple-500",
  en_route_to_pickup:"bg-indigo-500",
  arrived_at_pickup: "bg-cyan-500",
  picked_up:         "bg-teal-500",
  in_transit:        "bg-orange-500",
  arrived_at_dropoff:"bg-emerald-500",
  delivered:         "bg-emerald-500",
  completed:         "bg-green-500",
  delayed:           "bg-amber-500",
  issue_reported:    "bg-red-500",
  cancelled:         "bg-slate-400",
};

const LOAD_SIZE_LABEL: Record<string, string> = {
  boxes: "Boxes / Small", medium: "Medium", large: "Large", apartment: "Full Apartment",
};

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const PENDING_STATUSES = ["new", "under_review"];
const ACTIVE_STATUSES = ["accepted", "assigned", "en_route_to_pickup", "arrived_at_pickup", "picked_up", "in_transit", "arrived_at_dropoff", "delivered", "delayed", "issue_reported"];
const COMPLETED_STATUSES = ["completed"];
const CANCELLED_STATUSES = ["cancelled", "rejected"];

function getTab(status: string): string {
  if (PENDING_STATUSES.includes(status)) return "pending";
  if (ACTIVE_STATUSES.includes(status)) return "active";
  if (COMPLETED_STATUSES.includes(status)) return "completed";
  if (CANCELLED_STATUSES.includes(status)) return "cancelled";
  return "all";
}

export default function PartnerBookings() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const { data: bookings = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/partner/bookings"] });

  const counts = {
    all: bookings.length,
    pending: bookings.filter((b: any) => PENDING_STATUSES.includes(b.enterpriseStatus ?? "")).length,
    active: bookings.filter((b: any) => ACTIVE_STATUSES.includes(b.enterpriseStatus ?? "")).length,
    completed: bookings.filter((b: any) => COMPLETED_STATUSES.includes(b.enterpriseStatus ?? "")).length,
    cancelled: bookings.filter((b: any) => CANCELLED_STATUSES.includes(b.enterpriseStatus ?? "")).length,
  } as Record<string, number>;

  const filtered = bookings.filter((b: any) => {
    const status = b.enterpriseStatus ?? "new";
    const matchesTab = tab === "all" || getTab(status) === tab;
    const q = search.toLowerCase();
    const matchesSearch = !q || (
      b.pickupAddress?.toLowerCase().includes(q) ||
      b.dropoffAddress?.toLowerCase().includes(q) ||
      b.id?.toLowerCase().includes(q)
    );
    return matchesTab && matchesSearch;
  });

  return (
    <PartnerLayout>
      <div className="px-6 py-6">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Page header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold">Bookings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {counts.pending > 0
                ? <><span className="text-blue-600 dark:text-blue-400 font-semibold">{counts.pending} new</span> booking{counts.pending !== 1 ? "s" : ""} awaiting response</>
                : `${bookings.length} total booking${bookings.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading || filtered.length === 0}
            onClick={() => downloadCsv(
              `lervit-bookings-${format(new Date(), "yyyy-MM-dd")}.csv`,
              filtered,
              [
                { key: "id",              label: "Booking ID" },
                { key: "enterpriseStatus",label: "Status",      format: (v) => formatStatus(v ?? "new") },
                { key: "pickupAddress",   label: "Pickup Address" },
                { key: "dropoffAddress",  label: "Dropoff Address" },
                { key: "preferredDate",   label: "Preferred Date", format: (v) => v ? format(new Date(v), "yyyy-MM-dd") : "" },
                { key: "loadSize",        label: "Load Size",   format: (v) => LOAD_SIZE_LABEL[v] ?? v ?? "" },
                { key: "price",           label: "Price (CAD)", format: (v) => v ? parseFloat(v).toFixed(2) : "" },
                { key: "routedToPartnerAt", label: "Routed At", format: (v) => v ? format(new Date(v), "yyyy-MM-dd HH:mm") : "" },
              ]
            )}
            data-testid="button-export-bookings"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>

        {/* Tab bar + search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                data-testid={`tab-${t.key}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {!isLoading && counts[t.key] > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20"
                  }`}>
                    {counts[t.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search bookings…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-bookings"
            />
          </div>
        </div>

        {/* Booking list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Package className="w-10 h-10 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                {search ? "No bookings match your search" : tab !== "all" ? `No ${tab} bookings` : "No bookings yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((b: any) => {
              const status = b.enterpriseStatus ?? "new";
              return (
                <Link key={b.id} href={`/partner/bookings/${b.id}`}>
                  <Card className="hover-elevate cursor-pointer overflow-hidden" data-testid={`card-booking-${b.id}`}>
                    <div className={`h-1 ${STATUS_BAR[status] ?? "bg-muted"}`} />
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={`text-xs ${STATUS_COLOR[status] ?? ""}`} data-testid={`status-${b.id}`}>
                              {formatStatus(status)}
                            </Badge>
                            <span className="text-xs text-muted-foreground font-mono">
                              #{b.id.slice(-8).toUpperCase()}
                            </span>
                            {b.loadSize && (
                              <span className="text-xs text-muted-foreground">
                                · {LOAD_SIZE_LABEL[b.loadSize] ?? b.loadSize}
                              </span>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-start gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
                              <p className="text-sm font-medium truncate">{b.pickupAddress}</p>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                              <p className="text-sm text-muted-foreground truncate">{b.dropoffAddress}</p>
                            </div>
                          </div>
                          {b.preferredDate && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(b.preferredDate), "PPP")}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {b.price && (
                            <span className="font-bold text-base text-primary">${parseFloat(b.price).toFixed(2)}</span>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </PartnerLayout>
  );
}
