import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { DollarSign, ArrowLeft, TrendingUp, Calendar, CreditCard, CheckCircle } from "lucide-react";
import { format, subDays, isAfter } from "date-fns";

type Booking = {
  id: string;
  status: string;
  price: string | null;
  paymentStatus: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledDate: string;
  createdAt: string;
  customer: {
    firstName: string;
    lastName: string;
  } | null;
  mover: {
    firstName: string;
    lastName: string;
  } | null;
};

export default function AdminRevenuePage() {
  const { user } = useAuth();

  const { data: bookings, isLoading } = useQuery<Booking[]>({
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

  const completedBookings = bookings?.filter(b => b.status === "completed") || [];
  const paidBookings = bookings?.filter(b => b.paymentStatus === "paid" || b.paymentStatus === "succeeded") || [];
  
  const totalRevenue = completedBookings.reduce((sum, b) => sum + (parseFloat(b.price || "0")), 0);
  const paidRevenue = paidBookings.reduce((sum, b) => sum + (parseFloat(b.price || "0")), 0);
  
  const today = new Date();
  const last7Days = subDays(today, 7);
  const last30Days = subDays(today, 30);
  
  const revenueThisWeek = completedBookings
    .filter(b => b.createdAt && isAfter(new Date(b.createdAt), last7Days))
    .reduce((sum, b) => sum + (parseFloat(b.price || "0")), 0);
    
  const revenueThisMonth = completedBookings
    .filter(b => b.createdAt && isAfter(new Date(b.createdAt), last30Days))
    .reduce((sum, b) => sum + (parseFloat(b.price || "0")), 0);

  const avgBookingValue = completedBookings.length > 0 
    ? totalRevenue / completedBookings.length 
    : 0;

  return (
    <div className="min-h-screen pt-24 pb-12 bg-gradient-to-b from-amber-50/50 to-background dark:from-amber-950/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20" data-testid="button-back-admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500 rounded-lg">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">Revenue Overview</h1>
          </div>
          <p className="text-muted-foreground text-lg">Track earnings and payment analytics</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-amber-100">Total Revenue</CardTitle>
              <DollarSign className="w-5 h-5 text-amber-200" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="stat-total-revenue">
                ${totalRevenue.toFixed(2)}
              </div>
              <p className="text-xs text-amber-200 mt-1">CAD from completed moves</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
              <TrendingUp className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">${revenueThisWeek.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Calendar className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">${revenueThisMonth.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Booking</CardTitle>
              <CreditCard className="w-4 h-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">${avgBookingValue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Per completed move</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                Payment Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Paid Bookings</span>
                  <span className="font-bold text-green-600">{paidBookings.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Paid Revenue</span>
                  <span className="font-bold text-green-600">${paidRevenue.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Completed Moves</span>
                  <span className="font-bold">{completedBookings.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-500" />
                Revenue Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Lifetime Revenue</span>
                  <span className="font-bold">${totalRevenue.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Collection Rate</span>
                  <span className="font-bold">{totalRevenue > 0 ? ((paidRevenue / totalRevenue) * 100).toFixed(1) : 0}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Avg. per Completed Move</span>
                  <span className="font-bold">${avgBookingValue.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Completed Moves</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : completedBookings.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Mover</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedBookings.slice(0, 10).map((b) => (
                      <TableRow key={b.id} data-testid={`row-revenue-${b.id}`}>
                        <TableCell>
                          {b.scheduledDate ? format(new Date(b.scheduledDate), "MMM d, yyyy") : "N/A"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {b.customer?.firstName} {b.customer?.lastName}
                        </TableCell>
                        <TableCell>
                          {b.mover ? `${b.mover.firstName} ${b.mover.lastName}` : "N/A"}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <div className="truncate text-sm" title={b.pickupAddress}>
                            {b.pickupAddress?.split(",")[0] || "N/A"}
                          </div>
                          <div className="truncate text-xs text-muted-foreground" title={b.dropoffAddress}>
                            → {b.dropoffAddress?.split(",")[0] || "N/A"}
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-green-600">
                          ${parseFloat(b.price || "0").toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {b.paymentStatus === "paid" || b.paymentStatus === "succeeded" ? (
                            <Badge className="bg-green-500 text-white">Paid</Badge>
                          ) : (
                            <Badge variant="secondary">{b.paymentStatus || "Pending"}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No completed moves yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
