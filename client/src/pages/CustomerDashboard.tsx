import { useState } from "react";
import BookingCard from "@/components/BookingCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useLocation } from "wouter";
import moverPhoto1 from "@assets/generated_images/male_mover_profile_photo.png";
import moverPhoto2 from "@assets/generated_images/female_mover_profile_photo.png";

//todo: remove mock functionality
const mockBookings = [
  {
    id: "1",
    moverName: "Sarah Chen",
    moverPhoto: moverPhoto2,
    pickupAddress: "123 Main St SW, Calgary, AB",
    dropoffAddress: "456 Oak Ave NW, Calgary, AB",
    date: "Dec 28, 2024",
    time: "2:00 PM",
    status: "confirmed" as const,
    price: 185,
  },
  {
    id: "2",
    moverName: "Mike Johnson",
    moverPhoto: moverPhoto1,
    pickupAddress: "789 Pine Rd SE, Calgary, AB",
    dropoffAddress: "321 Maple Dr NE, Calgary, AB",
    date: "Dec 30, 2024",
    time: "10:00 AM",
    status: "pending" as const,
    price: 165,
  },
];

const mockPastBookings = [
  {
    id: "3",
    moverName: "David Martinez",
    moverPhoto: moverPhoto1,
    pickupAddress: "555 River St, Calgary, AB",
    dropoffAddress: "888 Park Ave, Calgary, AB",
    date: "Dec 15, 2024",
    time: "1:00 PM",
    status: "completed" as const,
    price: 145,
  },
];

export default function CustomerDashboard() {
  const [, setLocation] = useLocation();

  const handleMessage = (id: string) => {
    console.log("Message booking:", id);
    setLocation("/messages");
  };

  const handleViewDetails = (id: string) => {
    console.log("View details:", id);
    setLocation(`/booking/${id}`);
  };

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              My Bookings
            </h1>
            <p className="text-muted-foreground">
              Manage your moving requests
            </p>
          </div>
          <Button onClick={() => setLocation("/request-move")} data-testid="button-new-booking">
            <Plus className="w-4 h-4 mr-2" />
            New Booking
          </Button>
        </div>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="active" data-testid="tab-active">
              Active Bookings
            </TabsTrigger>
            <TabsTrigger value="past" data-testid="tab-past">
              Past Bookings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {mockBookings.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No active bookings</p>
                <Button onClick={() => setLocation("/request-move")}>
                  Book Your First Move
                </Button>
              </div>
            ) : (
              mockBookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  {...booking}
                  onMessage={handleMessage}
                  onViewDetails={handleViewDetails}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {mockPastBookings.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No past bookings</p>
              </div>
            ) : (
              mockPastBookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  {...booking}
                  onMessage={handleMessage}
                  onViewDetails={handleViewDetails}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
