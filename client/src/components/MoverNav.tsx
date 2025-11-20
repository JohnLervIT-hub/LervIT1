import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LayoutDashboard } from "lucide-react";

export function MoverNav() {
  return (
    <nav className="flex items-center gap-1">
      <Link href="/mover-dashboard" data-testid="link-mover-dashboard">
        <Button variant="ghost" className="hover-elevate active-elevate-2">
          <LayoutDashboard className="w-4 h-4 mr-2" />
          Dashboard
        </Button>
      </Link>
    </nav>
  );
}
