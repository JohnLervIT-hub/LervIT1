import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Search, Eye, CheckCircle, XCircle, Clock, AlertTriangle, FileText, Calendar, FileCheck } from "lucide-react";
import { format } from "date-fns";

interface Driver {
  driverId: string;
  name: string;
  email: string;
  phone: string;
  rating: string;
  overallStatus: string;
  approvedCount: number;
  totalRequired: number;
  hasExpired: boolean;
  hasRejected: boolean;
  isAvailable: boolean;
  lastUpdated: string;
}

interface VerificationItem {
  id: string;
  type: string;
  status: string;
  fileUrls: string[] | null;
  rejectionReason: string | null;
  expiryDate: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string;
}

interface DriverDetail {
  driver: {
    id: string;
    name: string;
    email: string;
    phone: string;
    moverImage: string | null;
    bio: string | null;
    rating: string;
    totalMoves: number;
    isAvailable: boolean;
    vehicleType: string | null;
    vehicleColor: string | null;
    licensePlate: string | null;
    vehiclePhoto: string | null;
  };
  verificationSummary: {
    overallStatus: string;
    approvedCount: number;
    totalRequired: number;
    hasExpired: boolean;
    hasRejected: boolean;
  };
  verificationItems: VerificationItem[];
}

export default function AdminVerificationDashboard() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<VerificationItem | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState("");

  // Build drivers URL with filters
  const buildDriversUrl = () => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (statusFilter !== "ALL") params.append("statusFilter", statusFilter);
    params.append("page", page.toString());
    params.append("pageSize", "20");
    return `/api/admin/verification/drivers?${params}`;
  };

  // Fetch drivers list - uses session cookies for auth (credentials: include)
  const { data: driversData, isLoading, error: driversError, isError: isDriversError } = useQuery<any>({
    queryKey: ["/api/admin/verification/drivers", search, statusFilter, page],
    queryFn: async () => {
      const url = buildDriversUrl();
      const response = await fetch(url, {
        credentials: "include",
      });
      
      if (response.status === 401) {
        throw new Error("Not authenticated. Please log in again.");
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch drivers: ${errorText}`);
      }
      return response.json();
    },
  });

  // Fetch driver detail - uses session cookies for auth
  const { data: driverDetail, isLoading: detailLoading, error: detailError } = useQuery<DriverDetail>({
    queryKey: [`/api/admin/verification/driver/${selectedDriverId}`],
    enabled: !!selectedDriverId,
    queryFn: async () => {
      const response = await fetch(`/api/admin/verification/driver/${selectedDriverId}`, {
        credentials: "include",
      });
      if (response.status === 401) {
        throw new Error("Not authenticated. Please log in again.");
      }
      if (!response.ok) {
        throw new Error("Failed to fetch driver details");
      }
      return response.json();
    },
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ itemId, status, reason }: { itemId: string; status: string; reason?: string }) => {
      return apiRequest("PATCH", `/api/admin/verification/item/${itemId}`, {
        status,
        rejectionReason: reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/verification/drivers"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/verification/driver/${selectedDriverId}`] });
      toast({
        title: "Verification updated",
        description: "The verification item has been updated successfully.",
      });
      setSelectedItem(null);
      setReviewStatus("");
      setRejectionReason("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update verification item",
        variant: "destructive",
      });
    },
  });

  const handleReview = () => {
    if (!selectedItem) return;
    if (reviewStatus === "Rejected" && !rejectionReason.trim()) {
      toast({
        title: "Rejection reason required",
        description: "Please provide a reason for rejection",
        variant: "destructive",
      });
      return;
    }

    reviewMutation.mutate({
      itemId: selectedItem.id,
      status: reviewStatus,
      reason: reviewStatus === "Rejected" ? rejectionReason : undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      APPROVED: { variant: "default", icon: CheckCircle, label: "Approved" },
      INCOMPLETE: { variant: "secondary", icon: Clock, label: "Incomplete" },
      ATTENTION: { variant: "destructive", icon: AlertTriangle, label: "Attention" },
      Pending: { variant: "secondary", icon: Clock, label: "Pending" },
      "Under Review": { variant: "default", icon: FileText, label: "Under Review" },
      Approved: { variant: "default", icon: CheckCircle, label: "Approved" },
      Rejected: { variant: "destructive", icon: XCircle, label: "Rejected" },
      Expired: { variant: "destructive", icon: Calendar, label: "Expired" },
    };

    const config = variants[status] || { variant: "secondary", icon: Clock, label: status };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const formatType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Calculate stats
  const totalDrivers = driversData?.total || 0;
  const approvedDrivers = driversData?.drivers?.filter((d: Driver) => d.overallStatus === "APPROVED").length || 0;
  const pendingDrivers = driversData?.drivers?.filter((d: Driver) => d.overallStatus === "INCOMPLETE" || d.overallStatus === "ATTENTION").length || 0;
  const needsAttention = driversData?.drivers?.filter((d: Driver) => d.hasExpired || d.hasRejected).length || 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 to-background dark:from-blue-950/20">
      {/* Premium Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
              <FileCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">Driver Verification</h1>
              <p className="text-blue-200">Review and manage driver compliance documents</p>
            </div>
          </div>
          
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <p className="text-blue-200 text-sm mb-1">Total Drivers</p>
              <p className="text-3xl font-bold">{totalDrivers}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <p className="text-green-200 text-sm mb-1">Fully Approved</p>
              <p className="text-3xl font-bold text-green-300">{approvedDrivers}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <p className="text-amber-200 text-sm mb-1">Pending Review</p>
              <p className="text-3xl font-bold text-amber-300">{pendingDrivers}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <p className="text-red-200 text-sm mb-1">Needs Attention</p>
              <p className="text-3xl font-bold text-red-300">{needsAttention}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search & Filters */}
        <Card className="mb-6 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, phone, or ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 h-11"
                    data-testid="input-search-drivers"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px] h-11" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Drivers</SelectItem>
                  <SelectItem value="MISSING_REQUIRED">Missing Required</SelectItem>
                  <SelectItem value="INCOMPLETE">Incomplete</SelectItem>
                  <SelectItem value="ATTENTION">Needs Attention</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Drivers ({driversData?.total || 0})</CardTitle>
                <CardDescription>Click on a driver to review their verification documents</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p>Loading drivers...</p>
              </div>
            ) : isDriversError ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-destructive" />
                </div>
                <div className="text-destructive font-medium mb-2">Failed to load drivers</div>
                <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                  {driversError instanceof Error ? driversError.message : "An error occurred"}
                </p>
                <Button
                  variant="outline"
                  onClick={() => window.location.href = "/login"}
                  data-testid="button-relogin"
                >
                  Go to Login
                </Button>
              </div>
            ) : driversData?.drivers?.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <FileCheck className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No drivers found matching your criteria</p>
              </div>
            ) : (
              <div className="divide-y">
                {driversData?.drivers?.map((driver: Driver) => {
                  const progressPercent = driver.totalRequired > 0 ? (driver.approvedCount / driver.totalRequired) * 100 : 0;
                  const progressColor = progressPercent === 100 ? "bg-green-500" : progressPercent >= 50 ? "bg-blue-500" : "bg-amber-500";
                  
                  return (
                    <div
                      key={driver.driverId}
                      className="group p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedDriverId(driver.driverId)}
                      data-testid={`row-driver-${driver.driverId}`}
                    >
                      <div className="flex items-center gap-4">
                        {/* Avatar & Name */}
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-lg shrink-0">
                          {driver.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        
                        {/* Driver Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{driver.name}</h3>
                            {driver.isAvailable && (
                              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Online" />
                            )}
                            <span className="text-sm text-muted-foreground">
                              {parseFloat(driver.rating).toFixed(1)}★
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span className="truncate max-w-[200px]">{driver.email}</span>
                            {driver.phone && <span>{driver.phone}</span>}
                          </div>
                        </div>

                        {/* Progress & Status - Desktop */}
                        <div className="hidden md:flex items-center gap-6">
                          {/* Progress */}
                          <div className="w-32">
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="font-medium">{driver.approvedCount}/{driver.totalRequired}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full ${progressColor} transition-all duration-300`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className="w-28">
                            {getStatusBadge(driver.overallStatus)}
                          </div>

                          {/* Flags */}
                          <div className="flex gap-1 w-24">
                            {driver.hasExpired && (
                              <Badge variant="destructive" className="text-xs">Expired</Badge>
                            )}
                            {driver.hasRejected && (
                              <Badge variant="destructive" className="text-xs">Rejected</Badge>
                            )}
                            {!driver.hasExpired && !driver.hasRejected && driver.overallStatus === "APPROVED" && (
                              <Badge className="bg-green-500 text-xs">Complete</Badge>
                            )}
                          </div>

                          {/* Last Updated */}
                          <div className="text-sm text-muted-foreground w-24">
                            {format(new Date(driver.lastUpdated), "MMM d, yyyy")}
                          </div>
                        </div>

                        {/* Action Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          data-testid={`button-view-${driver.driverId}`}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          <span className="hidden sm:inline">Review</span>
                        </Button>
                      </div>

                      {/* Mobile: Progress & Status */}
                      <div className="md:hidden mt-3 flex flex-wrap items-center gap-2">
                        {getStatusBadge(driver.overallStatus)}
                        {driver.hasExpired && (
                          <Badge variant="destructive" className="text-xs">Expired</Badge>
                        )}
                        {driver.hasRejected && (
                          <Badge variant="destructive" className="text-xs">Rejected</Badge>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${progressColor}`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{driver.approvedCount}/{driver.totalRequired}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Driver Detail Dialog */}
        <Dialog open={!!selectedDriverId} onOpenChange={(open) => !open && setSelectedDriverId(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Driver Verification Details</DialogTitle>
              <DialogDescription>Review and update verification items for this driver</DialogDescription>
            </DialogHeader>

            {driverDetail && (
              <div className="space-y-6">
                {/* Driver Overview */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Driver Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start gap-4">
                      {driverDetail.driver.moverImage && (
                        <img
                          src={driverDetail.driver.moverImage}
                          alt={driverDetail.driver.name}
                          className="w-20 h-20 rounded-full object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-xl font-bold">{driverDetail.driver.name}</h3>
                        <p className="text-sm text-muted-foreground mb-2">{driverDetail.driver.email}</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {getStatusBadge(driverDetail.verificationSummary.overallStatus)}
                          {driverDetail.driver.isAvailable && (
                            <Badge variant="default" className="bg-green-500">Online</Badge>
                          )}
                        </div>
                        <div className="text-sm">
                          <strong>{driverDetail.verificationSummary.approvedCount}</strong> of{" "}
                          <strong>{driverDetail.verificationSummary.totalRequired}</strong> required items approved
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Vehicle Info */}
                {driverDetail.driver.vehicleType && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Vehicle Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Type</div>
                          <div className="font-medium">{driverDetail.driver.vehicleType}</div>
                        </div>
                        {driverDetail.driver.vehicleColor && (
                          <div>
                            <div className="text-sm text-muted-foreground">Color</div>
                            <div className="font-medium">{driverDetail.driver.vehicleColor}</div>
                          </div>
                        )}
                        {driverDetail.driver.licensePlate && (
                          <div>
                            <div className="text-sm text-muted-foreground">License Plate</div>
                            <div className="font-medium">{driverDetail.driver.licensePlate}</div>
                          </div>
                        )}
                      </div>
                      {driverDetail.driver.vehiclePhoto && (
                        <div className="mt-4">
                          <img
                            src={driverDetail.driver.vehiclePhoto}
                            alt="Vehicle"
                            className="w-full max-w-md rounded-lg"
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Verification Items */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Verification Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {driverDetail.verificationItems.map((item) => (
                        <div
                          key={item.id}
                          className="border rounded-lg p-4 hover-elevate active-elevate-2 cursor-pointer"
                          onClick={() => setSelectedItem(item)}
                          data-testid={`item-${item.type}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="font-medium">{formatType(item.type)}</div>
                              <div className="flex items-center gap-2 mt-1">
                                {getStatusBadge(item.status)}
                                {item.expiryDate && (
                                  <span className="text-sm text-muted-foreground">
                                    Expires: {format(new Date(item.expiryDate), "MMM d, yyyy")}
                                  </span>
                                )}
                              </div>
                              {item.rejectionReason && (
                                <div className="mt-2 text-sm text-destructive">
                                  Reason: {item.rejectionReason}
                                </div>
                              )}
                            </div>
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}>
                              Review
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Verification Item Review Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={(open) => { if (!open) { setSelectedItem(null); setReviewStatus(""); setRejectionReason(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review Verification Item</DialogTitle>
              <DialogDescription>
                {selectedItem && formatType(selectedItem.type)}
              </DialogDescription>
            </DialogHeader>

            {selectedItem && (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Current Status</div>
                  {getStatusBadge(selectedItem.status)}
                </div>

                {selectedItem.fileUrls && selectedItem.fileUrls.length > 0 && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Documents ({selectedItem.fileUrls.length})</div>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedItem.fileUrls.map((url, idx) => (
                        <div key={idx} className="relative">
                          <img
                            src={url}
                            alt={`Verification document ${idx + 1}`}
                            className="w-full rounded-lg border cursor-pointer hover:opacity-90"
                            onClick={() => window.open(url, '_blank')}
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => window.open(selectedItem.fileUrls![0], '_blank')}
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      Open Full Size
                    </Button>
                  </div>
                )}

                {selectedItem.rejectionReason && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Previous Rejection Reason</div>
                    <div className="text-sm bg-destructive/10 text-destructive p-2 rounded">
                      {selectedItem.rejectionReason}
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="review-status">New Status</Label>
                  <Select value={reviewStatus} onValueChange={setReviewStatus}>
                    <SelectTrigger id="review-status" data-testid="select-review-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                      <SelectItem value="Under Review">Under Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {reviewStatus === "Rejected" && (
                  <div>
                    <Label htmlFor="rejection-reason">Rejection Reason *</Label>
                    <Textarea
                      id="rejection-reason"
                      placeholder="Explain why this document is being rejected..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                      data-testid="textarea-rejection-reason"
                    />
                  </div>
                )}

                {selectedItem.submittedAt && (
                  <div className="text-sm text-muted-foreground">
                    Submitted: {format(new Date(selectedItem.submittedAt), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { setSelectedItem(null); setReviewStatus(""); setRejectionReason(""); }}>
                Cancel
              </Button>
              <Button
                onClick={handleReview}
                disabled={!reviewStatus || reviewMutation.isPending}
                data-testid="button-submit-review"
              >
                {reviewMutation.isPending ? "Updating..." : "Update Status"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
