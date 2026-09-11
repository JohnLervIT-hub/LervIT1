import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  const [days, setDays] = useState("3");

  const { data, isLoading, error } = useQuery<BriefsResponse>({
    queryKey: ["/api/admin/agent/xavier/briefs", { days }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/agent/xavier/briefs?days=${days}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to load briefs: ${res.status}`);
      return res.json();
    },
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
  const previous = briefs.slice(1);

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
            <div className="flex items-center gap-2">
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="h-7 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Today</SelectItem>
                  <SelectItem value="3">Last 3 days</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
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
                <Badge variant="secondary">Latest Brief</Badge>
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

      {previous.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Previous Briefs</CardTitle>
            <CardDescription>Last {previous.length} briefs</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {previous.map(b => (
                <AccordionItem key={b.id} value={b.id}>
                  <AccordionTrigger className="text-sm">
                    {format(new Date(b.generatedAt ?? b.createdAt), "MMM d, h:mm a")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <pre className="text-sm whitespace-pre-wrap font-sans bg-muted/40 p-3 rounded-md">
                      {b.brief ?? "(empty)"}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
