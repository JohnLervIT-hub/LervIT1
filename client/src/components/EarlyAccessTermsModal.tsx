import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, FileText, CheckCircle } from "lucide-react";

const EARLY_ACCESS_TERMS = `LERVIT – EARLY ACCESS MOVER TERMS (PILOT)

Effective Date: Upon Acceptance
Program: Early Access (Pilot)

By clicking "I Agree", you ("Mover") agree to the following terms to participate in Lervit's Early Access pilot.

1. Early Access Status

You are approved to participate in Lervit's Early Access (Pilot).
Early Access does not mean "verified". Full verification requirements may be introduced later as the platform scales.

2. Independent Contractor Relationship

You are an independent contractor, not an employee, partner, or agent of Lervit.

You choose when, where, and whether to accept jobs.

You may work for other platforms or clients at any time.

Lervit does not provide wages, benefits, insurance, or equipment.

3. Vehicle, Insurance, and Responsibility

You confirm that:

You own or have lawful access to the vehicle you use.

You are responsible for maintaining valid auto insurance and any coverage required for your operations.

You are responsible for safe loading, transport, and delivery of items.

Lervit does not provide cargo, vehicle, or liability insurance for movers during the Early Access pilot.

4. Payments and Fees

You will be paid for completed jobs according to the app's pricing and payout rules.

Lervit may apply a platform service fee.
During Early Access, this fee may be reduced or refunded at Lervit's discretion.

You are responsible for your own taxes, including GST/HST if applicable.

5. Job Acceptance and Conduct

You may freely accept or decline any job.

If you accept a job, you agree to:

Contact the customer promptly

Arrive on time

Perform the job professionally and safely

Unsafe behavior, fraud, or misuse of the platform may result in suspension or removal.

6. Communications

You agree to receive transactional communications (SMS, calls, in-app notifications) related to:

Job offers

Job updates

Payouts

Account status

You may opt out of non-essential messages where applicable.

7. Suspension or Removal

Lervit may suspend or remove your Early Access status at any time, with or without notice, including for:

Safety concerns

Repeated no-shows

Customer complaints

Misrepresentation of vehicle or services

8. Limitation of Liability

To the maximum extent permitted by law:

Lervit is not responsible for loss, damage, or disputes arising from jobs accepted through the platform.

You agree to indemnify Lervit against claims arising from your actions as a mover.

9. Future Verification

You acknowledge that:

Additional verification (ID, insurance, background checks) may be required later

Continued access to the platform may depend on completing those steps

10. Acceptance

By clicking "I Agree", you confirm that:

You have read and understood these terms

You agree to participate as an independent contractor in the Early Access pilot`;

interface EarlyAccessTermsModalProps {
  open: boolean;
  onAccept: () => void;
}

export function EarlyAccessTermsModal({ open, onAccept }: EarlyAccessTermsModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const acceptTermsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/movers/terms/accept");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Terms Accepted",
        description: "You can now receive and accept job offers on LervIT.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/movers/terms/status"] });
      onAccept();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept terms. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (isAtBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleAccept = () => {
    if (!agreed) return;
    acceptTermsMutation.mutate();
  };

  useEffect(() => {
    if (open) {
      setAgreed(false);
      setHasScrolledToBottom(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-2xl max-h-[90vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Early Access Mover Terms
          </DialogTitle>
          <DialogDescription>
            Please read and accept the following terms to start receiving job offers.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea 
          className="flex-1 border rounded-md p-4 max-h-[50vh]"
          onScrollCapture={handleScroll}
          ref={scrollRef}
        >
          <div className="whitespace-pre-wrap text-sm text-muted-foreground font-mono leading-relaxed">
            {EARLY_ACCESS_TERMS}
          </div>
        </ScrollArea>

        {!hasScrolledToBottom && (
          <p className="text-xs text-muted-foreground text-center">
            Please scroll to the bottom to enable the checkbox
          </p>
        )}

        <div className="flex items-start gap-3 py-2">
          <Checkbox
            id="terms-agreement"
            checked={agreed}
            onCheckedChange={(checked) => setAgreed(checked === true)}
            disabled={!hasScrolledToBottom}
            data-testid="checkbox-terms-agreement"
          />
          <label
            htmlFor="terms-agreement"
            className={`text-sm leading-tight cursor-pointer ${
              !hasScrolledToBottom ? "text-muted-foreground" : ""
            }`}
          >
            I have read and agree to the Early Access Mover Terms. I understand that I am participating as an independent contractor.
          </label>
        </div>

        <DialogFooter>
          <Button
            onClick={handleAccept}
            disabled={!agreed || acceptTermsMutation.isPending}
            className="w-full sm:w-auto"
            data-testid="button-accept-terms"
          >
            {acceptTermsMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Accepting...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                I Agree - Start Earning
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
