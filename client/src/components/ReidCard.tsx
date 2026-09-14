import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  RefreshCw,
  FileSearch,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Search,
} from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { cn } from "@/lib/utils";

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

interface AuditListResponse {
  audits: AuditRow[];
  total: number;
  limit: number;
  offset: number;
}

type StatusFilter =
  | "all"
  | "pending_review"
  | "escalated"
  | "auto_approved"
  | "pending_clarification"
  | "approved"
  | "rejected";

type DocTypeFilter =
  | "all"
  | "insurance"
  | "drivers_license"
  | "vehicle_registration"
  | "background_check";

type ScoreFilter = "all" | "clean" | "low" | "medium" | "high";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending_review", label: "Pending" },
  { value: "escalated", label: "Escalated" },
  { value: "auto_approved", label: "Auto-Approved" },
  { value: "pending_clarification", label: "Clarification" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const TYPE_FILTERS: { value: DocTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "insurance", label: "Insurance" },
  { value: "drivers_license", label: "Driver's License" },
  { value: "vehicle_registration", label: "Vehicle Reg" },
  { value: "background_check", label: "Background Check" },
];

const SCORE_FILTERS: { value: ScoreFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "clean", label: "Clean (0)" },
  { value: "low", label: "Low (1-2)" },
  { value: "medium", label: "Medium (3-4)" },
  { value: "high", label: "High (5+)" },
];

function scoreRange(f: ScoreFilter): { min?: number; max?: number } {
  switch (f) {
    case "clean":
      return { min: 0, max: 0 };
    case "low":
      return { min: 1, max: 2 };
    case "medium":
      return { min: 3, max: 4 };
    case "high":
      return { min: 5 };
    default:
      return {};
  }
}

export function ReidCard() {
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [filterType, setFilterType] = useState<DocTypeFilter>("all");
  const [filterScore, setFilterScore] = useState<ScoreFilter>("all");
  const [search, setSearch] = useState("");

  const { data: kpi, isLoading: kpiLoading } = useQuery<KpiReport>({
    queryKey: ["/api/admin/reid/kpi?days=7"],
  });

  const auditsQueryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterType !== "all") params.set("documentType", filterType);
    const { min, max } = scoreRange(filterScore);
    if (min !== undefined) params.set("minScore", String(min));
    if (max !== undefined) params.set("maxScore", String(max));
    if (search.trim()) params.set("search", search.trim());
    params.set("limit", "50");
    const qs = params.toString();
    return [`/api/admin/document-audits${qs ? `?${qs}` : ""}`];
  }, [filterStatus, filterType, filterScore, search]);

  const { data: auditsData, isLoading: auditsLoading } =
    useQuery<AuditListResponse>({
      queryKey: auditsQueryKey,
    });

  const audits = auditsData?.audits ?? [];

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

  const invalidateAudits = () => {
    queryClient.invalidateQueries({ queryKey: auditsQueryKey });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reid/kpi?days=7"] });
  };

  const approve = useMutation({
    mutationFn: async (auditId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/document-audits/${auditId}/approve`,
        {},
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document approved" });
      invalidateAudits();
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
      const res = await apiRequest(
        "POST",
        `/api/admin/document-audits/${auditId}/reject`,
        { reason },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document rejected" });
      setRejectingId(null);
      setRejectReason("");
      invalidateAudits();
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

            <FiltersBar
              search={search}
              onSearchChange={setSearch}
              filterStatus={filterStatus}
              onStatusChange={setFilterStatus}
              filterType={filterType}
              onTypeChange={setFilterType}
              filterScore={filterScore}
              onScoreChange={setFilterScore}
            />

            <div className="rounded-md border">
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b flex items-center gap-1.5">
                <FileSearch className="w-3.5 h-3.5" />
                Audits ({audits.length}
                {auditsData && auditsData.total > audits.length
                  ? ` of ${auditsData.total}`
                  : ""}
                )
              </div>
              {auditsLoading && (
                <div className="px-3 py-3 text-sm text-muted-foreground">Loading…</div>
              )}
              {!auditsLoading && audits.length === 0 && (
                <div className="px-3 py-3 text-sm text-muted-foreground">
                  No audits match these filters.
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
                        <Link href={`/admin/audits/${a.id}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`link-reid-view-audit-${a.id}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1" />
                            View Audit
                          </Button>
                        </Link>
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

function FiltersBar({
  search,
  onSearchChange,
  filterStatus,
  onStatusChange,
  filterType,
  onTypeChange,
  filterScore,
  onScoreChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  filterStatus: StatusFilter;
  onStatusChange: (v: StatusFilter) => void;
  filterType: DocTypeFilter;
  onTypeChange: (v: DocTypeFilter) => void;
  filterScore: ScoreFilter;
  onScoreChange: (v: ScoreFilter) => void;
}) {
  return (
    <div className="rounded-md border p-3 space-y-3 bg-muted/20">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search mover name…"
          className="pl-8 h-8 text-sm"
          data-testid="input-reid-search"
        />
      </div>
      <PillGroup
        label="Status"
        value={filterStatus}
        onChange={(v) => onStatusChange(v as StatusFilter)}
        options={STATUS_FILTERS}
        testIdPrefix="reid-filter-status"
      />
      <PillGroup
        label="Type"
        value={filterType}
        onChange={(v) => onTypeChange(v as DocTypeFilter)}
        options={TYPE_FILTERS}
        testIdPrefix="reid-filter-type"
      />
      <PillGroup
        label="Score"
        value={filterScore}
        onChange={(v) => onScoreChange(v as ScoreFilter)}
        options={SCORE_FILTERS}
        testIdPrefix="reid-filter-score"
      />
    </div>
  );
}

function PillGroup({
  label,
  value,
  onChange,
  options,
  testIdPrefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  testIdPrefix: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">
        {label}
      </span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "text-xs px-2.5 py-1 rounded-full border transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background hover:bg-muted border-input",
          )}
          data-testid={`${testIdPrefix}-${o.value}`}
        >
          {o.label}
        </button>
      ))}
    </div>
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
