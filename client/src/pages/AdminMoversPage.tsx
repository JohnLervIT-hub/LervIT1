import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Truck, ArrowLeft, Search, CheckCircle, XCircle, Star, RefreshCw, Upload, Camera, Loader2, UserCheck, CreditCard } from "lucide-react";
import { useState, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Mover = {
  id: string;
  userId: string;
  vehicleType: string;
  vehiclePhoto?: string;
  vehiclePhotoUrl?: string;
  profilePhotoUrl?: string;
  isVerified: boolean;
  rating: string;
  totalMoves: number;
  isAvailable: boolean;
  onboardingCompleted?: boolean;
  user: {
    name: string;
    email: string;
    phone?: string;
    avatarUrl?: string;
  } | null;
  stripeConnect: {
    status: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  } | null;
};

export default function AdminMoversPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const initialStatus = searchParams.get("status") || "all";
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedMover, setSelectedMover] = useState<Mover | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: moversData, isLoading, error } = useQuery<Mover[]>({
    queryKey: ["/api/movers"],
  });
  const movers = Array.isArray(moversData) ? moversData : [];

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/sync-mover-counters");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/movers"] });
      
      console.log('[Sync Diagnostics]', data.diagnostics);
      
      const statusCounts = data.diagnostics?.bookingStatusCounts || [];
      const completedCount = statusCounts.find((s: any) => s.status === 'completed')?.count || 0;
      const totalBookings = statusCounts.reduce((sum: number, s: any) => sum + s.count, 0);
      
      toast({
        title: "Mover counts synced",
        description: `Updated ${data.updates?.length || 0} mover(s). Found ${completedCount} completed bookings out of ${totalBookings} total.`,
      });
    },
    onError: () => {
      toast({
        title: "Sync failed",
        description: "Could not sync mover counts. Please try again.",
        variant: "destructive",
      });
    },
  });

  const syncStripeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/sync-stripe-accounts");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to sync Stripe accounts");
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/movers"] });
      
      toast({
        title: "Stripe accounts synced",
        description: `Synced ${data.synced} account(s): ${data.created} created, ${data.updated} updated.`,
      });
    },
    onError: (error: any) => {
      console.error('Stripe sync error:', error);
      toast({
        title: "Stripe sync failed",
        description: error?.message || "Could not sync Stripe accounts. Please try again.",
        variant: "destructive",
      });
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async ({ moverId, file }: { moverId: string; file: File }) => {
      const formData = new FormData();
      formData.append("images", file);
      const uploadResponse = await fetch("/api/upload/images", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!uploadResponse.ok) throw new Error("Upload failed");
      const uploadData = await uploadResponse.json();
      const photoUrl = uploadData.urls?.[0];

      const updateResponse = await apiRequest("PATCH", `/api/movers/${moverId}`, {
        vehiclePhoto: photoUrl,
      });
      return updateResponse.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/movers"] });
      toast({
        title: "Vehicle photo uploaded",
        description: `Successfully updated ${selectedMover?.user?.name || "mover"}'s vehicle photo.`,
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Upload failed",
        description: "Could not upload the vehicle photo. Please try again.",
        variant: "destructive",
      });
    },
  });

  const overrideOnboardingMutation = useMutation({
    mutationFn: async (moverId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/movers/${moverId}/override-onboarding`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/movers"] });
      toast({
        title: "Onboarding Override Applied",
        description: `${selectedMover?.user?.name || "Mover"} can now access their dashboard without completing onboarding.`,
      });
      handleCloseDialog();
    },
    onError: () => {
      toast({
        title: "Override failed",
        description: "Could not override onboarding. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (mover: Mover) => {
    setSelectedMover(mover);
    setSelectedFile(null);
    setPreviewUrl(mover.vehiclePhoto || null);
    setUploadDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setUploadDialogOpen(false);
    setSelectedMover(null);
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image under 5MB.",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = () => {
    if (selectedMover && selectedFile) {
      uploadPhotoMutation.mutate({ moverId: selectedMover.id, file: selectedFile });
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">This page is only available for administrators.</p>
        </div>
      </div>
    );
  }

  const filteredMovers = movers.filter(m => {
    const matchesSearch = 
      m.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.vehicleType?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = 
      statusFilter === "all" ||
      (statusFilter === "verified" && m.isVerified) ||
      (statusFilter === "unverified" && !m.isVerified) ||
      (statusFilter === "available" && m.isAvailable);
    
    return matchesSearch && matchesStatus;
  });

  const verifiedCount = movers.filter(m => m.isVerified).length;
  const unverifiedCount = movers.filter(m => !m.isVerified).length;
  const availableCount = movers.filter(m => m.isAvailable).length;

  return (
    <div className="min-h-screen pt-24 pb-12 bg-gradient-to-b from-green-50/50 to-background dark:from-green-950/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20" data-testid="button-back-admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-600 rounded-lg">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">All Movers</h1>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => syncStripeMutation.mutate()}
                disabled={syncStripeMutation.isPending}
                data-testid="button-sync-stripe-accounts"
              >
                <CreditCard className={`w-4 h-4 mr-2 ${syncStripeMutation.isPending ? 'animate-spin' : ''}`} />
                {syncStripeMutation.isPending ? 'Syncing...' : 'Sync Stripe'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                data-testid="button-sync-mover-counts"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                {syncMutation.isPending ? 'Syncing...' : 'Sync Mover Counts'}
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground text-lg">Manage registered movers and their verification status</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("verified")}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verified</CardTitle>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{verifiedCount}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("unverified")}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unverified</CardTitle>
              <XCircle className="w-4 h-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{unverifiedCount}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("available")}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available Now</CardTitle>
              <Truck className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{availableCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle>Mover List ({filteredMovers.length})</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search movers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-movers"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Movers</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="unverified">Unverified</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading movers...</div>
            ) : filteredMovers.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Photo</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Moves</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Stripe</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovers.map((m) => (
                      <TableRow 
                        key={m.id} 
                        data-testid={`row-mover-${m.id}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleOpenDialog(m)}
                      >
                        <TableCell className="font-medium">
                          {m.user?.name || "Unknown Mover"}
                        </TableCell>
                        <TableCell>{m.user?.email || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{m.vehicleType || "Not specified"}</Badge>
                        </TableCell>
                        <TableCell>
                          {m.vehiclePhoto ? (
                            <div className="w-12 h-12 rounded overflow-hidden bg-muted">
                              <img 
                                src={m.vehiclePhoto} 
                                alt="Vehicle" 
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">No photo</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                            <span>{parseFloat(m.rating || "0").toFixed(1)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{m.totalMoves || 0}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {m.isVerified ? (
                              <Badge className="bg-green-500 text-white">Verified</Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                            {m.isAvailable && (
                              <Badge className="bg-blue-500 text-white">Available</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {m.stripeConnect ? (
                            m.stripeConnect.chargesEnabled && m.stripeConnect.payoutsEnabled ? (
                              <Badge className="bg-green-500 text-white" data-testid={`stripe-enabled-${m.userId}`}>
                                <CreditCard className="w-3 h-3 mr-1" />
                                Connected
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-600 border-amber-500" data-testid={`stripe-pending-${m.userId}`}>
                                <CreditCard className="w-3 h-3 mr-1" />
                                Pending
                              </Badge>
                            )
                          ) : (
                            <Badge variant="secondary" className="text-muted-foreground" data-testid={`stripe-none-${m.userId}`}>
                              Not Setup
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDialog(m);
                            }}
                            data-testid={`button-upload-photo-${m.id}`}
                          >
                            <Camera className="w-4 h-4 mr-1" />
                            Upload Photo
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No movers found</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Upload Vehicle Photo</DialogTitle>
              <DialogDescription>
                Upload a vehicle photo for {selectedMover?.user?.name || "this mover"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {selectedMover && selectedMover.onboardingCompleted === false && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Onboarding Incomplete</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">This mover hasn't completed their onboarding wizard.</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => overrideOnboardingMutation.mutate(selectedMover.id)}
                      disabled={overrideOnboardingMutation.isPending}
                      className="border-amber-500 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900"
                      data-testid="button-override-onboarding"
                    >
                      {overrideOnboardingMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <UserCheck className="w-4 h-4 mr-1" />
                      )}
                      Override
                    </Button>
                  </div>
                </div>
              )}

              {previewUrl && (
                <div className="w-full h-48 rounded-lg overflow-hidden bg-muted border">
                  <img 
                    src={previewUrl} 
                    alt="Vehicle preview" 
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              
              <div className="flex flex-col gap-2">
                <Label>Select Image</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  data-testid="input-admin-vehicle-photo"
                />
                <p className="text-sm text-muted-foreground">Maximum file size: 5MB</p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleCloseDialog} data-testid="button-cancel-upload">
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpload}
                  disabled={!selectedFile || uploadPhotoMutation.isPending}
                  data-testid="button-confirm-upload"
                >
                  {uploadPhotoMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Photo
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
