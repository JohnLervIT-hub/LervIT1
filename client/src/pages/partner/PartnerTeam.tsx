import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Plus, Loader2, Truck, Pencil, Trash2, Camera } from "lucide-react";

function VehiclePhotoUpload({ member }: { member: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(member.vehiclePhoto ?? null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/partner/team/${member.id}/vehicle-photo`, { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      const updated = await res.json();
      setPreview(updated.vehiclePhoto);
      qc.invalidateQueries({ queryKey: ["/api/partner/team"] });
      toast({ title: "Photo updated" });
    } catch (err: any) {
      toast({ title: err.message ?? "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      {preview ? (
        <div className="relative shrink-0 group">
          <img src={preview} alt="Vehicle" className="w-12 h-9 object-cover rounded border border-border" data-testid={`img-vehicle-${member.id}`} />
          <button onClick={() => fileRef.current?.click()} className="absolute inset-0 flex items-center justify-center rounded bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center w-12 h-9 rounded border border-dashed border-border bg-muted/40 hover-elevate shrink-0"
          data-testid={`button-upload-vehicle-${member.id}`}
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /> : <Camera className="w-3 h-3 text-muted-foreground" />}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} data-testid={`input-vehicle-photo-${member.id}`} />
    </div>
  );
}

async function uploadVehiclePhoto(memberId: string, file: File): Promise<void> {
  const fd = new FormData();
  fd.append("file", file);
  await fetch(`/api/partner/team/${memberId}/vehicle-photo`, { method: "POST", credentials: "include", body: fd });
}

function TeamMemberDialog({ member, onClose }: { member?: any; onClose: () => void }) {
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

  const save = useMutation({
    mutationFn: () => isEdit ? apiRequest("PUT", `/api/partner/team/${member.id}`, form) : apiRequest("POST", "/api/partner/team", form),
    onSuccess: async (saved: any) => {
      const memberId = isEdit ? member.id : saved.id;
      if (photoFile && memberId) await uploadVehiclePhoto(memberId, photoFile);
      toast({ title: isEdit ? "Member updated" : "Member added" });
      qc.invalidateQueries({ queryKey: ["/api/partner/team"] });
      setOpen(false);
      onClose();
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const trigger = isEdit ? (
    <Button size="icon" variant="ghost" onClick={() => setOpen(true)} data-testid={`button-edit-${member.id}`} className="h-7 w-7">
      <Pencil className="w-3.5 h-3.5" />
    </Button>
  ) : (
    <Button size="sm" data-testid="button-add-member">
      <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Member
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) onClose(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Member" : "Add Team Member"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
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
                <SelectTrigger data-testid="select-vehicle-type"><SelectValue placeholder="Select…" /></SelectTrigger>
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
              <Label>Color</Label>
              <Input value={form.vehicleColor} onChange={e => setForm(f => ({ ...f, vehicleColor: e.target.value }))} data-testid="input-vehicle-color" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Vehicle Photo</Label>
            <div className="flex items-center gap-3">
              {photoPreview ? (
                <img src={photoPreview} alt="Vehicle preview" className="w-16 h-11 object-cover rounded border border-border shrink-0" />
              ) : (
                <div className="flex items-center justify-center w-16 h-11 rounded border border-dashed border-border bg-muted/40 shrink-0">
                  <Camera className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="button-pick-vehicle-photo">
                {photoPreview ? "Replace" : "Upload photo"}
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); } }}
                data-testid="input-vehicle-photo-dialog"
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Switch checked={form.isAvailable} onCheckedChange={v => setForm(f => ({ ...f, isAvailable: v }))} data-testid="switch-availability" />
            <Label className="font-normal">Available for assignments</Label>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={() => { setOpen(false); onClose(); }}>Cancel</Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !form.name} data-testid="button-save-member">
              {save.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : "Save"}
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
    onSuccess: () => { toast({ title: "Member removed" }); qc.invalidateQueries({ queryKey: ["/api/partner/team"] }); },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  const toggleAvailability = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      apiRequest("PUT", `/api/partner/team/${id}`, { isAvailable }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/partner/team"] }),
  });

  const available = team.filter((m: any) => m.isAvailable).length;

  return (
    <PartnerLayout>
      <div className="p-6 space-y-5 max-w-3xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Team</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {available} available · {team.length} total
            </p>
          </div>
          <TeamMemberDialog onClose={() => {}} />
        </div>

        <Separator />

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : team.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2 text-muted-foreground">
            <Users className="w-8 h-8" />
            <p className="text-sm">No team members yet</p>
            <p className="text-xs">Add your first driver or crew member</p>
          </div>
        ) : (
          <div className="space-y-px">
            {team.map((member: any, idx: number) => (
              <div key={member.id}>
                <div className="flex items-center gap-4 py-3 px-2 rounded-md" data-testid={`card-member-${member.id}`}>
                  <VehiclePhotoUpload member={member} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{member.name}</p>
                      <span className="text-xs text-muted-foreground capitalize">{member.memberType}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`availability-${member.id}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${member.isAvailable ? "bg-green-500" : "bg-gray-400"}`} />
                        {member.isAvailable ? "Available" : "Unavailable"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      {member.phone && <span>{member.phone}</span>}
                      {member.vehicleType && (
                        <span className="flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          {member.vehicleType}
                          {member.vehiclePlate && ` · ${member.vehiclePlate}`}
                        </span>
                      )}
                    </div>
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
                      className="h-7 w-7"
                      onClick={() => deleteMember.mutate(member.id)}
                      disabled={deleteMember.isPending}
                      data-testid={`button-delete-${member.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                {idx < team.length - 1 && <Separator className="opacity-40" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </PartnerLayout>
  );
}
