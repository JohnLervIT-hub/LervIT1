import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";

interface VictorStats {
  dispatchedToday: number;
  escalationsToday: number;
  totalDispatchedAllTime: number;
  avgDispatchMinutes: number | null;
}

export function VictorNashCard() {
  const { data: stats, isLoading } = useQuery<VictorStats>({
    queryKey: ["/api/admin/agent/victor/stats"],
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <AgentAvatar agentKey="victor-nash" size="md" showName showRole />
            <CardDescription className="mt-1.5">
              Runs on every new pending booking · Escalates to Xavier if no movers accept
            </CardDescription>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    data-testid="button-victor-trigger"
                  >
                    Scan Pending
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Use the Leads page to dispatch a specific booking
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading dispatch stats…
          </div>
        )}
        {stats && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <StatBox label="Jobs Dispatched Today" value={stats.dispatchedToday} />
              <StatBox
                label="Escalations Today"
                value={stats.escalationsToday}
                tone={stats.escalationsToday > 0 ? "warn" : undefined}
              />
            </div>
            <div className="text-xs text-muted-foreground pl-1">
              Total dispatched: <span className="font-medium text-foreground tabular-nums">{stats.totalDispatchedAllTime}</span>
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
  tone?: "good" | "warn";
}) {
  const toneClass =
    tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-blue-600";
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
