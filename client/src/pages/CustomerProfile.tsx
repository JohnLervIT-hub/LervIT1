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
  Star,
  CheckCircle,
  MoreVertical
} from "lucide-react";
import { SiVisa, SiMastercard, SiAmericanexpress, SiDiscover } from "react-icons/si";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Link } from "wouter";
import { PhoneVerification } from "@/components/PhoneVerification";

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

// Lazy-load Stripe with key from server (handles dev/prod automatically)
let stripePromiseCache: ReturnType<typeof loadStripe> | null = null;
const getStripePromise = (): ReturnType<typeof loadStripe> => {
  if (!stripePromiseCache) {
    stripePromiseCache = fetch('/api/config/stripe-public-key')
      .then(res => res.json())
      .then(data => {
        if (!data.publicKey) {
          console.error('Missing Stripe public key from server');
          return null;
        }
        return loadStripe(data.publicKey);
      })
      .catch(err => {
        console.error('Failed to fetch Stripe config:', err);
        return null;
      });
  }
  return stripePromiseCache;
};

// Initialize immediately for Elements component
const stripePromise = getStripePromise();

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

type SavedAddress = { id: string; label: string; address: string };

function SavedAddressesCard() {
  const { toast } = useToast();
  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [adding, setAdding] = useState(false);

  const { data: addresses, isLoading } = useQuery<SavedAddress[]>({
    queryKey: ["/api/addresses"],
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/addresses", { label: newLabel.trim(), address: newAddress.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/addresses"] });
      toast({ title: "Address saved" });
      setNewLabel("");
      setNewAddress("");
      setAdding(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save address", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/addresses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/addresses"] });
      toast({ title: "Address removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove address", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          Saved Addresses
        </CardTitle>
        <CardDescription>Quick-select addresses when booking a move (max 5)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : addresses && addresses.length > 0 ? (
          <div className="space-y-2">
            {addresses.map((addr) => (
              <div key={addr.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-sm">{addr.label}</p>
                  <p className="text-xs text-muted-foreground">{addr.address}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(addr.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-address-${addr.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">No saved addresses yet</p>
        )}

        {!adding ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => setAdding(true)}
            disabled={(addresses?.length ?? 0) >= 5}
            data-testid="button-add-address"
          >
            <Plus className="w-4 h-4" /> Add Address
          </Button>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="space-y-1">
              <Label htmlFor="addr-label" className="text-xs">Label (e.g. "Home", "Office")</Label>
              <Input id="addr-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Home" data-testid="input-address-label" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="addr-address" className="text-xs">Full address</Label>
              <Input id="addr-address" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="123 Main St, Calgary, AB" data-testid="input-address-value" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => addMutation.mutate()} disabled={!newLabel.trim() || !newAddress.trim() || addMutation.isPending} data-testid="button-save-address">
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewLabel(""); setNewAddress(""); }}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
  
  // Initialize notifications from user data (persisted in database)
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailBookingUpdates: (user as any)?.emailBookingUpdates ?? true,
    emailPromotions: (user as any)?.emailPromotions ?? false,
    smsBookingUpdates: (user as any)?.smsBookingUpdates ?? false,
    pushNotifications: (user as any)?.pushNotifications ?? true,
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
    switch (brandLower) {
      case 'visa':
        return <SiVisa className="w-8 h-8 text-[#1A1F71]" />;
      case 'mastercard':
        return <SiMastercard className="w-8 h-8 text-[#EB001B]" />;
      case 'amex':
      case 'american_express':
        return <SiAmericanexpress className="w-8 h-8 text-[#006FCF]" />;
      case 'discover':
        return <SiDiscover className="w-8 h-8 text-[#FF6000]" />;
      default:
        return <CreditCard className="w-8 h-8 text-muted-foreground" />;
    }
  };

  const getCardBrandName = (brand: string) => {
    const brandLower = brand?.toLowerCase();
    switch (brandLower) {
      case 'visa': return 'Visa';
      case 'mastercard': return 'Mastercard';
      case 'amex':
      case 'american_express': return 'American Express';
      case 'discover': return 'Discover';
      default: return 'Card';
    }
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

  // Mutation to save notification preferences to database
  const updateNotificationMutation = useMutation({
    mutationFn: async (updates: Partial<NotificationSettings>) => {
      return apiRequest("PATCH", "/api/users/profile", updates);
    },
    onSuccess: () => {
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Could not save notification preference. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleNotification = (key: keyof NotificationSettings) => {
    const newValue = !notifications[key];
    setNotifications(prev => ({
      ...prev,
      [key]: newValue,
    }));
    // Save to database
    updateNotificationMutation.mutate({ [key]: newValue });
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

        {/* Show PhoneVerification component only if NOT verified */}
        {!user.phoneVerified && (
          <div className="mb-6">
            <PhoneVerification
              currentPhone={user.phone}
              isVerified={user.phoneVerified}
              onVerified={() => refreshUser()}
            />
          </div>
        )}

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
                    className={`relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                      card.isDefault 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                    data-testid={`card-payment-method-${card.id}`}
                  >
                    {/* Card Brand Icon */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-white dark:bg-muted flex items-center justify-center shadow-sm border">
                      {getCardBrandIcon(card.brand)}
                    </div>
                    
                    {/* Card Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {getCardBrandName(card.brand)}
                        </span>
                        <span className="text-muted-foreground">
                          •••• {card.last4}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-muted-foreground">
                          Expires {card.expMonth.toString().padStart(2, '0')}/{card.expYear.toString().slice(-2)}
                        </span>
                        {card.isDefault && (
                          <div className="flex items-center gap-1 text-primary">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-xs font-medium">Default</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0"
                          data-testid={`button-card-menu-${card.id}`}
                        >
                          <MoreVertical className="w-5 h-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!card.isDefault && (
                          <DropdownMenuItem
                            onClick={() => setDefaultCardMutation.mutate(card.id)}
                            disabled={setDefaultCardMutation.isPending}
                            data-testid={`button-set-default-${card.id}`}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Set as default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => deleteCardMutation.mutate(card.id)}
                          disabled={deleteCardMutation.isPending}
                          className="text-destructive focus:text-destructive"
                          data-testid={`button-delete-card-${card.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove card
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

        {/* Saved Addresses */}
        <SavedAddressesCard />

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

            {/* Phone Verification Badge - shown only when verified */}
            {user.phoneVerified && (
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg" data-testid="security-phone-verified">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">Phone Verified</p>
                    <p className="text-sm text-muted-foreground">{user.phone}</p>
                  </div>
                </div>
                <Badge className="bg-green-500">Verified</Badge>
              </div>
            )}
            
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
