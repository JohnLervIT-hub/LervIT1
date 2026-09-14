import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  ExternalLink,
  Copy,
  Loader2,
  Mail,
  Phone,
  Truck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Irregularity {
  id: string;
  auditId: string;
  moverId: string;
  checkName: string;
  result: string;
  severity: string;
  details: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface AuditDetail {
  id: string;
  moverId: string;
  verificationItemId: string | null;
  documentType: string;
  documentUrl: string | null;
  status: string;
  irregularityScore: number | null;
  irregularities: Irregularity[];
  checksRun: unknown;
  auditedBy: string | null;
  reviewedBy: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  escalatedAt: string | null;
  escalationReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  moverName: string | null;
  moverEmail: string | null;
  moverPhone: string | null;
  moverVehicle: string | null;
  recommendation: "approve" | "clarification" | "escalate";
}

interface CheckResult {
  name?: string;
  check?: string;
  result?: string;
  status?: string;
  severity?: string;
  details?: string;
  passed?: boolean;
}

export default function AdminAuditDetailPage() {
  const params = useParams<{ auditId: string }>();
  const auditId = params.auditId ?? "";
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [showChecks, setShowChecks] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    null | { kind: "approve" } | { kind: "reject" } | { kind: "clarify" }
  >(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, error } = useQuery<{ audit: AuditDetail }>({
    queryKey: [`/api/admin/document-audits/${auditId}`],
    enabled: !!auditId,
  });

  const audit = data?.audit;

  const approve = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/document-audits/${auditId}/approve`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document approved" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/document-audits/${auditId}`] });
      navigate("/admin/verification");
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
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/document-audits/${auditId}/reject`, {
        reason,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document rejected" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/document-audits/${auditId}`] });
      navigate("/admin/verification");
    },
    onError: (err: any) => {
      toast({
        title: "Reject failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const clarify = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/admin/document-audits/${auditId}/clarify`,
        { reason },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Clarification requested" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/document-audits/${auditId}`] });
      navigate("/admin/verification");
    },
    onError: (err: any) => {
      toast({
        title: "Clarification request failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const isApproved = audit?.status === "approved" || !!audit?.approvedAt;
  const isRejected = audit?.status === "rejected" || !!audit?.rejectedAt;

  if (!auditId) {
    return <div className="p-8 text-sm text-muted-foreground">Invalid audit ID.</div>;
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading audit…
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-4">
        <BackLink />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Audit not found or failed to load.
          </CardContent>
        </Card>
      </div>
    );
  }

  const shortId = audit.id.slice(-8);
  const score = audit.irregularityScore ?? 0;
  const checksRun = Array.isArray(audit.checksRun) ? (audit.checksRun as CheckResult[]) : [];

  return (
    <div className="min-h-screen bg-muted/20 pb-32">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BackLink />
            <div>
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-audit-title">
                Document Audit #{shortId}
              </h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <StatusBadge status={audit.status} />
                <span>·</span>
                <span>{format(new Date(audit.createdAt), "PPP p")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1 — Mover Profile */}
        <Card data-testid="card-mover-profile">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mover</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-4">
              <Avatar className="w-14 h-14">
                <AvatarFallback>{initials(audit.moverName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-base font-semibold" data-testid="text-mover-name">
                  {audit.moverName ?? audit.moverId.slice(0, 8)}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {audit.moverEmail && (
                    <a
                      href={`mailto:${audit.moverEmail}`}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      {audit.moverEmail}
                    </a>
                  )}
                  {audit.moverPhone && (
                    <a
                      href={`tel:${audit.moverPhone}`}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {audit.moverPhone}
                    </a>
                  )}
                  {audit.moverVehicle && (
                    <span className="flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5" />
                      {audit.moverVehicle}
                    </span>
                  )}
                </div>
              </div>
              <Link href={`/admin/verification?moverId=${audit.moverId}`}>
                <Button variant="outline" size="sm" data-testid="link-view-full-profile">
                  View Full Profile
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Section 2 — Reid Assessment */}
        <Card data-testid="card-reid-assessment">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <AgentAvatar agentKey="reid-calloway" size="sm" />
              <div>
                <CardTitle className="text-base">Reid's AI Assessment</CardTitle>
                <CardDescription className="text-xs">
                  Audited by {audit.auditedBy ?? "reid"} · Score {score}/10
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScoreMeter score={score} />

            <RecommendationBanner recommendation={audit.recommendation} />

            {audit.notes && (
              <blockquote className="border-l-4 border-muted-foreground/30 pl-3 py-1 text-sm italic text-muted-foreground">
                "{audit.notes}"
              </blockquote>
            )}

            {checksRun.length > 0 && (
              <div className="rounded-md border">
                <button
                  type="button"
                  onClick={() => setShowChecks(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/40"
                  data-testid="button-toggle-checks"
                >
                  <span>Checks Run ({checksRun.length})</span>
                  {showChecks ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
                {showChecks && (
                  <div className="border-t divide-y">
                    {checksRun.map((c, i) => {
                      const passed =
                        c.passed === true ||
                        c.result === "pass" ||
                        c.status === "pass";
                      return (
                        <div
                          key={i}
                          className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 items-center text-sm"
                        >
                          <div className="min-w-0 truncate">
                            {c.name ?? c.check ?? `Check ${i + 1}`}
                            {c.details && (
                              <div className="text-xs text-muted-foreground truncate">
                                {c.details}
                              </div>
                            )}
                          </div>
                          <Badge variant={passed ? "outline" : "destructive"} className="text-[10px]">
                            {passed ? "PASS" : c.result ?? c.status ?? "FAIL"}
                          </Badge>
                          {c.severity && (
                            <SeverityBadge severity={c.severity} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 3 — Document Viewer */}
        <Card data-testid="card-document-viewer">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Submitted Document
            </CardTitle>
            <CardDescription className="text-xs">
              {audit.documentType.replace(/_/g, " ")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentPreview url={audit.documentUrl} />
          </CardContent>
        </Card>

        {/* Section 4 — Irregularities */}
        <Card data-testid="card-irregularities">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Issues Detected ({audit.irregularities.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {score === 0 && audit.irregularities.length === 0 ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-4 flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                No issues found.
              </div>
            ) : audit.irregularities.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Score is {score} but no line-item irregularities were recorded.
              </div>
            ) : (
              <div className="space-y-2">
                {audit.irregularities.map(irr => (
                  <div
                    key={irr.id}
                    className="rounded-md border p-3 space-y-1"
                    data-testid={`irregularity-${irr.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={irr.severity} />
                      <span className="text-sm font-medium">{irr.checkName}</span>
                    </div>
                    {irr.details && (
                      <div className="text-sm text-muted-foreground">{irr.details}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 5 — Sticky action panel */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur-sm z-40">
        <div className="max-w-5xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(audit.id);
              toast({ title: "Audit ID copied" });
            }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            data-testid="button-copy-audit-id"
          >
            <Copy className="w-3 h-3" />
            Audit ID: <code className="text-xs">{audit.id}</code>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              onClick={() => {
                setReason("");
                setConfirmAction({ kind: "clarify" });
              }}
              disabled={isApproved || isRejected}
              data-testid="button-request-clarification"
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1" />
              Request Clarification
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setReason("");
                setConfirmAction({ kind: "reject" });
              }}
              disabled={isRejected}
              data-testid="button-reject-document"
            >
              <XCircle className="w-3.5 h-3.5 mr-1" />
              Reject Document
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setConfirmAction({ kind: "approve" })}
              disabled={isApproved}
              data-testid="button-approve-document"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Approve Document
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation dialog */}
      <Dialog
        open={confirmAction !== null}
        onOpenChange={open => {
          if (!open) {
            setConfirmAction(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.kind === "approve" && "Approve document?"}
              {confirmAction?.kind === "reject" && "Reject document?"}
              {confirmAction?.kind === "clarify" && "Request clarification?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.kind === "approve" &&
                "The mover will be notified and marked verified for this document."}
              {confirmAction?.kind === "reject" &&
                "The mover will be notified with the reason below."}
              {confirmAction?.kind === "clarify" &&
                "Reid will email the mover asking them to re-upload with the notes below."}
            </DialogDescription>
          </DialogHeader>
          {(confirmAction?.kind === "reject" || confirmAction?.kind === "clarify") && (
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={
                confirmAction.kind === "reject"
                  ? "Reason for rejection (required)"
                  : "What needs to be clarified?"
              }
              rows={4}
              data-testid="input-action-reason"
            />
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmAction(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmAction?.kind === "approve") approve.mutate();
                else if (confirmAction?.kind === "reject") reject.mutate();
                else if (confirmAction?.kind === "clarify") clarify.mutate();
              }}
              disabled={
                (confirmAction?.kind === "reject" && !reason.trim()) ||
                (confirmAction?.kind === "clarify" && !reason.trim()) ||
                approve.isPending ||
                reject.isPending ||
                clarify.isPending
              }
              className={cn(
                confirmAction?.kind === "approve" && "bg-emerald-600 hover:bg-emerald-700 text-white",
                confirmAction?.kind === "reject" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
              data-testid="button-confirm-action"
            >
              {(approve.isPending || reject.isPending || clarify.isPending) && (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/verification">
      <Button variant="ghost" size="sm" data-testid="link-back-to-verification">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back
      </Button>
    </Link>
  );
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  const tone: "outline" | "secondary" | "destructive" | "default" =
    status === "approved"
      ? "default"
      : status === "escalated" || status === "rejected"
        ? "destructive"
        : status === "pending_clarification"
          ? "secondary"
          : "outline";
  return (
    <Badge variant={tone} data-testid="badge-audit-status">
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function ScoreMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(10, score));
  const pct = (clamped / 10) * 100;
  const color = score === 0 ? "bg-emerald-500" : score <= 4 ? "bg-amber-500" : "bg-red-500";
  const label = score === 0 ? "Clean" : score <= 4 ? "Low-Medium" : "High";
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Irregularity Score
        </div>
        <div className="text-sm">
          <span className="text-lg font-bold tabular-nums">{score}</span>
          <span className="text-xs text-muted-foreground ml-1">/ 10 · {label}</span>
        </div>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all", color)}
          style={{ width: `${pct}%` }}
          data-testid="score-meter-fill"
        />
      </div>
    </div>
  );
}

function RecommendationBanner({
  recommendation,
}: {
  recommendation: "approve" | "clarification" | "escalate";
}) {
  const spec =
    recommendation === "approve"
      ? {
          icon: "✅",
          label: "Approve",
          classes: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
        }
      : recommendation === "clarification"
        ? {
            icon: "⚠️",
            label: "Request Clarification",
            classes: "border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
          }
        : {
            icon: "🚨",
            label: "Escalate",
            classes: "border-red-200 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300",
          };
  return (
    <div
      className={cn("rounded-md border p-3 flex items-center gap-2 text-sm font-medium", spec.classes)}
      data-testid="recommendation-banner"
    >
      <span className="text-lg">{spec.icon}</span>
      Reid recommends: {spec.label}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  const variant: "outline" | "secondary" | "destructive" | "default" =
    s === "critical" || s === "high"
      ? "destructive"
      : s === "medium" || s === "med"
        ? "secondary"
        : "outline";
  return (
    <Badge variant={variant} className="text-[10px] uppercase">
      {severity}
    </Badge>
  );
}

function DocumentPreview({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center bg-muted/30">
        <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <div className="text-sm text-muted-foreground">No document file available</div>
      </div>
    );
  }

  const isImage = /\.(png|jpe?g|gif|webp|heic|avif)(\?|$)/i.test(url);
  const isPdf = /\.pdf(\?|$)/i.test(url);

  return (
    <div className="space-y-2">
      {isImage && (
        <img
          src={url}
          alt="Submitted document"
          className="max-w-full max-h-[600px] rounded-md border mx-auto object-contain"
          data-testid="img-document-preview"
        />
      )}
      {isPdf && (
        <iframe
          src={url}
          title="Submitted PDF"
          className="w-full h-[600px] rounded-md border"
          data-testid="iframe-document-preview"
        />
      )}
      {!isImage && !isPdf && (
        <div className="rounded-md border p-4 text-sm text-muted-foreground">
          Preview not available for this file type.
        </div>
      )}
      <div className="flex justify-end">
        <Button
          asChild
          variant="outline"
          size="sm"
          data-testid="link-open-full-size"
        >
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Open Full Size
          </a>
        </Button>
      </div>
    </div>
  );
}
