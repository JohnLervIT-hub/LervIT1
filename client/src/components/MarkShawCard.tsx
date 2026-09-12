import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";

interface MarkAlert {
  id: string;
  eventType: string;
  entityId: string | null;
  payload: any;
  createdAt: string;
}

interface AlertsResponse {
  alerts: MarkAlert[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const HIGH_SEVERITY_EVENTS = new Set(['pulse.gps_silent', 'pulse.no_start']);

const EVENT_LABELS: Record<string, string> = {
  'pulse.gps_silent': 'GPS silent',
  'pulse.no_start': 'No start',
  'pulse.overtime': 'Overtime',
  'pulse.customer_uninformed': 'Delay SMS sent',
  'pulse.customer_notify_failed': 'Customer SMS failed',
};

export function MarkShawCard() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AlertsResponse>({
    queryKey: ["/api/admin/agent/mark/alerts"],
  });

  const triggerScan = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/agent/mark/trigger", {
        action: "scan_active_trips",
        input: {},
      });
      return res.json();
    },
    onSuccess: (data) => {
      const r = data?.result ?? {};
      toast({
        title: "Mark scan complete",
        description: `Scanned ${r.checked ?? r.trips ?? 0} trips — GPS: ${
          r.gpsSilent ?? 0
        }, Overtime: ${r.overtime ?? 0}, No-start: ${r.noStart ?? 0}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/mark/alerts"] });
    },
    onError: (err: any) => {
      toast({
        title: "Mark scan failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const { stats, high, medium } = useMemo(() => {
    const alerts = data?.alerts ?? [];
    const cutoff = Date.now() - DAY_MS;
    const recent = alerts.filter((a) => new Date(a.createdAt).getTime() >= cutoff);
    const trips = new Set(recent.map((a) => a.entityId).filter(Boolean)).size;
    const gps = recent.filter((a) => a.eventType === "pulse.gps_silent").length;
    const overtime = recent.filter((a) => a.eventType === "pulse.overtime").length;
    const delaySms = recent.filter((a) => a.eventType === "pulse.customer_uninformed").length;
    const high = recent.filter((a) => HIGH_SEVERITY_EVENTS.has(a.eventType));
    const medium = recent.filter((a) => !HIGH_SEVERITY_EVENTS.has(a.eventType));
    return { stats: { trips, gps, overtime, delaySms }, high, medium };
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <AgentAvatar agentKey="mark-shaw" size="md" showName showRole />
            <CardDescription className="mt-1.5">
              Scans active trips for GPS silence, overtime, and no-start · Alerts Xavier on high severity
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerScan.mutate()}
            disabled={triggerScan.isPending}
            data-testid="button-mark-trigger"
          >
            {triggerScan.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Scan Now
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading alerts…
          </div>
        )}
        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox label="Trips w/ Alerts (24h)" value={stats.trips} />
              <StatBox
                label="GPS Alerts (24h)"
                value={stats.gps}
                tone={stats.gps > 0 ? "warn" : undefined}
              />
              <StatBox
                label="Overtime (24h)"
                value={stats.overtime}
                tone={stats.overtime > 0 ? "warn" : undefined}
              />
              <StatBox label="Delay SMS Sent (24h)" value={stats.delaySms} />
            </div>
            {high.length > 0 && (
              <AlertsList
                title="High severity"
                alerts={high}
                severity="high"
                testId="mark-alerts-high"
              />
            )}
            {medium.length > 0 && (
              <AlertsList
                title="Medium severity"
                alerts={medium}
                severity="medium"
                testId="mark-alerts-medium"
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertsList({
  title,
  alerts,
  severity,
  testId,
}: {
  title: string;
  alerts: MarkAlert[];
  severity: "high" | "medium";
  testId: string;
}) {
  const badgeClass =
    severity === "high"
      ? "bg-red-100 text-red-800 border-red-200"
      : "bg-amber-100 text-amber-800 border-amber-200";
  return (
    <div data-testid={testId}>
      <div className="text-xs font-medium text-muted-foreground mb-1.5">
        {title} ({alerts.length})
      </div>
      <ul className="space-y-1">
        {alerts.slice(0, 8).map((a) => (
          <li
            key={a.id}
            className="flex items-start justify-between gap-2 rounded-md border p-2 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}
              >
                {severity}
              </span>
              <span className="font-medium truncate">
                {EVENT_LABELS[a.eventType] ?? a.eventType}
              </span>
              {a.entityId && (
                <span className="text-muted-foreground truncate">
                  · {a.entityId.slice(0, 8)}
                </span>
              )}
            </div>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {new Date(a.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "warn";
}) {
  const toneClass = tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
