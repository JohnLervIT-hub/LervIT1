import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, Plus, Search, Loader2, CheckCircle, Clock, ShieldAlert, Flame } from "lucide-react";
import { format } from "date-fns";

const SEVERITY_CONFIG: Record<string, { color: string; dot: string; label: string }> = {
  low:      { color: "bg-blue-500/10 text-blue-600 border-blue-500/20",     dot: "bg-blue-400",   label: "Low" },
  medium:   { color: "bg-amber-500/10 text-amber-600 border-amber-500/20",  dot: "bg-amber-400",  label: "Medium" },
  high:     { color: "bg-orange-500/10 text-orange-600 border-orange-500/20", dot: "bg-orange-500", label: "High" },
  critical: { color: "bg-red-500/10 text-red-600 border-red-500/20",        dot: "bg-red-500",    label: "Critical" },
};

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: React.ElementType }> = {
  open:         { color: "bg-red-500/10 text-red-600 border-red-500/20",       label: "Open",         icon: Flame },
  under_review: { color: "bg-amber-500/10 text-amber-600 border-amber-500/20", label: "Under Review",  icon: Clock },
  resolved:     { color: "bg-green-500/10 text-green-600 border-green-500/20", label: "Resolved",      icon: CheckCircle },
  escalated:    { color: "bg-purple-500/10 text-purple-600 border-purple-500/20", label: "Escalated",  icon: ShieldAlert },
};

const CATEGORIES = [
  { value: "delay", label: "Delay" },
  { value: "damage", label: "Damage" },
  { value: "access_issue", label: "Access Issue" },
  { value: "customer_complaint", label: "Customer Complaint" },
  { value: "vehicle_issue", label: "Vehicle Issue" },
  { value: "weather", label: "Weather" },
  { value: "other", label: "Other" },
];

const TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "under_review", label: "Under Review" },
  { key: "resolved", label: "Resolved" },
  { key: "escalated", label: "Escalated" },
];

