import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Package,
  ClipboardCheck,
  FileCheck,
  AlertTriangle,
  Users,
  LogOut,
  History,
  DollarSign,
  Building2,
} from "lucide-react";

const navItems = [
  { path: "/partner/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/partner/bookings", label: "Bookings", icon: Package },
  { path: "/partner/earnings", label: "Earnings", icon: DollarSign },
  { path: "/partner/onboarding", label: "Onboarding", icon: ClipboardCheck },
  { path: "/partner/compliance", label: "Compliance", icon: FileCheck },
  { path: "/partner/incidents", label: "Incidents", icon: AlertTriangle },
  { path: "/partner/team", label: "Team", icon: Users },
  { path: "/partner/audit", label: "Audit Log", icon: History },
];

export function PartnerLayout({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const { user, logout } = useAuth();

  const { data: ctx } = useQuery<any>({ queryKey: ["/api/partner/me"] });
  const { data: dashboard } = useQuery<any>({ queryKey: ["/api/partner/dashboard"] });

  const partner = ctx?.partner;
  const pendingBookings = dashboard?.stats?.pendingBookings ?? 0;
  const openIncidents = dashboard?.stats?.openIncidents ?? 0;

  const sidebarStyle = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar>
          {/* Brand header */}
          <SidebarHeader className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-6 h-6 shrink-0">
                <Building2 className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate leading-tight text-foreground">
                  {partner?.name ?? "Partner Portal"}
                </span>
                <span className="text-[11px] text-muted-foreground leading-tight">
                  {partner?.status === "active" ? "Active" : partner?.status?.replace(/_/g, " ") ?? ""}
                </span>
              </div>
            </div>
          </SidebarHeader>

          {/* Nav */}
          <SidebarContent className="py-2">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => {
                    const isActive = loc === item.path || loc.startsWith(item.path + "/");
                    const Icon = item.icon;
                    const count =
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
                          <Link href={item.path} className="flex items-center justify-between w-full">
                            <span className="flex items-center gap-2.5">
                              <Icon className="w-4 h-4 shrink-0" />
                              <span className="text-sm">{item.label}</span>
                            </span>
                            {count !== null && (
                              <span
                                className="text-[11px] font-medium tabular-nums text-muted-foreground ml-auto"
                                data-testid={`badge-${item.label.toLowerCase()}`}
                              >
                                {count}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          {/* Footer */}
          <SidebarFooter className="border-t border-border px-3 py-3">
            <div className="flex items-center gap-2.5">
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarFallback className="text-[10px] font-medium">
                  {user?.name?.charAt(0).toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-medium truncate leading-tight">
                  {user?.name ?? "Partner User"}
                </span>
                <span className="text-[11px] text-muted-foreground truncate capitalize leading-tight">
                  {ctx?.partnerUser?.partnerRole?.replace("partner_", "").replace(/_/g, " ") ?? ""}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={logout}
                data-testid="button-logout"
                title="Sign out"
                className="h-7 w-7 shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <header className="flex items-center h-11 px-4 border-b border-border bg-background shrink-0 gap-3">
            <SidebarTrigger data-testid="button-sidebar-toggle" className="h-7 w-7" />
            {partner && partner.status !== "active" && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    Onboarding incomplete
                  </span>
                  <Link href="/partner/onboarding">
                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2" data-testid="button-complete-onboarding">
                      Continue →
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </header>
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
