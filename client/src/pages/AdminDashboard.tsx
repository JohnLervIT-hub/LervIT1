import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Truck, DollarSign, Calendar } from "lucide-react";

//todo: remove mock functionality
const mockStats = [
  {
    label: "Total Bookings",
    value: "1,284",
    change: "+12.3%",
    icon: <Calendar className="w-6 h-6" />,
  },
  {
    label: "Active Movers",
    value: "523",
    change: "+8.1%",
    icon: <Truck className="w-6 h-6" />,
  },
  {
    label: "Total Customers",
    value: "3,847",
    change: "+15.2%",
    icon: <Users className="w-6 h-6" />,
  },
  {
    label: "Revenue (Dec)",
    value: "$187,420",
    change: "+23.5%",
    icon: <DollarSign className="w-6 h-6" />,
  },
];

const mockRecentBookings = [
  {
    id: "1234",
    customer: "John Doe",
    mover: "Sarah Chen",
    date: "Dec 28, 2024",
    price: "$185",
    status: "confirmed",
  },
  {
    id: "1235",
    customer: "Jane Smith",
    mover: "Mike Johnson",
    date: "Dec 29, 2024",
    price: "$165",
    status: "pending",
  },
  {
    id: "1236",
    customer: "Bob Wilson",
    mover: "David Martinez",
    date: "Dec 30, 2024",
    price: "$145",
    status: "completed",
  },
];

export default function AdminDashboard() {
  return (
    <div className="min-h-screen pt-24 pb-12 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">
            Overview of platform activity
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {mockStats.map((stat, index) => (
            <Card key={index} data-testid={`card-stat-${index}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    {stat.icon}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {stat.change}
                  </Badge>
                </div>
                <div className="text-2xl font-bold mb-1" data-testid={`text-stat-value-${index}`}>
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground">
                  {stat.label}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <h2 className="text-2xl font-bold">Recent Bookings</h2>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Mover</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockRecentBookings.map((booking) => (
                    <TableRow key={booking.id} data-testid={`row-booking-${booking.id}`}>
                      <TableCell className="font-medium">#{booking.id}</TableCell>
                      <TableCell>{booking.customer}</TableCell>
                      <TableCell>{booking.mover}</TableCell>
                      <TableCell>{booking.date}</TableCell>
                      <TableCell>{booking.price}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            booking.status === "completed"
                              ? "default"
                              : booking.status === "confirmed"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {booking.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
