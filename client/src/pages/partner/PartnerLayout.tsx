import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Building2, AlertTriangle, Camera, Loader2, Pencil } from "lucide-react";
import "iconify-icon";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "iconify-icon": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { icon: string; width?: string | number; height?: string | number },
        HTMLElement
      >;
    }
  }
}

const navItems = [
  { path: "/partner/dashboard", label: "Dashboard",  icon3d: "fluent-emoji-3d:bar-chart" },
  { path: "/partner/bookings",  label: "Bookings",   icon3d: "fluent-emoji-3d:package" },
  { path: "/partner/earnings",  label: "Earnings",   icon3d: "fluent-emoji-3d:money-bag" },
  { path: "/partner/onboarding",label: "Onboarding", icon3d: "fluent-emoji-3d:rocket" },
  { path: "/partner/compliance",label: "Compliance", icon3d: "fluent-emoji-3d:page-facing-up" },
  { path: "/partner/incidents", label: "Incidents",  icon3d: "fluent-emoji-3d:warning" },
  { path: "/partner/team",      label: "Team",       icon3d: "fluent-emoji-3d:busts-in-silhouette" },
  { path: "/partner/users",     label: "Users",      icon3d: "fluent-emoji-3d:identification-card", adminOnly: true },
  { path: "/partner/audit",     label: "Audit Log",  icon3d: "fluent-emoji-3d:magnifying-glass-tilted-right", adminOnly: true },
];

function ProfileEditDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only image files accepted", variant: "destructive" });
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name cannot be empty", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      if (photoFile) fd.append("photo", photoFile);

      const res = await fetch("/api/partner/profile", {
        method: "PATCH",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save");
      }
      toast({ title: "Profile updated" });
      // refreshUser re-fetches /api/auth/me and updates the auth context state
      // so the sidebar name/avatar updates immediately without a page reload
      await refreshUser();
      qc.invalidateQueries({ queryKey: ["/api/partner/me"] });
      onClose();
    } catch (err: any) {
      toast({ title: err.message ?? "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Edit Profile</DialogTitle>
      </DialogHeader>
      <div className="space-y-5 pt-1">
        {/* Avatar upload */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative group">
            <Avatar className="w-20 h-20 border-2 border-border cursor-pointer" onClick={() => fileRef.current?.click()}>
              <AvatarImage src={photoPreview ?? undefined} alt={name} />
              <AvatarFallback className="text-xl font-semibold bg-muted text-muted-foreground">
                {name?.charAt(0).toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Upload photo"
            >
              <Camera className="w-5 h-5 text-white" />
            </button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Camera className="w-3.5 h-3.5 mr-1.5" />
            {photoPreview ? "Replace photo" : "Upload photo"}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <Label>Display Name</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            data-testid="input-profile-name"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-profile">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Save changes"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

export function PartnerLayout({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const { data: ctx } = useQuery<any>({
    queryKey: ["/api/partner/me"],
  });

  const { data: dashboard } = useQuery<any>({
    queryKey: ["/api/partner/dashboard"],
  });

  const partner = ctx?.partner;
  const pendingBookings = dashboard?.stats?.pendingBookings ?? 0;
  const openIncidents = dashboard?.stats?.openIncidents ?? 0;
  const isOnboarding = partner?.status !== "active";

  const sidebarStyle = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3.5rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="partner-portal flex h-screen w-full overflow-hidden bg-background font-sans">
        <Sidebar>
          <SidebarHeader className="px-4 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
                <Building2 className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold truncate leading-tight">
                  {partner?.name ?? "Partner Portal"}
                </span>
                {partner?.status && (
                  <Badge
                    variant={partner.status === "active" ? "default" : "secondary"}
                    className="text-[10px] h-4 px-1.5 mt-0.5 w-fit"
                  >
                    {partner.status.replace("_", " ")}
                  </Badge>
                )}
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="py-2">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.filter(item => !item.adminOnly || ctx?.partnerUser?.partnerRole === "partner_admin").map((item) => {
                    const isActive = loc === item.path || loc.startsWith(item.path + "/");
                    const badge =
                      item.path === "/partner/bookings" && pendingBookings > 0
                        ? pendingBookings
                        : item.path === "/partner/incidents" && openIncidents > 0
                        ? openIncidents
                        : null;

                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <Link href={item.path}>
                            <iconify-icon icon={item.icon3d} width="20" height="20" style={{ display: "block", flexShrink: 0 }} />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {badge !== null && (
                          <SidebarMenuBadge data-testid={`badge-${item.label.toLowerCase()}`}>
                            {badge}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-border p-3">
            <div className="flex items-center gap-2">
              {/* Clickable profile area */}
              <button
                onClick={() => setProfileOpen(true)}
                className="flex items-center gap-2 flex-1 min-w-0 rounded-md p-1 -m-1 hover-elevate text-left"
                data-testid="button-edit-profile"
                title="Edit profile"
              >
                <div className="relative shrink-0">
                  <Avatar className="w-7 h-7">
                    <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.name} />
                    <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                      {user?.name?.charAt(0).toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-background border border-border flex items-center justify-center">
                    <Pencil className="w-2 h-2 text-muted-foreground" />
                  </div>
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium truncate leading-tight">
                    {user?.name ?? "Partner User"}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {ctx?.partnerUser?.partnerRole?.replace("partner_", "").replace(/_/g, " ") ?? ""}
                  </span>
                </div>
              </button>

              <Button
                size="icon"
                variant="ghost"
                onClick={logout}
                data-testid="button-logout"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <header className="flex items-center h-12 px-4 border-b border-border bg-background shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            {isOnboarding && partner && (
              <div className="ml-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">
                  Complete onboarding to go live
                </span>
                <Link href="/partner/onboarding">
                  <Button size="sm" variant="outline" data-testid="button-complete-onboarding">
                    Continue
                  </Button>
                </Link>
              </div>
            )}
          </header>
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>

      {/* Profile edit dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        {profileOpen && (
          <ProfileEditDialog user={user} onClose={() => setProfileOpen(false)} />
        )}
      </Dialog>
    </SidebarProvider>
  );
}
