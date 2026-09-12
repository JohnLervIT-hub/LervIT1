import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ExternalLink, ShieldCheck } from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";

interface AegisStats {
  suspendedCount: number;
  compliantCount: number;
  unverifiedInPool: number;
  expiringCount: number;
  recentEvents: Array<{
    id: string;
    eventType: string;
    entityId: string | null;
    payload: Record<string, any> | null;
    createdAt: string;
  }>;
}

type AegisAction = "scan_expiring_documents" | "scan_dispatch_eligibility";

export function AegisCard() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AegisStats>({
    queryKey: ["/api/admin/agent/aegis/stats"],
  });

  const trigger = useMutation({
    mutationFn: async ({ action, dryRun }: { action: AegisAction; dryRun: boolean }) => {
      const res = await apiRequest("POST", "/api/admin/agent/aegis/trigger", {
        action,
        input: {},
        dry_run: dryRun,
      });
      return res.json();
    },
    onSuccess: (payload, { action, dryRun }) => {
      const label =
        action === "scan_expiring_documents" ? "Document scan" : "Pool scan";
      toast({
        title: dryRun ? `Aegis dry-run — ${label}` : `Aegis queued — ${label}`,
        description: dryRun
          ? `Preview: ${JSON.stringify(payload?.result ?? {})}`
          : `Job ${payload?.jobId ?? ""} runs in background.`,
      });
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/aegis/stats"] });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Aegis trigger failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <AgentAvatar agentKey="aegis-ford" size="md" showName showRole />
            <CardDescription className="mt-1.5">
              Watches document expiries · Warns 30/14/7 days out · Auto-suspends on lapse
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => trigger.mutate({ action: "scan_expiring_documents", dryRun: true })}
              disabled={trigger.isPending}
              data-testid="button-aegis-preview-docs"
            >
              Preview Docs
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => trigger.mutate({ action: "scan_expiring_documents", dryRun: false })}
              disabled={trigger.isPending}
              data-testid="button-aegis-scan-docs"
            >
              {trigger.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Scan Documents
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => trigger.mutate({ action: "scan_dispatch_eligibility", dryRun: false })}
              disabled={trigger.isPending}
              data-testid="button-aegis-scan-pool"
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
              Scan Pool
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/admin/verification">
                Verification Queue
                <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading compliance snapshot…
          </div>
        )}
        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox label="Compliant" value={data.compliantCount} tone="good" />
              <StatBox label="Expiring ≤30d" value={data.expiringCount} tone="warm" />
              <StatBox label="Suspended" value={data.suspendedCount} tone="bad" />
              <StatBox label="Pool violations" value={data.unverifiedInPool} tone="bad" />
            </div>
            {data.recentEvents.length > 0 && (
              <div className="rounded-md border">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                  Recent events
                </div>
                <ul className="divide-y">
                  {data.recentEvents.slice(0, 5).map((e) => (
                    <li key={e.id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <span className={`text-sm font-medium ${eventTone(e.eventType)}`}>
                        {e.eventType.replace(/^aegis\./, "")}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function eventTone(eventType: string): string {
  if (eventType.includes("mover_suspended")) return "text-red-600";
  if (eventType.includes("mover_reactivated")) return "text-emerald-600";
  if (eventType.includes("expiry_warning_sent")) return "text-amber-600";
  if (eventType.includes("availability_corrected")) return "text-amber-600";
  return "text-foreground";
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "good" | "warm" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warm"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "text-foreground";
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
