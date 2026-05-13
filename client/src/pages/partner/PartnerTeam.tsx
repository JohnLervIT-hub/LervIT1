import { useRef, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";
import { Users, Plus, Loader2, Truck, Pencil, Trash2, Camera, Search, X, StickyNote } from "lucide-react";

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function DriverPhotoUpload({ member }: { member: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(member.driverPhoto ?? null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only image files accepted", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/partner/team/${member.id}/driver-photo`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }
      const updated = await res.json();
      setPreview(updated.driverPhoto);
      qc.invalidateQueries({ queryKey: ["/api/partner/team"] });
      toast({ title: "Driver photo updated" });
    } catch (err: any) {
      toast({ title: err.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="relative shrink-0 group">
      <Avatar className="w-14 h-14 border-2 border-border cursor-pointer" onClick={() => fileRef.current?.click()} data-testid={`avatar-driver-${member.id}`}>
        <AvatarImage src={preview ?? undefined} alt={member.name} />
        <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : initials(member.name)}
        </AvatarFallback>
      </Avatar>
      <button
        onClick={() => fileRef.current?.click()}
        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
        title={preview ? "Replace photo" : "Add driver photo"}
        aria-label="Upload driver photo"
        data-testid={`button-upload-driver-photo-${member.id}`}
      >
        <Camera className="w-4 h-4 text-white" />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
        data-testid={`input-driver-photo-${member.id}`}
      />
    </div>
  );
}

function VehiclePhotoUpload({ member }: { member: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(member.vehiclePhoto ?? null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only image files accepted", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/partner/team/${member.id}/vehicle-photo`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed");
      }
      const updated = await res.json();
      setPreview(updated.vehiclePhoto);
      qc.invalidateQueries({ queryKey: ["/api/partner/team"] });
      toast({ title: "Vehicle photo uploaded" });
    } catch (err: any) {
      toast({ title: err.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      {preview ? (
        <div className="relative shrink-0 group">
          <img
            src={preview}
            alt="Vehicle"
            className="w-14 h-10 object-cover rounded-md border border-border"
            data-testid={`img-vehicle-${member.id}`}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Replace photo"
          >
            <Camera className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center w-14 h-10 rounded-md border border-dashed border-border bg-muted/40 hover-elevate shrink-0"
          title="Upload vehicle photo"
          data-testid={`button-upload-vehicle-${member.id}`}
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Camera className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
        data-testid={`input-vehicle-photo-${member.id}`}
      />
    </div>
  );
}

async function uploadPhoto(memberId: string, file: File, kind: "driver" | "vehicle"): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/partner/team/${memberId}/${kind}-photo`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return kind === "driver" ? (data.driverPhoto ?? null) : (data.vehiclePhoto ?? null);
}

function TeamMemberDialog({ member, onClose }: { member?: any; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!member;
  const [open, setOpen] = useState(false);

  const driverPhotoRef = useRef<HTMLInputElement>(null);
  const vehiclePhotoRef = useRef<HTMLInputElement>(null);
  const [driverPhotoFile, setDriverPhotoFile] = useState<File | null>(null);
  const [driverPhotoPreview, setDriverPhotoPreview] = useState<string | null>(member?.driverPhoto ?? null);
  const [vehiclePhotoFile, setVehiclePhotoFile] = useState<File | null>(null);
  const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState<string | null>(member?.vehiclePhoto ?? null);

  const [form, setForm] = useState({
    name: member?.name ?? "",
    memberType: member?.memberType ?? "driver",
    phone: member?.phone ?? "",
    vehicleType: member?.vehicleType ?? "",
    vehiclePlate: member?.vehiclePlate ?? "",
    vehicleColor: member?.vehicleColor ?? "",
    isAvailable: member?.isAvailable ?? true,
    notes: member?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: () => isEdit
      ? apiRequest("PUT", `/api/partner/team/${member.id}`, form)
      : apiRequest("POST", "/api/partner/team", form),
    onSuccess: async (saved: any) => {
      const memberId = isEdit ? member.id : saved.id;
      if (driverPhotoFile && memberId) await uploadPhoto(memberId, driverPhotoFile, "driver");
      if (vehiclePhotoFile && memberId) await uploadPhoto(memberId, vehiclePhotoFile, "vehicle");
      toast({ title: isEdit ? "Member updated" : "Team member added" });
      qc.invalidateQueries({ queryKey: ["/api/partner/team"] });
      setOpen(false);
      onClose();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const trigger = isEdit ? (
    <Button size="icon" variant="ghost" onClick={() => setOpen(true)} data-testid={`button-edit-${member.id}`}>
      <Pencil className="w-4 h-4" />
    </Button>
  ) : (
    <Button onClick={() => setOpen(true)} data-testid="button-add-member">
      <Plus className="w-4 h-4 mr-2" /> Add Member
    </Button>
  );

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Driver Photo</Label>
            <div className="flex items-center gap-4">
              <div className="relative group shrink-0">
                <Avatar className="w-16 h-16 border-2 border-border cursor-pointer" onClick={() => driverPhotoRef.current?.click()}>
                  <AvatarImage src={driverPhotoPreview ?? undefined} alt={form.name || "Driver"} />
                  <AvatarFallback className="bg-muted text-muted-foreground text-base font-semibold">
                    {form.name ? initials(form.name) : <Camera className="w-5 h-5" />}
                  </AvatarFallback>
                </Avatar>
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => driverPhotoRef.current?.click()}
                >
                  <Camera className="w-4 h-4 text-white" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => driverPhotoRef.current?.click()} data-testid="button-pick-driver-photo">
                  <Camera className="w-3.5 h-3.5 mr-1.5" />
                  {driverPhotoPreview ? "Replace photo" : "Upload photo"}
                </Button>
                <p className="text-xs text-muted-foreground">JPG, PNG or WebP</p>
              </div>
              <input ref={driverPhotoRef} type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setDriverPhotoFile(file);
                  setDriverPhotoPreview(URL.createObjectURL(file));
                }}
                data-testid="input-driver-photo-dialog"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-member-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.memberType} onValueChange={v => setForm(f => ({ ...f, memberType: v }))}>
                <SelectTrigger data-testid="select-member-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} data-testid="input-member-phone" />
            </div>
            <div className="space-y-1.5">
              <Label>Vehicle Type</Label>
              <Select value={form.vehicleType} onValueChange={v => setForm(f => ({ ...f, vehicleType: v }))}>
                <SelectTrigger data-testid="select-vehicle-type"><SelectValue placeholder="Select type…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cargo Van">Cargo Van</SelectItem>
                  <SelectItem value="Cargo Van (Large)">Cargo Van (Large)</SelectItem>
                  <SelectItem value="Cargo Truck">Cargo Truck</SelectItem>
                  <SelectItem value="Box Truck">Box Truck</SelectItem>
                  <SelectItem value="Pickup Truck">Pickup Truck</SelectItem>
                  <SelectItem value="Sprinter Van">Sprinter Van</SelectItem>
                  <SelectItem value="Moving Truck">Moving Truck</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Plate</Label>
              <Input value={form.vehiclePlate} onChange={e => setForm(f => ({ ...f, vehiclePlate: e.target.value }))} data-testid="input-vehicle-plate" />
            </div>
            <div className="space-y-1.5">
              <Label>Vehicle Color</Label>
              <Input value={form.vehicleColor} onChange={e => setForm(f => ({ ...f, vehicleColor: e.target.value }))} data-testid="input-vehicle-color" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Vehicle Photo</Label>
            <div className="flex items-center gap-3">
              {vehiclePhotoPreview ? (
                <img src={vehiclePhotoPreview} alt="Vehicle preview" className="w-20 h-14 object-cover rounded-md border border-border shrink-0" />
              ) : (
                <div className="flex items-center justify-center w-20 h-14 rounded-md border border-dashed border-border bg-muted/40 shrink-0">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => vehiclePhotoRef.current?.click()} data-testid="button-pick-vehicle-photo">
                  <Camera className="w-3.5 h-3.5 mr-1.5" />
                  {vehiclePhotoPreview ? "Replace photo" : "Upload photo"}
                </Button>
                <p className="text-xs text-muted-foreground">JPG, PNG or WebP</p>
              </div>
              <input ref={vehiclePhotoRef} type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setVehiclePhotoFile(file);
                  setVehiclePhotoPreview(URL.createObjectURL(file));
                }}
                data-testid="input-vehicle-photo-dialog"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={form.isAvailable} onCheckedChange={v => setForm(f => ({ ...f, isAvailable: v }))} data-testid="switch-availability" />
            <Label>Available for assignments</Label>
          </div>

          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Add notes visible to admins and dispatchers only…"
              className="resize-none text-sm min-h-[72px]"
              data-testid="textarea-member-notes"
            />
            <p className="text-xs text-muted-foreground">Only visible to your team — not shown to customers.</p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => { setOpen(false); onClose(); }}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name} data-testid="button-save-member">
              {save.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

const VEHICLE_TYPES = [
  "Cargo Van", "Cargo Van (Large)", "Cargo Truck",
  "Box Truck", "Pickup Truck", "Sprinter Van", "Moving Truck",
];

export default function PartnerTeam() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: team = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/partner/team"] });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [availFilter, setAvailFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");

  const deleteMember = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/partner/team/${id}`),
    onSuccess: () => {
      toast({ title: "Member removed" });
      qc.invalidateQueries({ queryKey: ["/api/partner/team"] });
    },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      apiRequest("PUT", `/api/partner/team/${id}`, { isAvailable }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/partner/team"] }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return team.filter((m: any) => {
      if (typeFilter !== "all" && m.memberType !== typeFilter) return false;
      if (availFilter === "available" && !m.isAvailable) return false;
      if (availFilter === "unavailable" && m.isAvailable) return false;
      if (vehicleFilter !== "all" && m.vehicleType !== vehicleFilter) return false;
      if (q) {
        const hay = [m.name, m.phone, m.vehicleType, m.vehiclePlate, m.vehicleColor, m.notes].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [team, search, typeFilter, availFilter, vehicleFilter]);

  const hasFilters = search !== "" || typeFilter !== "all" || availFilter !== "all" || vehicleFilter !== "all";

  function clearFilters() {
    setSearch("");
    setTypeFilter("all");
    setAvailFilter("all");
    setVehicleFilter("all");
  }

  const availableCount = team.filter((m: any) => m.isAvailable).length;

  return (
    <PartnerLayout>
      <div className="px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-5">

          {/* Page header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-lg font-semibold">Team</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {availableCount} available · {team.length} total
              </p>
            </div>
            <TeamMemberDialog onClose={() => {}} />
          </div>

          {/* Filters */}
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by name, plate, vehicle…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                  data-testid="input-team-search"
                />
              </div>

              {/* Type */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 text-sm w-32" data-testid="select-team-type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>

              {/* Availability */}
              <Select value={availFilter} onValueChange={setAvailFilter}>
                <SelectTrigger className="h-9 text-sm w-36" data-testid="select-team-availability">
                  <SelectValue placeholder="Availability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>

              {/* Vehicle type */}
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger className="h-9 text-sm w-40" data-testid="select-team-vehicle">
                  <SelectValue placeholder="Vehicle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vehicles</SelectItem>
                  {VEHICLE_TYPES.map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Clear */}
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 text-muted-foreground"
                  data-testid="button-clear-team-filters"
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Clear
                </Button>
              )}
            </div>

            {/* Results count */}
            {!isLoading && team.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {hasFilters
                  ? `${filtered.length} of ${team.length} members`
                  : `${team.length} members`}
              </p>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-md bg-muted animate-pulse" />)}
            </div>
          ) : team.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-14 gap-3">
                <Users className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No team members yet. Add your first driver or crew.</p>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-14 gap-3">
                <Search className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No members match your filters.</p>
                <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((member: any) => (
                <Card key={member.id} data-testid={`card-member-${member.id}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-4">

                      <DriverPhotoUpload member={member} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-sm font-semibold">{member.name}</p>
                          <Badge variant="outline" className="text-xs capitalize">{member.memberType}</Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${member.isAvailable
                              ? "bg-green-500/10 text-green-600 border-green-500/20"
                              : "bg-slate-500/10 text-slate-500 border-slate-500/20"}`}
                            data-testid={`availability-${member.id}`}
                          >
                            {member.isAvailable ? "Available" : "Unavailable"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {member.phone && <span>{member.phone}</span>}
                          {member.vehicleType && (
                            <span className="flex items-center gap-1">
                              <Truck className="w-3 h-3" />
                              {member.vehicleType}
                              {member.vehiclePlate && ` · ${member.vehiclePlate}`}
                              {member.vehicleColor && ` · ${member.vehicleColor}`}
                            </span>
                          )}
                        </div>
                        {member.vehiclePhoto && (
                          <div className="mt-2">
                            <img
                              src={member.vehiclePhoto}
                              alt="Vehicle"
                              className="w-16 h-10 object-cover rounded-md border border-border"
                              data-testid={`img-vehicle-${member.id}`}
                            />
                          </div>
                        )}
                        {member.notes && (
                          <div className="flex items-start gap-1.5 mt-2" data-testid={`notes-${member.id}`}>
                            <StickyNote className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                            <p className="text-xs text-muted-foreground leading-relaxed">{member.notes}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Switch
                          checked={member.isAvailable}
                          onCheckedChange={v => toggleAvailability.mutate({ id: member.id, isAvailable: v })}
                          data-testid={`switch-available-${member.id}`}
                        />
                        <TeamMemberDialog member={member} onClose={() => {}} />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMember.mutate(member.id)}
                          disabled={deleteMember.isPending}
                          data-testid={`button-delete-${member.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </PartnerLayout>
  );
}
