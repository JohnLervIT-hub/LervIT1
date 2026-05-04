import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Building2, Users, Truck, DollarSign, CheckCircle2,
  XCircle, Clock, Search, ChevronRight, Shield, CreditCard,
  Phone, Mail, MapPin, Loader2, AlertTriangle, FileText,
  Package, Calendar, Activity, Ban, BadgeCheck, Plus, MessageSquare, Send,
  Upload, Trash2, CheckCheck, ShieldCheck, ExternalLink, ChevronDown, ChevronUp,
  Car, StickyNote
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, isValid, isToday, isYesterday } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return isValid(dt) ? format(dt, "MMM d, yyyy") : "—";
}

function money(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? "0"));
  return isNaN(n) ? "$0.00" : `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-500/10 text-green-600 border-green-500/20",
    pending_approval: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    onboarding: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    invited: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    suspended: "bg-red-500/10 text-red-600 border-red-500/20",
  };
  const label: Record<string, string> = {
    active: "Active", pending_approval: "Pending Approval",
    onboarding: "Onboarding", invited: "Invited", suspended: "Suspended",
  };
  return (
    <Badge variant="outline" className={`text-xs capitalize ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {label[status] ?? status}
    </Badge>
  );
}

function OnboardingProgress({ p }: { p: any }) {
  const steps = [
    { key: "profileComplete", label: "Profile" },
    { key: "coverageComplete", label: "Coverage" },
    { key: "complianceComplete", label: "Compliance" },
    { key: "dispatchComplete", label: "Dispatch" },
    { key: "termsAccepted", label: "Terms" },
  ];
  const done = steps.filter(s => p[s.key]).length;
  return (
    <div className="flex items-center gap-1.5">
      {steps.map(s => (
        <div
          key={s.key}
          className={`h-1.5 rounded-full flex-1 ${p[s.key] ? "bg-green-500" : "bg-muted"}`}
          title={`${s.label}: ${p[s.key] ? "✓" : "pending"}`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{done}/{steps.length}</span>
    </div>
  );
}

function BookingStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-green-500/10 text-green-600 border-green-500/20",
    in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    accepted: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
    confirmed: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
    pending: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  };
  return (
    <Badge variant="outline" className={`text-xs ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

// ─── TEAM MEMBER LIST WITH EXPANDABLE ROWS ─────────────────────────────────
function TeamMemberList({ team }: { team: any[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {team.map((m: any) => {
        const isExpanded = expandedId === m.id;
        const isDriver = m.memberType === "driver";
        return (
          <Card key={m.id} data-testid={`card-team-${m.id}`} className="overflow-hidden">
            <CardContent className="pt-3 pb-3">
              {/* Clickable summary row */}
              <button
                className="w-full text-left"
                data-testid={`button-expand-team-${m.id}`}
                onClick={() => setExpandedId(isExpanded ? null : m.id)}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10 border border-border shrink-0">
                    <AvatarImage src={m.driverPhoto ?? undefined} alt={m.name} />
                    <AvatarFallback className="bg-muted text-xs font-semibold">
                      {m.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{m.name}</p>
                      <Badge variant="outline" className="text-xs capitalize">{m.memberType}</Badge>
                      <Badge variant="outline" className={`text-xs ${m.isAvailable ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-muted text-muted-foreground"}`}>
                        {m.isAvailable ? "Available" : "Unavailable"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-0.5">
                      {m.phone && <span>{m.phone}</span>}
                      {m.vehicleType && (
                        <span className="flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          {m.vehicleType}{m.vehiclePlate && ` · ${m.vehiclePlate}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-muted-foreground">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </button>

              {/* Expanded detail panel */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-border space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Left: details */}
                    <div className="space-y-2">
                      {m.vehicleColor && (
                        <div className="flex items-start gap-2">
                          <Car className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Vehicle Color</p>
                            <p className="text-sm font-medium capitalize">{m.vehicleColor}</p>
                          </div>
                        </div>
                      )}
                      {m.phone && (
                        <div className="flex items-start gap-2">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Phone</p>
                            <p className="text-sm font-medium">{m.phone}</p>
                          </div>
                        </div>
                      )}
                      {m.notes && (
                        <div className="flex items-start gap-2">
                          <StickyNote className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Notes</p>
                            <p className="text-sm">{m.notes}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Added</p>
                          <p className="text-sm font-medium">{fmt(m.createdAt)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Right: vehicle photo (drivers only) */}
                    {isDriver && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          Vehicle Photo
                        </p>
                        {m.vehiclePhoto ? (
                          <a href={m.vehiclePhoto} target="_blank" rel="noopener noreferrer" data-testid={`link-vehicle-photo-${m.id}`}>
                            <img
                              src={m.vehiclePhoto}
                              alt="Vehicle"
                              className="w-full max-w-[200px] rounded-md border border-border object-cover aspect-video hover-elevate"
                            />
                          </a>
                        ) : (
                          <div className="w-full max-w-[200px] aspect-video rounded-md border border-dashed border-border flex items-center justify-center bg-muted/30">
                            <p className="text-xs text-muted-foreground text-center px-2">No vehicle photo uploaded</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── PARTNER DETAIL VIEW ───────────────────────────────────────────────────
function PartnerDetail({ partnerId }: { partnerId: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [msgDraft, setMsgDraft] = useState("");
  const msgEndRef = useRef<HTMLDivElement>(null);
  const compFileRef = useRef<HTMLInputElement>(null);
  const [compDocType, setCompDocType] = useState("");
  const [compExpiry, setCompExpiry] = useState("");
  const [compFile, setCompFile] = useState<File | null>(null);
  const [compFileName, setCompFileName] = useState("");
  const [reviewingDoc, setReviewingDoc] = useState<string | null>(null);
  const [docRejectOpen, setDocRejectOpen] = useState(false);
  const [docRejectId, setDocRejectId] = useState<string | null>(null);
  const [docRejectNotes, setDocRejectNotes] = useState("");

  const { data: _rawMsgs, isLoading: msgsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/partners", partnerId, "messages"],
    queryFn: () => fetch(`/api/admin/partners/${partnerId}/messages`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 10000,
  });
  const directMsgs: any[] = Array.isArray(_rawMsgs) ? _rawMsgs : [];

  const sendMsg = useMutation({
    mutationFn: (text: string) => apiRequest("POST", `/api/admin/partners/${partnerId}/messages`, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", partnerId, "messages"] });
      setMsgDraft("");
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const markAdminMsgsRead = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/partners/${partnerId}/messages/mark-read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", partnerId, "messages"] }),
  });

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [directMsgs]);

  function fmtMsgTime(d: string) {
    const dt = new Date(d);
    if (isToday(dt)) return format(dt, "h:mm a");
    if (isYesterday(dt)) return `Yesterday ${format(dt, "h:mm a")}`;
    return format(dt, "MMM d, h:mm a");
  }

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/admin/partners", partnerId],
    queryFn: () => fetch(`/api/admin/partners/${partnerId}`, { credentials: "include" }).then(r => r.json()),
    onSuccess: (d: any) => { if (d?.partner?.adminNotes) setAdminNotes(d.partner.adminNotes); },
  } as any);

  const activate = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/admin/partners/${partnerId}/activate`, {}),
    onSuccess: () => { toast({ title: "Partner activated" }); queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", partnerId] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] }); },
    onError: () => toast({ title: "Failed to activate", variant: "destructive" }),
  });

  const suspend = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/admin/partners/${partnerId}/suspend`, { reason: suspendReason }),
    onSuccess: () => { toast({ title: "Partner suspended" }); setSuspendOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", partnerId] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] }); },
    onError: () => toast({ title: "Failed to suspend", variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/admin/partners/${partnerId}/reject`, { reason: rejectReason }),
    onSuccess: () => { toast({ title: "Application rejected", description: "Partner has been notified and returned to onboarding." }); setRejectOpen(false); setRejectReason(""); queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", partnerId] }); queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] }); },
    onError: () => toast({ title: "Failed to reject application", variant: "destructive" }),
  });

  const saveNotes = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/admin/partners/${partnerId}`, { adminNotes }),
    onSuccess: () => { toast({ title: "Notes saved" }); setEditingNotes(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", partnerId] }); },
    onError: () => toast({ title: "Failed to save notes", variant: "destructive" }),
  });

  const uploadCompDoc = useMutation({
    mutationFn: async () => {
      if (!compDocType) throw new Error("Select a document type");
      const fd = new FormData();
      fd.append("docType", compDocType);
      fd.append("reviewStatus", "approved");
      if (compExpiry) fd.append("expiryDate", compExpiry);
      if (compFile) {
        fd.append("file", compFile);
      } else if (compFileName.trim()) {
        fd.append("fileName", compFileName.trim());
      } else {
        throw new Error("Provide a file or document name");
      }
      const res = await fetch(`/api/admin/partners/${partnerId}/compliance/upload`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document added" });
      setCompDocType(""); setCompExpiry(""); setCompFile(null); setCompFileName("");
      if (compFileRef.current) compFileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", partnerId] });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Upload failed", variant: "destructive" }),
  });

  const reviewCompDoc = useMutation({
    mutationFn: ({ docId, reviewStatus, reviewNotes }: { docId: string; reviewStatus: string; reviewNotes?: string }) =>
      apiRequest("PUT", `/api/admin/compliance/${docId}/review`, { reviewStatus, reviewNotes }),
    onSuccess: () => {
      toast({ title: "Document updated" });
      setReviewingDoc(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", partnerId] });
    },
    onError: () => toast({ title: "Failed to update document", variant: "destructive" }),
  });

  const deleteCompDoc = useMutation({
    mutationFn: (docId: string) => fetch(`/api/admin/partners/${partnerId}/compliance/${docId}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => { toast({ title: "Document removed" }); queryClient.invalidateQueries({ queryKey: ["/api/admin/partners", partnerId] }); },
    onError: () => toast({ title: "Failed to remove document", variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
  if (!data?.partner) return <div className="text-center py-16 text-muted-foreground">Partner not found.</div>;

  const { partner, users, docs, team, recentBookings, earnings, invites, zones = [] } = data;

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

      {/* Back + Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/partners")} data-testid="button-back-partners">
          <ArrowLeft className="w-4 h-4 mr-1" /> Partners
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <h1 className="text-xl font-bold">{partner.name}</h1>
            <StatusBadge status={partner.status} />
            {partner.stripeConnectStatus === "active" && (
              <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                <CreditCard className="w-3 h-3 mr-1" /> Stripe Active
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{partner.legalName}</p>
        </div>
        <div className="flex items-center gap-2">
          {partner.status !== "active" && partner.status !== "suspended" && (
            <Button size="sm" onClick={() => activate.mutate()} disabled={activate.isPending} data-testid="button-activate-partner">
              {activate.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <BadgeCheck className="w-4 h-4 mr-1" />}
              Activate
            </Button>
          )}
          {partner.status === "pending_approval" && (
            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="destructive" data-testid="button-reject-partner">
                  <XCircle className="w-4 h-4 mr-1" /> Reject
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Reject Partner Application</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">The partner will be returned to onboarding status and notified by email with your reason. They can update their application and resubmit.</p>
                  <Label>Reason for rejection <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Required — explain what needs to be corrected before resubmitting"
                    data-testid="input-reject-reason"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => { setRejectOpen(false); setRejectReason(""); }}>Cancel</Button>
                    <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending || !rejectReason.trim()} data-testid="button-confirm-reject">
                      {reject.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Rejection"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {partner.status === "active" && (
            <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="destructive" data-testid="button-suspend-partner">
                  <Ban className="w-4 h-4 mr-1" /> Suspend
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Suspend Partner</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Label>Reason for suspension</Label>
                  <Textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Required — explain why this partner is being suspended" data-testid="input-suspend-reason" />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setSuspendOpen(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => suspend.mutate()} disabled={suspend.isPending || !suspendReason.trim()}>
                      {suspend.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Suspend"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {partner.status === "suspended" && (
            <Button size="sm" onClick={() => activate.mutate()} disabled={activate.isPending}>
              <BadgeCheck className="w-4 h-4 mr-1" /> Reinstate
            </Button>
          )}
        </div>
      </div>

      {/* Earnings KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Earned", value: money(earnings?.totalEarned), icon: DollarSign, color: "text-emerald-600" },
          { label: "Platform Fee (15%)", value: money(earnings?.platformFee), icon: Activity, color: "text-amber-600" },
          { label: "Partner Net", value: money(earnings?.partnerNet), icon: CreditCard, color: "text-blue-600" },
          { label: "Completed Jobs", value: String(earnings?.completedJobs ?? 0), icon: CheckCircle2, color: "text-green-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
              <p className="text-lg font-bold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bookings" data-testid="tab-bookings">Bookings ({recentBookings?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team">Team ({team?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance ({docs?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Users ({users?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="messages" data-testid="tab-messages" onClick={() => markAdminMsgsRead.mutate()}>
            <span className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Messages
              {directMsgs.filter((m: any) => m.senderRole === "partner" && !m.readAt).length > 0 && (
                <Badge className="text-[10px] h-4 min-w-[16px] px-1">
                  {directMsgs.filter((m: any) => m.senderRole === "partner" && !m.readAt).length}
                </Badge>
              )}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4 pt-3">
          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Company Info</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  { label: "Legal Name", value: partner.legalName },
                  { label: "Operating Name", value: partner.operatingName },
                  { label: "Phone", value: partner.phone },
                  { label: "Billing Email", value: partner.billingEmail },
                  { label: "Address", value: partner.address },
                  { label: "Service Description", value: partner.serviceDescription },
                  { label: "Joined", value: fmt(partner.createdAt) },
                  { label: "Activated", value: partner.activatedAt ? fmt(partner.activatedAt) : "—" },
                ].map(({ label, value }) => value ? (
                  <div key={label} className="flex gap-2">
                    <span className="text-muted-foreground w-36 shrink-0">{label}</span>
                    <span className="font-medium break-all">{value}</span>
                  </div>
                ) : null)}

                {/* Onboarding progress */}
                <Separator className="my-2" />
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Onboarding Progress</p>
                  <OnboardingProgress p={partner} />
                </div>

                {partner.suspendedReason && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex gap-2 p-2 rounded-md bg-red-500/5 border border-red-500/20">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-red-600">Suspension Reason</p>
                        <p className="text-xs text-muted-foreground">{partner.suspendedReason}</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dispatch Config</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {[
                    { label: "Method", value: partner.dispatchMethod },
                    { label: "Dispatch Phone", value: partner.dispatchPhone },
                    { label: "Dispatch Email", value: partner.dispatchEmail },
                    { label: "Primary Ops", value: partner.primaryOpsContact },
                    { label: "Ops Email", value: partner.primaryOpsEmail },
                    { label: "Ops Phone", value: partner.primaryOpsPhone },
                    { label: "Escalation", value: partner.escalationContact },
                  ].map(({ label, value }) => value ? (
                    <div key={label} className="flex gap-2">
                      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
                      <span className="font-medium break-all">{value}</span>
                    </div>
                  ) : null)}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Stripe Payouts</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Connect Status</span>
                    <Badge variant="outline" className={`text-xs ${partner.stripeConnectStatus === "active" ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-muted text-muted-foreground"}`}>
                      {partner.stripeConnectStatus ?? "not connected"}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Payouts</span>
                    <span>{partner.stripePayoutsEnabled ? "✓ Enabled" : "✗ Disabled"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Details</span>
                    <span>{partner.stripeDetailsSubmitted ? "✓ Submitted" : "Incomplete"}</span>
                  </div>
                </CardContent>
              </Card>

              {zones.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Coverage Zones</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {zones.map((z: any) => (
                      <div key={z.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{z.zoneName}</span>
                          {!z.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                        </div>
                        <div className="flex gap-2">
                          <span className="text-muted-foreground w-32 shrink-0">Location</span>
                          <span>{z.city}{z.province ? `, ${z.province}` : ""}</span>
                        </div>
                        {z.serviceRadiusKm && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground w-32 shrink-0">Radius</span>
                            <span>{z.serviceRadiusKm} km</span>
                          </div>
                        )}
                        {(z.operatingHoursStart || z.operatingHoursEnd) && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground w-32 shrink-0">Hours</span>
                            <span>{z.operatingHoursStart ?? "—"} – {z.operatingHoursEnd ?? "—"}</span>
                          </div>
                        )}
                        {z.postalCodePrefixes?.length > 0 && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground w-32 shrink-0">Postal Prefixes</span>
                            <span>{z.postalCodePrefixes.join(", ")}</span>
                          </div>
                        )}
                        {z.sameDayAvailable && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground w-32 shrink-0">Same-Day</span>
                            <span className="text-green-600 font-medium">Available</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Admin Notes */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Admin Notes</CardTitle>
              {!editingNotes
                ? <Button size="sm" variant="ghost" onClick={() => setEditingNotes(true)}>Edit</Button>
                : <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>Cancel</Button>
                    <Button size="sm" onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending}>
                      {saveNotes.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                    </Button>
                  </div>
              }
            </CardHeader>
            <CardContent>
              {editingNotes
                ? <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={4} placeholder="Internal notes visible only to LervIT admin..." data-testid="textarea-admin-notes" />
                : <p className="text-sm text-muted-foreground whitespace-pre-wrap">{partner.adminNotes || "No notes yet."}</p>
              }
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOOKINGS */}
        <TabsContent value="bookings" className="pt-3">
          {!recentBookings?.length
            ? <div className="text-center py-12 text-sm text-muted-foreground">No bookings routed to this partner yet.</div>
            : (
              <div className="space-y-3">
                {recentBookings.map((b: any) => (
                  <Card key={b.id} data-testid={`card-booking-${b.id}`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <BookingStatusBadge status={b.status} />
                          {b.enterpriseStatus && b.enterpriseStatus !== b.status && (
                            <Badge variant="outline" className="text-xs bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                              {b.enterpriseStatus.replace(/_/g, " ")}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">{fmt(b.createdAt)}</span>
                        </div>
                        <span className="font-bold text-sm">{money(b.price)}</span>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm mb-2">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{b.pickupAddress}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5 shrink-0 text-primary" />
                          <span className="truncate">{b.dropoffAddress}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mb-2">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" /> {b.loadSize ?? "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {fmt(b.preferredDate)}
                        </span>
                        {b.description && (
                          <span className="flex items-center gap-1 italic">"{b.description}"</span>
                        )}
                      </div>

                      {/* Assignment */}
                      {b.assignment && (
                        <div className="flex items-center gap-2 mt-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/15 text-xs">
                          <Truck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="font-medium text-blue-700 dark:text-blue-300">
                            {b.assignment.driverName ?? "Driver assigned"}
                          </span>
                          {b.assignment.vehicleType && <span className="text-muted-foreground">· {b.assignment.vehicleType}</span>}
                          {b.assignment.vehiclePlate && <span className="text-muted-foreground">· {b.assignment.vehiclePlate}</span>}
                          {b.assignment.driverPhone && <span className="text-muted-foreground">· {b.assignment.driverPhone}</span>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          }
        </TabsContent>

        {/* TEAM */}
        <TabsContent value="team" className="pt-3">
          {!team?.length
            ? <div className="text-center py-12 text-sm text-muted-foreground">No team members added yet.</div>
            : <TeamMemberList team={team} />
          }
        </TabsContent>

        {/* COMPLIANCE */}
        <TabsContent value="compliance" className="pt-3 space-y-4">

          {/* Required doc checklist */}
          {(() => {
            const REQUIRED = ["insurance_certificate", "cargo_liability", "business_registration"];
            const LABELS: Record<string, string> = {
              insurance_certificate: "Insurance Certificate",
              cargo_liability: "Cargo Liability Insurance",
              business_registration: "Business Registration",
            };
            const uploadedTypes = (docs ?? []).map((d: any) => d.docType);
            const allDone = REQUIRED.every(t => uploadedTypes.includes(t));
            return (
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-500" />
                    Required Documents
                    {allDone
                      ? <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">All Submitted</Badge>
                      : <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Incomplete</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="space-y-1.5">
                    {REQUIRED.map(type => {
                      const doc = (docs ?? []).find((d: any) => d.docType === type);
                      return (
                        <div key={type} className="flex items-center gap-3 py-1.5">
                          {doc
                            ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                            : <Clock className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <span className={`text-sm flex-1 ${doc ? "text-foreground" : "text-muted-foreground"}`}>
                            {LABELS[type]}
                          </span>
                          {doc && (
                            <Badge variant="outline" className={`text-xs ${
                              doc.reviewStatus === "approved" ? "bg-green-500/10 text-green-600 border-green-500/20" :
                              doc.reviewStatus === "rejected" ? "bg-red-500/10 text-red-600 border-red-500/20" :
                              "bg-amber-500/10 text-amber-600 border-amber-500/20"
                            }`}>
                              {doc.reviewStatus}
                            </Badge>
                          )}
                          {!doc && <Badge variant="outline" className="text-xs text-muted-foreground">Missing</Badge>}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Add document form */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="w-4 h-4" /> Add Document
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Document Type *</Label>
                  <Select value={compDocType} onValueChange={setCompDocType}>
                    <SelectTrigger data-testid="select-comp-doc-type" className="text-sm">
                      <SelectValue placeholder="Select type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        { value: "insurance_certificate", label: "Insurance Certificate" },
                        { value: "cargo_liability", label: "Cargo Liability" },
                        { value: "business_registration", label: "Business Registration" },
                        { value: "compliance_attestation", label: "Compliance Attestation" },
                        { value: "vehicle_registration", label: "Vehicle Registration" },
                        { value: "drivers_abstract", label: "Driver's Abstract" },
                      ].map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Document Name / File</Label>
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="e.g. Insurance_2025.pdf"
                      value={compFile ? compFile.name : compFileName}
                      onChange={e => { setCompFileName(e.target.value); setCompFile(null); }}
                      className="text-sm"
                      data-testid="input-comp-filename"
                      readOnly={!!compFile}
                    />
                    <Button
                      size="icon" variant="outline"
                      onClick={() => compFileRef.current?.click()}
                      data-testid="button-comp-pick-file"
                      title="Attach file"
                    >
                      <Upload className="w-4 h-4" />
                    </Button>
                    <input ref={compFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" className="hidden"
                      onChange={e => { setCompFile(e.target.files?.[0] ?? null); setCompFileName(""); }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Expiry Date <span className="text-muted-foreground">(optional)</span></Label>
                  <Input type="date" value={compExpiry} onChange={e => setCompExpiry(e.target.value)} className="text-sm" data-testid="input-comp-expiry" />
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => uploadCompDoc.mutate()}
                disabled={uploadCompDoc.isPending || !compDocType || (!compFile && !compFileName.trim())}
                data-testid="button-add-comp-doc"
              >
                {uploadCompDoc.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Adding…</>
                  : <><Plus className="w-3.5 h-3.5 mr-1.5" />Add Document</>}
              </Button>
            </CardContent>
          </Card>

          {/* Documents list */}
          {!docs?.length ? (
            <div className="text-center py-10 text-sm text-muted-foreground">No compliance documents yet. Add one above.</div>
          ) : (
            <div className="space-y-2">
              {docs.map((d: any) => {
                const statusCfg = {
                  approved: { cls: "bg-green-500/10 text-green-600 border-green-500/20", label: "Approved" },
                  rejected: { cls: "bg-red-500/10 text-red-600 border-red-500/20", label: "Rejected" },
                  under_review: { cls: "bg-blue-500/10 text-blue-600 border-blue-500/20", label: "Under Review" },
                  pending: { cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", label: "Pending" },
                }[d.reviewStatus as string] ?? { cls: "bg-muted text-muted-foreground", label: d.reviewStatus };
                const isExpiring = d.expiryDate && new Date(d.expiryDate) < new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
                return (
                  <Card key={d.id} data-testid={`row-doc-${d.id}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-md shrink-0 ${
                          d.reviewStatus === "approved" ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
                        }`}>
                          {d.reviewStatus === "approved"
                            ? <CheckCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                            : <FileText className="w-4 h-4 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium capitalize">{d.docType.replace(/_/g, " ")}</span>
                            <Badge variant="outline" className={`text-xs ${statusCfg.cls}`}>{statusCfg.label}</Badge>
                            {isExpiring && (
                              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/20">
                                <AlertTriangle className="w-3 h-3 mr-1" /> Expiring Soon
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {d.fileName ?? "—"}
                            {d.expiryDate ? ` · Expires ${fmt(d.expiryDate)}` : ""}
                            {` · Added ${fmt(d.createdAt)}`}
                          </p>
                          {d.reviewNotes && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{d.reviewNotes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {d.fileUrl && (
                            <a href={`/api/admin/compliance/${d.id}/file`} target="_blank" rel="noopener noreferrer">
                              <Button size="icon" variant="ghost" title="View file" data-testid={`button-view-doc-${d.id}`}>
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </a>
                          )}
                          {d.reviewStatus !== "approved" && (
                            <Button
                              size="sm" variant="ghost"
                              className="text-green-600 dark:text-green-400 text-xs"
                              onClick={() => reviewCompDoc.mutate({ docId: d.id, reviewStatus: "approved" })}
                              disabled={reviewCompDoc.isPending && reviewingDoc === d.id}
                              data-testid={`button-approve-doc-${d.id}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Approve
                            </Button>
                          )}
                          {d.reviewStatus !== "rejected" && d.reviewStatus !== "approved" && (
                            <Button
                              size="sm" variant="ghost"
                              className="text-red-600 dark:text-red-400 text-xs"
                              onClick={() => { setDocRejectId(d.id); setDocRejectNotes(""); setDocRejectOpen(true); }}
                              disabled={reviewCompDoc.isPending && reviewingDoc === d.id}
                              data-testid={`button-reject-doc-${d.id}`}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />Reject
                            </Button>
                          )}
                          <Button
                            size="icon" variant="ghost"
                            onClick={() => deleteCompDoc.mutate(d.id)}
                            disabled={deleteCompDoc.isPending}
                            data-testid={`button-delete-doc-${d.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Compliance doc rejection dialog */}
          <Dialog open={docRejectOpen} onOpenChange={open => { setDocRejectOpen(open); if (!open) { setDocRejectId(null); setDocRejectNotes(""); } }}>
            <DialogContent>
              <DialogHeader><DialogTitle>Reject Compliance Document</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">The partner will be notified by email with your reason and asked to re-upload a corrected document.</p>
                <Label>Rejection reason <span className="text-destructive">*</span></Label>
                <Textarea
                  value={docRejectNotes}
                  onChange={e => setDocRejectNotes(e.target.value)}
                  placeholder="Required — explain what is wrong and what must be corrected"
                  data-testid="input-doc-reject-notes"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setDocRejectOpen(false); setDocRejectId(null); setDocRejectNotes(""); }}>Cancel</Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (!docRejectId) return;
                      setReviewingDoc(docRejectId);
                      reviewCompDoc.mutate(
                        { docId: docRejectId, reviewStatus: "rejected", reviewNotes: docRejectNotes },
                        { onSettled: () => { setDocRejectOpen(false); setDocRejectId(null); setDocRejectNotes(""); setReviewingDoc(null); } }
                      );
                    }}
                    disabled={reviewCompDoc.isPending || !docRejectNotes.trim()}
                    data-testid="button-confirm-doc-reject"
                  >
                    {reviewCompDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Rejection"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* MESSAGES */}
        <TabsContent value="messages" className="pt-3">
          <Card>
            <CardContent className="p-0 flex flex-col" style={{ height: "520px" }}>
              {/* thread */}
              <ScrollArea className="flex-1 px-5 py-4">
                {msgsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className={`flex gap-2 ${i % 2 === 0 ? "flex-row-reverse" : ""}`}>
                        <div className="w-6 h-6 rounded-full bg-muted animate-pulse shrink-0" />
                        <div className={`h-8 rounded-2xl bg-muted animate-pulse ${i % 2 === 0 ? "w-40" : "w-56"}`} />
                      </div>
                    ))}
                  </div>
                ) : directMsgs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-16">
                    <MessageSquare className="w-8 h-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No messages yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Send a message to {partner.name} below</p>
                  </div>
                ) : (
                  <>
                    {directMsgs.map((msg: any) => {
                      const isOwn = msg.senderRole === "admin";
                      return (
                        <div key={msg.id} className={`flex items-end gap-2 mb-3 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                          {!isOwn && (
                            <Avatar className="w-7 h-7 shrink-0 mb-0.5">
                              <AvatarFallback className="text-xs bg-green-500/10 text-green-600">
                                {(msg.senderName ?? "P").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div className={`max-w-[70%] space-y-1 ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                            {!isOwn && (
                              <span className="text-xs text-muted-foreground ml-1">{msg.senderName}</span>
                            )}
                            <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${isOwn ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                              {msg.text}
                            </div>
                            <span className={`text-[11px] text-muted-foreground px-1 ${isOwn ? "text-right self-end" : "text-left"}`}>
                              {fmtMsgTime(msg.createdAt)}
                              {!isOwn && msg.readAt && <span className="ml-1 text-muted-foreground/50">· seen</span>}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={msgEndRef} />
                  </>
                )}
              </ScrollArea>

              {/* compose */}
              <div className="px-4 py-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <Input
                    value={msgDraft}
                    onChange={e => setMsgDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (msgDraft.trim() && !sendMsg.isPending) sendMsg.mutate(msgDraft.trim());
                      }
                    }}
                    placeholder={`Message ${partner.name}…`}
                    disabled={sendMsg.isPending}
                    data-testid="input-direct-message"
                  />
                  <Button
                    size="icon"
                    onClick={() => { if (msgDraft.trim() && !sendMsg.isPending) sendMsg.mutate(msgDraft.trim()); }}
                    disabled={!msgDraft.trim() || sendMsg.isPending}
                    data-testid="button-send-direct-message"
                  >
                    {sendMsg.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">Enter to send · messages are visible to all portal admins at {partner.name}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* USERS */}
        <TabsContent value="users" className="pt-3">
          <div className="space-y-2">
            {users?.map((u: any) => (
              <Card key={u.id} data-testid={`card-user-${u.id}`}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-9 h-9 border border-border shrink-0">
                      <AvatarFallback className="bg-muted text-xs">
                        {(u.userName ?? "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{u.userName ?? "—"}</p>
                        <Badge variant="outline" className="text-xs capitalize">{u.partnerRole?.replace("partner_", "")}</Badge>
                        {!u.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{u.userEmail}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{fmt(u.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {invites?.filter((i: any) => !i.acceptedAt).map((i: any) => (
              <Card key={i.id} className="border-dashed opacity-70">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full border border-dashed border-border flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-muted-foreground">{i.email}</p>
                        <Badge variant="outline" className="text-xs text-muted-foreground">Invite pending</Badge>
                        <Badge variant="outline" className="text-xs capitalize">{i.role?.replace("partner_", "")}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Expires {fmt(i.expiresAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {!users?.length && !invites?.length && (
              <div className="text-center py-12 text-sm text-muted-foreground">No users yet.</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── PARTNER LIST VIEW ─────────────────────────────────────────────────────
const EMPTY_INVITE = { name: "", legalName: "", adminName: "", adminEmail: "" };

function PartnerList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);

  const { data: partners = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/partners"],
  });

  const createPartner = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/partners/invite", { ...inviteForm, role: "partner_admin" }),
    onSuccess: (data: any) => {
      toast({ title: "Partner invited", description: `Activation email sent to ${inviteForm.adminEmail}` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
      setInviteOpen(false);
      setInviteForm(EMPTY_INVITE);
      if (data?.partner?.id) setLocation(`/admin/partners/${data.partner.id}`);
    },
    onError: (err: any) => toast({ title: "Failed to invite partner", description: err?.message ?? "Please check the fields and try again.", variant: "destructive" }),
  });

  const filtered = partners.filter((p: any) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.legalName.toLowerCase().includes(search.toLowerCase()) ||
      (p.billingEmail ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const counts = {
    total: partners.length,
    active: partners.filter((p: any) => p.status === "active").length,
    pending: partners.filter((p: any) => p.status === "pending_approval").length,
    suspended: partners.filter((p: any) => p.status === "suspended").length,
  };

  const inviteReady = inviteForm.name.trim() && inviteForm.legalName.trim() && inviteForm.adminName.trim() && inviteForm.adminEmail.trim();

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold">Enterprise Partners</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{counts.total} partner{counts.total !== 1 ? "s" : ""} · {counts.active} active</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-invite-partner">
              <Plus className="w-4 h-4 mr-1.5" /> Invite Partner
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite a New Partner</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</p>
                <div className="space-y-1.5">
                  <Label>Operating Name *</Label>
                  <Input
                    placeholder="OOMovers Inc."
                    data-testid="input-partner-name"
                    value={inviteForm.name}
                    onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Legal Name *</Label>
                  <Input
                    placeholder="OOMovers Holdings Ltd."
                    data-testid="input-partner-legal-name"
                    value={inviteForm.legalName}
                    onChange={e => setInviteForm(f => ({ ...f, legalName: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Portal Admin Contact</p>
                <p className="text-xs text-muted-foreground -mt-1">This person will receive the activation email and set up the partner portal.</p>
                <div className="space-y-1.5">
                  <Label>Full Name *</Label>
                  <Input
                    placeholder="Jane Smith"
                    data-testid="input-admin-name"
                    value={inviteForm.adminName}
                    onChange={e => setInviteForm(f => ({ ...f, adminName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    placeholder="jane@company.com"
                    data-testid="input-admin-email"
                    value={inviteForm.adminEmail}
                    onChange={e => setInviteForm(f => ({ ...f, adminEmail: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => { setInviteOpen(false); setInviteForm(EMPTY_INVITE); }}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createPartner.mutate()}
                  disabled={createPartner.isPending || !inviteReady}
                  data-testid="button-send-partner-invite"
                >
                  {createPartner.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
                    : "Send Invite"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: counts.total, color: "text-foreground" },
          { label: "Active", value: counts.active, color: "text-green-600" },
          { label: "Pending Approval", value: counts.pending, color: "text-amber-600" },
          { label: "Suspended", value: counts.suspended, color: "text-red-600" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search partners…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-partners"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-md bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          {search || statusFilter !== "all" ? "No partners match your filters." : "No partners yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p: any) => (
            <Card
              key={p.id}
              className="cursor-pointer hover-elevate"
              onClick={() => setLocation(`/admin/partners/${p.id}`)}
              data-testid={`card-partner-${p.id}`}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-semibold">{p.name}</p>
                      <StatusBadge status={p.status} />
                      {p.stripeConnectStatus === "active" && (
                        <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <CreditCard className="w-3 h-3 mr-1" /> Stripe
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-1.5">{p.legalName} {p.billingEmail ? `· ${p.billingEmail}` : ""}</p>
                    <OnboardingProgress p={p} />
                  </div>

                  <div className="hidden sm:flex items-center gap-6 shrink-0 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">Team</p>
                      <p className="text-sm font-semibold flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        {p.teamMemberCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Jobs Done</p>
                      <p className="text-sm font-semibold">{p.completedJobCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Earned</p>
                      <p className="text-sm font-semibold text-emerald-600">{money(p.totalEarned)}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ROOT EXPORT ────────────────────────────────────────────────────────────
export default function AdminPartnersPage() {
  const params = useParams<{ id?: string }>();
  return params.id ? <PartnerDetail partnerId={params.id} /> : <PartnerList />;
}
