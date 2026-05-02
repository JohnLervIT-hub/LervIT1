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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Package, DollarSign, ClipboardCheck,
  FileCheck, AlertTriangle, Users, History, LogOut, Building2,
} from "lucide-react";

const navItems = [
  { path: "/partner/dashboard", label: "Dashboard",  icon: LayoutDashboard, bg: "from-indigo-500 to-violet-600" },
  { path: "/partner/bookings",  label: "Bookings",   icon: Package,          bg: "from-blue-500 to-blue-700" },
  { path: "/partner/earnings",  label: "Earnings",   icon: DollarSign,       bg: "from-amber-500 to-orange-600" },
  { path: "/partner/onboarding",label: "Onboarding", icon: ClipboardCheck,   bg: "from-violet-500 to-purple-700" },
  { path: "/partner/compliance",label: "Compliance", icon: FileCheck,        bg: "from-teal-500 to-cyan-600" },
  { path: "/partner/incidents", label: "Incidents",  icon: AlertTriangle,    bg: "from-red-500 to-rose-600" },
  { path: "/partner/team",      label: "Team",       icon: Users,            bg: "from-emerald-500 to-green-600" },
  { path: "/partner/audit",     label: "Audit Log",  icon: History,          bg: "from-slate-500 to-slate-700" },
];

export function PartnerLayout({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const { user, logout } = useAuth();

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
                  {navItems.map((item) => {
                    const isActive = loc === item.path || loc.startsWith(item.path + "/");
                    const Icon = item.icon;
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
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br ${item.bg} shrink-0`}>
                              <Icon className="w-3.5 h-3.5 text-white" />
                            </span>
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
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarFallback className="text-xs">
                  {user?.name?.charAt(0).toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium truncate leading-tight">
                  {user?.name ?? "Partner User"}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {ctx?.partnerUser?.partnerRole?.replace("partner_", "").replace(/_/g, " ") ?? ""}
                </span>
              </div>
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
    </SidebarProvider>
  );
}
