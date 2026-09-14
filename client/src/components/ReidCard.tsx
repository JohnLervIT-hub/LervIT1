import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, FileSearch, CheckCircle2, XCircle } from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";

interface KpiReport {
  period: string;
  total: number;
  autoApproved: number;
  escalated: number;
  pending: number;
  rejected: number;
  autoApprovalRate: string;
  escalationRate: string;
  avgIrregularityScore: number;
  kpis: {
    autoApprovalTarget: string;
    autoApprovalMet: boolean;
    escalationTarget: string;
    escalationMet: boolean;
  };
}

interface AuditRow {
  id: string;
  moverId: string;
  moverName: string | null;
  documentType: string;
  status: string;
  irregularityScore: number | null;
  irregularities: unknown;
  notes: string | null;
  createdAt: string;
  escalatedAt: string | null;
}

const PENDING_STATUS_FILTER = "pending_review,escalated,pending_clarification";

export function ReidCard() {
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: kpi, isLoading: kpiLoading } = useQuery<KpiReport>({
    queryKey: ["/api/admin/reid/kpi?days=7"],
  });

  const { data: auditsData, isLoading: auditsLoading } = useQuery<{ audits: AuditRow[] }>({
    queryKey: ["/api/admin/document-audits?status=escalated"],
  });

  const { data: pendingData } = useQuery<{ audits: AuditRow[] }>({
    queryKey: ["/api/admin/document-audits?status=pending_review"],
  });

  const audits = [
    ...(auditsData?.audits ?? []),
    ...(pendingData?.audits ?? []),
  ];

  const runSweep = useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }) => {
      const res = await apiRequest("POST", "/api/admin/agent/reid/trigger", {
        action: "daily_audit_sweep",
        input: {},
        dry_run: dryRun,
      });
      return res.json();
    },
    onSuccess: (payload, { dryRun }) => {
      toast({
        title: dryRun ? "Reid dry-run" : "Reid sweep queued",
        description: dryRun
          ? `Preview: ${JSON.stringify(payload?.result ?? {})}`
          : `Job ${payload?.jobId ?? ""} runs in background.`,
      });
      if (!dryRun) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/reid/kpi?days=7"] });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Reid trigger failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const approve = useMutation({
    mutationFn: async (auditId: string) => {
      const res = await apiRequest("POST", `/api/admin/document-audits/${auditId}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document approved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/document-audits?status=escalated"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/document-audits?status=pending_review"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reid/kpi?days=7"] });
    },
    onError: (err: any) => {
      toast({
        title: "Approve failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const reject = useMutation({
    mutationFn: async ({ auditId, reason }: { auditId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/document-audits/${auditId}/reject`, {
        reason,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document rejected" });
      setRejectingId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/document-audits?status=escalated"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/document-audits?status=pending_review"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reid/kpi?days=7"] });
    },
    onError: (err: any) => {
      toast({
        title: "Reject failed",
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
            <AgentAvatar agentKey="reid-calloway" size="md" showName showRole />
            <CardDescription className="mt-1.5">
              Audits mover documents · Auto-approves clean uploads · Escalates irregularities &gt; 4
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => runSweep.mutate({ dryRun: true })}
              disabled={runSweep.isPending}
              data-testid="button-reid-preview-sweep"
            >
              Preview Sweep
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runSweep.mutate({ dryRun: false })}
              disabled={runSweep.isPending}
              data-testid="button-reid-run-sweep"
            >
              {runSweep.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Run Audit Sweep
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {kpiLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading Reid KPIs…
          </div>
        )}
        {kpi && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatBox label="Auto-approved (7d)" value={kpi.autoApproved} tone="good" />
              <StatBox label="Pending" value={kpi.pending} tone="warm" />
              <StatBox label="Escalated" value={kpi.escalated} tone="bad" />
              <StatBox label="Rejected" value={kpi.rejected} tone="bad" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <KpiRow
                label="Auto-approval"
                value={kpi.autoApprovalRate}
                target={kpi.kpis.autoApprovalTarget}
                met={kpi.kpis.autoApprovalMet}
              />
              <KpiRow
                label="Escalation"
                value={kpi.escalationRate}
                target={`≤${kpi.kpis.escalationTarget}`}
                met={kpi.kpis.escalationMet}
              />
              <div className="rounded-md border p-2.5 col-span-2">
                <div className="text-xs text-muted-foreground">Avg irregularity score</div>
                <div className="text-lg font-semibold tabular-nums">
                  {kpi.avgIrregularityScore}
                </div>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b flex items-center gap-1.5">
                <FileSearch className="w-3.5 h-3.5" />
                Pending audits ({audits.length})
              </div>
              {auditsLoading && (
                <div className="px-3 py-3 text-sm text-muted-foreground">Loading…</div>
              )}
              {!auditsLoading && audits.length === 0 && (
                <div className="px-3 py-3 text-sm text-muted-foreground">
                  No pending audits.
                </div>
              )}
              <ul className="divide-y">
                {audits.map((a) => (
                  <li key={a.id} className="px-3 py-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {a.moverName ?? a.moverId.slice(0, 8)} —{" "}
                          {a.documentType.replace(/_/g, " ")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(a.createdAt).toLocaleString()} · score {a.irregularityScore ?? 0}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={a.status} />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approve.mutate(a.id)}
                          disabled={approve.isPending}
                          data-testid={`button-reid-approve-${a.id}`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectingId(a.id)}
                          disabled={reject.isPending}
                          data-testid={`button-reid-reject-${a.id}`}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                    {a.notes && (
                      <div className="text-xs text-muted-foreground">{a.notes}</div>
                    )}
                    {rejectingId === a.id && (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Reason for rejection"
                          className="flex-1 min-w-[200px] rounded-md border px-2 py-1 text-sm"
                          data-testid={`input-reid-reject-reason-${a.id}`}
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            reject.mutate({ auditId: a.id, reason: rejectReason })
                          }
                          disabled={!rejectReason.trim() || reject.isPending}
                        >
                          Confirm Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectReason("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "escalated"
      ? "destructive"
      : status === "pending_clarification"
        ? "secondary"
        : "outline";
  return <Badge variant={tone as any}>{status.replace(/_/g, " ")}</Badge>;
}

function KpiRow({
  label,
  value,
  target,
  met,
}: {
  label: string;
  value: string;
  target: string;
  met: boolean;
}) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground">
        {label} <span className="opacity-70">(target {target})</span>
      </div>
      <div
        className={`text-lg font-semibold tabular-nums ${met ? "text-emerald-600" : "text-amber-600"}`}
      >
        {value}
      </div>
    </div>
  );
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
