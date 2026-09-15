import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";

interface B2BLead {
  id: string;
  companyName: string | null;
  dealStage: string | null;
  leadType: string;
}

interface PipelineResponse {
  count: number;
  stage: string;
  leads: B2BLead[];
}

type SamAction = "scan_b2b_prospects" | "check_onboarding_progress";

export function SamCarterCard() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<PipelineResponse>({
    queryKey: ["/api/admin/agent/sam/pipeline"],
  });

  const triggerSam = useMutation({
    mutationFn: async (action: SamAction) => {
      const res = await apiRequest("POST", "/api/admin/agent/sam/trigger", {
        action,
        input: {},
      });
      return res.json();
    },
    onSuccess: (data, action) => {
      const label = action === "scan_b2b_prospects" ? "Prospect scan" : "Onboarding check";
      toast({
        title: `Sam queued — ${label}`,
        description: `Job ${data?.jobId ?? ""} runs in background.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/sam/pipeline"] });
    },
    onError: (err: any) => {
      toast({
        title: "Sam trigger failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const funnel = useMemo(() => {
    const leads = data?.leads ?? [];
    const counts = { prospect: 0, warm: 0, meeting: 0, closed: 0 } as Record<string, number>;
    for (const lead of leads) {
      const s = lead.dealStage ?? "prospect";
      if (s in counts) counts[s]++;
    }
    return counts;
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <AgentAvatar agentKey="sam-carter" size="md" showName showRole />
            <CardDescription className="mt-1.5">
              Prospects fleet partners · Auto-invites warm leads · Tracks onboarding progress
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerSam.mutate("scan_b2b_prospects")}
              disabled={triggerSam.isPending}
              data-testid="button-sam-scan-prospects"
            >
              {triggerSam.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Scan Prospects
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerSam.mutate("check_onboarding_progress")}
              disabled={triggerSam.isPending}
              data-testid="button-sam-check-onboarding"
            >
              {triggerSam.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Check Onboarding
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/admin/leads?type=b2bp">
                View Pipeline
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
            Loading B2B pipeline…
          </div>
        )}
        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox label="Prospect" value={funnel.prospect} tone="neutral" />
              <StatBox label="Warm" value={funnel.warm} tone="warm" />
              <StatBox label="Meeting" value={funnel.meeting} tone="warm" />
              <StatBox label="Closed" value={funnel.closed} tone="good" />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <StatBox label="Total B2B Leads" value={data.count} tone="neutral" />
            </div>
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
  tone?: "good" | "warm" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warm"
        ? "text-amber-600"
        : "text-foreground";
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
