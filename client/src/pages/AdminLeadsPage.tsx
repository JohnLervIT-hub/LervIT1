import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ArrowLeft, RefreshCw, Zap, Plus } from "lucide-react";
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

const SOURCE_OPTIONS = [
  { value: "personal", label: "Personal" },
  { value: "referral", label: "Referral" },
  { value: "phone", label: "Phone" },
  { value: "social", label: "Social" },
  { value: "kijiji", label: "Kijiji" },
  { value: "google_alerts", label: "Google Alerts" },
  { value: "other", label: "Other" },
] as const;

const ALEX_AUTO_TRIGGER_THRESHOLD = 50;

function scoreClass(score: number | null): string {
  const s = score ?? 0;
  if (s >= 70) return "text-emerald-600 font-semibold";
  if (s >= 50) return "text-amber-600 font-semibold";
  return "text-red-600";
}

interface CreateLeadForm {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  sourceChannel: string;
  notes: string;
  intentScore: number;
}

const BLANK_FORM: CreateLeadForm = {
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  sourceChannel: "personal",
  notes: "",
  intentScore: 80,
};

export default function AdminLeadsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<CreateLeadForm>(BLANK_FORM);
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

  const createLead = useMutation({
    mutationFn: async (input: CreateLeadForm) => {
      const res = await apiRequest("POST", "/api/admin/agent/leads", {
        contactName: input.contactName.trim(),
        contactEmail: input.contactEmail.trim() || undefined,
        contactPhone: input.contactPhone.trim() || undefined,
        sourceChannel: input.sourceChannel,
        notes: input.notes.trim() || undefined,
        intentScore: input.intentScore,
        status: "new",
      });
      const body = (await res.json()) as { lead?: Lead };
      if (!body.lead) throw new Error("Server did not return a lead");
      return body.lead;
    },
    onSuccess: async (lead) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/leads"] });
      setAddOpen(false);
      setForm(BLANK_FORM);

      const willTriggerAlex = (lead.intentScore ?? 0) >= ALEX_AUTO_TRIGGER_THRESHOLD;
      if (willTriggerAlex) {
        try {
          await apiRequest("POST", "/api/admin/agent/alex/trigger", {
            action: "convert_lead",
            leadId: lead.id,
          });
          toast({
            title: "Lead added",
            description: "Alex will contact shortly.",
          });
        } catch (err: any) {
          toast({
            title: "Lead added — Alex trigger failed",
            description: err?.message ?? "Alex will pick this up on the next crawl.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Lead added",
          description: `Intent score ${lead.intentScore ?? 0} — below auto-contact threshold. Trigger Alex manually if needed.`,
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Add lead failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const leads = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const statuses = ["all", "new", "contacted", "converted", "cold"] as const;

  const nameValid = form.contactName.trim().length > 0;

  return (
    <div className="container mx-auto max-w-7xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Admin
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => { setForm(BLANK_FORM); setAddOpen(true); }}
            data-testid="button-add-lead"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Lead
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/leads"] })}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
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
              No leads yet. Add one above, or trigger Scout from the APEX tab.
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add lead</DialogTitle>
            <DialogDescription>
              Manually add a warm intro, referral, or phone lead. Scores ≥ {ALEX_AUTO_TRIGGER_THRESHOLD} auto-trigger Alex.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (!nameValid) return;
              createLead.mutate(form);
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Name *</Label>
              <Input
                id="lead-name"
                required
                value={form.contactName}
                onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                data-testid="input-lead-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lead-email">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                  data-testid="input-lead-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone">Phone</Label>
                <Input
                  id="lead-phone"
                  type="tel"
                  value={form.contactPhone}
                  onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                  data-testid="input-lead-phone"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-source">Source</Label>
              <Select
                value={form.sourceChannel}
                onValueChange={v => setForm(f => ({ ...f, sourceChannel: v }))}
              >
                <SelectTrigger id="lead-source" data-testid="select-lead-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-notes">Notes</Label>
              <Textarea
                id="lead-notes"
                placeholder="Moving from X to Y in October"
                rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                data-testid="input-lead-notes"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-score">Intent score (0–100)</Label>
              <Input
                id="lead-score"
                type="number"
                min={0}
                max={100}
                value={form.intentScore}
                onChange={e => {
                  const n = Number(e.target.value);
                  setForm(f => ({ ...f, intentScore: isNaN(n) ? 0 : Math.max(0, Math.min(100, n)) }));
                }}
                data-testid="input-lead-score"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!nameValid || createLead.isPending}
                data-testid="button-submit-lead"
              >
                {createLead.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Add lead
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
