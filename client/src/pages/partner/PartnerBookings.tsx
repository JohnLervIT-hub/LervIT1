import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PartnerLayout } from "./PartnerLayout";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Search, Package, MapPin, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const PENDING_STATUSES = ["new", "under_review"];
const ACTIVE_STATUSES = ["accepted", "assigned", "en_route_to_pickup", "arrived_at_pickup", "picked_up", "in_transit", "arrived_at_dropoff", "delivered", "delayed", "issue_reported"];
const COMPLETED_STATUSES = ["completed"];
const CANCELLED_STATUSES = ["cancelled", "rejected"];

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

function getTab(status: string) {
  if (PENDING_STATUSES.includes(status)) return "pending";
  if (ACTIVE_STATUSES.includes(status)) return "active";
  if (COMPLETED_STATUSES.includes(status)) return "completed";
  if (CANCELLED_STATUSES.includes(status)) return "cancelled";
  return "all";
}

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function StatusDot({ status }: { status: string }) {
  const color =
    PENDING_STATUSES.includes(status) ? "bg-amber-500" :
    ACTIVE_STATUSES.includes(status) ? "bg-blue-500" :
    COMPLETED_STATUSES.includes(status) ? "bg-green-500" :
    "bg-gray-400";
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

const LOAD_LABEL: Record<string, string> = {
  boxes: "Small", medium: "Medium", large: "Large", apartment: "Apartment",
};

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
    return matchesTab && (!q || b.pickupAddress?.toLowerCase().includes(q) || b.dropoffAddress?.toLowerCase().includes(q) || b.id?.toLowerCase().includes(q));
  });

  return (
    <PartnerLayout>
      <div className="p-6 space-y-5 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Bookings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {counts.pending > 0
                ? <>{counts.pending} new &middot; {bookings.length} total</>
                : `${bookings.length} total`}
            </p>
          </div>
        </div>

        {/* Tabs + search */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-0 border-b border-transparent">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                data-testid={`tab-${t.key}`}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? "border-foreground text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {!isLoading && counts[t.key] > 0 && (
                  <span className={`text-xs tabular-nums ${tab === t.key ? "text-foreground" : "text-muted-foreground"}`}>
                    {counts[t.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm w-56"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-bookings"
            />
          </div>
        </div>

        <Separator />

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2 text-muted-foreground">
            <Package className="w-8 h-8" />
            <p className="text-sm">{search ? "No bookings match your search" : `No ${tab === "all" ? "" : tab} bookings`}</p>
          </div>
        ) : (
          <div className="space-y-px">
            {filtered.map((b: any, idx: number) => (
              <div key={b.id}>
                <Link href={`/partner/bookings/${b.id}`}>
                  <div
                    className="flex items-center justify-between py-3 px-2 rounded-md hover-elevate cursor-pointer gap-4"
                    data-testid={`card-booking-${b.id}`}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="mt-1 shrink-0">
                        <StatusDot status={b.enterpriseStatus ?? "new"} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{b.pickupAddress}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-xs text-muted-foreground truncate">{b.dropoffAddress}</p>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span className="font-mono">{b.id.slice(-8).toUpperCase()}</span>
                          <span>{formatStatus(b.enterpriseStatus ?? "new")}</span>
                          {b.loadSize && <span>{LOAD_LABEL[b.loadSize] ?? b.loadSize}</span>}
                          {b.preferredDate && (
                            <span>{format(new Date(b.preferredDate), "MMM d")}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {b.price && (
                        <span className="text-sm font-medium tabular-nums">
                          ${parseFloat(b.price).toFixed(2)}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
                {idx < filtered.length - 1 && <Separator className="opacity-40" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </PartnerLayout>
  );
}
