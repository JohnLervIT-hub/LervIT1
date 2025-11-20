import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Truck, Calendar, DollarSign } from "lucide-react";

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

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Platform overview and management</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-users">
                {users?.length || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Verified Movers</CardTitle>
              <Truck className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-verified-movers">
                {verifiedMovers}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Moves</CardTitle>
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-completed-bookings">
                {completedBookings}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-revenue">
                ${totalRevenue.toFixed(2)}
              </div>
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
