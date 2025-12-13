import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Camera, Calendar, CreditCard, Truck, Sparkles, ArrowRight, Check, Gift } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface WelcomeTutorialProps {
  isOpen: boolean;
  onComplete: () => void;
  userName: string;
}

const tutorialSteps = [
  {
    icon: Sparkles,
    title: "Welcome to LervIT!",
    description: "We're Calgary's smartest moving platform. Let us show you how easy it is to book a move.",
    highlight: "10% OFF your first move!",
    highlightColor: "bg-green-500",
  },
  {
    icon: MapPin,
    title: "Step 1: Enter Locations",
    description: "Tell us where you're moving from and to. We'll calculate the distance and give you an instant price estimate.",
    tip: "Choose access types (ground floor, stairs, elevator) for accurate pricing.",
  },
  {
    icon: Camera,
    title: "Step 2: Upload Photos",
    description: "Take photos of what you're moving. Our AI will identify items and recommend the right vehicle and number of movers.",
    tip: "Better photos = more accurate quotes!",
  },
  {
    icon: Calendar,
    title: "Step 3: Pick a Date & Pay",
    description: "Choose your preferred moving date and time. Review your price breakdown and pay securely with Stripe.",
    tip: "Prices are transparent - no hidden fees!",
  },
  {
    icon: Truck,
    title: "Step 4: Meet Your Mover",
    description: "We'll match you with a verified local mover. Track their arrival in real-time and communicate through the app.",
    tip: "All our movers are background-checked.",
  },
];

export function WelcomeTutorial({ isOpen, onComplete, userName }: WelcomeTutorialProps) {
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
    } catch (error) {
      console.error("Failed to mark onboarding complete:", error);
    }
    setIsCompleting(false);
    onComplete();
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
      <DialogContent className="sm:max-w-md" data-testid="dialog-welcome-tutorial">
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
              data-testid="button-skip-tutorial"
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
            Customer onboarding tutorial - Step {currentStep + 1} of {tutorialSteps.length}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 text-center">
          {isFirstStep && (
            <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
          )}
          <p className="text-muted-foreground mb-4">{step.description}</p>
          
          {step.highlight && (
            <Badge className={`${step.highlightColor} text-white px-4 py-2 text-sm`}>
              <Gift className="w-4 h-4 mr-2" />
              {step.highlight}
            </Badge>
          )}
          
          {step.tip && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Tip:</span> {step.tip}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          {!isFirstStep && (
            <Button
              variant="outline"
              onClick={handleBack}
              data-testid="button-tutorial-back"
            >
              Back
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={isCompleting}
            className="flex-1"
            data-testid="button-tutorial-next"
          >
            {isLastStep ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Get Started
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

export default WelcomeTutorial;
