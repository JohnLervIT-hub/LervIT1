import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Loader2, 
  Upload, 
  Truck, 
  User, 
  Camera, 
  FileText, 
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Shield
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";

const EARLY_ACCESS_TERMS = `LERVIT – EARLY ACCESS MOVER TERMS (PILOT)

Effective Date: Upon Acceptance
Program: Early Access (Pilot)

By clicking "I Agree", you ("Mover") agree to the following terms to participate in LervIT's Early Access pilot.

1. Early Access Status

You are approved to participate in LervIT's Early Access (Pilot).
Early Access does not mean "verified". Full verification requirements may be introduced later as the platform scales.

2. Independent Contractor Relationship

You are an independent contractor, not an employee, partner, or agent of LervIT.

You choose when, where, and whether to accept jobs.

You may work for other platforms or clients at any time.

LervIT does not provide wages, benefits, insurance, or equipment.

3. Vehicle, Insurance, and Responsibility

You confirm that:

You own or have lawful access to the vehicle you use.

You are responsible for maintaining valid auto insurance and any coverage required for your operations.

You are responsible for safe loading, transport, and delivery of items.

LervIT does not provide cargo, vehicle, or liability insurance for movers during the Early Access pilot.

4. Payments and Fees

You will be paid for completed jobs according to the app's pricing and payout rules.

LervIT may apply a platform service fee.
During Early Access, this fee may be reduced or refunded at LervIT's discretion.

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

LervIT may suspend or remove your Early Access status at any time, with or without notice, including for:

Safety concerns

Repeated no-shows

Customer complaints

Misrepresentation of vehicle or services

8. Limitation of Liability

To the maximum extent permitted by law:

LervIT is not responsible for loss, damage, or disputes arising from jobs accepted through the platform.

You agree to indemnify LervIT against claims arising from your actions as a mover.

9. Future Verification

You acknowledge that:

Additional verification (ID, insurance, background checks) may be required later

Continued access to the platform may depend on completing those steps

10. Acceptance

By clicking "I Agree", you confirm that:

You have read and understood these terms

You agree to participate as an independent contractor in the Early Access pilot`;

const VEHICLE_TYPES = [
  { value: "car", label: "SUV / Small Vehicle", description: "Small moves, single items" },
  { value: "pickup", label: "Pickup Truck", description: "Medium furniture, moderate loads" },
  { value: "van", label: "Cargo Van", description: "Large furniture, multiple rooms" },
  { value: "truck", label: "Moving Truck", description: "Full house moves" },
];

const STEPS = [
  { id: 1, title: "Profile Photo", icon: User, description: "Add a friendly photo" },
  { id: 2, title: "Vehicle Info", icon: Truck, description: "Tell us about your vehicle" },
  { id: 3, title: "Vehicle Photo", icon: Camera, description: "Show customers your vehicle" },
  { id: 4, title: "Bio", icon: FileText, description: "Introduce yourself" },
  { id: 5, title: "Terms", icon: Shield, description: "Accept platform terms" },
];

const TOTAL_STEPS = 5;

