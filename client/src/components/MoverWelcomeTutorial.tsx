import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, Check, User, Bell, Wallet, Shield, Truck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface MoverWelcomeTutorialProps {
  isOpen: boolean;
  onComplete: () => void;
  userName: string;
}

const tutorialSteps = [
  {
    icon: Sparkles,
    title: "Welcome to LervIT!",
    description: "You're joining Calgary's smartest moving platform. Let us show you how to start earning.",
    highlight: "Earn on Your Schedule",
    highlightColor: "bg-primary",
  },
  {
    icon: User,
    title: "Complete Your Profile",
    description: "Add a professional photo, write a friendly bio, and add your vehicle details. Complete profiles get more job offers!",
    tip: "Customers choose movers they can trust - a great profile helps you stand out.",
  },
  {
    icon: Bell,
    title: "How Job Notifications Work",
    description: "When a customer books a move near you, you'll receive a notification. Accept quickly to secure the job - first come, first served!",
    tip: "Toggle 'Online' to start receiving job notifications.",
  },
  {
    icon: Wallet,
    title: "Complete Moves & Earn",
    description: "After completing a move, you'll see your earnings in the Payouts tab. We handle all payments securely through Stripe.",
    tip: "Platform fee is 15% - you keep 85% of every job!",
  },
  {
    icon: Shield,
    title: "Get Verified",
    description: "Complete your verification to earn a Verified badge. Verified movers get more visibility and customer trust.",
    tip: "Upload your driver's license and vehicle documents to get verified.",
  },
];

export function MoverWelcomeTutorial({ isOpen, onComplete, userName }: MoverWelcomeTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await apiRequest("PATCH", "/api/users/profile", {
        hasCompletedOnboarding: true,
      });
      // Invalidate auth cache to update user state
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (error) {
      console.error("Failed to mark onboarding complete:", error);
    } finally {
      setIsCompleting(false);
      onComplete();
    }
  };

  const handleSkip = async () => {
    await handleComplete();
  };

  const step = tutorialSteps[currentStep];
  const StepIcon = step.icon;
  const isLastStep = currentStep === tutorialSteps.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-mover-welcome-tutorial">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-1">
              {tutorialSteps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 w-8 rounded-full transition-colors ${
                    index <= currentStep ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-muted-foreground text-xs"
              data-testid="button-skip-mover-tutorial"
            >
              Skip
            </Button>
          </div>
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <StepIcon className="w-8 h-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            {isFirstStep ? `Hey ${userName.split(" ")[0]}!` : step.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Mover onboarding tutorial - Step {currentStep + 1} of {tutorialSteps.length}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 text-center">
          {isFirstStep && (
            <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
          )}
          <p className="text-muted-foreground mb-4">{step.description}</p>
          
          {step.highlight && (
            <Badge className={`${step.highlightColor} text-white px-6 py-3 text-base`}>
              <Truck className="w-4 h-4 mr-2" />
              {step.highlight}
            </Badge>
          )}
          
          {step.tip && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Pro Tip:</span> {step.tip}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          {!isFirstStep && (
            <Button
              variant="outline"
              onClick={handleBack}
              data-testid="button-mover-tutorial-back"
            >
              Back
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={isCompleting}
            className="flex-1"
            data-testid="button-mover-tutorial-next"
          >
            {isLastStep ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Start Earning
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MoverWelcomeTutorial;
