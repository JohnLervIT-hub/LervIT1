import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Plus, Loader2, Truck, User, Pencil, Trash2, Camera, ImageOff } from "lucide-react";

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

async function uploadVehiclePhoto(memberId: string, file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/partner/team/${memberId}/vehicle-photo`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.vehiclePhoto ?? null;
}

function TeamMemberDialog({
  member,
  onClose,
}: {
  member?: any;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!member;
  const [open, setOpen] = useState(!isEdit);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(member?.vehiclePhoto ?? null);
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

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const save = useMutation({
    mutationFn: () => isEdit
      ? apiRequest("PUT", `/api/partner/team/${member.id}`, form)
      : apiRequest("POST", "/api/partner/team", form),
    onSuccess: async (saved: any) => {
      const memberId = isEdit ? member.id : saved.id;
      if (photoFile && memberId) {
        await uploadVehiclePhoto(memberId, photoFile);
      }
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
    <Button data-testid="button-add-member">
      <Plus className="w-4 h-4 mr-2" /> Add Member
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) onClose(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
                <SelectTrigger data-testid="select-vehicle-type"><SelectValue placeholder="Select class…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cargo Van">Cargo Van</SelectItem>
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

          {/* Vehicle photo upload */}
          <div className="space-y-1.5">
            <Label>Vehicle Photo</Label>
            <div className="flex items-center gap-3">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Vehicle preview"
                  className="w-20 h-14 object-cover rounded-md border border-border shrink-0"
                />
              ) : (
                <div className="flex items-center justify-center w-20 h-14 rounded-md border border-dashed border-border bg-muted/40 shrink-0">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  data-testid="button-pick-vehicle-photo"
                >
                  <Camera className="w-3.5 h-3.5 mr-1.5" />
                  {photoPreview ? "Replace photo" : "Upload photo"}
                </Button>
                <p className="text-xs text-muted-foreground">JPG, PNG or WebP</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
                data-testid="input-vehicle-photo-dialog"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={form.isAvailable}
              onCheckedChange={v => setForm(f => ({ ...f, isAvailable: v }))}
              data-testid="switch-availability"
            />
            <Label>Available for assignments</Label>
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
  );
}

export default function PartnerTeam() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: team = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/partner/team"] });

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

  return (
    <PartnerLayout>
      <div className="px-6 py-6">
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Team</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {team.filter((m: any) => m.isAvailable).length} available · {team.length} total
            </p>
          </div>
          <TeamMemberDialog onClose={() => {}} />
        </div>

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
        ) : (
          <div className="space-y-3">
            {team.map((member: any) => (
              <Card key={member.id} data-testid={`card-member-${member.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    {/* Vehicle photo / placeholder */}
                    <VehiclePhotoUpload member={member} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{member.name}</p>
                        <Badge variant="outline" className="text-xs capitalize">{member.memberType}</Badge>
                        <Badge
                          className={`text-xs ${member.isAvailable ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
                          data-testid={`availability-${member.id}`}
                        >
                          {member.isAvailable ? "Available" : "Unavailable"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {member.phone && <span>{member.phone}</span>}
                        {member.vehicleType && (
                          <span className="flex items-center gap-1">
                            <Truck className="w-3 h-3" />{member.vehicleType}
                            {member.vehiclePlate && ` · ${member.vehiclePlate}`}
                            {member.vehicleColor && ` · ${member.vehicleColor}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
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
