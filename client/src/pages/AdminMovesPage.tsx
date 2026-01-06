import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar, ArrowLeft, Search, CheckCircle, Clock, XCircle, Truck, Edit, MapPin, Loader2, CreditCard, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Booking = {
  id: string;
  status: string;
  price: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledDate: string;
  createdAt: string;
  customer: {
    id?: string;
    name?: string;
    email?: string;
  } | null;
  mover: {
    id?: string;
    userId?: string;
    name?: string;
    phone?: string;
    vehicleType?: string;
  } | null;
};

export default function AdminMovesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const initialStatus = searchParams.get("status") || "all";
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editPickup, setEditPickup] = useState("");
  const [editDropoff, setEditDropoff] = useState("");

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
  });

  const updateAddressMutation = useMutation({
    mutationFn: async ({ bookingId, pickupAddress, dropoffAddress }: { bookingId: string; pickupAddress: string; dropoffAddress: string }) => {
      return apiRequest("PATCH", `/api/admin/bookings/${bookingId}/addresses`, {
        pickupAddress,
        dropoffAddress,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Addresses Updated",
        description: "The booking addresses have been successfully updated.",
      });
      setEditingBooking(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ bookingId, status, paymentStatus }: { bookingId: string; status: string; paymentStatus: string }) => {
      return apiRequest("PATCH", `/api/admin/bookings/${bookingId}/status`, {
        status,
        paymentStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Booking Updated",
        description: "The booking status has been updated.",
      });
      setEditingBooking(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleMarkRefunded = () => {
    if (!editingBooking) return;
    updateStatusMutation.mutate({
      bookingId: editingBooking.id,
      status: 'cancelled',
      paymentStatus: 'refunded',
    });
  };

  const openEditDialog = (booking: Booking) => {
    setEditingBooking(booking);
    setEditPickup(booking.pickupAddress);
    setEditDropoff(booking.dropoffAddress);
  };

  const handleSaveAddresses = () => {
    if (!editingBooking) return;
    updateAddressMutation.mutate({
      bookingId: editingBooking.id,
      pickupAddress: editPickup,
      dropoffAddress: editDropoff,
    });
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

  const filteredBookings = bookings?.filter(b => {
    const matchesSearch = 
      b.pickupAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.dropoffAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = 
      statusFilter === "all" ||
      b.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];

  const completedCount = bookings?.filter(b => b.status === "completed").length || 0;
  const pendingCount = bookings?.filter(b => b.status === "pending").length || 0;
  const pendingPaymentCount = bookings?.filter(b => b.status === "pending_payment" || b.status === "payment_failed").length || 0;
  const inProgressCount = bookings?.filter(b => b.status === "in_progress" || b.status === "accepted" || b.status === "confirmed").length || 0;
  const cancelledCount = bookings?.filter(b => b.status === "cancelled").length || 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending_payment":
        return <Badge className="bg-orange-500 text-white"><CreditCard className="w-3 h-3 mr-1" />Awaiting Payment</Badge>;
      case "payment_failed":
        return <Badge className="bg-red-500 text-white"><AlertTriangle className="w-3 h-3 mr-1" />Payment Failed</Badge>;
      case "completed":
        return <Badge className="bg-green-500 text-white"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-500 text-white"><Truck className="w-3 h-3 mr-1" />In Progress</Badge>;
      case "accepted":
        return <Badge className="bg-blue-500 text-white"><CheckCircle className="w-3 h-3 mr-1" />Accepted</Badge>;
      case "confirmed":
        return <Badge className="bg-blue-500 text-white"><CheckCircle className="w-3 h-3 mr-1" />Confirmed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500 text-white"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "cancelled":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 bg-gradient-to-b from-purple-50/50 to-background dark:from-purple-950/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20" data-testid="button-back-admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-600 rounded-lg">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">All Moves</h1>
          </div>
          <p className="text-muted-foreground text-lg">View and manage all booking requests</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("completed")}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completedCount}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("in_progress")}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Truck className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{inProgressCount}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("pending")}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="w-4 h-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("cancelled")}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
              <XCircle className="w-4 h-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{cancelledCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle>Booking List ({filteredBookings.length})</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search bookings..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-bookings"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading bookings...</div>
            ) : filteredBookings.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Booking ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Mover</TableHead>
                      <TableHead>Pickup</TableHead>
                      <TableHead>Dropoff</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBookings.map((b) => (
                      <TableRow key={b.id} data-testid={`row-booking-${b.id}`}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {b.id.slice(0, 8)}...
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>{b.customer?.name || "Unknown Customer"}</div>
                          <div className="text-xs text-muted-foreground">{b.customer?.email || "No email"}</div>
                        </TableCell>
                        <TableCell>
                          {b.mover?.name ? b.mover.name : <span className="text-muted-foreground">Unassigned</span>}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate" title={b.pickupAddress}>
                          {b.pickupAddress || "N/A"}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate" title={b.dropoffAddress}>
                          {b.dropoffAddress || "N/A"}
                        </TableCell>
                        <TableCell>
                          {b.scheduledDate ? format(new Date(b.scheduledDate), "MMM d, yyyy") : "N/A"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {b.price ? `$${parseFloat(b.price).toFixed(2)}` : "N/A"}
                        </TableCell>
                        <TableCell>{getStatusBadge(b.status)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(b)}
                            data-testid={`button-edit-booking-${b.id}`}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No bookings found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Address Dialog */}
      <Dialog open={!!editingBooking} onOpenChange={(open) => !open && setEditingBooking(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Edit Booking Addresses
            </DialogTitle>
            <DialogDescription>
              Update the pickup and dropoff addresses for this booking. Distance will be recalculated automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pickup-address">Pickup Address</Label>
              <Input
                id="pickup-address"
                value={editPickup}
                onChange={(e) => setEditPickup(e.target.value)}
                placeholder="Enter pickup address"
                data-testid="input-edit-pickup"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dropoff-address">Dropoff Address</Label>
              <Input
                id="dropoff-address"
                value={editDropoff}
                onChange={(e) => setEditDropoff(e.target.value)}
                placeholder="Enter dropoff address"
                data-testid="input-edit-dropoff"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              onClick={handleMarkRefunded}
              disabled={updateStatusMutation.isPending || editingBooking?.status === 'cancelled'}
              data-testid="button-mark-refunded"
              className="sm:mr-auto"
            >
              {updateStatusMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <XCircle className="w-4 h-4 mr-2" />
              Mark as Refunded
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditingBooking(null)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAddresses}
              disabled={updateAddressMutation.isPending || !editPickup.trim() || !editDropoff.trim()}
              data-testid="button-save-addresses"
            >
              {updateAddressMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
