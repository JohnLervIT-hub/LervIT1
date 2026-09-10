import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Radar, ExternalLink } from "lucide-react";

interface Funnel {
  total: number;
  new_: number;
  contacted: number;
  converted: number;
  cold: number;
}

interface StatsResponse {
  days: number;
  since: string;
  funnel: Funnel;
  byChannel: Array<{ channel: string; touches: number; delivered: number }>;
}

export function DemandPipelineCard() {
  const { toast } = useToast();

  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ["/api/admin/agent/alex/stats", { days: 7 }],
  });

  const triggerScout = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/agent/scout/trigger", {
        action: "process_signals",
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.queued) {
        toast({
          title: "Scout queued",
          description: `Job ${data.jobId ?? ""} accepted. Crawl runs in background (~2–10 min); leads appear as they're created.`,
        });
      } else {
        const r = data?.result ?? {};
        toast({
          title: "Scout completed",
          description: `Found ${r.googleAlerts ?? 0} GA + ${r.kijiji ?? 0} Kijiji; created ${r.leadsCreated ?? 0}, routed ${r.leadsRouted ?? 0}.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/alex/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/leads"] });
    },
    onError: (err: any) => {
      toast({
        title: "Scout trigger failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const funnel = stats?.funnel;
  const conversionRate = funnel && funnel.total > 0
    ? Math.round((funnel.converted / funnel.total) * 1000) / 10
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Radar className="w-4 h-4" />
              Demand Pipeline
            </CardTitle>
            <CardDescription>
              Scout Reid crawls daily at 07:00 · Alex Morgan sequences touches over 72h
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerScout.mutate()}
              disabled={triggerScout.isPending}
              data-testid="button-scout-trigger"
            >
              {triggerScout.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Trigger Scout
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/admin/leads">
                View All Leads
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
            Loading pipeline stats…
          </div>
        )}
        {stats && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <StatBox label="Total (7d)" value={funnel?.total ?? 0} />
              <StatBox label="New" value={funnel?.new_ ?? 0} />
              <StatBox label="Contacted" value={funnel?.contacted ?? 0} />
              <StatBox label="Converted" value={funnel?.converted ?? 0} tone="good" />
              <StatBox label="Conv rate" value={`${conversionRate}%`} tone="good" />
            </div>
            {stats.byChannel.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {stats.byChannel.map(c => (
                  <Badge key={c.channel} variant="secondary" className="text-xs">
                    {c.channel}: {c.delivered}/{c.touches} delivered
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number | string; tone?: "good" }) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === "good" ? "text-emerald-600" : ""}`}>
        {value}
      </div>
    </div>
  );
}
