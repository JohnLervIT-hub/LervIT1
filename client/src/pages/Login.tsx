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
import { ThemeToggle } from "@/components/ThemeToggle";

function Icon({ kind, className = "", glow = "blue" }: { kind: "truck" | "pin" | "box"; className?: string; glow?: "blue" | "pink" | "orange" }) {
  const glowClass =
    glow === "pink"
      ? "drop-shadow-[0_0_18px_rgba(255,80,180,0.55)]"
      : glow === "orange"
      ? "drop-shadow-[0_0_18px_rgba(255,170,80,0.55)]"
      : "drop-shadow-[0_0_18px_rgba(80,160,255,0.55)]";

  return (
    <div className={`${className} ${glowClass} opacity-95`}>
      {kind === "truck" && (
        <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
          <path d="M6 38V18c0-2 2-4 4-4h26v24H6Z" stroke="rgba(130,190,255,0.9)" strokeWidth="2.5" />
          <path d="M36 22h12l8 8v8H36V22Z" stroke="rgba(130,190,255,0.9)" strokeWidth="2.5" />
          <circle cx="18" cy="42" r="4" stroke="rgba(255,190,90,0.9)" strokeWidth="2.5" />
          <circle cx="46" cy="42" r="4" stroke="rgba(255,190,90,0.9)" strokeWidth="2.5" />
        </svg>
      )}

      {kind === "pin" && (
        <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
          <path d="M32 58s18-16 18-30A18 18 0 0 0 14 28c0 14 18 30 18 30Z"
                stroke="rgba(255,120,200,0.9)" strokeWidth="2.5" />
          <circle cx="32" cy="28" r="6" stroke="rgba(180,230,255,0.9)" strokeWidth="2.5" />
        </svg>
      )}

      {kind === "box" && (
        <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
          <path d="M12 24 32 14l20 10v26L32 60 12 50V24Z" stroke="rgba(130,190,255,0.9)" strokeWidth="2.5" />
          <path d="M12 24l20 10 20-10" stroke="rgba(130,190,255,0.6)" strokeWidth="2.5" />
          <path d="M32 34v26" stroke="rgba(255,190,90,0.6)" strokeWidth="2.5" />
        </svg>
      )}
    </div>
  );
}

function LervitBackground() {
  return (
    <div className="absolute inset-0 z-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,#0E2A7A40,transparent_55%),radial-gradient(circle_at_15%_75%,#0B5DFF22,transparent_55%),radial-gradient(circle_at_85%_20%,#7A2EFF22,transparent_50%)]" />
      <div className="absolute inset-0 bg-[#050A14]" style={{ mixBlendMode: "overlay" }} />

      <svg className="absolute inset-0 h-full w-full opacity-70" viewBox="0 0 1440 900" preserveAspectRatio="none">
        <path d="M -50 250 C 280 120, 520 380, 760 250 S 1200 80, 1500 180"
              fill="none" stroke="rgba(90,170,255,0.35)" strokeWidth="3"
              strokeDasharray="8 12" strokeLinecap="round" />
        <path d="M -20 680 C 300 600, 520 760, 820 690 S 1250 560, 1500 640"
              fill="none" stroke="rgba(90,170,255,0.28)" strokeWidth="3"
              strokeDasharray="8 14" strokeLinecap="round" />
        <path d="M 120 420 C 340 520, 520 420, 720 520 S 1120 780, 1420 720"
              fill="none" stroke="rgba(90,170,255,0.22)" strokeWidth="3"
              strokeDasharray="7 16" strokeLinecap="round" />

        <circle r="6" fill="rgba(160,220,255,0.9)">
          <animateMotion dur="5.5s" repeatCount="indefinite" path="M -50 250 C 280 120, 520 380, 760 250 S 1200 80, 1500 180" />
          <animate attributeName="opacity" values="0;1;1;0" dur="5.5s" repeatCount="indefinite" />
        </circle>

        <circle r="5" fill="rgba(160,220,255,0.85)">
          <animateMotion dur="6.8s" repeatCount="indefinite" path="M -20 680 C 300 600, 520 760, 820 690 S 1250 560, 1500 640" />
          <animate attributeName="opacity" values="0;1;1;0" dur="6.8s" repeatCount="indefinite" />
        </circle>

        <circle r="4.5" fill="rgba(160,220,255,0.8)">
          <animateMotion dur="7.2s" repeatCount="indefinite" path="M 120 420 C 340 520, 520 420, 720 520 S 1120 780, 1420 720" />
          <animate attributeName="opacity" values="0;1;1;0" dur="7.2s" repeatCount="indefinite" />
        </circle>
      </svg>

      <Icon kind="truck" className="absolute left-4 sm:left-[6%] top-16 sm:top-[18%] w-10 sm:w-16 md:w-20 animate-floatSlow" glow="blue" />
      <Icon kind="pin" className="absolute right-4 sm:right-[10%] top-16 sm:top-[8%] w-10 sm:w-12 md:w-16 animate-pulseSoft" glow="pink" />
      <Icon kind="pin" className="absolute left-4 sm:left-[10%] bottom-20 sm:bottom-[12%] w-10 sm:w-12 md:w-16 animate-pulseSoft" glow="blue" />
      <Icon kind="box" className="absolute right-4 sm:right-[16%] top-1/3 sm:top-[36%] w-10 sm:w-18 md:w-24 animate-float" glow="blue" />
      <Icon kind="truck" className="absolute right-4 sm:right-[8%] bottom-20 sm:bottom-[10%] w-10 sm:w-16 md:w-20 animate-floatSlow" glow="orange" />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,10,20,0.2)_45%,rgba(5,10,20,0.75)_80%)]" />
    </div>
  );
}

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
    <div className="relative min-h-screen overflow-hidden bg-background dark:bg-[#050A14]">
      <div className="hidden dark:block">
        <LervitBackground />
      </div>
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <div className="relative z-10 flex min-h-screen items-center justify-center px-3 sm:px-4 py-6 sm:py-12">
      <Card className="w-full max-w-md bg-card dark:bg-[rgba(10,14,24,0.65)] border dark:border-white/[0.08] dark:backdrop-blur-[14px] shadow-lg dark:shadow-[0_25px_80px_rgba(0,0,0,0.55)] mx-2 sm:mx-0">
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
    </div>
  );
}
