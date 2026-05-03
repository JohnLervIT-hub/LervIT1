import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  History, CheckCircle, XCircle, Upload, UserPlus, FileCheck,
  ScrollText, Settings, AlertTriangle, ArrowRight, Search, X,
} from "lucide-react";
import { format, isToday, isYesterday, subDays, startOfDay } from "date-fns";

const ACTION_META: Record<string, { icon: React.ElementType; color: string; label: string; category: string }> = {
  "booking.accepted":       { icon: CheckCircle,   color: "text-green-500",   label: "Booking Accepted",      category: "bookings" },
  "booking.rejected":       { icon: XCircle,       color: "text-red-500",     label: "Booking Rejected",      category: "bookings" },
  "booking.assigned":       { icon: ArrowRight,    color: "text-purple-500",  label: "Booking Assigned",      category: "bookings" },
  "booking.status_updated": { icon: ArrowRight,    color: "text-blue-500",    label: "Status Updated",        category: "bookings" },
  "incident.created":       { icon: AlertTriangle, color: "text-orange-500",  label: "Incident Reported",     category: "incidents" },
  "incident.resolved":      { icon: CheckCircle,   color: "text-green-500",   label: "Incident Resolved",     category: "incidents" },
  "compliance.uploaded":    { icon: Upload,        color: "text-blue-500",    label: "Document Uploaded",     category: "compliance" },
  "compliance.approved":    { icon: FileCheck,     color: "text-green-500",   label: "Document Approved",     category: "compliance" },
  "partner.activated":      { icon: CheckCircle,   color: "text-green-500",   label: "Partner Activated",     category: "partner" },
  "partner.invited":        { icon: UserPlus,      color: "text-indigo-500",  label: "Partner Invited",       category: "partner" },
  "terms.accepted":         { icon: ScrollText,    color: "text-teal-500",    label: "Terms Accepted",        category: "partner" },
  "user.invited":           { icon: UserPlus,      color: "text-indigo-500",  label: "User Invited",          category: "users" },
  "user.role_changed":      { icon: Settings,      color: "text-slate-500",   label: "Role Changed",          category: "users" },
  "user.removed":           { icon: XCircle,       color: "text-red-400",     label: "Access Revoked",        category: "users" },
  "team.created":           { icon: UserPlus,      color: "text-indigo-500",  label: "Team Member Added",     category: "team" },
  "team.updated":           { icon: Settings,      color: "text-slate-500",   label: "Team Member Updated",   category: "team" },
  "team.deleted":           { icon: XCircle,       color: "text-red-400",     label: "Team Member Removed",   category: "team" },
  "profile.updated":        { icon: Settings,      color: "text-slate-500",   label: "Profile Updated",       category: "profile" },
};

const CATEGORIES = [
  { value: "all",        label: "All Actions" },
  { value: "bookings",   label: "Bookings" },
  { value: "incidents",  label: "Incidents" },
  { value: "compliance", label: "Compliance" },
  { value: "team",       label: "Team" },
  { value: "users",      label: "Users" },
  { value: "partner",    label: "Partner" },
  { value: "profile",    label: "Profile" },
];

const DATE_RANGES = [
  { value: "all",   label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d",    label: "Last 7 days" },
  { value: "30d",   label: "Last 30 days" },
];

function getActionMeta(action: string) {
  return ACTION_META[action] ?? {
    icon: History,
    color: "text-muted-foreground",
    label: action.replace(/\./g, " › ").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    category: "other",
  };
}

function groupByDay(logs: any[]) {
  const groups: Record<string, any[]> = {};
  for (const log of logs) {
    const key = format(new Date(log.createdAt), "yyyy-MM-dd");
    if (!groups[key]) groups[key] = [];
    groups[key].push(log);
  }
  return groups;
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMMM d");
}

export default function PartnerAudit() {
  const { data: logs = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/partner/audit-log"] });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [dateRange, setDateRange] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();

    return logs.filter((log: any) => {
      const meta = getActionMeta(log.action);

      // Date filter
      if (dateRange !== "all") {
        const logDate = new Date(log.createdAt);
        if (dateRange === "today" && !isToday(logDate)) return false;
        if (dateRange === "7d" && logDate < startOfDay(subDays(now, 7))) return false;
        if (dateRange === "30d" && logDate < startOfDay(subDays(now, 30))) return false;
      }

      // Category filter
      if (category !== "all" && meta.category !== category) return false;

      // Text search
      if (q) {
        const haystack = [meta.label, log.notes ?? "", log.action, log.objectType ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [logs, search, category, dateRange]);

  const grouped = groupByDay(filtered);
  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const hasFilters = search !== "" || category !== "all" || dateRange !== "all";

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setDateRange("all");
  }

  return (
    <PartnerLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A complete record of actions taken in your partner portal
          </p>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search actions or notes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
                data-testid="input-audit-search"
              />
            </div>

            {/* Category */}
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 text-sm w-40" data-testid="select-audit-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date range */}
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="h-9 text-sm w-36" data-testid="select-audit-date-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGES.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear */}
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 text-muted-foreground"
                data-testid="button-clear-audit-filters"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Clear
              </Button>
            )}
          </div>

          {/* Results summary */}
          {!isLoading && (
            <p className="text-xs text-muted-foreground">
              {hasFilters
                ? `${filtered.length} of ${logs.length} entries`
                : `${logs.length} entries`}
            </p>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 gap-3">
              <History className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {hasFilters ? "No entries match your filters." : "No activity recorded yet."}
              </p>
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {days.map(day => (
              <div key={day}>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {dayLabel(day)}
                  </p>
                  <Badge variant="outline" className="text-xs h-4 px-1.5">
                    {grouped[day].length}
                  </Badge>
                </div>
                <div className="relative">
                  <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-1">
                    {grouped[day].map((log: any, idx: number) => {
                      const meta = getActionMeta(log.action);
                      const Icon = meta.icon;
                      return (
                        <div
                          key={log.id}
                          className="relative flex items-start gap-4 pl-10"
                          data-testid={`row-log-${log.id}`}
                        >
                          <div className="absolute left-0 flex items-center justify-center w-9 h-9 rounded-full bg-background border-2 border-border shrink-0">
                            <Icon className={`w-4 h-4 ${meta.color}`} />
                          </div>
                          <div className={`flex-1 pb-4`}>
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div>
                                <p className="text-sm font-medium">{meta.label}</p>
                                {log.notes && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{log.notes}</p>
                                )}
                                {log.objectType && log.objectId && (
                                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                    {log.objectType} · {log.objectId.slice(-10)}
                                  </p>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {format(new Date(log.createdAt), "h:mm a")}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PartnerLayout>
  );
}
