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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Loader2,
  ArrowLeft,
  RefreshCw,
  Zap,
  Plus,
  Trash2,
  ExternalLink,
  UserPlus,
  Mail,
  Phone,
  Clock,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

interface Lead {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  sourceChannel: string | null;
  utmCampaign: string | null;
  intentScore: number | null;
  status: string | null;
  leadType: string | null;
  touchpoints: number | null;
  lastTouchedAt: string | null;
  notes: string | null;
  createdAt: string;
}

type Audience = "all" | "customers" | "movers";
const AUDIENCE_TABS: Array<{ value: Audience; label: string }> = [
  { value: "all", label: "All" },
  { value: "customers", label: "Customers" },
  { value: "movers", label: "Mover Candidates" },
];

function isMoverCandidate(lead: Lead): boolean {
  return lead.utmCampaign === "ryan-brooks";
}

function isSamProspect(lead: Lead): boolean {
  return lead.leadType === "b2b" && (lead.sourceChannel?.startsWith("sam_") ?? false);
}

function extractUrl(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/URL:\s*(https?:\/\/[^\s\n]+)/);
  return match?.[1] ?? null;
}

function getScoreColor(score?: number | null): string {
  if (!score) return "bg-gray-100 text-gray-600";
  if (score >= 80) return "bg-green-100 text-green-700";
  if (score >= 60) return "bg-yellow-100 text-yellow-700";
  if (score >= 40) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-600";
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

const MOVER_SOURCE_OPTIONS = [
  { value: "kijiji", label: "Kijiji" },
  { value: "craigslist", label: "Craigslist" },
  { value: "reddit", label: "Reddit" },
  { value: "facebook", label: "Facebook" },
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
] as const;

const MOVER_VEHICLE_OPTIONS = [
  { value: "suv", label: "SUV / Car" },
  { value: "pickup", label: "Pickup Truck" },
  { value: "van", label: "Cargo Van" },
  { value: "truck", label: "Moving Truck" },
] as const;

const ALEX_AUTO_TRIGGER_THRESHOLD = 50;

const TEMPERATURE_OPTIONS = [
  { value: "hot",  score: 90, label: "🔴 Hot — Moving soon" },
  { value: "warm", score: 70, label: "🟡 Warm — Planning a move" },
  { value: "cool", score: 50, label: "🟢 Cool — Considering a move" },
  { value: "cold", score: 30, label: "⚪ Cold — Just exploring" },
] as const;
type Temperature = typeof TEMPERATURE_OPTIONS[number]["value"];
const DEFAULT_TEMPERATURE: Temperature = "warm";

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
  temperature: Temperature;
  vehicleType: string;
}

const BLANK_FORM: CreateLeadForm = {
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  sourceChannel: "personal",
  notes: "",
  temperature: DEFAULT_TEMPERATURE,
  vehicleType: "",
};

function temperatureToScore(t: Temperature): number {
  return TEMPERATURE_OPTIONS.find(o => o.value === t)?.score ?? 70;
}

