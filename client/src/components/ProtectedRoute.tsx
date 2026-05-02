import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
  redirectTo?: string;
  requireEmailVerification?: boolean;
}

export function ProtectedRoute({ children, allowedRoles, redirectTo, requireEmailVerification = true }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const hasRedirected = useRef(false);
  const mountTime = useRef(Date.now());

  useEffect(() => {
    if (isLoading) return;
    
    // Prevent multiple redirects
    if (hasRedirected.current) return;
    
    if (!user) {
      hasRedirected.current = true;
      const currentPath = window.location.pathname + window.location.search;
      setLocation(`/login?redirect=${encodeURIComponent(currentPath)}`);
      return;
    }
    
    // Check user role - ensure role exists before checking
    if (user.role && !allowedRoles.includes(user.role)) {
      hasRedirected.current = true;
      const roleRedirects: Record<string, string> = {
        customer: "/dashboard",
        mover: "/mover-dashboard",
        admin: "/admin",
        partner_admin: "/partner/dashboard",
        partner_dispatcher: "/partner/dashboard",
        partner_ops_manager: "/partner/dashboard",
        partner_viewer: "/partner/dashboard",
      };

      const targetRoute = redirectTo || roleRedirects[user.role] || "/";
      
      // Only show toast if this is a genuine access violation attempt (not from login redirect)
      // If we're within 2 seconds of mount and coming from login, skip the toast
      const timeSinceMount = Date.now() - mountTime.current;
      const comingFromLogin = document.referrer.includes('/login') || sessionStorage.getItem('justLoggedIn');
      
      if (timeSinceMount > 2000 && !comingFromLogin) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page.",
          variant: "destructive",
        });
      }
      
      setLocation(targetRoute);
      return;
    }
    
    // Clear the login flag once we've successfully accessed a page
    sessionStorage.removeItem('justLoggedIn');
    
    if (requireEmailVerification && !user.emailVerified && user.role !== 'admin') {
      hasRedirected.current = true;
      setLocation("/verify-email");
    }
  }, [user, isLoading, allowedRoles, redirectTo, setLocation, toast, requireEmailVerification]);

  // Show loading state while auth is initializing
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Don't render protected content for unauthorized users
  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Block access if email verification required but not verified (except admins)
  if (requireEmailVerification && !user.emailVerified && user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <>{children}</>;
}
