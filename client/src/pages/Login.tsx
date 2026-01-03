import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Truck, Eye, EyeOff, Loader2, Lock, AlertTriangle, ShieldAlert } from "lucide-react";

type LockoutError = {
  locked: boolean;
  lockedByAdmin: boolean;
  message: string;
  remainingMinutes?: number;
};

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lockoutError, setLockoutError] = useState<LockoutError | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  useEffect(() => {
    if (user && !isLoading) {
      const params = new URLSearchParams(window.location.search);
      const redirectPath = params.get('redirect');
      
      console.log('[Login] Redirect check:', {
        user: !!user,
        isLoading,
        redirectPath,
        fullSearch: window.location.search
      });
      
      if (redirectPath) {
        console.log('[Login] Redirecting to:', redirectPath);
        setLocation(redirectPath);
      } else {
        if (user.role === "customer") {
          setLocation("/dashboard");
        } else if (user.role === "mover") {
          setLocation("/mover-dashboard");
        } else if (user.role === "admin") {
          setLocation("/admin");
        }
      }
    }
  }, [user, isLoading, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLockoutError(null);
    setRemainingAttempts(null);

    try {
      await login(email, password);
      // Mark that we just logged in to prevent false "Access Denied" toasts
      sessionStorage.setItem('justLoggedIn', 'true');
      setIsLoading(false);
      toast({
        title: "Welcome back!",
        description: "You've successfully logged in.",
      });
    } catch (error: any) {
      setIsLoading(false);
      
      // Check if this is a lockout error
      if (error.locked) {
        setLockoutError({
          locked: true,
          lockedByAdmin: error.lockedByAdmin || false,
          message: error.message,
          remainingMinutes: error.remainingMinutes,
        });
      } else if (error.remainingAttempts !== undefined) {
        // Show remaining attempts warning
        setRemainingAttempts(error.remainingAttempts);
        toast({
          variant: "destructive",
          title: "Incorrect password",
          description: error.message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: error.message || "Please try again.",
        });
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center">
              <Truck className="w-7 h-7 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-muted-foreground text-sm">
            Sign in to continue to LervIT
          </p>
        </CardHeader>

        {/* Account Lockout Alert */}
        {lockoutError && (
          <div className="px-6 pb-2">
            <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
              {lockoutError.lockedByAdmin ? (
                <ShieldAlert className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              <AlertTitle className="font-semibold">
                {lockoutError.lockedByAdmin ? "Account Suspended" : "Account Temporarily Locked"}
              </AlertTitle>
              <AlertDescription className="mt-1 text-sm">
                {lockoutError.message}
                {!lockoutError.lockedByAdmin && (
                  <p className="mt-2 text-xs">
                    You can try again after the lockout period expires, or{" "}
                    <button
                      type="button"
                      onClick={() => setLocation("/forgot-password")}
                      className="underline font-medium"
                    >
                      reset your password
                    </button>.
                  </p>
                )}
                {lockoutError.lockedByAdmin && (
                  <p className="mt-2 text-xs">
                    Please contact support at{" "}
                    <a href="mailto:support@lervit.com" className="underline font-medium">
                      support@lervit.com
                    </a>{" "}
                    for assistance.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Remaining Attempts Warning */}
        {remainingAttempts !== null && remainingAttempts <= 2 && !lockoutError && (
          <div className="px-6 pb-2">
            <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="font-semibold text-amber-700 dark:text-amber-400">
                Warning
              </AlertTitle>
              <AlertDescription className="text-sm text-amber-700 dark:text-amber-400">
                {remainingAttempts === 1 
                  ? "This is your last attempt before your account is locked."
                  : `${remainingAttempts} attempts remaining before account lockout.`
                }
              </AlertDescription>
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => setLocation("/forgot-password")}
                  className="text-sm text-primary hover:underline"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-11 pr-10"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-2">
            <Button
              type="submit"
              className="w-full h-11"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Don't have an account? </span>
              <button
                type="button"
                onClick={() => setLocation("/signup")}
                className="text-primary font-medium hover:underline"
                data-testid="link-signup"
              >
                Sign up
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
