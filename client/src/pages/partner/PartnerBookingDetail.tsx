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
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Package,
  CheckCircle,
  XCircle,
  User,
  Truck,
  AlertTriangle,
  Upload,
  Clock,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  assigned: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  en_route_to_pickup: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  arrived_at_pickup: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  picked_up: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  in_transit: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  arrived_at_dropoff: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  delayed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  issue_reported: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
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
    queryFn: () => fetch(`/api/partner/bookings/${bookingId}`).then(r => r.ok ? r.json() : Promise.reject(r)),
    enabled: !!bookingId,
  });

  const { data: team = [] } = useQuery<any[]>({ queryKey: ["/api/partner/team"] });

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [statusNotes, setStatusNotes] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [assignData, setAssignData] = useState({
    teamMemberId: "",
    driverName: "",
    driverPhone: "",
    vehicleType: "",
    vehiclePlate: "",
    notes: "",
  });

  const accept = useMutation({
    mutationFn: () => apiRequest("POST", `/api/partner/bookings/${bookingId}/accept`, {}),
    onSuccess: () => { toast({ title: "Booking accepted" }); qc.invalidateQueries({ queryKey: ["/api/partner/bookings", bookingId] }); qc.invalidateQueries({ queryKey: ["/api/partner/bookings"] }); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: () => apiRequest("POST", `/api/partner/bookings/${bookingId}/reject`, { reason: rejectReason }),
    onSuccess: () => { toast({ title: "Booking rejected" }); setShowRejectForm(false); qc.invalidateQueries({ queryKey: ["/api/partner/bookings", bookingId] }); qc.invalidateQueries({ queryKey: ["/api/partner/bookings"] }); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const assign = useMutation({
    mutationFn: () => apiRequest("POST", `/api/partner/bookings/${bookingId}/assign`, {
      ...assignData,
      teamMemberId: assignData.teamMemberId || undefined,
    }),
    onSuccess: () => { toast({ title: "Booking assigned" }); setShowAssignForm(false); qc.invalidateQueries({ queryKey: ["/api/partner/bookings", bookingId] }); },
    onError: (e: any) => toast({ title: e?.message ?? "Failed", variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: () => apiRequest("POST", `/api/partner/bookings/${bookingId}/status`, { status: nextStatus, notes: statusNotes }),
    onSuccess: () => { toast({ title: `Status updated to ${formatStatus(nextStatus)}` }); setShowStatusForm(false); setNextStatus(""); setStatusNotes(""); qc.invalidateQueries({ queryKey: ["/api/partner/bookings", bookingId] }); qc.invalidateQueries({ queryKey: ["/api/partner/bookings"] }); },
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
          <Alert variant="destructive">
            <AlertDescription>Booking not found.</AlertDescription>
          </Alert>
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/partner/bookings")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">Booking #{booking.id.slice(-8).toUpperCase()}</h1>
              <Badge className={STATUS_COLOR[enterpriseStatus] ?? ""} data-testid="status-badge">
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

        {/* Booking details */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><MapPin className="w-4 h-4" /> Route</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Pickup</p>
                <p className="font-medium">{booking.pickupAddress}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dropoff</p>
                <p className="font-medium">{booking.dropoffAddress}</p>
              </div>
              {booking.distance && (
                <p className="text-xs text-muted-foreground">{parseFloat(booking.distance).toFixed(1)} km</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {booking.preferredDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{format(new Date(booking.preferredDate), "PPP p")}</span>
                </div>
              )}
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Load Size</p>
                  <p className="font-medium capitalize">{booking.loadSize?.replace("_", " ")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Movers</p>
                  <p className="font-medium">{booking.numberOfMovers}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="font-medium">${parseFloat(booking.price ?? "0").toFixed(2)}</p>
                </div>
              </div>
              {booking.description && (
                <p className="text-xs text-muted-foreground">{booking.description}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        {!isTerminal && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Accept / Reject for new bookings */}
              {isPending && (
                <div className="flex gap-3 flex-wrap">
                  <Button
                    onClick={() => accept.mutate()}
                    disabled={accept.isPending}
                    data-testid="button-accept-booking"
                  >
                    {accept.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                    Accept Booking
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowRejectForm(!showRejectForm)}
                    data-testid="button-show-reject"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                </div>
              )}

              {showRejectForm && (
                <div className="space-y-3 p-3 rounded-md bg-muted/40">
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
                      variant="destructive"
                      size="sm"
                      onClick={() => reject.mutate()}
                      disabled={!rejectReason.trim() || reject.isPending}
                      data-testid="button-confirm-reject"
                    >
                      {reject.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                      Confirm Rejection
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowRejectForm(false)}>Cancel</Button>
                  </div>
                </div>
              )}

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
                    <div className="mt-3 space-y-3 p-3 rounded-md bg-muted/40">
                      {team.length > 0 && (
                        <div className="space-y-1.5">
                          <Label>Select Team Member</Label>
                          <Select
                            value={assignData.teamMemberId}
                            onValueChange={v => {
                              const m = team.find((t: any) => t.id === v);
                              setAssignData(d => ({
                                ...d,
                                teamMemberId: v,
                                driverName: m?.name ?? d.driverName,
                                vehicleType: m?.vehicleType ?? d.vehicleType,
                                vehiclePlate: m?.vehiclePlate ?? d.vehiclePlate,
                              }));
                            }}
                          >
                            <SelectTrigger data-testid="select-team-member"><SelectValue placeholder="Select…" /></SelectTrigger>
                            <SelectContent>
                              {team.map((m: any) => (
                                <SelectItem key={m.id} value={m.id}>{m.name} ({m.memberType})</SelectItem>
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
                          <Textarea rows={1} value={assignData.notes} onChange={e => setAssignData(d => ({ ...d, notes: e.target.value }))} data-testid="input-assign-notes" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => assign.mutate()} disabled={assign.isPending} data-testid="button-confirm-assign">
                          {assign.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                          Confirm Assignment
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowAssignForm(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status transition */}
              {validNext.length > 0 && !isPending && (
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
                    <div className="mt-3 space-y-3 p-3 rounded-md bg-muted/40">
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
                        <Label>Notes (optional)</Label>
                        <Textarea rows={2} value={statusNotes} onChange={e => setStatusNotes(e.target.value)} data-testid="input-status-notes" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => updateStatus.mutate()} disabled={!nextStatus || updateStatus.isPending} data-testid="button-confirm-status">
                          {updateStatus.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
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
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><User className="w-4 h-4" /> Current Assignment</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1.5">
              {assignment.driverName && <p><span className="text-muted-foreground">Driver:</span> {assignment.driverName}</p>}
              {assignment.driverPhone && <p><span className="text-muted-foreground">Phone:</span> {assignment.driverPhone}</p>}
              {assignment.vehicleType && <p><span className="text-muted-foreground">Vehicle:</span> {assignment.vehicleType}</p>}
              {assignment.vehiclePlate && <p><span className="text-muted-foreground">Plate:</span> {assignment.vehiclePlate}</p>}
              {assignment.notes && <p><span className="text-muted-foreground">Notes:</span> {assignment.notes}</p>}
              <p className="text-xs text-muted-foreground">Assigned {format(new Date(assignment.assignedAt), "PPp")}</p>
            </CardContent>
          </Card>
        )}

        {/* Status timeline */}
        {events.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> Status History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {events.map((e: any) => (
                  <div key={e.id} className="flex items-start gap-3 text-sm" data-testid={`event-${e.id}`}>
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{formatStatus(e.toStatus)}</span>
                        {e.fromStatus && (
                          <span className="text-muted-foreground text-xs">from {formatStatus(e.fromStatus)}</span>
                        )}
                      </div>
                      {e.notes && <p className="text-xs text-muted-foreground">{e.notes}</p>}
                      <p className="text-xs text-muted-foreground">{format(new Date(e.createdAt), "PPp")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Incidents */}
        {incidents.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Incidents ({incidents.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {incidents.map((inc: any) => (
                <div key={inc.id} className="p-3 rounded-md bg-muted/50 text-sm" data-testid={`incident-${inc.id}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={inc.severity === "critical" ? "destructive" : "secondary"} className="text-xs">
                      {inc.severity}
                    </Badge>
                    <span className="font-medium">{inc.title}</span>
                    <Badge variant="outline" className="text-xs capitalize">{inc.status}</Badge>
                  </div>
                  <p className="text-muted-foreground text-xs mt-1">{inc.notes}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(inc.createdAt), "PPp")}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Proof of completion */}
        {proofs.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Upload className="w-4 h-4" /> Proof of Completion ({proofs.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {proofs.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50" data-testid={`proof-${p.id}`}>
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{p.fileName}</p>
                    <p className="text-xs text-muted-foreground">{p.proofType} · {format(new Date(p.uploadedAt), "PPp")}</p>
                  </div>
                  <a href={p.fileUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost">View</Button>
                  </a>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </PartnerLayout>
  );
}
