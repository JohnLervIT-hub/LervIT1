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
  Smartphone,
  Calendar,
  Truck,
  DollarSign,
  Briefcase,
  FileCheck,
  AlertTriangle,
  Star
} from "lucide-react";
import { Link } from "wouter";
import { PhoneVerification } from "@/components/PhoneVerification";

type Mover = {
  id: string;
  vehicleType: string;
  rating: string;
  totalMoves: number;
  completedTrips: number;
  isVerified: boolean;
  profileVerified: boolean;
  documentsVerified: boolean;
  moverImage?: string;
};

type NotificationSettings = {
  emailJobAlerts: boolean;
  emailBookingUpdates: boolean;
  emailEarningsReports: boolean;
  smsJobAlerts: boolean;
  smsBookingUpdates: boolean;
  pushNotifications: boolean;
};

export default function MoverProfile() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [address, setAddress] = useState(user?.address || "");
  const [isUploading, setIsUploading] = useState(false);
  
  // Initialize notifications from user data (persisted in database)
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailJobAlerts: (user as any)?.emailJobAlerts ?? true,
    emailBookingUpdates: (user as any)?.emailBookingUpdates ?? true,
    emailEarningsReports: (user as any)?.emailEarningsReports ?? true,
    smsJobAlerts: (user as any)?.smsJobAlerts ?? true,
    smsBookingUpdates: (user as any)?.smsBookingUpdates ?? false,
    pushNotifications: (user as any)?.pushNotifications ?? true,
  });

  const { data: moverData } = useQuery<Mover>({
    queryKey: ["/api/movers/me"],
    enabled: !!user,
  });

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
    .toUpperCase() || "M";

  const avatarUrl = moverData?.moverImage || user.avatarUrl;

  return (
    <div className="min-h-screen pt-20 pb-12 bg-gradient-to-b from-blue-50/50 to-background dark:from-blue-950/20">
      <div className="max-w-2xl mx-auto px-4">
        <Link href="/mover-dashboard" data-testid="link-back-mover-dashboard">
          <Button variant="ghost" size="sm" className="mb-4">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="relative mb-8">
          <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-t-2xl" />
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
            <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
              <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
                <AvatarImage src={avatarUrl || undefined} alt={user.name || "Mover"} />
                <AvatarFallback className="text-2xl bg-blue-600 text-white">
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
                data-testid="input-mover-avatar-upload"
              />
            </div>
          </div>
        </div>

        <div className="text-center mt-14 mb-8">
          <h1 className="text-2xl font-bold" data-testid="text-mover-name">{user.name}</h1>
          <p className="text-muted-foreground" data-testid="text-mover-email">{user.email}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Badge className="bg-blue-600">
              <Truck className="w-3 h-3 mr-1" />
              Mover
            </Badge>
            {moverData?.isVerified && (
              <Badge variant="outline" className="border-blue-500 text-blue-600">
                <Check className="w-3 h-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>
          {moverData && (
            <div className="flex items-center justify-center gap-4 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500" />
                {parseFloat(moverData.rating || "0").toFixed(1)}
              </span>
              <span className="flex items-center gap-1">
                <Briefcase className="w-4 h-4" />
                {moverData.completedTrips} trips
              </span>
              <span className="flex items-center gap-1">
                <Truck className="w-4 h-4" />
                {moverData.vehicleType}
              </span>
            </div>
          )}
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
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
                data-testid="input-mover-profile-name"
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
                  data-testid="input-mover-profile-email"
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
                  data-testid="input-mover-profile-phone"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="address">Home Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter your address"
                  className="pl-10"
                  data-testid="input-mover-profile-address"
                />
              </div>
            </div>

            <Button 
              onClick={handleSaveProfile}
              disabled={updateProfileMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700"
              data-testid="button-save-mover-profile"
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

        <div className="mb-6">
          <PhoneVerification
            currentPhone={user.phone}
            isVerified={user.phoneVerified}
            onVerified={() => refreshUser()}
          />
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-600" />
              Notification Preferences
            </CardTitle>
            <CardDescription>
              Choose how you want to be notified about jobs and updates
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
                  <Label htmlFor="email-jobs">New Job Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when new jobs match your availability
                  </p>
                </div>
                <Switch
                  id="email-jobs"
                  checked={notifications.emailJobAlerts}
                  onCheckedChange={() => toggleNotification("emailJobAlerts")}
                  data-testid="switch-mover-email-jobs"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-booking">Booking Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Updates about your active and upcoming jobs
                  </p>
                </div>
                <Switch
                  id="email-booking"
                  checked={notifications.emailBookingUpdates}
                  onCheckedChange={() => toggleNotification("emailBookingUpdates")}
                  data-testid="switch-mover-email-booking"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="email-earnings">Earnings Reports</Label>
                  <p className="text-sm text-muted-foreground">
                    Weekly earnings summaries and payout notifications
                  </p>
                </div>
                <Switch
                  id="email-earnings"
                  checked={notifications.emailEarningsReports}
                  onCheckedChange={() => toggleNotification("emailEarningsReports")}
                  data-testid="switch-mover-email-earnings"
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
                  <Label htmlFor="sms-jobs">SMS Job Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Instant text alerts for new job opportunities
                  </p>
                </div>
                <Switch
                  id="sms-jobs"
                  checked={notifications.smsJobAlerts}
                  onCheckedChange={() => toggleNotification("smsJobAlerts")}
                  data-testid="switch-mover-sms-jobs"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sms-booking">SMS Booking Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Text updates about job status changes
                  </p>
                </div>
                <Switch
                  id="sms-booking"
                  checked={notifications.smsBookingUpdates}
                  onCheckedChange={() => toggleNotification("smsBookingUpdates")}
                  data-testid="switch-mover-sms-booking"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="push">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Real-time alerts on your device
                  </p>
                </div>
                <Switch
                  id="push"
                  checked={notifications.pushNotifications}
                  onCheckedChange={() => toggleNotification("pushNotifications")}
                  data-testid="switch-mover-push"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-blue-600" />
              Verification Status
            </CardTitle>
            <CardDescription>
              Your driver verification and compliance status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  moverData?.profileVerified 
                    ? "bg-blue-100 dark:bg-blue-900/30" 
                    : "bg-yellow-100 dark:bg-yellow-900/30"
                }`}>
                  {moverData?.profileVerified ? (
                    <Check className="w-5 h-5 text-blue-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium">Profile Verification</p>
                  <p className="text-sm text-muted-foreground">
                    {moverData?.profileVerified ? "Profile complete" : "Complete your profile"}
                  </p>
                </div>
              </div>
              <Badge className={moverData?.profileVerified ? "bg-blue-600" : "bg-yellow-500"}>
                {moverData?.profileVerified ? "Verified" : "Pending"}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  moverData?.documentsVerified 
                    ? "bg-blue-100 dark:bg-blue-900/30" 
                    : "bg-yellow-100 dark:bg-yellow-900/30"
                }`}>
                  {moverData?.documentsVerified ? (
                    <Check className="w-5 h-5 text-blue-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium">Document Verification</p>
                  <p className="text-sm text-muted-foreground">
                    {moverData?.documentsVerified ? "All documents approved" : "Upload required documents"}
                  </p>
                </div>
              </div>
              <Badge className={moverData?.documentsVerified ? "bg-blue-600" : "bg-yellow-500"}>
                {moverData?.documentsVerified ? "Verified" : "Pending"}
              </Badge>
            </div>

            <Link href="/mover-verification" data-testid="link-mover-verification">
              <Button variant="outline" className="w-full">
                <FileCheck className="w-4 h-4 mr-2" />
                Manage Verification Documents
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Account Security
            </CardTitle>
            <CardDescription>
              Manage your account security settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Check className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Email Verified</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <Badge className="bg-blue-600">Verified</Badge>
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

            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Earnings</p>
                  <p className="text-sm text-muted-foreground">
                    {moverData?.completedTrips || 0} completed trips
                  </p>
                </div>
              </div>
              <Link href="/mover-dashboard" data-testid="link-view-earnings">
                <Button variant="ghost" size="sm">View</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
