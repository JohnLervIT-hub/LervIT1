import { useQuery } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  History, CheckCircle, XCircle, Upload, UserPlus, FileCheck,
  ScrollText, Settings, AlertTriangle, ArrowRight,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

const ACTION_META: Record<string, { icon: React.ElementType; label: string }> = {
  "booking.accepted":       { icon: CheckCircle,   label: "Booking Accepted" },
  "booking.rejected":       { icon: XCircle,       label: "Booking Rejected" },
  "booking.assigned":       { icon: ArrowRight,    label: "Booking Assigned" },
  "booking.status_updated": { icon: ArrowRight,    label: "Status Updated" },
  "incident.created":       { icon: AlertTriangle, label: "Incident Reported" },
  "incident.resolved":      { icon: CheckCircle,   label: "Incident Resolved" },
  "compliance.uploaded":    { icon: Upload,        label: "Document Uploaded" },
  "compliance.approved":    { icon: FileCheck,     label: "Document Approved" },
  "partner.activated":      { icon: CheckCircle,   label: "Partner Activated" },
  "terms.accepted":         { icon: ScrollText,    label: "Terms Accepted" },
  "team.created":           { icon: UserPlus,      label: "Team Member Added" },
  "team.updated":           { icon: Settings,      label: "Team Member Updated" },
  "team.deleted":           { icon: XCircle,       label: "Team Member Removed" },
  "profile.updated":        { icon: Settings,      label: "Profile Updated" },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? {
    icon: History,
    label: action.replace(/\./g, " · ").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
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
  const grouped = groupByDay(logs);
  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <PartnerLayout>
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete record of actions taken in your portal
          </p>
        </div>

        <Separator />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2 text-muted-foreground">
            <History className="w-8 h-8" />
            <p className="text-sm">No activity recorded yet</p>
          </div>
        ) : (
          <div className="space-y-8">
            {days.map(day => (
              <div key={day}>
                <p className="text-xs font-medium text-muted-foreground mb-3">
                  {dayLabel(day)}
                </p>
                <div className="space-y-px">
                  {grouped[day].map((log: any, idx: number) => {
                    const meta = getActionMeta(log.action);
                    const Icon = meta.icon;
                    return (
                      <div key={log.id}>
                        <div
                          className="flex items-start gap-3 py-2.5 px-2 rounded-md"
                          data-testid={`row-log-${log.id}`}
                        >
                          <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">{meta.label}</p>
                            {log.notes && (
                              <p className="text-xs text-muted-foreground mt-0.5">{log.notes}</p>
                            )}
                            {log.objectType && log.objectId && (
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                {log.objectType} · {log.objectId.slice(-10)}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                            {format(new Date(log.createdAt), "h:mm a")}
                          </span>
                        </div>
                        {idx < grouped[day].length - 1 && <Separator className="opacity-30" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PartnerLayout>
  );
}
