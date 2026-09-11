import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Activity } from "lucide-react";

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

  const stats = useMemo(() => {
    const alerts = data?.alerts ?? [];
    const cutoff = Date.now() - DAY_MS;
    const recent = alerts.filter((a) => new Date(a.createdAt).getTime() >= cutoff);
    const trips = new Set(recent.map((a) => a.entityId).filter(Boolean)).size;
    const gps = recent.filter((a) => a.eventType === "pulse.gps_silent").length;
    const overtime = recent.filter((a) => a.eventType === "pulse.overtime").length;
    const delaySms = recent.filter((a) => a.eventType === "pulse.customer_uninformed").length;
    return { trips, gps, overtime, delaySms };
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-600" />
              Mark Shaw — PULSE
            </CardTitle>
            <CardDescription>
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
        )}
      </CardContent>
    </Card>
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
