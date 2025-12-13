import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, ArrowLeft, Search, Shield, Truck, User, Eye, MapPin, Calendar, DollarSign, MessageCircle, CheckCircle, Clock, Package, Pencil, Trash2, Save, X } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserType | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", role: "" });

  const { data: users, isLoading

 } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const { data: allBookings } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; email: string; phone: string; role: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${data.id}`, {
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: data.role,
      });
    },
    onSuccess: () => {
      toast({ title: "User updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingUser(null);
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update user", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      toast({ title: "User deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDeleteConfirmUser(null);
      setSelectedUser(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete user", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

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

  const handleEditClick = (u: UserType) => {
    setEditingUser(u);
    setEditForm({
      name: u.name || "",
      email: u.email || "",
      phone: u.phone || "",
      role: u.role || "customer",
    });
  };

  const handleSaveEdit = () => {
    if (!editingUser) return;
    updateUserMutation.mutate({
      id: editingUser.id,
      ...editForm,
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
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedUser(u);
                              }}
                              data-testid={`button-view-user-${u.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(u);
                              }}
                              data-testid={`button-edit-user-${u.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            {u.id !== user.id && (
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmUser(u);
                                }}
                                data-testid={`button-delete-user-${u.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
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
      <Dialog open={!!selectedUser && !editingUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
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
                    <div className="flex gap-2 pt-2">
                      <Button 
                        onClick={() => handleEditClick(selectedUser)}
                        data-testid="button-edit-profile"
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit Profile
                      </Button>
                      {selectedUser.id !== user.id && (
                        <Button 
                          variant="destructive"
                          onClick={() => setDeleteConfirmUser(selectedUser)}
                          data-testid="button-delete-profile"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete User
                        </Button>
                      )}
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

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User Profile</DialogTitle>
            <DialogDescription>
              Update the user's information below
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Enter name"
                data-testid="input-edit-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="Enter email"
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="Enter phone number"
                data-testid="input-edit-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={editForm.role} onValueChange={(value) => setEditForm({ ...editForm, role: value })}>
                <SelectTrigger data-testid="select-edit-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="mover">Mover</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)} data-testid="button-cancel-edit">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit} 
              disabled={updateUserMutation.isPending}
              data-testid="button-save-edit"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmUser} onOpenChange={(open) => !open && setDeleteConfirmUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the account for <strong>{deleteConfirmUser?.name || deleteConfirmUser?.email}</strong>? 
              This action cannot be undone and will remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => deleteConfirmUser && deleteUserMutation.mutate(deleteConfirmUser.id)}
              disabled={deleteUserMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
