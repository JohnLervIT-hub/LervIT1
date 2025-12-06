import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, HelpCircle, MessageSquare, FileCheck, LayoutDashboard, Users, Truck, Calendar, DollarSign } from "lucide-react";

export function AdminNav() {
  const [location] = useLocation();
  
  const isActive = (path: string) => {
    if (path === "/admin") return location === "/admin";
    return location.startsWith(path);
  };

  const navItems = [
    { path: "/admin", label: "Overview", icon: LayoutDashboard, testId: "link-admin" },
    { path: "/admin/users", label: "Users", icon: Users, testId: "link-admin-users" },
    { path: "/admin/movers", label: "Movers", icon: Truck, testId: "link-admin-movers" },
    { path: "/admin/moves", label: "Moves", icon: Calendar, testId: "link-admin-moves" },
    { path: "/admin/revenue", label: "Revenue", icon: DollarSign, testId: "link-admin-revenue" },
    { path: "/admin/verification", label: "Verify", icon: FileCheck, testId: "link-admin-verification" },
    { path: "/admin/support", label: "Support", icon: MessageSquare, testId: "link-admin-support" },
  ];

  return (
    <nav className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-3 py-2 rounded-xl shadow-lg shadow-blue-500/20">
      <div className="flex items-center gap-1 mr-2 pr-3 border-r border-white/20">
        <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-semibold text-sm hidden lg:block">Admin</span>
      </div>
      
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.path);
        return (
          <Link key={item.path} href={item.path} data-testid={item.testId}>
            <Button 
              variant="ghost" 
              size="sm"
              className={`text-white/90 hover:text-white hover:bg-white/20 transition-all ${
                active 
                  ? "bg-white/25 text-white shadow-sm" 
                  : ""
              }`}
            >
              <Icon className="w-4 h-4 lg:mr-2" />
              <span className="hidden lg:inline">{item.label}</span>
            </Button>
          </Link>
        );
      })}
    </nav>
  );
}
