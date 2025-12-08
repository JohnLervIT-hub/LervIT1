import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, ArrowLeft, Search, Shield, Truck, User, Eye, MapPin, Calendar, DollarSign, MessageCircle, CheckCircle, Clock, Package } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

type UserType = {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  createdAt: string;
};

type Booking = {
  id: string;
  pickupAddress: string;
  dropoffAddress: string;
  preferredDate: string;
  status: string;
  price: string;
  loadSize: string;
  customerId: string;
  moverId?: string;
  mover?: { user?: { name: string } };
  customer?: { name: string };
};

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);

  const { data: users, isLoading } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  // Fetch all bookings for admin view
  const { data: allBookings } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
  });

  // Get user's bookings (as customer or mover)
  const getUserBookings = (userId: string, role: string) => {
    if (!allBookings) return [];
    if (role === "customer") {
      return allBookings.filter(b => b.customerId === userId);
    } else if (role === "mover") {
      return allBookings.filter(b => b.moverId === userId);
    }
    return [];
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: any }> = {
      pending: { color: "bg-amber-500/10 text-amber-600", icon: Clock },
      confirmed: { color: "bg-blue-500/10 text-blue-600", icon: CheckCircle },
      en_route_to_pickup: { color: "bg-green-500/10 text-green-600", icon: Truck },
      loading: { color: "bg-green-500/10 text-green-600", icon: Package },
      en_route_to_dropoff: { color: "bg-green-500/10 text-green-600", icon: Truck },
      unloading: { color: "bg-green-500/10 text-green-600", icon: Package },
      completed: { color: "bg-green-500/10 text-green-600", icon: CheckCircle },
      cancelled: { color: "bg-red-500/10 text-red-600", icon: Clock },
    };
    const config = statusConfig[status] || { color: "bg-muted text-muted-foreground", icon: Clock };
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} gap-1`}>
        <Icon className="w-3 h-3" />
        {status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
      </Badge>
    );
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

  const filteredUsers = users?.filter(u => {
    const matchesSearch = 
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = 
      roleFilter === "all" || u.role === roleFilter;
    
    return matchesSearch && matchesRole;
  }) || [];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-red-500 text-white"><Shield className="w-3 h-3 mr-1" />Admin</Badge>;
      case "mover":
        return <Badge className="bg-green-500 text-white"><Truck className="w-3 h-3 mr-1" />Mover</Badge>;
      default:
        return <Badge variant="secondary"><User className="w-3 h-3 mr-1" />Customer</Badge>;
    }
  };

  const customerCount = users?.filter(u => u.role === "customer").length || 0;
  const moverCount = users?.filter(u => u.role === "mover").length || 0;
  const adminCount = users?.filter(u => u.role === "admin").length || 0;

  return (
    <div className="min-h-screen pt-24 pb-12 bg-gradient-to-b from-blue-50/50 to-background dark:from-blue-950/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20" data-testid="button-back-admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">All Users</h1>
          </div>
          <p className="text-muted-foreground text-lg">Manage all registered users on the platform</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card 
            className={`cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${roleFilter === "customer" ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => setRoleFilter(roleFilter === "customer" ? "all" : "customer")}
            data-testid="card-filter-customers"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customers</CardTitle>
              <User className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{customerCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Click to filter</p>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${roleFilter === "mover" ? "ring-2 ring-green-500" : ""}`}
            onClick={() => setRoleFilter(roleFilter === "mover" ? "all" : "mover")}
            data-testid="card-filter-movers"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Movers</CardTitle>
              <Truck className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{moverCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Click to filter</p>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${roleFilter === "admin" ? "ring-2 ring-red-500" : ""}`}
            onClick={() => setRoleFilter(roleFilter === "admin" ? "all" : "admin")}
            data-testid="card-filter-admins"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Admins</CardTitle>
              <Shield className="w-4 h-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{adminCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Click to filter</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle>User List ({filteredUsers.length})</CardTitle>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-users"
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full sm:w-40" data-testid="select-role-filter">
                    <SelectValue placeholder="Filter role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="customer">Customers</SelectItem>
                    <SelectItem value="mover">Movers</SelectItem>
                    <SelectItem value="admin">Admins</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading users...</div>
            ) : filteredUsers.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow 
                        key={u.id} 
                        data-testid={`row-user-${u.id}`}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedUser(u)}
                      >
                        <TableCell className="font-medium">
                          {u.name || "Unknown User"}
                        </TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{getRoleBadge(u.role)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.createdAt ? format(new Date(u.createdAt), "MMM d, yyyy") : "N/A"}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUser(u);
                            }}
                            data-testid={`button-view-user-${u.id}`}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No users found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Details Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
                {selectedUser?.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div>
                <span>{selectedUser?.name || "Unknown User"}</span>
                <div className="flex items-center gap-2 mt-1">
                  {selectedUser && getRoleBadge(selectedUser.role)}
                </div>
              </div>
            </DialogTitle>
            <DialogDescription>
              User profile and activity details
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <Tabs defaultValue="profile" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="profile" data-testid="tab-user-profile">Profile</TabsTrigger>
                <TabsTrigger value="activity" data-testid="tab-user-activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="mt-4">
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="font-medium">{selectedUser.email}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <p className="font-medium">{selectedUser.phone || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Role</p>
                        <p className="font-medium capitalize">{selectedUser.role}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Member Since</p>
                        <p className="font-medium">
                          {selectedUser.createdAt ? format(new Date(selectedUser.createdAt), "MMM d, yyyy") : "N/A"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">User ID</p>
                      <p className="font-mono text-xs text-muted-foreground">{selectedUser.id}</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {selectedUser.role === "customer" ? "Bookings" : selectedUser.role === "mover" ? "Jobs" : "Activity"}
                    </CardTitle>
                    <CardDescription>
                      {selectedUser.role === "customer" 
                        ? "All moves requested by this customer" 
                        : selectedUser.role === "mover" 
                        ? "All jobs assigned to this mover"
                        : "No activity to show for admins"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[300px]">
                      {selectedUser.role === "admin" ? (
                        <div className="p-4 text-center text-muted-foreground">
                          Admin users don't have booking activity
                        </div>
                      ) : (
                        <div className="divide-y">
                          {getUserBookings(selectedUser.id, selectedUser.role).length === 0 ? (
                            <div className="p-4 text-center text-muted-foreground">
                              No {selectedUser.role === "customer" ? "bookings" : "jobs"} found
                            </div>
                          ) : (
                            getUserBookings(selectedUser.id, selectedUser.role)
                              .sort((a, b) => new Date(b.preferredDate).getTime() - new Date(a.preferredDate).getTime())
                              .map((booking) => (
                                <div key={booking.id} className="p-4 hover:bg-muted/50" data-testid={`activity-booking-${booking.id}`}>
                                  <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-muted-foreground" />
                                      <span className="font-medium">
                                        {format(new Date(booking.preferredDate), "MMM d, yyyy")}
                                      </span>
                                    </div>
                                    {getStatusBadge(booking.status)}
                                  </div>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <MapPin className="w-3 h-3 text-green-600" />
                                      <span className="line-clamp-1">{booking.pickupAddress}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <MapPin className="w-3 h-3 text-primary" />
                                      <span className="line-clamp-1">{booking.dropoffAddress}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between mt-2 pt-2 border-t">
                                    <span className="text-sm text-muted-foreground capitalize">{booking.loadSize} load</span>
                                    <span className="font-semibold text-green-600">
                                      ${parseFloat(booking.price || "0").toFixed(2)} CAD
                                    </span>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
