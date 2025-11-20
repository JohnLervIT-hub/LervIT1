import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";

export function AdminNav() {
  return (
    <nav className="flex items-center gap-1">
      <Link href="/admin" data-testid="link-admin">
        <Button variant="ghost" className="hover-elevate active-elevate-2">
          <Shield className="w-4 h-4 mr-2" />
          Admin Dashboard
        </Button>
      </Link>
    </nav>
  );
}
