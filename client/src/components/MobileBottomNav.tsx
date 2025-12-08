import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Home, 
  Calendar, 
  MessageCircle, 
  User, 
  Truck, 
  Settings, 
  Wallet,
  LayoutDashboard,
  Users,
  Shield,
  HelpCircle,
  Plus
} from "lucide-react";
import { motion } from "framer-motion";

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
}

export function MobileBottomNav() {
  const { user } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  const getNavItems = (): NavItem[] => {
    switch (user.role) {
      case "customer":
        return [
          { href: "/dashboard", icon: <Home className="w-5 h-5" />, label: "Home" },
          { href: "/my-bookings", icon: <Calendar className="w-5 h-5" />, label: "Bookings" },
          { href: "/request-move", icon: <Plus className="w-5 h-5" />, label: "New Move" },
          { href: "/support", icon: <HelpCircle className="w-5 h-5" />, label: "Support" },
          { href: "/profile", icon: <User className="w-5 h-5" />, label: "Profile" },
        ];
      case "mover":
        return [
          { href: "/mover-dashboard", icon: <Home className="w-5 h-5" />, label: "Jobs" },
          { href: "/mover-dashboard?tab=active", icon: <Truck className="w-5 h-5" />, label: "Active" },
          { href: "/mover-dashboard?tab=payouts", icon: <Wallet className="w-5 h-5" />, label: "Payouts" },
          { href: "/mover-settings", icon: <Settings className="w-5 h-5" />, label: "Settings" },
        ];
      case "admin":
        return [
          { href: "/admin", icon: <LayoutDashboard className="w-5 h-5" />, label: "Dashboard" },
          { href: "/admin/users", icon: <Users className="w-5 h-5" />, label: "Users" },
          { href: "/admin/verification", icon: <Shield className="w-5 h-5" />, label: "Verify" },
          { href: "/admin/support", icon: <HelpCircle className="w-5 h-5" />, label: "Support" },
        ];
      default:
        return [];
    }
  };

  const navItems = getNavItems();
  
  if (navItems.length === 0) return null;

  const isActive = (href: string) => {
    const [hrefPath, hrefQuery] = href.split("?");
    const currentPath = location.split("?")[0];
    const currentQuery = window.location.search;
    
    if (hrefQuery) {
      return currentPath === hrefPath && currentQuery.includes(hrefQuery);
    }
    
    const otherTabsForThisPath = navItems
      .filter(item => item.href !== href && item.href.startsWith(hrefPath + "?"))
      .some(item => {
        const itemQuery = item.href.split("?")[1];
        return currentQuery.includes(itemQuery);
      });
    
    if (otherTabsForThisPath) {
      return false;
    }
    
    return currentPath === hrefPath || location.startsWith(hrefPath + "/");
  };

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t md:hidden"
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <motion.button
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg min-w-[4rem] transition-colors ${
                  active 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                whileTap={{ scale: 0.95 }}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <motion.div
                  initial={false}
                  animate={active ? { scale: 1.1 } : { scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  {item.icon}
                </motion.div>
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                {active && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
