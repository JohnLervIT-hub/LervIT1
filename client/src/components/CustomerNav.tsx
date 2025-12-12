import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin, FileText } from "lucide-react";

export function CustomerNav() {
  return (
    <nav className="flex items-center gap-1">
      <Link href="/request-move" data-testid="link-request-move">
        <Button variant="ghost" className="hover-elevate active-elevate-2">
          <MapPin className="w-4 h-4 mr-2" />
          Request Move
        </Button>
      </Link>
      <Link href="/my-bookings" data-testid="link-my-bookings">
        <Button variant="ghost" className="hover-elevate active-elevate-2">
          <FileText className="w-4 h-4 mr-2" />
          My Bookings
        </Button>
      </Link>
      <Link href="/dashboard" data-testid="link-dashboard">
        <Button variant="ghost" className="hover-elevate active-elevate-2">
          Dashboard
        </Button>
      </Link>
    </nav>
  );
}
