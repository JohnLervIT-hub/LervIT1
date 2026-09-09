import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, RefreshCw, Zap } from "lucide-react";
import { format } from "date-fns";

interface Lead {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  sourceChannel: string | null;
  intentScore: number | null;
  status: string | null;
  touchpoints: number | null;
  lastTouchedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface ListResponse {
  data: Lead[];
  page: number;
  pageSize: number;
  total: number;
}

const STATUS_TONES: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-amber-100 text-amber-800",
  converted: "bg-emerald-100 text-emerald-800",
  cold: "bg-slate-100 text-slate-600",
};

function scoreClass(score: number | null): string {
  const s = score ?? 0;
  if (s >= 70) return "text-emerald-600 font-semibold";
  if (s >= 50) return "text-amber-600 font-semibold";
  return "text-red-600";
}

export default function AdminLeadsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading, error } = useQuery<ListResponse>({
    queryKey: ["/api/admin/agent/leads", { status: statusFilter, page, pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await apiRequest("GET", `/api/admin/agent/leads?${params.toString()}`);
      return res.json();
    },
  });

  const triggerAlex = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await apiRequest("POST", "/api/admin/agent/alex/trigger", {
        action: "convert_lead",
        leadId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Alex triggered", description: "Conversion touch sent." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/leads"] });
    },
    onError: (err: any) => {
      toast({
        title: "Trigger failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const leads = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const statuses = ["all", "new", "contacted", "converted", "cold"] as const;

  return (
    <div className="container mx-auto max-w-7xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Admin
          </Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/leads"] })}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Leads</CardTitle>
              <CardDescription>
                Scout Reid demand pipeline · {total} lead{total === 1 ? "" : "s"} total
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map(s => (
                <Button
                  key={s}
                  variant={statusFilter === s ? "default" : "ghost"}
                  size="sm"
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className="text-xs capitalize h-7 px-2.5"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading leads…
            </div>
          )}
          {error && <div className="text-sm text-destructive">Failed to load leads.</div>}
          {!isLoading && !error && leads.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No leads yet. Trigger Scout from the APEX tab.
            </div>
          )}
          {leads.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Touchpoints</th>
                    <th className="py-2 pr-3">Last touched</th>
                    <th className="py-2 pr-3">Notes</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => (
                    <tr key={lead.id} className="border-t align-top">
                      <td className="py-2 pr-3">{lead.sourceChannel ?? "—"}</td>
                      <td className={`py-2 pr-3 tabular-nums ${scoreClass(lead.intentScore)}`}>
                        {lead.intentScore ?? 0}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs ${STATUS_TONES[lead.status ?? "new"] ?? "bg-muted"}`}>
                          {lead.status ?? "new"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{lead.touchpoints ?? 0}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {lead.lastTouchedAt ? format(new Date(lead.lastTouchedAt), "PP p") : "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs max-w-md truncate" title={lead.notes ?? ""}>
                        {lead.notes ?? "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={triggerAlex.isPending || lead.status === "converted" || lead.status === "cold"}
                          onClick={() => triggerAlex.mutate(lead.id)}
                        >
                          <Zap className="w-3.5 h-3.5 mr-1" /> Trigger Alex
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-xs">
              <div className="text-muted-foreground">
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

