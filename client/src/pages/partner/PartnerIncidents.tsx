import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, Plus, Search, Loader2, CheckCircle } from "lucide-react";
import { format } from "date-fns";

const SEVERITY_DOT: Record<string, string> = {
  low: "bg-blue-400",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

const STATUS_DOT: Record<string, string> = {
  open: "bg-red-500",
  under_review: "bg-amber-500",
  resolved: "bg-green-500",
  escalated: "bg-purple-500",
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
        <Button size="sm" data-testid="button-report-incident">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Report Incident
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Report an Incident</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Booking</Label>
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
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger data-testid="select-category"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
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
            <Label>Title</Label>
            <Input placeholder="Brief incident title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-incident-title" />
          </div>
          <div className="space-y-1.5">
            <Label>Details</Label>
            <Textarea rows={3} placeholder="Describe what happened…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} data-testid="input-incident-notes" />
          </div>
          <div className="space-y-1.5">
            <Label>Attachments <span className="text-muted-foreground">(optional)</span></Label>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} type="button">
                Attach files
              </Button>
              {files.length > 0 && <span className="text-xs text-muted-foreground">{files.length} selected</span>}
            </div>
            <input ref={fileRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={e => setFiles(Array.from(e.target.files ?? []))} />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => report.mutate()}
              disabled={report.isPending || !form.bookingId || !form.category || !form.title || !form.notes}
              data-testid="button-submit-incident"
            >
              {report.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Submitting…</> : "Submit Report"}
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
      <div className="p-6 space-y-5 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Incidents</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {openCount > 0
                ? <>{openCount} open{criticalCount > 0 ? ` · ${criticalCount} critical` : ""}</>
                : "No open incidents"}
            </p>
          </div>
          <ReportIncidentDialog bookings={bookings} />
        </div>

        {/* Tabs + search */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-0">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                data-testid={`tab-${t.key}`}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? "border-foreground text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {!isLoading && counts[t.key] > 0 && (
                  <span className={`text-xs tabular-nums ${tab === t.key ? "text-foreground" : "text-muted-foreground"}`}>
                    {counts[t.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm w-56" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-incidents" />
          </div>
        </div>

        <Separator />

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2 text-muted-foreground">
            <AlertTriangle className="w-8 h-8" />
            <p className="text-sm">{search ? "No incidents match your search" : `No ${tab === "all" ? "" : tab.replace("_", " ")} incidents`}</p>
          </div>
        ) : (
          <div className="space-y-px">
            {filtered.map((inc: any, idx: number) => (
              <div key={inc.id}>
                <div
                  className="flex items-start justify-between gap-4 py-4 px-2 rounded-md"
                  data-testid={`card-incident-${inc.id}`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex flex-col items-center gap-1.5 mt-1 shrink-0">
                      <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[inc.severity] ?? "bg-gray-400"}`} data-testid={`severity-${inc.id}`} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{inc.title}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[inc.status] ?? "bg-gray-400"}`} />
                          <span className="capitalize" data-testid={`status-${inc.id}`}>{inc.status.replace("_", " ")}</span>
                        </span>
                        <span className="capitalize">{inc.severity}</span>
                        <span className="capitalize">{inc.category?.replace(/_/g, " ")}</span>
                        <span>{format(new Date(inc.createdAt), "MMM d, yyyy")}</span>
                      </div>
                      {inc.notes && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{inc.notes}</p>
                      )}
                      {inc.resolutionNotes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="font-medium">Resolution:</span> {inc.resolutionNotes}
                        </p>
                      )}
                    </div>
                  </div>
                  {inc.status !== "resolved" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs shrink-0"
                      onClick={() => resolve.mutate({ id: inc.id, notes: "Resolved by partner" })}
                      disabled={resolve.isPending}
                      data-testid={`button-resolve-${inc.id}`}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />
                      Resolve
                    </Button>
                  )}
                </div>
                {idx < filtered.length - 1 && <Separator className="opacity-40" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </PartnerLayout>
  );
}
