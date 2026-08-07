import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import {
  Users, UserPlus, Mail, Clock, ShieldCheck, Trash2, Link2, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

const ROLE_META: Record<string, { label: string; color: string }> = {
  partner_admin:        { label: "Admin",        color: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-400" },
  partner_ops_manager:  { label: "Primary Ops",  color: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400" },
  partner_dispatcher:   { label: "Dispatch",     color: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400" },
  partner_viewer:       { label: "Viewer",       color: "bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400" },
};

function roleBadge(role: string) {
  const m = ROLE_META[role] ?? { label: role, color: "" };
  return (
    <Badge variant="outline" className={`text-xs ${m.color}`}>{m.label}</Badge>
  );
}

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function InviteDialog({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "partner_dispatcher" });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/partner/users/invite", form),
    onSuccess: async (res: any) => {
      const data = await res.json();
      const url = `${window.location.origin}${data.invite.activationUrl}`;
      setInviteUrl(url);
      onDone();
      toast({ title: "Invite created", description: `Link valid for 7 days.` });
    },
    onError: async (err: any) => {
      const msg = err?.message ?? "Failed to create invite";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInviteUrl(null);
    mutation.mutate();
  }

  function copyLink() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    toast({ title: "Copied to clipboard" });
  }

  function handleClose(v: boolean) {
    setOpen(v);
    if (!v) {
      setForm({ name: "", email: "", role: "partner_dispatcher" });
      setInviteUrl(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-invite-user">
          <UserPlus className="w-4 h-4 mr-2" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Portal User</DialogTitle>
        </DialogHeader>

        {!inviteUrl ? (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                data-testid="input-invite-name"
                placeholder="Jane Smith"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email Address</Label>
              <Input
                data-testid="input-invite-email"
                type="email"
                placeholder="jane@company.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger data-testid="select-invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="partner_ops_manager">Primary Ops — manage profile, compliance, team, dispatch settings</SelectItem>
                  <SelectItem value="partner_dispatcher">Dispatch — accept/assign jobs, update status, log incidents</SelectItem>
                  <SelectItem value="partner_viewer">Viewer — read-only access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-invite-submit">
                {mutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                Send Invite
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
              <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                Invite email sent to <strong>{form.email}</strong>. They'll receive a link to set their password and activate their account.
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Or share this link directly (expires in 7 days):</p>
              <div className="rounded-md border bg-muted/40 p-3 text-xs font-mono break-all text-muted-foreground select-all">
                {inviteUrl}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>Done</Button>
              <Button onClick={copyLink} data-testid="button-copy-invite-link">
                <Link2 className="w-4 h-4 mr-2" />
                Copy Link
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PartnerUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const QK = ["/api/partner/users"];

  const { data, isLoading } = useQuery<any>({ queryKey: QK });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiRequest("PUT", `/api/partner/users/${id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      toast({ title: "Role updated" });
    },
    onError: async (err: any) => {
      const msg = err?.message ?? "Failed to update role";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/partner/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      toast({ title: "Access revoked" });
    },
    onError: () => toast({ title: "Error", description: "Failed to revoke access", variant: "destructive" }),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/partner/invites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK });
      toast({ title: "Invite cancelled" });
    },
    onError: (e: any) => toast({ title: "Failed to cancel invite", description: e?.message, variant: "destructive" }),
  });

  const users: any[] = data?.users ?? [];
  const pendingInvites: any[] = data?.pendingInvites ?? [];
  const myUserId: string = data?.myUserId ?? "";

  return (
    <PartnerLayout>
      <div className="px-6 py-6">
        <div className="space-y-6 max-w-4xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-lg font-semibold">Portal Access</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage who can log in to your partner portal and what they can do.
              </p>
            </div>
            <InviteDialog onDone={() => queryClient.invalidateQueries({ queryKey: QK })} />
          </div>

          {/* Role legend */}
          <div className="rounded-md border bg-muted/30 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {Object.entries(ROLE_META).filter(([k]) => k !== "partner_admin").map(([role, meta]) => (
              <div key={role} className="flex items-start gap-2">
                <Badge variant="outline" className={`text-xs mt-0.5 shrink-0 ${meta.color}`}>{meta.label}</Badge>
                <span className="text-muted-foreground text-xs leading-snug">
                  {role === "partner_ops_manager"
                    ? "Edit profile, coverage, compliance, team, dispatch settings + all booking ops"
                    : role === "partner_dispatcher"
                    ? "Accept / assign jobs, update statuses, log incidents, upload proof"
                    : "Read-only — can view but cannot make changes"}
                </span>
              </div>
            ))}
          </div>

          {/* Active users */}
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Active Users ({users.length})
            </h2>

            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-10 w-full" /></CardContent></Card>
              ))
            ) : users.length === 0 ? (
              <Card>
                <CardContent className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                  <Users className="w-8 h-8 opacity-40" />
                  <p className="text-sm">No portal users yet.</p>
                </CardContent>
              </Card>
            ) : (
              users.map((u: any) => {
                const isMe = u.userId === myUserId;
                const isAdmin = u.partnerRole === "partner_admin";
                return (
                  <Card key={u.puId} data-testid={`card-user-${u.puId}`}>
                    <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                      <Avatar className="w-9 h-9 shrink-0">
                        <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{u.name}</span>
                          {isMe && <Badge variant="outline" className="text-xs">You</Badge>}
                          {roleBadge(u.partnerRole)}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3" />{u.email}
                        </p>
                      </div>
                      {!isMe && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Select
                            value={u.partnerRole}
                            onValueChange={role => roleMutation.mutate({ id: u.puId, role })}
                            disabled={roleMutation.isPending}
                          >
                            <SelectTrigger
                              className="h-8 text-xs w-36"
                              data-testid={`select-role-${u.puId}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="partner_admin">Admin</SelectItem>
                              <SelectItem value="partner_ops_manager">Primary Ops</SelectItem>
                              <SelectItem value="partner_dispatcher">Dispatch</SelectItem>
                              <SelectItem value="partner_viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => removeMutation.mutate(u.puId)}
                            disabled={removeMutation.isPending}
                            data-testid={`button-remove-user-${u.puId}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Pending invites */}
          {(isLoading || pendingInvites.length > 0) && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Pending Invites ({pendingInvites.length})
              </h2>
              {isLoading ? (
                <Card><CardContent className="p-4"><Skeleton className="h-8 w-full" /></CardContent></Card>
              ) : (
                pendingInvites.map((inv: any) => (
                  <Card key={inv.id} data-testid={`card-invite-${inv.id}`}>
                    <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{inv.email}</span>
                          {roleBadge(inv.role)}
                          <Badge variant="outline" className="text-xs border-dashed text-muted-foreground">
                            Pending
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          Expires {format(new Date(inv.expiresAt), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => {
                            const url = `${window.location.origin}/partner-activate?token=${inv.token}`;
                            navigator.clipboard.writeText(url);
                            toast({ title: "Invite link copied" });
                          }}
                          data-testid={`button-copy-link-${inv.id}`}
                        >
                          <Link2 className="w-3 h-3 mr-1.5" />
                          Copy Link
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive h-8 w-8"
                          onClick={() => cancelInviteMutation.mutate(inv.id)}
                          disabled={cancelInviteMutation.isPending}
                          data-testid={`button-cancel-invite-${inv.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

        </div>
      </div>
    </PartnerLayout>
  );
}
