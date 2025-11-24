import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Search, Eye, CheckCircle, XCircle, Clock, AlertTriangle, FileText, Calendar } from "lucide-react";
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
  id: number;
  type: string;
  status: string;
  documentUrl: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  submittedAt: string;
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

  // Helper to get auth headers (same logic as queryClient)
  const getAuthHeaders = (): Record<string, string> => {
    const storedUser = localStorage.getItem("moveit_user");
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (user.id) {
          return { "Authorization": `Bearer ${user.id}` };
        }
      } catch {
        // Invalid stored user
      }
    }
    return {};
  };

  // Fetch drivers list
  const buildDriversUrl = () => {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (statusFilter !== "ALL") params.append("statusFilter", statusFilter);
    params.append("page", page.toString());
    params.append("pageSize", "20");
    return `/api/admin/verification/drivers?${params}`;
  };

  const { data: driversData, isLoading, error: driversError, isError: isDriversError } = useQuery<any>({
    queryKey: ["/api/admin/verification/drivers", search, statusFilter, page],
    queryFn: async () => {
      const url = buildDriversUrl();
      const authHeaders = getAuthHeaders();
      
      if (!authHeaders["Authorization"]) {
        throw new Error("Not authenticated. Please log in again.");
      }
      
      const response = await fetch(url, {
        credentials: "include",
        headers: authHeaders,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch drivers: ${errorText}`);
      }
      return response.json();
    },
  });

  // Fetch driver detail
  const { data: driverDetail } = useQuery<DriverDetail>({
    queryKey: [`/api/admin/verification/driver/${selectedDriverId}`],
    enabled: !!selectedDriverId,
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ itemId, status, reason }: { itemId: number; status: string; reason?: string }) => {
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

  return (
    <div className="min-h-screen pt-24 pb-12 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Driver Verification & Compliance</h1>
          <p className="text-muted-foreground text-lg">Review and manage driver verification documents</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Search and filter drivers by verification status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, phone, or ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-drivers"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-status-filter">
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

        <Card>
          <CardHeader>
            <CardTitle>Drivers ({driversData?.total || 0})</CardTitle>
            <CardDescription>Click on a driver to review their verification documents</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading drivers...</div>
            ) : isDriversError ? (
              <div className="text-center py-8">
                <div className="text-destructive font-medium mb-2">Failed to load drivers</div>
                <p className="text-muted-foreground mb-4">
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
              <div className="text-center py-8 text-muted-foreground">No drivers found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Flags</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driversData?.drivers?.map((driver: Driver) => (
                      <TableRow key={driver.driverId} data-testid={`row-driver-${driver.driverId}`}>
                        <TableCell className="font-medium">
                          <div>
                            <div>{driver.name}</div>
                            <div className="text-sm text-muted-foreground">⭐ {driver.rating}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{driver.email}</div>
                            {driver.phone && <div className="text-muted-foreground">{driver.phone}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(driver.overallStatus)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium">
                              {driver.approvedCount} / {driver.totalRequired}
                            </div>
                            <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${(driver.approvedCount / driver.totalRequired) * 100}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {driver.hasExpired && (
                              <Badge variant="destructive" className="text-xs">Expired</Badge>
                            )}
                            {driver.hasRejected && (
                              <Badge variant="destructive" className="text-xs">Rejected</Badge>
                            )}
                            {driver.isAvailable && (
                              <Badge variant="default" className="bg-green-500 text-xs">Online</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(driver.lastUpdated), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedDriverId(driver.driverId)}
                            data-testid={`button-view-${driver.driverId}`}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                                {item.expiresAt && (
                                  <span className="text-sm text-muted-foreground">
                                    Expires: {format(new Date(item.expiresAt), "MMM d, yyyy")}
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

                {selectedItem.documentUrl && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Document</div>
                    <img
                      src={selectedItem.documentUrl}
                      alt="Verification document"
                      className="w-full rounded-lg border"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => window.open(selectedItem.documentUrl!, '_blank')}
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

                <div className="text-sm text-muted-foreground">
                  Submitted: {format(new Date(selectedItem.submittedAt), "MMM d, yyyy 'at' h:mm a")}
                </div>
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
