import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const activateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ActivateForm = z.infer<typeof activateSchema>;

export default function PartnerActivate() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string>("");
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token") || "";
    setToken(t);
  }, []);

  const { data: inviteInfo, isLoading: loadingInvite, error: inviteError } = useQuery<any>({
    queryKey: ["/api/partner/invite-info", token],
    queryFn: () => fetch(`/api/partner/invite-info?token=${token}`).then(r => r.ok ? r.json() : Promise.reject(r)),
    enabled: !!token,
    retry: false,
  });

  const form = useForm<ActivateForm>({
    resolver: zodResolver(activateSchema),
    defaultValues: { name: "", password: "", confirmPassword: "" },
  });

  const activate = useMutation({
    mutationFn: (data: ActivateForm) =>
      apiRequest("POST", "/api/partner/activate", { token, name: data.name, password: data.password }),
    onSuccess: () => {
      setActivated(true);
      setTimeout(() => setLocation("/login"), 2500);
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No invite token found in the URL.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (inviteError || !inviteInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This invite link is invalid, expired, or already used. Please contact your Lervit account manager.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <div>
              <h2 className="text-xl font-semibold">Account Activated!</h2>
              <p className="text-muted-foreground mt-1">Redirecting you to login…</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-md bg-primary">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle>Activate Your Partner Account</CardTitle>
          <CardDescription>
            You've been invited to join <strong>{inviteInfo.partnerName}</strong> as{" "}
            <strong>{inviteInfo.role.replace("partner_", "").replace("_", " ")}</strong>
          </CardDescription>
          <p className="text-sm text-muted-foreground mt-1">
            Signing up as <strong>{inviteInfo.email}</strong>
          </p>
        </CardHeader>
        <CardContent>
          {activate.error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {(activate.error as any)?.message || "Activation failed. Please try again."}
              </AlertDescription>
            </Alert>
          )}
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((d) => activate.mutate(d))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Smith" data-testid="input-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Create Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Minimum 8 characters" data-testid="input-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Repeat password" data-testid="input-confirm-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={activate.isPending}
                data-testid="button-activate"
              >
                {activate.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Activating…</>
                ) : (
                  "Activate Account"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
