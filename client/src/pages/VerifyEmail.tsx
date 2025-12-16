import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Mail, CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<"pending" | "success" | "error">("pending");
  const [errorMessage, setErrorMessage] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [emailFromApi, setEmailFromApi] = useState("");
  
  // Prevent duplicate verification calls
  const verificationAttemptedRef = useRef(false);
  const verificationInProgressRef = useRef(false);

  const userEmail = emailFromApi || user?.email || "";

  // Helper function to get dashboard based on user role
  const getDashboardRoute = (role: string) => {
    switch (role) {
      case 'mover': return '/mover-dashboard';
      case 'admin': return '/admin';
      default: return '/dashboard';
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    
    if (tokenParam) {
      // Only attempt verification once per page load
      if (verificationAttemptedRef.current || verificationInProgressRef.current) {
        return;
      }
      verificationAttemptedRef.current = true;
      setToken(tokenParam);
      verifyEmail(tokenParam);
    } else {
      // No token - user is here to see verification required message
      setIsLoading(false);
      // If user is logged in but not verified, show pending state
      if (user && !user.emailVerified) {
        setVerificationStatus("pending");
      } else if (user && user.emailVerified) {
        // Already verified, redirect to appropriate dashboard based on role
        setLocation(getDashboardRoute(user.role));
      } else {
        setVerificationStatus("error");
        setErrorMessage("No verification token found. Please check your email for the verification link.");
      }
    }
  }, [user]);

  const verifyEmail = async (verificationToken: string) => {
    // Prevent concurrent verification attempts
    if (verificationInProgressRef.current) {
      return;
    }
    verificationInProgressRef.current = true;
    
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: verificationToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.email) {
          setEmailFromApi(data.email);
        }
        throw new Error(data.error || "Failed to verify email");
      }

      setVerificationStatus("success");
      
      if (refreshUser) {
        await refreshUser();
      }
      
      toast({
        title: "Email verified!",
        description: "Your email has been successfully verified. Welcome to LervIT!",
      });
    } catch (error) {
      setVerificationStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Verification failed. Please try again.");
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Please try again or request a new verification link.",
      });
    } finally {
      setIsLoading(false);
      verificationInProgressRef.current = false;
    }
  };

  const handleResendVerification = async () => {
    if (!userEmail) {
      toast({
        variant: "destructive",
        title: "Email required",
        description: "Please log in to resend the verification email.",
      });
      setLocation("/login");
      return;
    }

    setIsResending(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to resend verification email");
      }

      toast({
        title: "Verification email sent!",
        description: "Please check your inbox for the new verification link.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to resend",
        description: error instanceof Error ? error.message : "Please try again later.",
      });
    } finally {
      setIsResending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary-foreground animate-spin" />
              </div>
            </div>
            <h1 className="text-2xl font-bold">Verifying Your Email</h1>
            <p className="text-muted-foreground">
              Please wait while we verify your email address...
            </p>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Show pending verification message when user needs to verify email
  if (verificationStatus === "pending" && user && !user.emailVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                <Mail className="w-8 h-8 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-2xl font-bold">Verify Your Email</h1>
            <p className="text-muted-foreground">
              Please verify your email address to access the dashboard
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              We've sent a verification link to <strong>{user.email}</strong>. 
              Please check your inbox and spam folder, then click the link to verify your account.
            </p>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm text-center">
                Didn't receive the email? Click below to resend.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button
              className="w-full"
              onClick={handleResendVerification}
              disabled={isResending}
              data-testid="button-resend-verification"
            >
              {isResending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Resend Verification Email
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                toast({
                  title: "Checking verification status...",
                  description: "Please wait...",
                });
                if (refreshUser) {
                  await refreshUser();
                }
                // After refresh, useEffect will handle redirect if verified
              }}
              data-testid="button-check-status"
            >
              I've Verified My Email
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (verificationStatus === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold">Email Verified!</h1>
            <p className="text-muted-foreground">
              Your email has been successfully verified. You can now use all features of LervIT.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Thank you for verifying your email address. Your account is now fully activated.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button
              className="w-full"
              onClick={() => setLocation(user ? getDashboardRoute(user.role) : "/dashboard")}
              data-testid="button-go-to-dashboard"
            >
              Go to Dashboard
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/")}
              data-testid="button-go-home"
            >
              Go to Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-destructive rounded-full flex items-center justify-center">
              <XCircle className="w-8 h-8 text-destructive-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Verification Failed</h1>
          <p className="text-muted-foreground">
            {errorMessage}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-center text-muted-foreground">
            The verification link may have expired or is invalid. You can request a new verification email below.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {userEmail ? (
            <Button
              className="w-full"
              onClick={handleResendVerification}
              disabled={isResending}
              data-testid="button-resend-verification"
            >
              {isResending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Resend Verification Email
                </>
              )}
            </Button>
          ) : (
            <p className="text-sm text-center text-muted-foreground mb-2">
              Please log in to request a new verification email.
            </p>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setLocation("/login")}
            data-testid="button-go-to-login"
          >
            {userEmail ? "Go to Login" : "Log In to Resend"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
