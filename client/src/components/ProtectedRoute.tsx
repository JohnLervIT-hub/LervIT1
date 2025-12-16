import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect } from "react";
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

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        setLocation("/login");
      } else if (!allowedRoles.includes(user.role)) {
        const roleRedirects: Record<string, string> = {
          customer: "/dashboard",
          mover: "/mover-dashboard",
          admin: "/admin",
        };

        const targetRoute = redirectTo || roleRedirects[user.role] || "/";
        
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page.",
          variant: "destructive",
        });
        
        setLocation(targetRoute);
      } else if (requireEmailVerification && !user.emailVerified && user.role !== 'admin') {
        // Redirect to email verification page if email not verified
        setLocation("/verify-email");
      }
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