function ReportIncidentDialog({ bookings }: { bookings: any[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bookingId: "", category: "", severity: "medium", title: "", notes: "" });
  const [files, setFiles] = useState<File[]>([]);

  const report = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("category", form.category);
      fd.append("severity", form.severity);
      fd.append("title", form.title);
      fd.append("notes", form.notes);
      files.forEach(f => fd.append("files", f));
      const res = await fetch(`/api/partner/bookings/${form.bookingId}/incidents`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Incident reported" });
      setOpen(false);
      setForm({ bookingId: "", category: "", severity: "medium", title: "", notes: "" });
      setFiles([]);
      qc.invalidateQueries({ queryKey: ["/api/partner/incidents"] });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const activeBookings = bookings.filter((b: any) => !["completed", "cancelled", "rejected"].includes(b.enterpriseStatus ?? ""));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-report-incident">
          <Plus className="w-4 h-4 mr-2" /> Report Incident
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report an Incident</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Booking *</Label>
            <Select value={form.bookingId} onValueChange={v => setForm(f => ({ ...f, bookingId: v }))}>
              <SelectTrigger data-testid="select-incident-booking">
                <SelectValue placeholder={activeBookings.length === 0 ? "No active bookings" : "Select booking…"} />
              </SelectTrigger>
              <SelectContent>
                {activeBookings.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    #{b.id.slice(-8).toUpperCase()} — {b.pickupAddress?.slice(0, 30)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger data-testid="select-category"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severity *</Label>
              <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                <SelectTrigger data-testid="select-severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input placeholder="Brief incident title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-incident-title" />
          </div>
          <div className="space-y-1.5">
            <Label>Details *</Label>
            <Textarea rows={3} placeholder="Describe what happened…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} data-testid="input-incident-notes" />
          </div>
          <div className="space-y-1.5">
            <Label>Attachments (optional)</Label>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} type="button">
                Attach Photos/Docs
              </Button>
              {files.length > 0 && <span className="text-xs text-muted-foreground">{files.length} file(s) selected</span>}
            </div>
            <input ref={fileRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={e => setFiles(Array.from(e.target.files ?? []))} />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => report.mutate()}
              disabled={report.isPending || !form.bookingId || !form.category || !form.title || !form.notes}
              data-testid="button-submit-incident"
            >
              {report.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</> : "Submit Report"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PartnerIncidents() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: incidents = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/partner/incidents"] });
  const { data: bookings = [] } = useQuery<any[]>({ queryKey: ["/api/partner/bookings"] });

  const resolve = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      apiRequest("PUT", `/api/partner/incidents/${id}`, { status: "resolved", resolutionNotes: notes }),
    onSuccess: () => { toast({ title: "Incident resolved" }); qc.invalidateQueries({ queryKey: ["/api/partner/incidents"] }); },
    onError: () => toast({ title: "Failed to resolve", variant: "destructive" }),
  });

  const counts = {
    all: incidents.length,
    open: incidents.filter((i: any) => i.status === "open").length,
    under_review: incidents.filter((i: any) => i.status === "under_review").length,
    resolved: incidents.filter((i: any) => i.status === "resolved").length,
    escalated: incidents.filter((i: any) => i.status === "escalated").length,
  } as Record<string, number>;

  const filtered = incidents.filter((inc: any) => {
    const matchesTab = tab === "all" || inc.status === tab;
    const q = search.toLowerCase();
    return matchesTab && (!q || inc.title?.toLowerCase().includes(q) || inc.notes?.toLowerCase().includes(q));
  });

  const openCount = counts.open + counts.under_review;
  const criticalCount = incidents.filter((i: any) => i.severity === "critical" && i.status !== "resolved").length;

  return (
    <PartnerLayout>
      <div className="px-6 py-6">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Page header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold">Incidents</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {openCount > 0 ? (
                <><span className="text-red-600 dark:text-red-400 font-semibold">{openCount} open</span>
                {criticalCount > 0 && <> · <span className="text-red-600 dark:text-red-400 font-semibold">{criticalCount} critical</span></>}</>
              ) : "No open incidents"}
            </p>
          </div>
          <ReportIncidentDialog bookings={bookings} />
        </div>

        {/* Summary pills */}
        {!isLoading && incidents.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Open",         count: counts.open,         color: "bg-red-500/10 text-red-600 border border-red-500/20" },
              { label: "Under Review", count: counts.under_review, color: "bg-amber-500/10 text-amber-600 border border-amber-500/20" },
              { label: "Resolved",     count: counts.resolved,     color: "bg-green-500/10 text-green-600 border border-green-500/20" },
              { label: "Escalated",    count: counts.escalated,    color: "bg-purple-500/10 text-purple-600 border border-purple-500/20" },
            ].map(s => s.count > 0 && (
              <span key={s.label} className={`text-xs px-2.5 py-1 rounded-full font-medium ${s.color}`}>
                {s.count} {s.label}
              </span>
            ))}
          </div>
        )}

        {/* Tab bar + search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                data-testid={`tab-${t.key}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {!isLoading && counts[t.key] > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20"
                  }`}>{counts[t.key]}</span>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search incidents…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-incidents" />
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-md bg-muted animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-14 gap-3">
              <AlertTriangle className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search ? "No incidents match your search" : `No ${tab === "all" ? "" : tab.replace("_", " ")} incidents`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((inc: any) => {
              const sev = SEVERITY_CONFIG[inc.severity] ?? SEVERITY_CONFIG.medium;
              const sta = STATUS_CONFIG[inc.status] ?? { color: "", label: inc.status, icon: Clock };
              const StatusIcon = sta.icon;
              return (
                <Card key={inc.id} data-testid={`card-incident-${inc.id}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`w-1 self-stretch rounded-full shrink-0 ${sev.dot}`} />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`text-xs ${sev.color}`} data-testid={`severity-${inc.id}`}>
                              {sev.label}
                            </Badge>
                            <Badge className={`text-xs ${sta.color}`} data-testid={`status-${inc.id}`}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {sta.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground capitalize">
                              {inc.category.replace(/_/g, " ")}
                            </span>
                          </div>
                          <p className="font-semibold text-sm">{inc.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{inc.notes}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(inc.createdAt), "PPp")}</p>
                          {inc.resolutionNotes && (
                            <p className="text-xs text-green-700 dark:text-green-400 font-medium mt-1">
                              Resolution: {inc.resolutionNotes}
                            </p>
                          )}
                        </div>
                      </div>
                      {inc.status !== "resolved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resolve.mutate({ id: inc.id, notes: "Resolved by partner" })}
                          disabled={resolve.isPending}
                          data-testid={`button-resolve-${inc.id}`}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </PartnerLayout>
  );
}
