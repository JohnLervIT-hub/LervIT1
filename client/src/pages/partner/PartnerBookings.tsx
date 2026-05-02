import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Calendar, ChevronRight, Search, Package, Clock } from "lucide-react";
import { format } from "date-fns";

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
        <div>
          <h1 className="text-xl font-bold">Bookings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {counts.pending > 0
              ? <><span className="text-blue-600 dark:text-blue-400 font-semibold">{counts.pending} new</span> booking{counts.pending !== 1 ? "s" : ""} awaiting response</>
              : `${bookings.length} total booking${bookings.length !== 1 ? "s" : ""}`}
          </p>
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
            {filtered.map((b: any) => (
              <Link key={b.id} href={`/partner/bookings/${b.id}`}>
                <Card className="hover-elevate cursor-pointer" data-testid={`card-booking-${b.id}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-xs ${STATUS_COLOR[b.enterpriseStatus ?? "new"] ?? ""}`} data-testid={`status-${b.id}`}>
                            {formatStatus(b.enterpriseStatus ?? "new")}
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
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="text-sm min-w-0">
                            <p className="font-medium truncate">{b.pickupAddress}</p>
                            <p className="text-muted-foreground truncate">→ {b.dropoffAddress}</p>
                          </div>
                        </div>
                        {b.preferredDate && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {format(new Date(b.preferredDate), "PPP")}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {b.price && (
                          <span className="font-bold text-base">${parseFloat(b.price).toFixed(2)}</span>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
      </div>
    </PartnerLayout>
  );
}
