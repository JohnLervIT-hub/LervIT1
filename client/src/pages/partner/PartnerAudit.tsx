import { useQuery } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  History, CheckCircle, XCircle, Upload, UserPlus, FileCheck,
  ScrollText, Settings, AlertTriangle, ArrowRight,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

const ACTION_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  "booking.accepted":       { icon: CheckCircle,  color: "text-green-500",  label: "Booking Accepted" },
  "booking.rejected":       { icon: XCircle,      color: "text-red-500",    label: "Booking Rejected" },
  "booking.assigned":       { icon: ArrowRight,   color: "text-purple-500", label: "Booking Assigned" },
  "booking.status_updated": { icon: ArrowRight,   color: "text-blue-500",   label: "Status Updated" },
  "incident.created":       { icon: AlertTriangle,color: "text-orange-500", label: "Incident Reported" },
  "incident.resolved":      { icon: CheckCircle,  color: "text-green-500",  label: "Incident Resolved" },
  "compliance.uploaded":    { icon: Upload,       color: "text-blue-500",   label: "Document Uploaded" },
  "compliance.approved":    { icon: FileCheck,    color: "text-green-500",  label: "Document Approved" },
  "partner.activated":      { icon: CheckCircle,  color: "text-green-500",  label: "Partner Activated" },
  "terms.accepted":         { icon: ScrollText,   color: "text-teal-500",   label: "Terms Accepted" },
  "team.created":           { icon: UserPlus,     color: "text-indigo-500", label: "Team Member Added" },
  "team.updated":           { icon: Settings,     color: "text-slate-500",  label: "Team Member Updated" },
  "team.deleted":           { icon: XCircle,      color: "text-red-400",    label: "Team Member Removed" },
  "profile.updated":        { icon: Settings,     color: "text-slate-500",  label: "Profile Updated" },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? {
    icon: History,
    color: "text-muted-foreground",
    label: action.replace(/\./g, " › ").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
  };
}

function groupByDay(logs: any[]) {
  const groups: Record<string, any[]> = {};
  for (const log of logs) {
    const date = new Date(log.createdAt);
    const key = format(date, "yyyy-MM-dd");
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

  const grouped = groupByDay(logs);
  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <PartnerLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A complete record of actions taken in your partner portal
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 gap-3">
              <History className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No activity recorded yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {days.map(day => (
              <div key={day}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {dayLabel(day)}
                </p>
                <div className="relative">
                  {/* Vertical line */}
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
                          {/* Icon dot on the line */}
                          <div className={`absolute left-0 flex items-center justify-center w-9 h-9 rounded-full bg-background border-2 border-border shrink-0`}>
                            <Icon className={`w-4 h-4 ${meta.color}`} />
                          </div>
                          {/* Content */}
                          <div className={`flex-1 pb-4 ${idx === grouped[day].length - 1 ? "" : ""}`}>
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