export default function AdminLeadsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [audience, setAudience] = useState<Audience>("all");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<CreateLeadForm>(BLANK_FORM);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pageSize = 20;

  const openAddContact = (lead: Lead) => {
    setSelectedLead(lead);
    setContactForm({ name: "", email: "", phone: "" });
    setAddContactOpen(true);
  };

  const agentName = selectedLead
    ? (isMoverCandidate(selectedLead) ? "Jordan Hayes" : "Alex Morgan")
    : "";
  const isSupply = selectedLead ? isMoverCandidate(selectedLead) : false;

  const handleAddContact = async () => {
    if (!selectedLead) return;
    if (!contactForm.email && !contactForm.phone) return;

    setIsSubmitting(true);
    try {
      await apiRequest("PATCH", `/api/admin/agent/leads/${selectedLead.id}/contact`, {
        contactName: contactForm.name.trim() || undefined,
        contactEmail: contactForm.email.trim() || undefined,
        contactPhone: contactForm.phone.trim() || undefined,
      });

      const agentEndpoint = isMoverCandidate(selectedLead)
        ? "/api/admin/agent/jordan/trigger"
        : "/api/admin/agent/alex/trigger";
      const agentAction = isMoverCandidate(selectedLead) ? "onboard_candidate" : "convert_lead";

      await apiRequest("POST", agentEndpoint, {
        action: agentAction,
        leadId: selectedLead.id,
      });

      toast({
        title: `${agentName} activated`,
        description: contactForm.email
          ? `Personalized email sent to ${contactForm.email}`
          : `SMS sequence started for ${contactForm.phone}`,
      });

      setAddContactOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/leads"] });
    } catch (err: any) {
      toast({
        title: "Something went wrong",
        description: err?.message ?? "Contact not saved. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const { data, isLoading, error } = useQuery<ListResponse>({
    queryKey: ["/api/admin/agent/leads", { status: statusFilter, audience, page, pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (audience !== "all") params.set("audience", audience);
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

  const triggerJordan = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await apiRequest("POST", "/api/admin/agent/jordan/trigger", {
        action: "onboard_candidate",
        leadId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Jordan triggered", description: "Recruitment touch sent." });
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

  const triggerSam = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await apiRequest("POST", "/api/admin/agent/sam/trigger", {
        action: "send_b2b_touch",
        input: { leadId, touchNumber: 1 },
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sam triggered", description: "B2B outreach touch queued." });
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

  const deleteLead = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/agent/leads/${leadId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Lead deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agent/leads"] });
    },
    onError: (err: any) => {
      toast({
        title: "Delete failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const createLead = useMutation({
    mutationFn: async (input: CreateLeadForm) => {
      const isMoverAdd = audience === "movers";
      const vehicleLine = isMoverAdd && input.vehicleType
        ? `Vehicle: ${MOVER_VEHICLE_OPTIONS.find(o => o.value === input.vehicleType)?.label ?? input.vehicleType}`
        : "";
      const combinedNotes = [vehicleLine, input.notes.trim()].filter(Boolean).join('\n') || undefined;
      const res = await apiRequest("POST", "/api/admin/agent/leads", {
        contactName: input.contactName.trim(),
        contactEmail: input.contactEmail.trim() || undefined,
        contactPhone: input.contactPhone.trim() || undefined,
        sourceChannel: input.sourceChannel,
        notes: combinedNotes,
        intentScore: temperatureToScore(input.temperature),
        status: "new",
        utmCampaign: isMoverAdd ? "ryan-brooks" : undefined,
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
            onClick={() => {
              setForm({
                ...BLANK_FORM,
                sourceChannel: audience === "movers" ? "kijiji" : "personal",
              });
              setAddOpen(true);
            }}
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
                {audience === "movers"
                  ? "Ryan Brooks supply pipeline"
                  : audience === "customers"
                    ? "Scout Reid demand pipeline"
                    : "Demand + supply pipelines"}
                {" · "}
                {total} lead{total === 1 ? "" : "s"} total
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
          <div className="flex gap-1.5 pt-2" role="tablist" aria-label="Lead audience">
            {AUDIENCE_TABS.map(t => (
              <Button
                key={t.value}
                variant={audience === t.value ? "default" : "outline"}
                size="sm"
                role="tab"
                aria-selected={audience === t.value}
                onClick={() => { setAudience(t.value); setPage(1); }}
                className="text-xs h-7 px-3"
                data-testid={`tab-audience-${t.value}`}
              >
                {t.label}
              </Button>
            ))}
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
                  {leads.map(lead => {
                    const listingUrl = extractUrl(lead.notes);
                    const isAnonymous = !lead.contactEmail && !lead.contactPhone;
                    return (
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
                        <div className="flex flex-wrap gap-1.5">
                          {listingUrl && !lead.contactEmail && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(listingUrl, "_blank")}
                              className="gap-1.5 text-xs"
                              data-testid={`button-view-listing-${lead.id}`}
                            >
                              <ExternalLink className="w-3 h-3" />
                              View Listing
                            </Button>
                          )}
                          {isAnonymous && (
                            <Button
                              size="sm"
                              onClick={() => openAddContact(lead)}
                              className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                              data-testid={`button-add-contact-${lead.id}`}
                            >
                              <UserPlus className="w-3 h-3" />
                              Add Contact
                            </Button>
                          )}
                          {!isAnonymous && (isMoverCandidate(lead) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={triggerJordan.isPending || lead.status === "converted" || lead.status === "cold"}
                              onClick={() => triggerJordan.mutate(lead.id)}
                              data-testid={`button-trigger-jordan-${lead.id}`}
                            >
                              <Zap className="w-3.5 h-3.5 mr-1" /> Trigger Jordan
                            </Button>
                          ) : isSamProspect(lead) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={triggerSam.isPending || lead.status === "converted" || lead.status === "cold"}
                              onClick={() => triggerSam.mutate(lead.id)}
                              data-testid={`button-trigger-sam-${lead.id}`}
                            >
                              <Zap className="w-3.5 h-3.5 mr-1" /> Trigger Sam
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={triggerAlex.isPending || lead.status === "converted" || lead.status === "cold"}
                              onClick={() => triggerAlex.mutate(lead.id)}
                            >
                              <Zap className="w-3.5 h-3.5 mr-1" /> Trigger Alex
                            </Button>
                          ))}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            disabled={deleteLead.isPending}
                            title="Delete lead"
                            data-testid={`button-delete-lead-${lead.id}`}
                            onClick={() => {
                              const label = lead.contactName?.trim() || lead.notes?.slice(0, 60) || lead.id;
                              if (window.confirm(`Delete this lead?\n\n${label}\n\nThis cannot be undone.`)) {
                                deleteLead.mutate(lead.id);
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
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
            <DialogTitle>{audience === "movers" ? "Add Mover Candidate" : "Add lead"}</DialogTitle>
            <DialogDescription>
              {audience === "movers"
                ? `Manually add a driver or mover to the recruitment pipeline. Jordan auto-triggers on scores ≥ ${ALEX_AUTO_TRIGGER_THRESHOLD}.`
                : `Manually add a warm intro, referral, or phone lead. Scores ≥ ${ALEX_AUTO_TRIGGER_THRESHOLD} auto-trigger Alex.`}
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
                  {(audience === "movers" ? MOVER_SOURCE_OPTIONS : SOURCE_OPTIONS).map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {audience === "movers" && (
              <div className="space-y-1.5">
                <Label htmlFor="lead-vehicle">Vehicle Type</Label>
                <Select
                  value={form.vehicleType}
                  onValueChange={v => setForm(f => ({ ...f, vehicleType: v }))}
                >
                  <SelectTrigger id="lead-vehicle" data-testid="select-lead-vehicle">
                    <SelectValue placeholder="Select vehicle…" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOVER_VEHICLE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
              <Label htmlFor="lead-temperature">Lead Temperature</Label>
              <Select
                value={form.temperature}
                onValueChange={v => setForm(f => ({ ...f, temperature: v as Temperature }))}
              >
                <SelectTrigger id="lead-temperature" data-testid="select-lead-temperature">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPERATURE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              Add Contact Details
            </DialogTitle>
            <DialogDescription>
              Add contact info to activate
              {isSupply ? " Jordan Hayes" : " Alex Morgan"}'s outreach sequence.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Lead Signal
            </p>
            <p className="text-sm line-clamp-2">
              {selectedLead?.notes?.split("\n")[0]}
            </p>
            <div className="flex items-center gap-2 mt-2">
              {selectedLead?.sourceChannel && (
                <Badge variant="outline" className="text-xs">
                  {selectedLead.sourceChannel}
                </Badge>
              )}
              <Badge className={cn("text-xs", getScoreColor(selectedLead?.intentScore))}>
                Score: {selectedLead?.intentScore ?? 0}
              </Badge>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact-name">
                Full Name{" "}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="contact-name"
                placeholder="e.g. Sarah Johnson"
                value={contactForm.name}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, name: e.target.value }))
                }
                data-testid="input-contact-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-email">Email Address</Label>
              <Input
                id="contact-email"
                type="email"
                placeholder="e.g. sarah@email.com"
                value={contactForm.email}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, email: e.target.value }))
                }
                data-testid="input-contact-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-phone">
                Phone Number{" "}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Input
                id="contact-phone"
                type="tel"
                placeholder="e.g. (403) 555-0123"
                value={contactForm.phone}
                onChange={(e) =>
                  setContactForm((f) => ({ ...f, phone: e.target.value }))
                }
                data-testid="input-contact-phone"
              />
            </div>

            {!contactForm.email && !contactForm.phone && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                At least one contact method required
              </p>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
            <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">
              What happens next
            </p>
            <div className="space-y-1 text-xs text-blue-600 dark:text-blue-400">
              {contactForm.email && (
                <p className="flex items-center gap-1.5">
                  <Mail className="w-3 h-3" />
                  {agentName} sends personalized email immediately
                </p>
              )}
              {contactForm.phone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3" />
                  SMS follow-up in 24 hours
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                4-touch sequence over 72 hours
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setAddContactOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddContact}
              disabled={
                (!contactForm.email && !contactForm.phone) || isSubmitting
              }
              className="gap-2 bg-blue-600 hover:bg-blue-700"
              data-testid="button-submit-contact"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Activating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Add Contact & Activate {agentName}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