export default function MoverOnboardingWizard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [vehiclePhotoFile, setVehiclePhotoFile] = useState<File | null>(null);
  const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const termsScrollRef = useRef<HTMLDivElement | null>(null);

  const { data: mover, isLoading } = useQuery<any>({
    queryKey: [`/api/movers?userId=${user?.id}`],
    enabled: !!user?.id,
    select: (data) => (Array.isArray(data) ? data[0] : data),
  });

  useEffect(() => {
    if (mover) {
      if (mover.moverImage) setProfilePhotoPreview(mover.moverImage);
      if (mover.vehicleType) setVehicleType(mover.vehicleType);
      if (mover.vehicleColor) setVehicleColor(mover.vehicleColor);
      if (mover.licensePlate) setLicensePlate(mover.licensePlate);
      if (mover.vehiclePhoto) setVehiclePhotoPreview(mover.vehiclePhoto);
      if (mover.bio) setBio(mover.bio);
    }
  }, [mover]);

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("images", file);
      const response = await fetch("/api/upload/images", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      return { url: data.urls?.[0] || data.url };
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PATCH", `/api/movers/${mover?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/movers?userId=${user?.id}`] });
    },
  });

  const acceptTermsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/movers/terms/accept");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/movers/terms/status"] });
    },
  });

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/movers/${mover?.id}`, { onboardingCompleted: true });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: [`/api/movers?userId=${user?.id}`] });
      toast({
        title: "Welcome to LervIT!",
        description: "Your profile is complete and terms accepted. You're ready to start earning.",
      });
      setLocation("/mover-dashboard");
    },
  });

  const handleProfilePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfilePhotoFile(file);
      setProfilePhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleVehiclePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVehiclePhotoFile(file);
      setVehiclePhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      if (!profilePhotoFile && !profilePhotoPreview) {
        toast({ title: "Profile photo required", description: "Please upload a profile photo", variant: "destructive" });
        return;
      }
      if (profilePhotoFile) {
        try {
          const result = await uploadImageMutation.mutateAsync(profilePhotoFile);
          await updateProfileMutation.mutateAsync({ moverImage: result.url });
          setProfilePhotoFile(null);
        } catch (error) {
          toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
          return;
        }
      }
    }
    
    if (currentStep === 2) {
      if (!vehicleType) {
        toast({ title: "Vehicle type required", description: "Please select your vehicle type", variant: "destructive" });
        return;
      }
      try {
        await updateProfileMutation.mutateAsync({ vehicleType, vehicleColor, licensePlate });
      } catch (error) {
        toast({ title: "Save failed", description: "Please try again", variant: "destructive" });
        return;
      }
    }
    
    if (currentStep === 3) {
      if (!vehiclePhotoFile && !vehiclePhotoPreview) {
        toast({ title: "Vehicle photo required", description: "Please upload a photo of your vehicle", variant: "destructive" });
        return;
      }
      if (vehiclePhotoFile) {
        try {
          const result = await uploadImageMutation.mutateAsync(vehiclePhotoFile);
          await updateProfileMutation.mutateAsync({ vehiclePhoto: result.url });
          setVehiclePhotoFile(null);
        } catch (error) {
          toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
          return;
        }
      }
    }
    
    if (currentStep === 4) {
      try {
        if (bio) {
          await updateProfileMutation.mutateAsync({ bio });
        }
      } catch (error) {
        toast({ title: "Save failed", description: "Please try again", variant: "destructive" });
        return;
      }
    }

    if (currentStep === 5) {
      if (!termsAgreed) {
        toast({ title: "Terms required", description: "Please read and accept the terms to continue", variant: "destructive" });
        return;
      }
      try {
        await acceptTermsMutation.mutateAsync();
        await completeOnboardingMutation.mutateAsync();
      } catch (error) {
        toast({ title: "Failed to complete", description: "Please try again", variant: "destructive" });
        return;
      }
      return;
    }
    
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (isAtBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const isLoading_ = uploadImageMutation.isPending || updateProfileMutation.isPending || completeOnboardingMutation.isPending || acceptTermsMutation.isPending;
  const progress = (currentStep / TOTAL_STEPS) * 100;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Profile Setup</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">Complete Your Profile</h1>
          <p className="text-muted-foreground">
            Help customers find you by completing your mover profile
          </p>
        </div>

        <div className="mb-8">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between mt-4">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isComplete = currentStep > step.id;
              return (
                <div key={step.id} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      isComplete
                        ? "bg-primary text-primary-foreground"
                        : isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span className={`text-xs hidden md:block ${isActive ? "font-medium" : "text-muted-foreground"}`}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <Card className="p-6 md:p-8">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Add Your Profile Photo</h2>
                <p className="text-muted-foreground text-sm">
                  A friendly photo helps build trust with customers
                </p>
              </div>

              <div className="flex flex-col items-center gap-4">
                <Avatar className="h-32 w-32 border-4 border-primary/20">
                  {profilePhotoPreview ? (
                    <AvatarImage src={profilePhotoPreview} alt="Profile" />
                  ) : (
                    <AvatarFallback className="bg-muted">
                      <User className="h-16 w-16 text-muted-foreground" />
                    </AvatarFallback>
                  )}
                </Avatar>

                <Label
                  htmlFor="profile-photo"
                  className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover-elevate"
                  data-testid="button-upload-profile-photo"
                >
                  <Upload className="h-4 w-4" />
                  {profilePhotoPreview ? "Change Photo" : "Upload Photo"}
                </Label>
                <Input
                  id="profile-photo"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleProfilePhotoChange}
                  data-testid="input-profile-photo"
                />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Vehicle Information</h2>
                <p className="text-muted-foreground text-sm">
                  Tell customers about your moving vehicle
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Vehicle Type *</Label>
                  <Select value={vehicleType} onValueChange={setVehicleType}>
                    <SelectTrigger data-testid="select-vehicle-type">
                      <SelectValue placeholder="Select your vehicle type" />
                    </SelectTrigger>
                    <SelectContent>
                      {VEHICLE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex flex-col">
                            <span>{type.label}</span>
                            <span className="text-xs text-muted-foreground">{type.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Vehicle Color</Label>
                    <Input
                      placeholder="e.g., White"
                      value={vehicleColor}
                      onChange={(e) => setVehicleColor(e.target.value)}
                      data-testid="input-vehicle-color"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>License Plate</Label>
                    <Input
                      placeholder="e.g., ABC 123"
                      value={licensePlate}
                      onChange={(e) => setLicensePlate(e.target.value)}
                      data-testid="input-license-plate"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Vehicle Photo</h2>
                <p className="text-muted-foreground text-sm">
                  Show customers what vehicle you'll be using
                </p>
              </div>

              <div className="flex flex-col items-center gap-4">
                <div className="w-full aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center border-2 border-dashed border-muted-foreground/30">
                  {vehiclePhotoPreview ? (
                    <img
                      src={vehiclePhotoPreview}
                      alt="Vehicle"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Truck className="h-12 w-12 mx-auto mb-2" />
                      <p className="text-sm">No vehicle photo yet</p>
                    </div>
                  )}
                </div>

                <Label
                  htmlFor="vehicle-photo"
                  className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover-elevate"
                  data-testid="button-upload-vehicle-photo"
                >
                  <Camera className="h-4 w-4" />
                  {vehiclePhotoPreview ? "Change Photo" : "Upload Photo"}
                </Label>
                <Input
                  id="vehicle-photo"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleVehiclePhotoChange}
                  data-testid="input-vehicle-photo"
                />
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Introduce Yourself</h2>
                <p className="text-muted-foreground text-sm">
                  Write a short bio to help customers get to know you
                </p>
              </div>

              <div className="space-y-2">
                <Label>Your Bio</Label>
                <Textarea
                  placeholder="Tell customers about your experience, what makes you a great mover, and why they should choose you..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="min-h-32 resize-none"
                  maxLength={500}
                  data-testid="textarea-bio"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {bio.length}/500 characters
                </p>
              </div>

              <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">One more step!</p>
                    <p className="text-sm text-muted-foreground">
                      After this, you'll review and accept the platform terms.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Early Access Terms</h2>
                <p className="text-muted-foreground text-sm">
                  Please read and accept the following terms to start receiving job offers
                </p>
              </div>

              <div 
                className="border rounded-md p-4 max-h-[40vh] overflow-y-auto"
                onScroll={handleTermsScroll}
                ref={termsScrollRef}
                data-testid="terms-scroll-container"
              >
                <div className="whitespace-pre-wrap text-sm text-muted-foreground font-mono leading-relaxed">
                  {EARLY_ACCESS_TERMS}
                </div>
              </div>

              {!hasScrolledToBottom && (
                <p className="text-xs text-muted-foreground text-center">
                  Please scroll to the bottom to enable the checkbox
                </p>
              )}

              <div className="flex items-start gap-3 py-2">
                <Checkbox
                  id="terms-agreement"
                  checked={termsAgreed}
                  onCheckedChange={(checked) => setTermsAgreed(checked === true)}
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
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t">
            {currentStep > 1 ? (
              <Button variant="outline" onClick={handleBack} disabled={isLoading_} data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <Button onClick={handleNext} disabled={isLoading_ || (currentStep === 5 && !termsAgreed)} data-testid="button-next-step">
                {isLoading_ ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {currentStep === 5 ? (
                  <>
                    I Agree - Start Earning
                    <CheckCircle2 className="h-4 w-4 ml-2" />
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          You can always update your profile later in Settings
        </p>
      </div>
    </div>
  );
}
