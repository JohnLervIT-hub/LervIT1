import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Truck, Calendar, DollarSign, TrendingUp, Shield, Clock, CheckCircle, ChevronRight } from "lucide-react";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
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
  customer: {
    name: string;
  } | null;
  mover: {
    name: string;
  } | null;
};

export default function AdminDashboard() {
  const { user } = useAuth();

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: movers } = useQuery<Mover[]>({
    queryKey: ["/api/movers"],
  });

  const { data: bookings } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
  });

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">This page is only available for administrators.</p>
        </div>
      </div>
    );
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
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">Admin Dashboard</h1>
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
                <CardDescription>Recent booking activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!bookings || bookings.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No bookings yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {bookings.map((booking) => (
                        <div
                          key={booking.id}
                          className="flex items-center justify-between p-3 border rounded-md"
                          data-testid={`booking-row-${booking.id}`}
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {booking.customer?.name || "Unknown"} → {booking.mover?.name || "Unassigned"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(booking.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{booking.status}</Badge>
                            {booking.price && (
                              <span className="text-sm font-medium">
                                ${parseFloat(booking.price).toFixed(2)}
                              </span>
                            )}
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
                          <div>
                            <p className="text-sm font-medium">
                              {mover.user?.name || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {mover.vehicleType} • {mover.totalMoves} moves
                            </p>
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
                          <div>
                            <p className="text-sm font-medium">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
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
      </div>
    </div>
  );
}
