import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MapPin,
  Calendar,
  ChevronRight,
  Search,
  Package,
} from "lucide-react";
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
  boxes: "Boxes / Small",
  medium: "Medium",
  large: "Large",
  apartment: "Full Apartment",
};

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

const ALL_STATUSES = [
  "new", "under_review", "accepted", "assigned",
  "en_route_to_pickup", "arrived_at_pickup", "picked_up",
  "in_transit", "arrived_at_dropoff", "delivered",
  "completed", "delayed", "issue_reported", "cancelled", "rejected",
];

export default function PartnerBookings() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: bookings = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/partner/bookings"],
  });

  const filtered = bookings.filter((b: any) => {
    const matchesStatus = statusFilter === "all" || b.enterpriseStatus === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || (
      b.pickupAddress?.toLowerCase().includes(q) ||
      b.dropoffAddress?.toLowerCase().includes(q) ||
      b.id?.toLowerCase().includes(q)
    );
    return matchesStatus && matchesSearch;
  });

  const pendingCount = bookings.filter((b: any) => ["new", "under_review"].includes(b.enterpriseStatus ?? "")).length;

  return (
    <PartnerLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Bookings</h1>
            {pendingCount > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                <span className="text-blue-600 font-medium">{pendingCount} new booking{pendingCount > 1 ? "s" : ""}</span> awaiting your response
              </p>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by address or ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-bookings"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-52" data-testid="select-status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ALL_STATUSES.map(s => (
                <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Booking list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Package className="w-10 h-10 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                {search || statusFilter !== "all" ? "No bookings match your filters" : "No bookings yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((b: any) => (
              <Link key={b.id} href={`/partner/bookings/${b.id}`}>
                <Card
                  className="hover-elevate cursor-pointer transition-none"
                  data-testid={`card-booking-${b.id}`}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            className={`text-xs ${STATUS_COLOR[b.enterpriseStatus ?? "new"] ?? ""}`}
                            data-testid={`status-${b.id}`}
                          >
                            {formatStatus(b.enterpriseStatus ?? "new")}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">#{b.id.slice(-8).toUpperCase()}</span>
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
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(b.preferredDate), "PPP")}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {b.price && (
                          <span className="font-semibold text-sm">${parseFloat(b.price).toFixed(2)}</span>
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
    </PartnerLayout>
  );
}
