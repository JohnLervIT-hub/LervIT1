import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useCallback } from "react";
import { 
  Home, 
  Calendar,
  Clock,
  Truck, 
  Wallet,
  LayoutDashboard,
  Users,
  Plus,
  Inbox
} from "lucide-react";

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
}

export function MobileBottomNav() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  
  const [currentSearch, setCurrentSearch] = useState(window.location.search);
  
  useEffect(() => {
    const updateSearch = () => setCurrentSearch(window.location.search);
    window.addEventListener('popstate', updateSearch);
    updateSearch();
    return () => window.removeEventListener('popstate', updateSearch);
  }, [location]);

  const handleNavClick = useCallback((href: string) => {
    setLocation(href);
    const newSearch = href.includes('?') ? '?' + href.split('?')[1] : '';
    setCurrentSearch(newSearch);
    window.dispatchEvent(new CustomEvent('lervit-navigation', { detail: { href, search: newSearch } }));
  }, [setLocation]);

  if (!user) return null;

  const getNavItems = (): NavItem[] => {
    switch (user.role) {
      case "customer":
        return [
          { href: "/dashboard",             icon: <Home className="w-5 h-5" />,     label: "Home" },
          { href: "/my-bookings",            icon: <Calendar className="w-5 h-5" />, label: "Bookings" },
          { href: "/dashboard?tab=past",     icon: <Clock className="w-5 h-5" />,    label: "Activity" },
          { href: "/request-move",           icon: <Plus className="w-5 h-5" />,     label: "New Move", accent: true },
        ];
      case "mover":
        return [
          { href: "/mover-dashboard",               icon: <Home className="w-5 h-5" />,   label: "Jobs" },
          { href: "/mover-dashboard?tab=active",     icon: <Truck className="w-5 h-5" />,  label: "Active" },
          { href: "/mover-dashboard?tab=payouts",    icon: <Wallet className="w-5 h-5" />, label: "Payouts" },
        ];
      case "admin":
        return [
          { href: "/admin",         icon: <LayoutDashboard className="w-5 h-5" />, label: "Dashboard" },
          { href: "/admin/users",   icon: <Users className="w-5 h-5" />,           label: "Users" },
          { href: "/admin/support", icon: <Inbox className="w-5 h-5" />,           label: "Tickets" },
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
    
    if (hrefQuery) {
      return currentPath === hrefPath && currentSearch.includes(hrefQuery);
    }
    
    const otherTabsForThisPath = navItems
      .filter(item => item.href !== href && item.href.startsWith(hrefPath + "?"))
      .some(item => {
        const itemQuery = item.href.split("?")[1];
        return currentSearch.includes(itemQuery);
      });
    
    if (otherTabsForThisPath) return false;
    return currentPath === hrefPath || location.startsWith(hrefPath + "/");
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden px-4"
      style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="bg-card border border-border rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] flex items-center justify-around h-16 px-1 max-w-md mx-auto">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const isAccent = item.accent;

          return (
            <button
              key={item.href}
              onClick={() => handleNavClick(item.href)}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl min-w-[3.5rem] flex-1 transition-colors active:scale-95 ${
                active
                  ? isAccent ? "text-primary" : "text-primary"
                  : "text-muted-foreground"
              }`}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              {/* Active background pill */}
              {active && !isAccent && (
                <div className="absolute inset-x-1 inset-y-0.5 rounded-xl bg-primary/8" />
              )}

              {/* Icon — accent items get a filled circle */}
              <div className={`relative transition-transform duration-150 ${active ? 'scale-110' : 'scale-100'}`}>
                {isAccent ? (
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition-colors ${
                    active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                  }`}>
                    {item.icon}
                  </div>
                ) : (
                  item.icon
                )}
              </div>

              {/* Label — hidden for accent items when not active to keep it compact */}
              <span className={`text-[10px] font-medium leading-tight transition-opacity ${
                isAccent && !active ? "opacity-0 h-0 overflow-hidden" : "opacity-100"
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
