import { useQuery } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History } from "lucide-react";
import { format } from "date-fns";

const ACTION_COLOR: Record<string, string> = {
  "booking.accepted": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "booking.rejected": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "booking.assigned": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "incident.created": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "compliance.uploaded": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "compliance.approved": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "partner.activated": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "terms.accepted": "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
};

function formatAction(action: string) {
  return action.replace(/\./g, " › ").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function PartnerAudit() {
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/partner/audit-log"],
  });

  return (
    <PartnerLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">Recent actions taken in your partner portal</p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-14 gap-3">
              <History className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No activity recorded yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {logs.map((log: any) => (
              <Card key={log.id} data-testid={`row-log-${log.id}`}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge
                        className={`text-xs shrink-0 ${ACTION_COLOR[log.action] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {formatAction(log.action)}
                      </Badge>
                      {log.objectType && log.objectId && (
                        <span className="text-xs text-muted-foreground font-mono truncate">
                          {log.objectType}#{log.objectId.slice(-8)}
                        </span>
                      )}
                      {log.notes && (
                        <span className="text-xs text-muted-foreground truncate hidden sm:block">{log.notes}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 hidden md:block">
                      {format(new Date(log.createdAt), "PPp")}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground mt-1 block md:hidden">
                    {format(new Date(log.createdAt), "PP")}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PartnerLayout>
  );
}
