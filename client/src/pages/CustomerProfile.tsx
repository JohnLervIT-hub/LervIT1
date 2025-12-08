import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  User, 
  Camera, 
  Bell, 
  Mail, 
  Phone, 
  MapPin, 
  Shield, 
  Check, 
  Loader2,
  ChevronLeft,
  MessageSquare,
  Smartphone,
  Calendar,
  CreditCard,
  Plus,
  Trash2,
  Star
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Link } from "wouter";

type NotificationSettings = {
  emailBookingUpdates: boolean;
  emailPromotions: boolean;
  smsBookingUpdates: boolean;
  pushNotifications: boolean;
};

type SavedCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

function AddCardForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);

    const { error } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    });

    setIsProcessing(false);

    if (error) {
      toast({
        title: "Failed to save card",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Card saved",
        description: "Your payment method has been saved successfully.",
      });
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button 
        type="submit" 
        className="w-full" 
        disabled={!stripe || !elements || isProcessing}
        data-testid="button-save-card"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4 mr-2" />
            Save Card
          </>
        )}
      </Button>
    </form>
  );
}

export default function CustomerProfile() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [address, setAddress] = useState(user?.address || "");
  const [isUploading, setIsUploading] = useState(false);
  
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailBookingUpdates: true,
    emailPromotions: false,
    smsBookingUpdates: true,
    pushNotifications: true,
  });
  
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [setupClientSecret, setSetupClientSecret] = useState<string | null>(null);

  // Saved payment methods query
  const { data: savedCardsData, isLoading: isLoadingCards } = useQuery<{ paymentMethods: SavedCard[] }>({
    queryKey: ["/api/payment-methods"],
    enabled: !!user,
  });

  // Create setup intent for adding a new card
  const createSetupIntentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payment-methods/setup-intent", {});
      return res.json();
    },
    onSuccess: (data) => {
      setSetupClientSecret(data.clientSecret);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not initialize card setup. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete payment method mutation
  const deleteCardMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      return apiRequest("DELETE", `/api/payment-methods/${paymentMethodId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({
        title: "Card removed",
        description: "Your payment method has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not remove card. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Set default payment method mutation
  const setDefaultCardMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      return apiRequest("POST", `/api/payment-methods/${paymentMethodId}/set-default`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({
        title: "Default card updated",
        description: "Your default payment method has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not set default card. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddCard = () => {
    setAddCardOpen(true);
    createSetupIntentMutation.mutate();
  };

  const handleCardAdded = () => {
    setAddCardOpen(false);
    setSetupClientSecret(null);
    queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
  };

  const getCardBrandIcon = (brand: string) => {
    const brandLower = brand?.toLowerCase();
    if (brandLower === 'visa') return '💳 Visa';
    if (brandLower === 'mastercard') return '💳 Mastercard';
    if (brandLower === 'amex') return '💳 Amex';
    return '💳 Card';
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name: string; phone: string; address: string }) => {
      return apiRequest("PATCH", "/api/users/profile", data);
    },
    onSuccess: () => {
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Profile Updated",
        description: "Your personal information has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Could not update your profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("avatar", file);
      const response = await fetch("/api/users/avatar", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      return response.json();
    },
    onSuccess: () => {
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Photo Updated",
        description: "Your profile photo has been updated.",
      });
      setIsUploading(false);
    },
    onError: () => {
      toast({
        title: "Upload Failed",
        description: "Could not upload your photo. Please try again.",
        variant: "destructive",
      });
      setIsUploading(false);
    },
  });

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image under 5MB.",
          variant: "destructive",
        });
        return;
      }
      setIsUploading(true);
      uploadAvatarMutation.mutate(file);
    }
  };

  const handleSaveProfile = () => {
    updateProfileMutation.mutate({ name, phone, address });
  };

  const toggleNotification = (key: keyof NotificationSettings) => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
    toast({
      title: "Preference Updated",
      description: "Your notification preference has been saved.",
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">Please log in to view your profile.</p>
        </div>
      </div>
    );
  }

  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <div className="min-h-screen pt-20 pb-12 bg-gradient-to-b from-primary/5 to-background">
      <div className="max-w-2xl mx-auto px-4">
        <Link href="/dashboard" data-testid="link-back-dashboard">
          <Button variant="ghost" size="sm" className="mb-4">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="relative mb-8">
          <div className="h-32 bg-gradient-to-r from-primary to-primary/70 rounded-t-2xl" />
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
            <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
              <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
                <AvatarImage src={user.avatarUrl || undefined} alt={user.name || "User"} />
                <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                {isUploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-avatar-upload"
              />
            </div>
          </div>
        </div>

        <div className="text-center mt-14 mb-8">
          <h1 className="text-2xl font-bold" data-testid="text-user-name">{user.name}</h1>
          <p className="text-muted-foreground" data-testid="text-user-email">{user.email}</p>
          <Badge variant="secondary" className="mt-2">
            <User className="w-3 h-3 mr-1" />
            Customer
          </Badge>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Update your personal details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                data-testid="input-profile-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Input
                  id="email"
                  value={user.email}
                  disabled
                  className="bg-muted"
                  data-testid="input-profile-email"
                />
                <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Check className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(403) 555-0123"
                  className="pl-10"
                  data-testid="input-profile-phone"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address">Default Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter your default pickup address"
                  className="pl-10"
                  data-testid="input-profile-address"
                />
              </div>
            </div>

            <Button 
              onClick={handleSaveProfile}
              disabled={updateProfileMutation.isPending}
              className="w-full"
              data-testid="button-save-profile"
            >
              {updateProfileMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Notification Preferences
            </CardTitle>
            <CardDescription>
              Choose how you want to be notified
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Notifications
              </h4>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-booking">Booking Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when your booking status changes
                  </p>
                </div>
                <Switch
                  id="email-booking"
                  checked={notifications.emailBookingUpdates}
                  onCheckedChange={() => toggleNotification("emailBookingUpdates")}
                  data-testid="switch-email-booking"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-promo">Promotions & Offers</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive deals and special offers
                  </p>
                </div>
                <Switch
                  id="email-promo"
                  checked={notifications.emailPromotions}
                  onCheckedChange={() => toggleNotification("emailPromotions")}
                  data-testid="switch-email-promo"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Smartphone className="w-4 h-4" />
                SMS & Push Notifications
              </h4>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sms-booking">SMS Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Get text messages for important updates
                  </p>
                </div>
                <Switch
                  id="sms-booking"
                  checked={notifications.smsBookingUpdates}
                  onCheckedChange={() => toggleNotification("smsBookingUpdates")}
                  data-testid="switch-sms-booking"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="push">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive real-time updates on your device
                  </p>
                </div>
                <Switch
                  id="push"
                  checked={notifications.pushNotifications}
                  onCheckedChange={() => toggleNotification("pushNotifications")}
                  data-testid="switch-push"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Saved Payment Methods */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Saved Payment Methods
            </CardTitle>
            <CardDescription>
              Manage your saved cards for faster checkout
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingCards ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : savedCardsData?.paymentMethods && savedCardsData.paymentMethods.length > 0 ? (
              <div className="space-y-3">
                {savedCardsData.paymentMethods.map((card) => (
                  <div 
                    key={card.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    data-testid={`card-payment-method-${card.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          {getCardBrandIcon(card.brand)} •••• {card.last4}
                          {card.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              <Star className="w-3 h-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Expires {card.expMonth.toString().padStart(2, '0')}/{card.expYear.toString().slice(-2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!card.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefaultCardMutation.mutate(card.id)}
                          disabled={setDefaultCardMutation.isPending}
                          data-testid={`button-set-default-${card.id}`}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteCardMutation.mutate(card.id)}
                        disabled={deleteCardMutation.isPending}
                        className="text-destructive hover:text-destructive"
                        data-testid={`button-delete-card-${card.id}`}
                        aria-label="Delete payment card"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <CreditCard className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No saved payment methods</p>
                <p className="text-sm">Add a card for faster checkout</p>
              </div>
            )}

            <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleAddCard}
                  data-testid="button-add-card"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Card
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Payment Method</DialogTitle>
                  <DialogDescription>
                    Add a new card for faster checkout on future bookings
                  </DialogDescription>
                </DialogHeader>
                {setupClientSecret ? (
                  <Elements 
                    stripe={stripePromise} 
                    options={{ 
                      clientSecret: setupClientSecret,
                      appearance: { theme: 'stripe' }
                    }}
                  >
                    <AddCardForm onSuccess={handleCardAdded} />
                  </Elements>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Account Security
            </CardTitle>
            <CardDescription>
              Manage your account security settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Email Verified</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <Badge className="bg-green-500">Verified</Badge>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Member Since</p>
                  <p className="text-sm text-muted-foreground">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { 
                      month: 'long', 
                      year: 'numeric' 
                    }) : 'Recently joined'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
