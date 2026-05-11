import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import {
  History, CheckCircle, XCircle, Upload, UserPlus, FileCheck,
  ScrollText, Settings, AlertTriangle, ArrowRight, Search, X,
  ChevronRight, Lightbulb, Info, CalendarDays, Tag, ExternalLink,
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

const ACTION_INSIGHTS: Record<string, { insight: string; recommendation: string; linkLabel?: string; linkPath?: (log: any) => string }> = {
  "booking.accepted": {
    insight: "Accepting jobs consistently builds your partner reliability score, which affects how frequently LervIT routes new jobs to your company.",
    recommendation: "Ensure your assigned driver has been briefed on the pickup address, load size, and any customer notes before departure.",
    linkLabel: "View booking",
    linkPath: (log) => `/partner/bookings/${log.objectId}`,
  },
  "booking.rejected": {
    insight: "Rejecting bookings reduces your acceptance rate. A lower acceptance rate can reduce the volume of new jobs routed to your organization.",
    recommendation: "If you're rejecting due to capacity, consider updating your coverage zones or team availability. Frequent rejections in a specific area may signal a staffing gap.",
    linkLabel: "View booking",
    linkPath: (log) => `/partner/bookings/${log.objectId}`,
  },
  "booking.assigned": {
    insight: "This booking has been assigned to a team member. Assignment is tracked and contributes to individual driver performance metrics.",
    recommendation: "Confirm the assigned driver has acknowledged the job and has the correct vehicle ready. Check the booking detail for any special handling notes.",
    linkLabel: "View booking",
    linkPath: (log) => `/partner/bookings/${log.objectId}`,
  },
  "booking.status_updated": {
    insight: "Status updates are logged in real time and visible to the customer. Keeping statuses current improves customer satisfaction scores.",
    recommendation: "Make sure your team is updating job status at each stage — en route, arrived, in progress, and completed. Delayed updates can trigger customer escalations.",
    linkLabel: "View booking",
    linkPath: (log) => `/partner/bookings/${log.objectId}`,
  },
  "incident.created": {
    insight: "A new incident has been logged. Unresolved incidents affect your partner health score and may be reviewed by the LervIT operations team.",
    recommendation: "Resolve this incident as quickly as possible. If it involves customer property damage, document everything with photos and notify your insurance. Communication speed is the most important factor in customer satisfaction after an incident.",
    linkLabel: "View incidents",
    linkPath: () => `/partner/incidents`,
  },
  "incident.resolved": {
    insight: "Resolving incidents promptly demonstrates operational maturity. Partners with fast resolution times receive priority routing for premium jobs.",
    recommendation: "Consider performing a brief team debrief after each resolved incident to identify root causes and prevent recurrence.",
    linkLabel: "View incidents",
    linkPath: () => `/partner/incidents`,
  },
  "compliance.uploaded": {
    insight: "Your document is in the review queue. LervIT compliance review typically takes 2–3 business days. Expired or pending documents can pause job routing.",
    recommendation: "Check back in 3 business days. If not approved by then, contact your partner success manager. Keep original copies of all submitted documents.",
    linkLabel: "View compliance",
    linkPath: () => `/partner/compliance`,
  },
  "compliance.approved": {
    insight: "Approved compliance documents unlock or maintain your eligibility for the full job routing pipeline. Keeping all documents current maximizes your revenue potential.",
    recommendation: "Set a calendar reminder 30 days before this document's expiry date so you can renew proactively and avoid any interruption to job routing.",
    linkLabel: "View compliance",
    linkPath: () => `/partner/compliance`,
  },
  "partner.activated": {
    insight: "Your partner account is now fully active. From this point, LervIT can begin routing enterprise jobs to your organization.",
    recommendation: "Complete your coverage zone setup and ensure at least one team member is marked as available so you start receiving job matches immediately.",
  },
  "partner.invited": {
    insight: "An invitation was sent to a prospective team member or partner. Pending invites expire after 7 days.",
    recommendation: "Follow up with the invitee directly if they haven't accepted within 48 hours. Expired invites can be resent from the Team section.",
    linkLabel: "View team",
    linkPath: () => `/partner/team`,
  },
  "terms.accepted": {
    insight: "Accepting the partner terms is a one-time step that enables the full suite of LervIT enterprise features including payout processing.",
    recommendation: "Keep a copy of the accepted terms version for your records. If terms are updated in the future, you'll receive a notification to re-accept.",
  },
  "user.invited": {
    insight: "A new user has been invited to your partner portal. They will have access based on the role they were assigned.",
    recommendation: "Remind new users to check their spam folder if they don't receive the invitation email within 10 minutes.",
    linkLabel: "View team",
    linkPath: () => `/partner/team`,
  },
  "user.role_changed": {
    insight: "Role changes take effect immediately. Elevated roles (admin, dispatcher) have access to sensitive booking and payout information.",
    recommendation: "Audit your team's roles quarterly to ensure access levels match current responsibilities. Avoid assigning admin roles to temporary or contract staff.",
    linkLabel: "View team",
    linkPath: () => `/partner/team`,
  },
  "user.removed": {
    insight: "This user's access has been permanently revoked. They can no longer log in or view any partner portal data.",
    recommendation: "If this user had access to shared accounts or tools outside the portal, update those credentials as well. Review any recent actions they took before removal.",
    linkLabel: "View audit log",
    linkPath: () => `/partner/audit`,
  },
  "team.created": {
    insight: "Adding team members expands your capacity to accept more jobs and cover more geographic areas simultaneously.",
    recommendation: "Make sure new team members complete their vehicle and licence details so the matching engine can assign appropriate jobs.",
    linkLabel: "View team",
    linkPath: () => `/partner/team`,
  },
  "team.updated": {
    insight: "Team member details affect job matching. Vehicle type and availability status are used by the LervIT dispatch engine to route jobs correctly.",
    recommendation: "Keep vehicle information and availability status up to date. Stale data leads to mismatched job assignments and potential rejections.",
    linkLabel: "View team",
    linkPath: () => `/partner/team`,
  },
  "team.deleted": {
    insight: "Removing a team member reduces your available capacity. If this person covered specific routes or zones, those may now be under-served.",
    recommendation: "Review your coverage zones and reassign any pending bookings this team member was responsible for. Consider recruiting a replacement if capacity drops below your target.",
    linkLabel: "View team",
    linkPath: () => `/partner/team`,
  },
  "profile.updated": {
    insight: "Partner profile information is visible to LervIT's operations team and may be used in partner-facing communications.",
    recommendation: "Ensure your business name, contact email, and phone number are accurate. Outdated contact details can cause delays in payment processing and support responses.",
  },
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
    label: action.replace(/\./g, " › ").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
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

function AuditDetailSheet({ log, onClose }: { log: any; onClose: () => void }) {
  const meta = getActionMeta(log.action);
  const Icon = meta.icon;
  const insights = ACTION_INSIGHTS[log.action];

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-base">Action Detail</SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Action identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Icon className={`w-5 h-5 ${meta.color}`} />
            </div>
            <div>
              <p className="font-semibold text-sm">{meta.label}</p>
              <p className="text-xs text-muted-foreground font-mono">{log.action}</p>
            </div>
          </div>

          <Separator />

          {/* Meta fields */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <CalendarDays className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Timestamp</p>
                <p className="text-sm font-medium">{format(new Date(log.createdAt), "PPPp")}</p>
              </div>
            </div>

            {log.notes && (
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{log.notes}</p>
                </div>
              </div>
            )}

            {log.objectType && log.objectId && (
              <div className="flex items-start gap-3">
                <Tag className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Related record</p>
                  <p className="text-sm font-medium capitalize">{log.objectType}</p>
                  <p className="text-xs text-muted-foreground font-mono">{log.objectId}</p>
                </div>
              </div>
            )}

            {log.actorName && (
              <div className="flex items-start gap-3">
                <UserPlus className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Performed by</p>
                  <p className="text-sm font-medium">{log.actorName}</p>
                </div>
              </div>
            )}
          </div>

          {/* Insights & recommendation */}
          {insights && (
            <>
              <Separator />

              <div className="space-y-4">
                {/* Insight */}
                <div
                  className="rounded-lg p-4 space-y-2"
                  style={{ background: "hsl(var(--muted))" }}
                >
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-500 shrink-0" />
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Insight</p>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{insights.insight}</p>
                </div>

                {/* Recommendation */}
                <div
                  className="rounded-lg p-4 space-y-2"
                  style={{ background: "hsl(var(--muted))" }}
                >
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Recommendation</p>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{insights.recommendation}</p>
                </div>

                {/* Deep link */}
                {insights.linkLabel && insights.linkPath && (
                  <Link href={insights.linkPath(log)} onClick={onClose}>
                    <Button variant="outline" className="w-full" data-testid="button-audit-deeplink">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      {insights.linkLabel}
                    </Button>
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function PartnerAudit() {
  const { data: logs = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/partner/audit-log"] });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [selected, setSelected] = useState<any | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();

    return logs.filter((log: any) => {
      const meta = getActionMeta(log.action);

      if (dateRange !== "all") {
        const logDate = new Date(log.createdAt);
        if (dateRange === "today" && !isToday(logDate)) return false;
        if (dateRange === "7d" && logDate < startOfDay(subDays(now, 7))) return false;
        if (dateRange === "30d" && logDate < startOfDay(subDays(now, 30))) return false;
      }

      if (category !== "all" && meta.category !== category) return false;

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
            A complete record of actions taken in your partner portal — click any entry for insights and recommendations.
          </p>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
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

          {!isLoading && (
            <p className="text-xs text-muted-foreground">
              {hasFilters ? `${filtered.length} of ${logs.length} entries` : `${logs.length} entries`}
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
                <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
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
                      const hasInsights = !!ACTION_INSIGHTS[log.action];
                      return (
                        <div
                          key={log.id}
                          className={`relative flex items-start gap-4 pl-10 rounded-lg transition-colors ${hasInsights ? "cursor-pointer hover:bg-muted/60 group" : ""}`}
                          onClick={() => hasInsights && setSelected(log)}
                          data-testid={`row-log-${log.id}`}
                        >
                          <div className="absolute left-0 flex items-center justify-center w-9 h-9 rounded-full bg-background border-2 border-border shrink-0">
                            <Icon className={`w-4 h-4 ${meta.color}`} />
                          </div>
                          <div className={`flex-1 min-w-0 ${idx < grouped[day].length - 1 ? "pb-4" : "pb-1"}`}>
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="flex-1 min-w-0">
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
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(log.createdAt), "h:mm a")}
                                </span>
                                {hasInsights && (
                                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                              </div>
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

      {selected && (
        <AuditDetailSheet log={selected} onClose={() => setSelected(null)} />
      )}
    </PartnerLayout>
  );
}
