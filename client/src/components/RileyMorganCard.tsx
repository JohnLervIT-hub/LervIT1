import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, UserCheck } from "lucide-react";

interface RileyStats {
  moversVerified: number;
  customersVerified: number;
  nudgesSent: number;
  stripeConnected: number;
  period: string;
}

export function RileyMorganCard() {
  const { toast } = useToast();

  const { data: stats, isLoading } = useQuery<RileyStats>({
    queryKey: ["/api/admin/agent/riley/stats"],
  });

  const triggerTest = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/agent/riley/trigger", {
        action: "mover_verified",
        input: { moverId: "test", userId: "test" },
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Riley queued (test)",
        description: `Job ${data?.jobId ?? ""} — dry run, no real emails/SMS sent.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/riley/stats"] });
    },
    onError: (err: any) => {
      toast({
        title: "Riley trigger failed",
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
              <UserCheck className="w-4 h-4 text-green-600" />
              Riley Morgan — Onboarding
            </CardTitle>
            <CardDescription>
              Activates newly verified movers + customers · Nudges day 3 / 7 / 14
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerTest.mutate()}
            disabled={triggerTest.isPending}
            data-testid="button-riley-trigger"
          >
            {triggerTest.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Test Mover
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading onboarding stats…
          </div>
        )}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatBox label="Movers Verified (7d)" value={stats.moversVerified} tone="good" />
            <StatBox label="Customers Onboarded (7d)" value={stats.customersVerified} tone="good" />
            <StatBox label="Nudges Sent (7d)" value={stats.nudgesSent} />
            <StatBox label="Stripe Connected (7d)" value={stats.stripeConnected} tone="good" />
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
          tone === "good" ? "text-emerald-600" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
