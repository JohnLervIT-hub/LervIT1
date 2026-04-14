import { useState, useEffect } from "react";
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
import { Link } from "wouter";
import { Search, Eye, CheckCircle, XCircle, Clock, AlertTriangle, FileText, Calendar, FileCheck, Rocket, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { AdminRowLayout, AdminRowCell, AdminRowPrimary, AdminRowProgress, AdminRowMobileExtras } from "@/components/admin/AdminRowLayout";

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
  pilotStatus?: string;
  hasAcceptedTerms?: boolean;
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
    pilotStatus: string | null;
    pilotNotes: string | null;
    pilotExpiresAt: string | null;
    pilotApprovedAt: string | null;
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
  const [pilotStatus, setPilotStatus] = useState<string>("");
  const [pilotNotes, setPilotNotes] = useState("");
  const [pilotExpiresAt, setPilotExpiresAt] = useState("");

  // Build drivers URL with filters
  const buildDriversUrl = () => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (statusFilter !== "ALL") params.append("statusFilter", statusFilter);
    params.append("page", page.toString());
    params.append("pageSize", "100");
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

  // Initialize pilot form fields when driver detail loads
  useEffect(() => {
    if (driverDetail?.driver) {
      setPilotStatus(driverDetail.driver.pilotStatus || "");
      setPilotNotes(driverDetail.driver.pilotNotes || "");
      setPilotExpiresAt(driverDetail.driver.pilotExpiresAt ? driverDetail.driver.pilotExpiresAt.split('T')[0] : "");
    }
  }, [driverDetail]);

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

  const pilotMutation = useMutation({
    mutationFn: async ({ moverId, status, notes, expiresAt }: { moverId: string; status: string; notes?: string; expiresAt?: string }) => {
      return apiRequest("PATCH", `/api/admin/movers/${moverId}/pilot-status`, { status, notes, expiresAt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/verification/drivers"] });
      queryClient.refetchQueries({ queryKey: [`/api/admin/verification/driver/${selectedDriverId}`] });
      toast({
        title: "Pilot status updated",
        description: "The driver's early access status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update pilot status",
        variant: "destructive",
      });
    },
  });

  const handlePilotUpdate = () => {
    if (!selectedDriverId || !pilotStatus) return;
    pilotMutation.mutate({
      moverId: selectedDriverId,
      status: pilotStatus,
      notes: pilotNotes || undefined,
      expiresAt: pilotExpiresAt || undefined,
    });
  };

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
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4" data-testid="button-back-admin">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Command Center
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-blue-500/10 rounded-lg">
              <FileCheck className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Driver Verification</h1>
              <p className="text-sm text-muted-foreground">Review and manage driver compliance documents</p>
            </div>
          </div>

          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Drivers</CardTitle>
                <FileCheck className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{totalDrivers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approved</CardTitle>
                <CheckCircle className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-green-600">{approvedDrivers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending</CardTitle>
                <Clock className="w-4 h-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-amber-600">{pendingDrivers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs Attention</CardTitle>
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums text-red-600">{needsAttention}</div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
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
                      <AdminRowLayout preset="5-col">
                        <AdminRowPrimary
                          avatar={
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-lg">
                              {driver.name?.charAt(0)?.toUpperCase() || "?"}
                            </div>
                          }
                          title={
                            <span className="flex items-center gap-2">
                              {driver.name}
                              {driver.isAvailable && (
                                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Online" />
                              )}
                              <span className="text-sm text-muted-foreground font-normal">
                                {parseFloat(driver.rating).toFixed(1)}★
                              </span>
                            </span>
                          }
                          subtitle={
                            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                              <span className="truncate max-w-[200px]">{driver.email}</span>
                              {driver.phone && <span>{driver.phone}</span>}
                            </span>
                          }
                          badges={
                            driver.pilotStatus === 'approved' && (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs gap-1">
                                <Rocket className="w-3 h-3" />
                                Early Access
                                {driver.hasAcceptedTerms && <CheckCircle className="w-3 h-3 text-green-500" />}
                              </Badge>
                            )
                          }
                        />

                        <AdminRowCell hideOnMobile>
                          <AdminRowProgress
                            current={driver.approvedCount}
                            total={driver.totalRequired}
                          />
                        </AdminRowCell>

                        <AdminRowCell hideOnMobile>
                          {getStatusBadge(driver.overallStatus)}
                        </AdminRowCell>

                        <AdminRowCell hideOnMobile className="flex gap-1">
                          {driver.hasExpired && (
                            <Badge variant="destructive" className="text-xs">Expired</Badge>
                          )}
                          {driver.hasRejected && (
                            <Badge variant="destructive" className="text-xs">Rejected</Badge>
                          )}
                          {!driver.hasExpired && !driver.hasRejected && driver.overallStatus === "APPROVED" && (
                            <Badge className="bg-green-500 text-xs">Complete</Badge>
                          )}
                        </AdminRowCell>

                        <AdminRowCell hideOnMobile className="flex items-center justify-end gap-3">
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(driver.lastUpdated), "MMM d, yyyy")}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`button-view-${driver.driverId}`}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            <span className="hidden sm:inline">Review</span>
                          </Button>
                        </AdminRowCell>
                      </AdminRowLayout>

                      <AdminRowMobileExtras>
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
                      </AdminRowMobileExtras>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Driver Detail Dialog */}
        <Dialog open={!!selectedDriverId} onOpenChange={(open) => {
          if (!open) {
            setSelectedDriverId(null);
            setPilotStatus("");
            setPilotNotes("");
            setPilotExpiresAt("");
          }
        }}>
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

                {/* Early Access (Pilot) Program */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Rocket className="w-5 h-5" />
                      Early Access Program
                    </CardTitle>
                    <CardDescription>Allow this driver to operate before full verification is complete</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Current Status:</span>
                      {driverDetail.driver.pilotStatus === "approved" ? (
                        <Badge className="bg-green-500 gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Early Access Approved
                        </Badge>
                      ) : driverDetail.driver.pilotStatus === "pending" ? (
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="w-3 h-3" />
                          Pending Review
                        </Badge>
                      ) : driverDetail.driver.pilotStatus === "rejected" ? (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="w-3 h-3" />
                          Rejected
                        </Badge>
                      ) : driverDetail.driver.pilotStatus === "suspended" ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Suspended
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          Not Enrolled
                        </Badge>
                      )}
                    </div>

                    {driverDetail.driver.pilotApprovedAt && (
                      <div className="text-sm text-muted-foreground">
                        Approved on: {format(new Date(driverDetail.driver.pilotApprovedAt), "MMM d, yyyy")}
                      </div>
                    )}

                    {driverDetail.driver.pilotExpiresAt && (
                      <div className="text-sm text-muted-foreground">
                        Expires: {format(new Date(driverDetail.driver.pilotExpiresAt), "MMM d, yyyy")}
                      </div>
                    )}

                    {driverDetail.driver.pilotNotes && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Notes:</div>
                        <div className="text-sm bg-muted p-2 rounded">{driverDetail.driver.pilotNotes}</div>
                      </div>
                    )}

                    <div className="border-t pt-4 space-y-3">
                      <div>
                        <Label htmlFor="pilot-status">Update Status</Label>
                        <Select value={pilotStatus} onValueChange={setPilotStatus}>
                          <SelectTrigger id="pilot-status" data-testid="select-pilot-status">
                            <SelectValue placeholder="Select new status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="approved">Approve Early Access</SelectItem>
                            <SelectItem value="pending">Set as Pending</SelectItem>
                            <SelectItem value="rejected">Reject</SelectItem>
                            <SelectItem value="suspended">Suspend</SelectItem>
                            <SelectItem value="none">Remove from Program</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="pilot-notes">Notes (optional)</Label>
                        <Textarea
                          id="pilot-notes"
                          placeholder="Add notes about this decision..."
                          value={pilotNotes}
                          onChange={(e) => setPilotNotes(e.target.value)}
                          rows={2}
                          data-testid="textarea-pilot-notes"
                        />
                      </div>

                      <div>
                        <Label htmlFor="pilot-expires">Expiry Date (optional)</Label>
                        <Input
                          id="pilot-expires"
                          type="date"
                          value={pilotExpiresAt}
                          onChange={(e) => setPilotExpiresAt(e.target.value)}
                          data-testid="input-pilot-expires"
                        />
                      </div>

                      <Button
                        onClick={handlePilotUpdate}
                        disabled={!pilotStatus || pilotMutation.isPending}
                        data-testid="button-update-pilot"
                      >
                        {pilotMutation.isPending ? "Updating..." : "Update Early Access Status"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

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
          <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                            className="w-full h-36 object-cover rounded-lg border cursor-pointer hover:opacity-90"
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
  </div>
  );
}
