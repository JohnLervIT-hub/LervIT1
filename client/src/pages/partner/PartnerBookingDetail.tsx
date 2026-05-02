import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, MapPin, Calendar, Package, CheckCircle, XCircle,
  User, Truck, AlertTriangle, Upload, Clock, ChevronRight, ChevronLeft,
  Loader2, DollarSign, Users, Route, Navigation, ZoomIn, Images,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_COLOR: Record<string, string> = {
  new:               "bg-blue-500/10 text-blue-600 border-blue-500/20",
  under_review:      "bg-amber-500/10 text-amber-600 border-amber-500/20",
  accepted:          "bg-green-500/10 text-green-600 border-green-500/20",
  rejected:          "bg-red-500/10 text-red-600 border-red-500/20",
  assigned:          "bg-purple-500/10 text-purple-600 border-purple-500/20",
  en_route_to_pickup:"bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  arrived_at_pickup: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  picked_up:         "bg-teal-500/10 text-teal-600 border-teal-500/20",
  in_transit:        "bg-orange-500/10 text-orange-600 border-orange-500/20",
  arrived_at_dropoff:"bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  delivered:         "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  completed:         "bg-green-500/10 text-green-600 border-green-500/20",
  delayed:           "bg-amber-500/10 text-amber-600 border-amber-500/20",
  issue_reported:    "bg-red-500/10 text-red-600 border-red-500/20",
  cancelled:         "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

const ENTERPRISE_STATUS_TRANSITIONS: Record<string, string[]> = {
  new: ["under_review", "accepted", "rejected", "cancelled"],
  under_review: ["accepted", "rejected", "cancelled"],
  accepted: ["assigned", "en_route_to_pickup", "cancelled"],
  assigned: ["en_route_to_pickup", "delayed", "issue_reported", "cancelled"],
  en_route_to_pickup: ["arrived_at_pickup", "delayed", "issue_reported", "cancelled"],
  arrived_at_pickup: ["picked_up", "delayed", "issue_reported"],
  picked_up: ["in_transit", "issue_reported"],
  in_transit: ["arrived_at_dropoff", "delayed", "issue_reported"],
  arrived_at_dropoff: ["delivered", "issue_reported"],
  delivered: ["completed"],
  delayed: ["en_route_to_pickup", "arrived_at_pickup", "in_transit", "arrived_at_dropoff", "issue_reported", "cancelled"],
  issue_reported: ["en_route_to_pickup", "arrived_at_pickup", "in_transit", "completed", "cancelled"],
};

const LOAD_SIZE_LABEL: Record<string, string> = {
  boxes: "Boxes / Small", medium: "Medium", large: "Large", apartment: "Full Apartment",
};

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function PartnerBookingDetail() {
  const [, params] = useRoute("/partner/bookings/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const bookingId = params?.id ?? "";

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/partner/bookings", bookingId],
    queryFn: () => fetch(`/api/partner/bookings/${bookingId}`, { credentials: "include" }).then(r => r.ok ? r.json() : Promise.reject(r)),
    enabled: !!bookingId,
  });

  const { data: team = [] } = useQuery<any[]>({ queryKey: ["/api/partner/team"] });

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [statusNotes, setStatusNotes] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [assignData, setAssignData] = useState({
    teamMemberId: "", driverName: "", driverPhone: "",
    vehicleType: "", vehiclePlate: "", notes: "",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/partner/bookings", bookingId] });
    qc.invalidateQueries({ queryKey: ["/api/partner/bookings"] });
    qc.invalidateQueries({ queryKey: ["/api/partner/dashboard"] });
  };

  const accept = useMutation({
    mutationFn: () => apiRequest("POST", `/api/partner/bookings/${bookingId}/accept`, {}),
    onSuccess: () => { toast({ title: "Booking accepted" }); invalidate(); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: () => apiRequest("POST", `/api/partner/bookings/${bookingId}/reject`, { reason: rejectReason }),
    onSuccess: () => { toast({ title: "Booking rejected" }); setShowRejectForm(false); invalidate(); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const assign = useMutation({
    mutationFn: () => apiRequest("POST", `/api/partner/bookings/${bookingId}/assign`, {
      ...assignData, teamMemberId: assignData.teamMemberId || undefined,
    }),
    onSuccess: () => { toast({ title: "Booking assigned" }); setShowAssignForm(false); invalidate(); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: () => apiRequest("POST", `/api/partner/bookings/${bookingId}/status`, { status: nextStatus, notes: statusNotes }),
    onSuccess: () => {
      toast({ title: `Status updated to ${formatStatus(nextStatus)}` });
      setShowStatusForm(false); setNextStatus(""); setStatusNotes("");
      invalidate();
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <PartnerLayout>
        <div className="p-6 flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </PartnerLayout>
    );
  }

  if (error || !data) {
    return (
      <PartnerLayout>
        <div className="p-6">
          <Alert variant="destructive"><AlertDescription>Booking not found.</AlertDescription></Alert>
        </div>
      </PartnerLayout>
    );
  }

  const { booking, assignment, events, incidents, proofs } = data;
  const enterpriseStatus = booking.enterpriseStatus ?? "new";
  const validNext = ENTERPRISE_STATUS_TRANSITIONS[enterpriseStatus] ?? [];
  const isPending = ["new", "under_review"].includes(enterpriseStatus);
  const isTerminal = ["completed", "cancelled", "rejected"].includes(enterpriseStatus);

  return (
    <PartnerLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/partner/bookings")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg font-semibold">Booking #{booking.id.slice(-8).toUpperCase()}</h1>
              <Badge variant="outline" className={STATUS_COLOR[enterpriseStatus] ?? ""} data-testid="status-badge">
                {formatStatus(enterpriseStatus)}
              </Badge>
            </div>
            {booking.routedToPartnerAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Received {format(new Date(booking.routedToPartnerAt), "PPp")}
              </p>
            )}
          </div>
        </div>

        {/* Pending action alert */}
        {isPending && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Action required</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                    This booking is awaiting your response. Accept or reject to proceed.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => accept.mutate()}
                  disabled={accept.isPending}
                  data-testid="button-accept-booking"
                >
                  {accept.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRejectForm(!showRejectForm)}
                  data-testid="button-show-reject"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </div>
            </div>
            {showRejectForm && (
              <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700 space-y-3">
                <Label>Rejection Reason *</Label>
                <Textarea
                  rows={2}
                  placeholder="Explain why you cannot fulfill this booking…"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  data-testid="input-reject-reason"
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive" size="sm"
                    onClick={() => reject.mutate()}
                    disabled={!rejectReason.trim() || reject.isPending}
                    data-testid="button-confirm-reject"
                  >
                    {reject.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                    Confirm Rejection
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowRejectForm(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Details grid */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Route className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Route</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center shrink-0 pt-0.5">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 border-2 border-green-500 flex items-center justify-center">
                    <span className="text-xs font-bold text-green-600">A</span>
                  </div>
                  <div className="w-0.5 h-8 bg-gradient-to-b from-green-500 to-primary my-1 rounded-full" />
                  <div className="w-8 h-8 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">B</span>
                  </div>
                </div>
                <div className="flex-1 space-y-5 pt-0.5">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pickup</p>
                    <p className="font-medium text-sm">{booking.pickupAddress}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Dropoff</p>
                    <p className="font-medium text-sm">{booking.dropoffAddress}</p>
                  </div>
                </div>
              </div>
              {booking.distance && (
                <div className="bg-muted/30 rounded-lg p-3 flex items-center gap-2">
                  <Navigation className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">Distance</span>
                  <span className="font-semibold text-sm ml-auto">{parseFloat(booking.distance).toFixed(1)} km</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Job Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {booking.preferredDate && (
                <div className="bg-muted/30 rounded-lg p-3 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Scheduled</span>
                  <span className="text-sm font-medium ml-auto">{format(new Date(booking.preferredDate), "PPP p")}</span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Load</p>
                  <p className="font-semibold text-sm">{LOAD_SIZE_LABEL[booking.loadSize] ?? booking.loadSize?.replace("_", " ") ?? "—"}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Movers</p>
                  <p className="font-semibold text-sm flex items-center gap-1">
                    <Users className="w-3 h-3" />{booking.numberOfMovers ?? "—"}
                  </p>
                </div>
                <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Value</p>
                  <p className="font-bold text-base text-primary">${parseFloat(booking.price ?? "0").toFixed(2)}</p>
                </div>
              </div>
              {booking.description && (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">{booking.description}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Item Photos */}
        {booking.images && booking.images.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Images className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                  Item Photos ({booking.images.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {booking.images.map((imageUrl: string, index: number) => (
                  <div
                    key={index}
                    className="relative aspect-square rounded-md overflow-hidden border cursor-pointer group"
                    onClick={() => {
                      setPreviewImages(booking.images ?? []);
                      setPreviewIndex(index);
                      setShowImagePreview(true);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        setPreviewImages(booking.images ?? []);
                        setPreviewIndex(index);
                        setShowImagePreview(true);
                      }
                    }}
                    aria-label={`View item photo ${index + 1} of ${booking.images.length}`}
                    data-testid={`button-preview-image-${index}`}
                  >
                    <img
                      src={imageUrl}
                      alt={`Item ${index + 1}`}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      data-testid={`image-item-${index}`}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions (all non-terminal states) */}
        {!isTerminal && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Dispatch Actions</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Assign team */}
              {["accepted", "assigned"].includes(enterpriseStatus) && (
                <div>
                  <Button
                    variant="outline"
                    onClick={() => setShowAssignForm(!showAssignForm)}
                    data-testid="button-show-assign"
                  >
                    <Truck className="w-4 h-4 mr-2" />
                    {assignment ? "Reassign Team" : "Assign Team / Driver"}
                  </Button>
                  {showAssignForm && (
                    <div className="mt-3 space-y-3 p-4 rounded-md bg-muted/40">
                      {team.length > 0 && (
                        <div className="space-y-1.5">
                          <Label>Select Team Member</Label>
                          <Select
                            value={assignData.teamMemberId}
                            onValueChange={v => {
                              const m = team.find((t: any) => t.id === v);
                              setAssignData(d => ({
                                ...d, teamMemberId: v,
                                driverName: m?.name ?? d.driverName,
                                vehicleType: m?.vehicleType ?? d.vehicleType,
                                vehiclePlate: m?.vehiclePlate ?? d.vehiclePlate,
                              }));
                            }}
                          >
                            <SelectTrigger data-testid="select-team-member">
                              <SelectValue placeholder="Select from team…" />
                            </SelectTrigger>
                            <SelectContent>
                              {team.map((m: any) => (
                                <SelectItem key={m.id} value={m.id}>{m.name} — {m.memberType}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Driver Name</Label>
                          <Input value={assignData.driverName} onChange={e => setAssignData(d => ({ ...d, driverName: e.target.value }))} data-testid="input-driver-name" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Driver Phone</Label>
                          <Input value={assignData.driverPhone} onChange={e => setAssignData(d => ({ ...d, driverPhone: e.target.value }))} data-testid="input-driver-phone" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Vehicle Type</Label>
                          <Input placeholder="e.g. Cargo Van" value={assignData.vehicleType} onChange={e => setAssignData(d => ({ ...d, vehicleType: e.target.value }))} data-testid="input-vehicle-type" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Plate Number</Label>
                          <Input value={assignData.vehiclePlate} onChange={e => setAssignData(d => ({ ...d, vehiclePlate: e.target.value }))} data-testid="input-vehicle-plate" />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                          <Label>Notes</Label>
                          <Textarea rows={2} value={assignData.notes} onChange={e => setAssignData(d => ({ ...d, notes: e.target.value }))} data-testid="input-assign-notes" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => assign.mutate()} disabled={assign.isPending} data-testid="button-confirm-assign">
                          {assign.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                          Confirm Assignment
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowAssignForm(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status update */}
              {validNext.length > 0 && (
                <div>
                  <Button
                    variant="outline"
                    onClick={() => setShowStatusForm(!showStatusForm)}
                    data-testid="button-show-status-update"
                  >
                    <ChevronRight className="w-4 h-4 mr-2" />
                    Update Status
                  </Button>
                  {showStatusForm && (
                    <div className="mt-3 space-y-3 p-4 rounded-md bg-muted/40">
                      <div className="space-y-1.5">
                        <Label>New Status</Label>
                        <Select value={nextStatus} onValueChange={setNextStatus}>
                          <SelectTrigger data-testid="select-next-status"><SelectValue placeholder="Select status…" /></SelectTrigger>
                          <SelectContent>
                            {validNext.map(s => (
                              <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
                        <Textarea rows={2} value={statusNotes} onChange={e => setStatusNotes(e.target.value)} data-testid="input-status-notes" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => updateStatus.mutate()} disabled={!nextStatus || updateStatus.isPending} data-testid="button-confirm-status">
                          {updateStatus.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                          Update Status
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowStatusForm(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Current assignment */}
        {assignment && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Assigned Driver</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-2">
                {assignment.driverName && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Driver</p>
                    <p className="font-semibold text-sm">{assignment.driverName}</p>
                  </div>
                )}
                {assignment.driverPhone && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Phone</p>
                    <p className="font-semibold text-sm">{assignment.driverPhone}</p>
                  </div>
                )}
                {assignment.vehicleType && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Vehicle</p>
                    <p className="font-semibold text-sm">{assignment.vehicleType}</p>
                  </div>
                )}
                {assignment.vehiclePlate && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Plate</p>
                    <p className="font-semibold text-sm">{assignment.vehiclePlate}</p>
                  </div>
                )}
                {assignment.notes && (
                  <div className="sm:col-span-2 bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-sm">{assignment.notes}</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Assigned {format(new Date(assignment.assignedAt), "PPp")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Status timeline */}
        {events.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Status History</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />
                <div className="space-y-4">
                  {events.map((e: any) => (
                    <div key={e.id} className="relative flex items-start gap-4" data-testid={`event-${e.id}`}>
                      <div className="w-3.5 h-3.5 rounded-full bg-primary border-2 border-background shrink-0 mt-0.5" />
                      <div className="flex-1 pb-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <span className="text-sm font-medium">{formatStatus(e.toStatus)}</span>
                            {e.fromStatus && (
                              <span className="text-xs text-muted-foreground ml-2">from {formatStatus(e.fromStatus)}</span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{format(new Date(e.createdAt), "PPp")}</span>
                        </div>
                        {e.notes && <p className="text-xs text-muted-foreground mt-0.5">{e.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Incidents */}
        {incidents.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Incidents ({incidents.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {incidents.map((inc: any) => (
                <div key={inc.id} className="p-3 rounded-md bg-muted/50 text-sm" data-testid={`incident-${inc.id}`}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={inc.severity === "critical" ? "destructive" : "secondary"} className="text-xs capitalize">
                      {inc.severity}
                    </Badge>
                    <span className="font-medium">{inc.title}</span>
                    <Badge variant="outline" className="text-xs capitalize">{inc.status.replace("_", " ")}</Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">{inc.notes}</p>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(inc.createdAt), "PPp")}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Proof of completion */}
        {proofs.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Proof of Completion ({proofs.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {proofs.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50" data-testid={`proof-${p.id}`}>
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{p.fileName}</p>
                    {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                  </div>
                  {p.fileUrl && (
                    <a href={p.fileUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost">View</Button>
                    </a>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Image Lightbox */}
      <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          <DialogDescription className="sr-only">
            Viewing image {previewIndex + 1} of {previewImages.length}
          </DialogDescription>
          <div className="relative flex items-center justify-center min-h-[60vh]">
            {previewImages.length > 0 && (
              <>
                <img
                  src={previewImages[previewIndex]}
                  alt={`Preview ${previewIndex + 1}`}
                  className="max-w-full max-h-[80vh] object-contain"
                  data-testid="img-preview-full"
                />
                {previewImages.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full"
                      onClick={() => setPreviewIndex(p => p > 0 ? p - 1 : previewImages.length - 1)}
                      aria-label="Previous image"
                      data-testid="button-prev-image"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full"
                      onClick={() => setPreviewIndex(p => p < previewImages.length - 1 ? p + 1 : 0)}
                      aria-label="Next image"
                      data-testid="button-next-image"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </Button>
                  </>
                )}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 px-3 py-1 rounded-full text-white text-sm">
                  {previewIndex + 1} / {previewImages.length}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PartnerLayout>
  );
}
