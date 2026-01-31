import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { FormFieldError } from "@/components/FormFieldError";
import { Truck, Eye, EyeOff, Loader2, Package, Users, Phone, ArrowLeft, CheckCircle, Mail } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

type SignupStep = "phone" | "otp" | "details" | "success";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { user, signup } = useAuth();
  const { toast } = useToast();
  
  // Step state
  const [step, setStep] = useState<SignupStep>("phone");
  
  // Phone verification state
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [verifiedToken, setVerifiedToken] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  
  // Account details state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("customer");
  const [isLoading, setIsLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  
  // Format phone number for display
  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
    return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  };
  
  // Clean phone number for API
  const cleanPhoneNumber = (value: string) => {
    return value.replace(/\D/g, "");
  };
  
  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  const validatePassword = (password: string) => {
    return password.length >= 6;
  };
  
  const getFieldError = (field: string): string | undefined => {
    if (!touched[field]) return undefined;
    
    switch (field) {
      case 'name':
        return name.length < 2 ? 'Name must be at least 2 characters' : undefined;
      case 'email':
        return !validateEmail(email) ? 'Please enter a valid email address' : undefined;
      case 'password':
        return !validatePassword(password) ? 'Password must be at least 6 characters' : undefined;
      default:
        return undefined;
    }
  };
  
  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  useEffect(() => {
    // Don't redirect if we're showing the success screen
    if (step === "success") return;
    
    if (user && !isLoading) {
      if (user.role === "customer") {
        setLocation("/dashboard");
      } else if (user.role === "mover") {
        setLocation("/mover-dashboard");
      } else if (user.role === "admin") {
        setLocation("/admin");
      }
    }
  }, [user, isLoading, setLocation, step]);

  // Dev code state (only used in development when SMS fails)
  const [devCode, setDevCode] = useState<string | null>(null);
  
  // SMS failed state - show email fallback option
  const [smsFailed, setSmsFailed] = useState(false);
  const [fallbackEmail, setFallbackEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  // Send OTP mutation
  const sendOtpMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      const response = await apiRequest("POST", "/api/auth/pre-signup/send-code", { phone: phoneNumber });
      return response.json();
    },
    onSuccess: (data) => {
      setStep("otp");
      // Track if SMS failed for email fallback
      if (data.smsFailed) {
        setSmsFailed(true);
        // In development, show the code if SMS failed
        if (data.devCode) {
          setDevCode(data.devCode);
          toast({
            title: "Code Sent (Dev Mode)",
            description: `SMS not configured. Your code is: ${data.devCode}`,
            duration: 30000,
          });
        } else {
          toast({
            title: "SMS Delivery Issue",
            description: "We couldn't send an SMS. You can receive your code via email instead.",
            duration: 10000,
          });
        }
      } else {
        setSmsFailed(false);
        toast({
          title: "Code Sent",
          description: "A 6-digit verification code has been sent to your phone.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to Send Code",
        description: error.message || "Please check your phone number and try again.",
      });
    },
  });

  // Send OTP via email fallback mutation
  const sendOtpViaEmailMutation = useMutation({
    mutationFn: async ({ phoneNumber, email }: { phoneNumber: string; email: string }) => {
      const response = await apiRequest("POST", "/api/auth/pre-signup/resend-via-email", { 
        phone: phoneNumber, 
        email 
      });
      return response.json();
    },
    onSuccess: (data) => {
      setEmailSent(true);
      toast({
        title: "Code Sent via Email",
        description: "Check your email for the verification code.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to Send Email",
        description: error.message || "Please try again.",
      });
    },
  });

  const handleSendViaEmail = () => {
    if (!validateEmail(fallbackEmail)) {
      toast({
        variant: "destructive",
        title: "Invalid Email",
        description: "Please enter a valid email address.",
      });
      return;
    }
    sendOtpViaEmailMutation.mutate({ 
      phoneNumber: cleanPhoneNumber(phone), 
      email: fallbackEmail 
    });
  };

  // Verify OTP mutation
  const verifyOtpMutation = useMutation({
    mutationFn: async ({ phoneNumber, code }: { phoneNumber: string; code: string }) => {
      const response = await apiRequest("POST", "/api/auth/pre-signup/verify-code", { 
        phone: phoneNumber, 
        code 
      });
      return response.json();
    },
    onSuccess: (data) => {
      setVerifiedToken(data.verifiedToken);
      setVerifiedPhone(data.phone);
      setStep("details");
      toast({
        title: "Phone Verified",
        description: "Your phone number has been verified. Complete your profile to continue.",
      });
    },
    onError: (error: Error) => {
      // Extract message from error (may be formatted as "400: {json}" or plain text)
      let errorMessage = "Invalid code. Please try again.";
      try {
        const match = error.message.match(/^\d+:\s*(.+)$/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          errorMessage = parsed.message || parsed.error || errorMessage;
        } else if (error.message) {
          errorMessage = error.message;
        }
      } catch {
        // Use default message
      }
      toast({
        variant: "destructive",
        title: "Verification Failed",
        description: errorMessage,
      });
    },
  });

  const handleSendOtp = () => {
    const cleanedPhone = cleanPhoneNumber(phone);
    if (cleanedPhone.length < 10) {
      toast({
        variant: "destructive",
        title: "Invalid Phone Number",
        description: "Please enter a valid 10-digit phone number.",
      });
      return;
    }
    sendOtpMutation.mutate(cleanedPhone);
  };

  const handleVerifyOtp = () => {
    if (otpCode.length !== 6) {
      toast({
        variant: "destructive",
        title: "Invalid Code",
        description: "Please enter the 6-digit verification code.",
      });
      return;
    }
    verifyOtpMutation.mutate({ phoneNumber: cleanPhoneNumber(phone), code: otpCode });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signup(name, email, password, role, verifiedPhone, verifiedToken);
      setIsLoading(false);
      // Show success screen with email verification instructions
      setStep("success");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Signup failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setIsLoading(false);
    }
  };
  
  // Navigate to appropriate dashboard based on role
  const goToDashboard = () => {
    if (role === "mover") {
      setLocation("/mover-dashboard");
    } else {
      setLocation("/dashboard");
    }
  };

  // Step 1: Phone Number Entry (Uber-style)
  if (step === "phone") {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center">
                <Phone className="w-7 h-7 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Enter your phone</h1>
            <p className="text-muted-foreground text-sm" data-testid="status-signup-step">
              We'll send you a code to verify your number
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(403) 555-1234"
                value={formatPhoneNumber(phone)}
                onChange={(e) => setPhone(cleanPhoneNumber(e.target.value))}
                className="h-12 text-lg"
                data-testid="input-phone"
                autoFocus
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-2">
            <Button
              onClick={handleSendOtp}
              className="w-full h-11"
              disabled={sendOtpMutation.isPending || cleanPhoneNumber(phone).length < 10}
              data-testid="button-send-code"
            >
              {sendOtpMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending code...
                </>
              ) : (
                "Continue"
              )}
            </Button>
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="text-primary font-medium hover:underline"
                data-testid="link-login"
              >
                Sign in
              </button>
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Step 2: OTP Verification (Uber-style)
  if (step === "otp") {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center pb-2">
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setOtpCode("");
              }}
              className="absolute left-4 top-4 p-2 hover:bg-muted rounded-full transition-colors"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Enter the code</h1>
            <p className="text-muted-foreground text-sm" data-testid="status-otp-sent">
              We sent a code to {formatPhoneNumber(phone)}
            </p>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otpCode}
                onChange={(value) => setOtpCode(value)}
                data-testid="input-otp-code"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Didn't receive a code?{" "}
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={sendOtpMutation.isPending}
                className="text-primary underline hover:no-underline"
                data-testid="button-resend-code"
              >
                Resend
              </button>
            </p>
            
            {/* Email fallback when SMS fails */}
            {smsFailed && !emailSent && (
              <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2 mb-3">
                  <Mail className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      SMS not delivered?
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                      Enter your email to receive the code instead
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={fallbackEmail}
                    onChange={(e) => setFallbackEmail(e.target.value)}
                    className="flex-1 h-9 text-sm"
                    data-testid="input-fallback-email"
                  />
                  <Button
                    size="sm"
                    onClick={handleSendViaEmail}
                    disabled={sendOtpViaEmailMutation.isPending || !fallbackEmail}
                    data-testid="button-send-via-email"
                  >
                    {sendOtpViaEmailMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Send"
                    )}
                  </Button>
                </div>
              </div>
            )}
            
            {/* Email sent confirmation */}
            {emailSent && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Code sent to {fallbackEmail}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-2">
            <Button
              onClick={handleVerifyOtp}
              className="w-full h-11"
              disabled={verifyOtpMutation.isPending || otpCode.length !== 6}
              data-testid="button-verify-code"
            >
              {verifyOtpMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify"
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Step 4: Success - Check Email (after account creation)
  if (step === "success") {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                <Mail className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Check Your Email</h1>
            <p className="text-muted-foreground" data-testid="status-signup-success">
              We've sent a verification link to
            </p>
            <p className="font-medium text-foreground" data-testid="text-verification-email">
              {email}
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                Click the link in the email to verify your account. If you don't see it, check your spam folder.
              </p>
            </div>
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm text-green-700 dark:text-green-400">
                Phone verified: {formatPhoneNumber(verifiedPhone)}
              </span>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button
              onClick={goToDashboard}
              className="w-full h-11"
              data-testid="button-continue-to-dashboard"
            >
              Continue to Dashboard
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              You can use the app while waiting for email verification
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Step 3: Account Details (after phone verification)
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center">
              <Truck className="w-7 h-7 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Complete your profile</h1>
          <p className="text-muted-foreground text-sm" data-testid="status-phone-verified">
            <span className="inline-flex items-center gap-1 text-green-600">
              <CheckCircle className="w-4 h-4" />
              {formatPhoneNumber(verifiedPhone)} verified
            </span>
          </p>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => handleBlur('name')}
                required
                className={`h-11 ${getFieldError('name') ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                data-testid="input-name"
                aria-invalid={!!getFieldError('name')}
                aria-describedby={getFieldError('name') ? 'name-error' : undefined}
              />
              <FormFieldError id="name-error" message={getFieldError('name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => handleBlur('email')}
                required
                className={`h-11 ${getFieldError('email') ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                data-testid="input-email"
                aria-invalid={!!getFieldError('email')}
                aria-describedby={getFieldError('email') ? 'email-error' : undefined}
              />
              <FormFieldError id="email-error" message={getFieldError('email')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => handleBlur('password')}
                  required
                  className={`h-11 pr-10 ${getFieldError('password') ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  data-testid="input-password"
                  aria-invalid={!!getFieldError('password')}
                  aria-describedby={getFieldError('password') ? 'password-error' : undefined}
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
              <FormFieldError id="password-error" message={getFieldError('password')} />
            </div>
            <div className="space-y-3">
              <Label>I want to</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("customer")}
                  aria-pressed={role === "customer"}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    role === "customer"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  }`}
                  data-testid="button-role-customer"
                >
                  <Package className="w-6 h-6" />
                  <span className="font-medium text-sm">Customer</span>
                  <span className="text-xs text-muted-foreground">Book a Move</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole("mover")}
                  aria-pressed={role === "mover"}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    role === "mover"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  }`}
                  data-testid="button-role-mover"
                >
                  <Users className="w-6 h-6" />
                  <span className="font-medium text-sm">Mover</span>
                  <span className="text-xs text-muted-foreground">Drive & Earn</span>
                </button>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-2">
            <Button
              type="submit"
              className="w-full h-11"
              disabled={isLoading}
              data-testid="button-signup"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="text-primary font-medium hover:underline"
                data-testid="link-login"
              >
                Sign in
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
