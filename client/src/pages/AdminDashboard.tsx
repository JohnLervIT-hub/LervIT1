import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminDashboardSkeleton } from "@/components/DashboardSkeleton";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Users, Truck, Calendar, DollarSign, TrendingUp, Shield, Clock, CheckCircle, ChevronRight, MapPin, Package, User as UserIcon, Phone, Mail, ArrowRight, Eye, Box, AlertCircle, Trash2, Loader2, MessageSquare, ShieldCheck, Send } from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  createdAt: string;
};

type Mover = {
  id: string;
  vehicleType: string;
  isVerified: boolean;
  rating: string;
  totalMoves: number;
  user: {
    name: string;
    email: string;
  } | null;
};

type Booking = {
  id: string;
  status: string;
  price: string | null;
  createdAt: string;
  preferredDate?: string | null;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  loadSize?: string | null;
  description?: string | null;
  distance?: string | null;
  numberOfMovers?: number | null;
  pickupDifficulty?: string | null;
  dropoffDifficulty?: string | null;
  heavyItem?: boolean | null;
  paymentStatus?: string | null;
  customer: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  mover: {
    id?: string;
    name?: string;
    vehicleType?: string;
    rating?: string;
    user?: {
      id?: string;
      name?: string;
    };
  } | null;
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const { toast } = useToast();

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: movers, isLoading: moversLoading } = useQuery<Mover[]>({
    queryKey: ["/api/movers"],
  });

  const { data: bookings, isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
  });

  const isLoading = usersLoading || moversLoading || bookingsLoading;

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/admin/cleanup-broken-bookings");
    },
    onSuccess: async (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Cleanup Complete",
        description: response.message || "Broken bookings have been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Cleanup Failed",
        description: "Could not remove broken bookings. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-amber-500",
      accepted: "bg-blue-500",
      in_progress: "bg-indigo-500",
      completed: "bg-green-500",
      cancelled: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const getPaymentBadge = (status?: string | null) => {
    if (!status || status === "pending") return <Badge variant="secondary">Unpaid</Badge>;
    if (status === "paid") return <Badge className="bg-green-500">Paid</Badge>;
    if (status === "refunded") return <Badge variant="destructive">Refunded</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  const getLoadSizeLabel = (size?: string | null) => {
    if (!size) return "Unknown";
    const labels: Record<string, string> = {
      boxes: "Boxes Only (1-10 ft³)",
      medium: "Medium Load (11-50 ft³)",
      large: "Large Load (50-170 ft³)",
      apartment: "Full Apartment (170+ ft³)",
    };
    return labels[size] || size;
  };

  const getDifficultyLabel = (difficulty?: string | null) => {
    if (!difficulty) return "Ground Floor";
    const labels: Record<string, string> = {
      ground: "Ground Floor",
      basement: "Basement",
      stairs: "Stairs",
      elevator: "Elevator",
    };
    return labels[difficulty] || difficulty;
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

  if (isLoading) {
    return <AdminDashboardSkeleton />;
  }

  const totalRevenue = bookings?.reduce((sum, b) => sum + (parseFloat(b.price || "0")), 0) || 0;
  const completedBookings = bookings?.filter(b => b.status === "completed").length || 0;
  const verifiedMovers = movers?.filter(m => m.isVerified).length || 0;

  const pendingBookings = bookings?.filter(b => b.status === "pending").length || 0;
  const activeBookings = bookings?.filter(b => b.status === "in_progress" || b.status === "accepted").length || 0;

  return (
    <div className="min-h-screen pt-24 pb-12 bg-gradient-to-b from-blue-50/50 to-background dark:from-blue-950/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">Admin Dashboard</h1>
            </div>
            <Button
              variant="destructive"
              onClick={() => cleanupMutation.mutate()}
              disabled={cleanupMutation.isPending}
              data-testid="button-cleanup-bookings"
            >
              {cleanupMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Clean Broken Bookings
            </Button>
          </div>
          <p className="text-muted-foreground text-lg">Platform overview and management</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Link href="/admin/users" data-testid="link-admin-users">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/25">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-100">Total Users</CardTitle>
                <Users className="w-5 h-5 text-blue-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold" data-testid="stat-total-users">
                  {users?.length || 0}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-blue-200">Registered accounts</p>
                  <ChevronRight className="w-4 h-4 text-blue-200" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/movers?status=verified" data-testid="link-admin-movers">
            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-green-500/25">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-100">Verified Movers</CardTitle>
                <Truck className="w-5 h-5 text-green-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold" data-testid="stat-verified-movers">
                  {verifiedMovers}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-green-200">Active drivers</p>
                  <ChevronRight className="w-4 h-4 text-green-200" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/moves?status=completed" data-testid="link-admin-moves">
            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-purple-500/25">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-purple-100">Completed Moves</CardTitle>
                <CheckCircle className="w-5 h-5 text-purple-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold" data-testid="stat-completed-bookings">
                  {completedBookings}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-purple-200">Successful deliveries</p>
                  <ChevronRight className="w-4 h-4 text-purple-200" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/revenue" data-testid="link-admin-revenue">
            <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-orange-500/25">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-amber-100">Total Revenue</CardTitle>
                <TrendingUp className="w-5 h-5 text-amber-200" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold" data-testid="stat-total-revenue">
                  ${totalRevenue.toFixed(2)}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-amber-200">CAD earned</p>
                  <ChevronRight className="w-4 h-4 text-amber-200" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Bookings</CardTitle>
              <Clock className="w-4 h-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{pendingBookings}</div>
              <p className="text-xs text-muted-foreground">Awaiting mover</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Moves</CardTitle>
              <Calendar className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{activeBookings}</div>
              <p className="text-xs text-muted-foreground">Currently in progress</p>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Admin Tools</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Link href="/admin/support" data-testid="link-admin-support">
              <Card className="hover-elevate cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="p-2 rounded-lg bg-rose-500/10">
                    <MessageSquare className="w-5 h-5 text-rose-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Support Tickets</CardTitle>
                    <CardDescription className="text-xs">Manage customer support</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/admin/verification" data-testid="link-admin-verification">
              <Card className="hover-elevate cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Verification</CardTitle>
                    <CardDescription className="text-xs">Review driver documents</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/admin/email-center" data-testid="link-admin-email-center">
              <Card className="hover-elevate cursor-pointer h-full">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="p-2 rounded-lg bg-indigo-500/10">
                    <Send className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Email Center</CardTitle>
                    <CardDescription className="text-xs">Send bulk or personal emails</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>

        <Tabs defaultValue="bookings">
          <TabsList>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="movers">Movers</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="bookings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Bookings</CardTitle>
                <CardDescription>Click on a booking to view full itinerary details</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {!bookings || bookings.length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-muted-foreground">No bookings yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bookings.map((booking) => (
                        <div
                          key={booking.id}
                          className="group p-4 border rounded-lg hover-elevate cursor-pointer transition-all"
                          onClick={() => setSelectedBooking(booking)}
                          data-testid={`booking-row-${booking.id}`}
                        >
                          {/* Header Row: Booker & Status */}
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                <UserIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">
                                  {booking.customer?.name || "Unknown Customer"}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {booking.customer?.email || "No email"}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge className={`${getStatusColor(booking.status)} text-white`}>
                                {booking.status.replace("_", " ")}
                              </Badge>
                              {getPaymentBadge(booking.paymentStatus)}
                            </div>
                          </div>

                          {/* Route Summary */}
                          <div className="flex items-center gap-2 mb-3 text-sm">
                            <MapPin className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="truncate max-w-[180px]">{booking.pickupAddress?.split(",")[0] || "Pickup"}</span>
                            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            <MapPin className="w-4 h-4 text-red-500 shrink-0" />
                            <span className="truncate max-w-[180px]">{booking.dropoffAddress?.split(",")[0] || "Dropoff"}</span>
                          </div>

                          {/* Details Row */}
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>{booking.preferredDate ? format(new Date(booking.preferredDate), "MMM d, yyyy") : "No date"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Box className="w-4 h-4" />
                              <span className="capitalize">{booking.loadSize || "Unknown"}</span>
                            </div>
                            {booking.mover && (
                              <div className="flex items-center gap-1">
                                <Truck className="w-4 h-4 text-blue-500" />
                                <span>{booking.mover.user?.name || booking.mover.name || "Assigned"}</span>
                              </div>
                            )}
                            {!booking.mover && (
                              <div className="flex items-center gap-1 text-amber-600">
                                <AlertCircle className="w-4 h-4" />
                                <span>Awaiting mover</span>
                              </div>
                            )}
                            <div className="ml-auto flex items-center gap-2">
                              <span className="font-semibold text-foreground">
                                ${booking.price ? parseFloat(booking.price).toFixed(2) : "0.00"}
                              </span>
                              <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Eye className="w-4 h-4 mr-1" />
                                View
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="movers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Movers</CardTitle>
                <CardDescription>Registered mover accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!movers || movers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No movers registered yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {movers.map((mover) => (
                        <div
                          key={mover.id}
                          className="flex items-center justify-between p-3 border rounded-md"
                          data-testid={`mover-row-${mover.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {mover.user?.name || "Unknown Mover"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {mover.user?.email || "No email"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {mover.vehicleType} • {mover.totalMoves} moves
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {mover.isVerified && (
                              <Badge variant="default">Verified</Badge>
                            )}
                            <span className="text-sm font-medium">
                              {parseFloat(mover.rating).toFixed(1)}★
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Users</CardTitle>
                <CardDescription>Registered user accounts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!users || users.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No users registered yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {users.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between p-3 border rounded-md"
                          data-testid={`user-row-${u.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              u.role === 'admin' ? 'bg-purple-100 dark:bg-purple-900/30' :
                              u.role === 'mover' ? 'bg-blue-100 dark:bg-blue-900/30' :
                              'bg-green-100 dark:bg-green-900/30'
                            }`}>
                              <UserIcon className={`w-5 h-5 ${
                                u.role === 'admin' ? 'text-purple-600 dark:text-purple-400' :
                                u.role === 'mover' ? 'text-blue-600 dark:text-blue-400' :
                                'text-green-600 dark:text-green-400'
                              }`} />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{u.name || "Unnamed User"}</p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="capitalize">
                            {u.role}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Booking Detail Dialog */}
        <Dialog open={!!selectedBooking} onOpenChange={(open) => !open && setSelectedBooking(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Booking Details
              </DialogTitle>
              <DialogDescription>
                Full itinerary and booking information
              </DialogDescription>
            </DialogHeader>

            {selectedBooking && (
              <div className="space-y-6">
                {/* Status & Payment */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={`${getStatusColor(selectedBooking.status)} text-white`}>
                      {selectedBooking.status.replace("_", " ")}
                    </Badge>
                    {getPaymentBadge(selectedBooking.paymentStatus)}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">
                      ${selectedBooking.price ? parseFloat(selectedBooking.price).toFixed(2) : "0.00"} CAD
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Created {format(new Date(selectedBooking.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Customer Info */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Customer</h3>
                  <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <UserIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{selectedBooking.customer?.name || "Unknown"}</p>
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-1">
                        {selectedBooking.customer?.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            <span>{selectedBooking.customer.email}</span>
                          </div>
                        )}
                        {selectedBooking.customer?.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            <span>{selectedBooking.customer.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Itinerary */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Itinerary</h3>
                  <div className="space-y-3">
                    {/* Pickup */}
                    <div className="flex gap-3 p-4 border rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-muted-foreground">Pickup Location</p>
                        <p className="font-medium">{selectedBooking.pickupAddress || "Not specified"}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Access: {getDifficultyLabel(selectedBooking.pickupDifficulty)}
                        </p>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
                      </div>
                    </div>

                    {/* Dropoff */}
                    <div className="flex gap-3 p-4 border rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-muted-foreground">Dropoff Location</p>
                        <p className="font-medium">{selectedBooking.dropoffAddress || "Not specified"}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Access: {getDifficultyLabel(selectedBooking.dropoffDifficulty)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Move Details */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Move Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Scheduled Date</span>
                      </div>
                      <p className="font-medium">
                        {selectedBooking.preferredDate 
                          ? format(new Date(selectedBooking.preferredDate), "EEEE, MMM d, yyyy")
                          : "Not scheduled"}
                      </p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Box className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Load Size</span>
                      </div>
                      <p className="font-medium">{getLoadSizeLabel(selectedBooking.loadSize)}</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Movers Required</span>
                      </div>
                      <p className="font-medium">{selectedBooking.numberOfMovers} mover(s)</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Distance</span>
                      </div>
                      <p className="font-medium">
                        {selectedBooking.distance ? `${parseFloat(selectedBooking.distance).toFixed(1)} km` : "Calculating..."}
                      </p>
                    </div>
                  </div>

                  {selectedBooking.heavyItem && (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <AlertCircle className="w-4 h-4" />
                        <span className="font-medium">Heavy items included</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Assigned Mover */}
                {selectedBooking.mover && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Assigned Mover</h3>
                    <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
                      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <Truck className="w-6 h-6 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{selectedBooking.mover.user?.name || selectedBooking.mover.name || "Assigned"}</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          {selectedBooking.mover.vehicleType && (
                            <span>{selectedBooking.mover.vehicleType}</span>
                          )}
                          {selectedBooking.mover.rating && (
                            <span>{parseFloat(selectedBooking.mover.rating).toFixed(1)}★</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Description */}
                {selectedBooking.description && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Additional Notes</h3>
                    <div className="p-4 border rounded-lg bg-muted/30">
                      <p className="text-sm">{selectedBooking.description}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
