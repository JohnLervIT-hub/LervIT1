import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw } from "lucide-react";

interface KaiStats {
  customersContacted: number;
  moversReactivated: number;
  kai15Redemptions: number;
  period: string;
}

type KaiAction = "scan_dormant_customers" | "scan_inactive_movers";

export function KaiBennettCard() {
  const { toast } = useToast();

  const { data: stats, isLoading } = useQuery<KaiStats>({
    queryKey: ["/api/admin/agent/kai/stats"],
  });

  const triggerScan = useMutation({
    mutationFn: async (action: KaiAction) => {
      const res = await apiRequest("POST", "/api/admin/agent/kai/trigger", {
        action,
        input: {},
      });
      return res.json();
    },
    onSuccess: (data, action) => {
      const label = action === "scan_dormant_customers" ? "Customer" : "Mover";
      toast({
        title: `Kai ${label} scan queued`,
        description: `Job ${data?.jobId ?? ""} — scan runs in background.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/kai/stats"] });
    },
    onError: (err: any) => {
      toast({
        title: "Kai trigger failed",
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
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCcw className="w-4 h-4 text-purple-600" />
              Kai Bennett — Retention
            </CardTitle>
            <CardDescription>
              Winback for dormant customers + reactivation for inactive movers · Promo: KAI15
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerScan.mutate("scan_dormant_customers")}
              disabled={triggerScan.isPending}
              data-testid="button-kai-scan-customers"
            >
              {triggerScan.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Scan Customers
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerScan.mutate("scan_inactive_movers")}
              disabled={triggerScan.isPending}
              data-testid="button-kai-scan-movers"
            >
              {triggerScan.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Scan Movers
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading retention stats…
          </div>
        )}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <StatBox label="Customers Contacted (7d)" value={stats.customersContacted} />
            <StatBox label="Movers Reactivated (7d)" value={stats.moversReactivated} />
            <StatBox
              label="KAI15 Redemptions (7d)"
              value={stats.kai15Redemptions}
              tone="good"
            />
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
  tone?: "good";
}) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-lg font-semibold tabular-nums ${
          tone === "good" ? "text-emerald-600" : "text-purple-600"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
