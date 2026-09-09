import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface XavierBrief {
  id: string;
  createdAt: string;
  brief: string | null;
  generatedAt: string | null;
}

interface BriefsResponse {
  briefs: XavierBrief[];
}

export function XavierBriefCard() {
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<BriefsResponse>({
    queryKey: ["/api/admin/agent/xavier/briefs"],
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/agent/xavier/trigger", { action: "daily_brief" });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Xavier triggered", description: "Daily brief generated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/xavier/briefs"] });
    },
    onError: (err: any) => {
      toast({
        title: "Xavier trigger failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const briefs = data?.briefs ?? [];
  const latest = briefs[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Xavier Cole (APEX) — Daily Brief
              </CardTitle>
              <CardDescription>
                CEO agent brief. Auto-runs daily at 06:05 Calgary time.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending}
              data-testid="button-xavier-trigger"
            >
              {triggerMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Trigger Now
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading briefs…
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive">
              Failed to load briefs.
            </div>
          )}
          {!isLoading && !error && !latest && (
            <div className="text-sm text-muted-foreground">
              No briefs yet. Click "Trigger Now" to generate one.
            </div>
          )}
          {latest && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">Latest</Badge>
                <span>
                  {format(new Date(latest.generatedAt ?? latest.createdAt), "PPpp")}
                </span>
              </div>
              <pre className="text-sm whitespace-pre-wrap font-sans bg-muted/40 p-3 rounded-md">
                {latest.brief ?? "(empty brief)"}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {briefs.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Previous Briefs</CardTitle>
            <CardDescription>Last {briefs.length - 1} briefs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {briefs.slice(1).map(b => (
              <div key={b.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                <div className="text-xs text-muted-foreground mb-1.5">
                  {format(new Date(b.generatedAt ?? b.createdAt), "PPpp")}
                </div>
                <pre className="text-sm whitespace-pre-wrap font-sans">
                  {b.brief ?? "(empty)"}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
