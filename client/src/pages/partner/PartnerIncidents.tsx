import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertTriangle,
  Plus,
  Search,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { format } from "date-fns";

const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_COLOR: Record<string, string> = {
  open: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  escalated: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
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

function ReportIncidentDialog({ bookings }: { bookings: any[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    bookingId: "",
    category: "",
    severity: "medium",
    title: "",
    notes: "",
  });
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
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed");
      }
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-report-incident">
          <Plus className="w-4 h-4 mr-2" />
          Report Incident
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
              <SelectTrigger data-testid="select-incident-booking"><SelectValue placeholder="Select booking…" /></SelectTrigger>
              <SelectContent>
                {bookings.filter((b: any) => !["completed", "cancelled", "rejected"].includes(b.enterpriseStatus ?? "")).map((b: any) => (
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
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} type="button">
                Attach Photos/Docs
              </Button>
              {files.length > 0 && <span className="text-xs text-muted-foreground self-center">{files.length} file(s)</span>}
            </div>
            <input ref={fileRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={e => setFiles(Array.from(e.target.files ?? []))} />
          </div>
          <div className="flex gap-2 justify-end">
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
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: incidents = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/partner/incidents"],
  });

  const { data: bookings = [] } = useQuery<any[]>({
    queryKey: ["/api/partner/bookings"],
  });

  const resolve = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      apiRequest("PUT", `/api/partner/incidents/${id}`, { status: "resolved", resolutionNotes: notes }),
    onSuccess: () => {
      toast({ title: "Incident resolved" });
      qc.invalidateQueries({ queryKey: ["/api/partner/incidents"] });
    },
    onError: () => toast({ title: "Failed to resolve", variant: "destructive" }),
  });

  const filtered = incidents.filter((inc: any) => {
    const matchesStatus = statusFilter === "all" || inc.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || inc.title?.toLowerCase().includes(q) || inc.notes?.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const openCount = incidents.filter((i: any) => ["open", "under_review"].includes(i.status)).length;

  return (
    <PartnerLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Incidents</h1>
            {openCount > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                <span className="text-red-600 font-medium">{openCount} open</span> incident{openCount !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <ReportIncidentDialog bookings={bookings} />
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search incidents…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-incidents"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44" data-testid="select-status-filter">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Incidents list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-md bg-muted animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-14 gap-3">
              <AlertTriangle className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search || statusFilter !== "all" ? "No incidents match your filters" : "No incidents reported"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((inc: any) => (
              <Card key={inc.id} data-testid={`card-incident-${inc.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-xs ${SEVERITY_COLOR[inc.severity] ?? ""}`} data-testid={`severity-${inc.id}`}>
                          {inc.severity}
                        </Badge>
                        <Badge className={`text-xs ${STATUS_COLOR[inc.status] ?? ""}`} data-testid={`status-${inc.id}`}>
                          {inc.status.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground capitalize">{inc.category.replace("_", " ")}</span>
                      </div>
                      <p className="font-medium text-sm">{inc.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{inc.notes}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(inc.createdAt), "PPp")}</p>
                    </div>
                    {inc.status !== "resolved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolve.mutate({ id: inc.id, notes: "Resolved by partner" })}
                        disabled={resolve.isPending}
                        data-testid={`button-resolve-${inc.id}`}
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                        Resolve
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PartnerLayout>
  );
}
