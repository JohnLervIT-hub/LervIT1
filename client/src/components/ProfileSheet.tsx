import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "./ThemeToggle";
import { useState } from "react";
import {
  User,
  LogOut,
  Settings,
  Wallet,
  HelpCircle,
  Calendar,
  Truck,
  Shield,
  LayoutDashboard,
  Users,
  ChevronRight,
  Moon,
  Bell,
} from "lucide-react";

export function ProfileSheet() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  // Fetch mover profile to get mover image for movers
  const { data: moverData } = useQuery<{ moverImage?: string }>({
    queryKey: ["/api/movers/me"],
    enabled: !!user && user.role === "mover",
  });

  if (!user) return null;

  // Use mover image for movers, fallback to user avatarUrl
  const avatarUrl = user.role === "mover" ? (moverData?.moverImage || user.avatarUrl) : user.avatarUrl;

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    setLocation("/");
  };

  const handleNavigation = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getMenuItems = () => {
    switch (user.role) {
      case "customer":
        return [
          { href: "/profile", icon: User, label: "My Profile" },
          { href: "/inbox", icon: Bell, label: "Notifications" },
          { href: "/my-bookings", icon: Calendar, label: "My Bookings" },
          { href: "/support", icon: HelpCircle, label: "Help & Support" },
        ];
      case "mover":
        return [
          { href: "/mover-profile", icon: User, label: "My Profile" },
          { href: "/inbox", icon: Bell, label: "Notifications" },
          { href: "/mover-settings", icon: Settings, label: "Settings" },
          { href: "/mover-dashboard?tab=payouts", icon: Wallet, label: "Earnings & Payouts" },
          { href: "/mover-verification", icon: Shield, label: "Verification" },
          { href: "/support", icon: HelpCircle, label: "Help & Support" },
        ];
      case "admin":
        return [
          { href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
          { href: "/inbox", icon: Bell, label: "Notifications" },
          { href: "/admin/users", icon: Users, label: "Manage Users" },
          { href: "/admin/verification", icon: Shield, label: "Verification" },
          { href: "/admin/support", icon: HelpCircle, label: "Support Tickets" },
        ];
      default:
        return [];
    }
  };

  const menuItems = getMenuItems();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full p-0 h-9 w-9 hover-elevate active-elevate-2"
          data-testid="button-profile-sheet"
          aria-label="Open profile menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatarUrl || undefined} alt={user.name} />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 p-0">
        <SheetHeader className="p-6 pb-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={avatarUrl || undefined} alt={user.name} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left">
              <SheetTitle className="text-lg font-semibold">{user.name}</SheetTitle>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                {user.role}
              </span>
            </div>
          </div>
        </SheetHeader>

        <Separator />

        <div className="p-2">
          {menuItems.map((item) => (
            <button
              key={item.href}
              onClick={() => handleNavigation(item.href)}
              className="flex items-center justify-between w-full px-4 py-3 rounded-lg text-left hover-elevate active-elevate-2 transition-colors"
              data-testid={`link-sheet-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">{item.label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        <Separator />

        <div className="p-4">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              <Moon className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">Dark Mode</span>
            </div>
            <ThemeToggle />
          </div>
        </div>

        <Separator />

        <div className="p-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleLogout}
            data-testid="button-sheet-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Log Out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
