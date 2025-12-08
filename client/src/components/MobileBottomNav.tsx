import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
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

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
}

export function MobileBottomNav() {
  const { user } = useAuth();
  const [location] = useLocation();
  
  // Track full URL including query params for proper active state detection
  const [currentSearch, setCurrentSearch] = useState(window.location.search);
  
  // Update search params when URL changes (handles both navigation and history.replaceState)
  useEffect(() => {
    const updateSearch = () => setCurrentSearch(window.location.search);
    
    // Listen for popstate (browser back/forward)
    window.addEventListener('popstate', updateSearch);
    
    // Also check on location change from wouter
    updateSearch();
    
    return () => window.removeEventListener('popstate', updateSearch);
  }, [location]);

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
          { href: "/support", icon: <HelpCircle className="w-5 h-5" />, label: "Support" },
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
    
    // For items with query params (e.g., ?tab=active, ?tab=payouts)
    if (hrefQuery) {
      return currentPath === hrefPath && currentSearch.includes(hrefQuery);
    }
    
    // For items without query params (e.g., /mover-dashboard for "Jobs")
    // Check if any other nav item with query params for the same path is currently active
    const otherTabsForThisPath = navItems
      .filter(item => item.href !== href && item.href.startsWith(hrefPath + "?"))
      .some(item => {
        const itemQuery = item.href.split("?")[1];
        return currentSearch.includes(itemQuery);
      });
    
    // If another tab is active, this base item should not be active
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
              <button
                className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg min-w-[4rem] transition-colors active:scale-95 ${
                  active 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <div className={`transition-transform duration-150 ${active ? 'scale-110' : 'scale-100'}`}>
                  {item.icon}
                </div>
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                {active && (
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
