import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { FormFieldError } from "@/components/FormFieldError";
import { Truck, Eye, EyeOff, Loader2 } from "lucide-react";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { user, signup } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("customer");
  const [isLoading, setIsLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  
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
    if (user && !isLoading) {
      if (user.role === "customer") {
        setLocation("/dashboard");
      } else if (user.role === "mover") {
        setLocation("/mover-dashboard");
      } else if (user.role === "admin") {
        setLocation("/admin");
      }
    }
  }, [user, isLoading, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signup(name, email, password, role, phone);
      setIsLoading(false);
      toast({
        title: "Account created!",
        description: "Welcome to LervIT!",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Signup failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setIsLoading(false);
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
          <h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
          <p className="text-muted-foreground text-sm">
            Join LervIT to get moving
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
              <FormFieldError message={getFieldError('name')} />
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
              <FormFieldError message={getFieldError('email')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(403) 555-1234"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11"
                data-testid="input-phone"
              />
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
              <FormFieldError message={getFieldError('password')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">I want to</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="role" className="h-11" data-testid="select-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Find movers for my move</SelectItem>
                  <SelectItem value="mover">Become a mover and earn</SelectItem>
                </SelectContent>
              </Select>
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
