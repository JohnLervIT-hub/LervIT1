import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Badge } from "@/components/ui/badge";
import { Phone, CheckCircle, Loader2, Send } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PhoneVerificationProps {
  currentPhone?: string | null;
  isVerified?: boolean;
  onVerified?: () => void;
}

export function PhoneVerification({ currentPhone, isVerified, onVerified }: PhoneVerificationProps) {
  const [phone, setPhone] = useState(currentPhone || "");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const { toast } = useToast();

  const sendCodeMutation = useMutation({
    mutationFn: async (phoneNumber: string) => {
      return apiRequest("POST", "/api/auth/send-phone-verification", { phone: phoneNumber });
    },
    onSuccess: () => {
      setCodeSent(true);
      toast({
        title: "Code Sent",
        description: "A verification code has been sent to your phone.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send Code",
        description: error.message || "Please check your phone number and try again.",
        variant: "destructive",
      });
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async (verificationCode: string) => {
      return apiRequest("POST", "/api/auth/verify-phone", { code: verificationCode });
    },
    onSuccess: () => {
      setCodeSent(false);
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Phone Verified",
        description: "Your phone number has been verified successfully!",
      });
      onVerified?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Invalid or expired code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendCode = () => {
    if (phone.length < 10) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number.",
        variant: "destructive",
      });
      return;
    }
    sendCodeMutation.mutate(phone);
  };

  const handleVerifyCode = () => {
    if (code.length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter the 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }
    verifyCodeMutation.mutate(code);
  };

  if (isVerified && currentPhone) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Phone Number
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground" data-testid="text-verified-phone">{currentPhone}</span>
            <Badge className="bg-green-500 hover-elevate" data-testid="badge-phone-verified">
              <CheckCircle className="h-3 w-3 mr-1" />
              Verified
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Verify Your Phone
        </CardTitle>
        <CardDescription data-testid="status-phone-verification">
          {codeSent
            ? "Enter the 6-digit code sent to your phone"
            : "Add and verify your phone number to receive SMS updates"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!codeSent ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(403) 555-0123"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="input-phone"
              />
            </div>
            <Button
              onClick={handleSendCode}
              disabled={sendCodeMutation.isPending || phone.length < 10}
              className="w-full"
              data-testid="button-send-code"
            >
              {sendCodeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Verification Code
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={(value) => setCode(value)}
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
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCodeSent(false);
                  setCode("");
                }}
                className="flex-1"
                data-testid="button-change-phone"
              >
                Change Number
              </Button>
              <Button
                onClick={handleVerifyCode}
                disabled={verifyCodeMutation.isPending || code.length !== 6}
                className="flex-1"
                data-testid="button-verify-code"
              >
                {verifyCodeMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Verify
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Didn't receive a code?{" "}
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sendCodeMutation.isPending}
                className="text-primary underline hover:no-underline"
                data-testid="button-resend-code"
              >
                Resend
              </button>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
