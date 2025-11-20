import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield, HelpCircle, MessageSquare } from "lucide-react";

export function AdminNav() {
  return (
    <nav className="flex items-center gap-1">
      <Link href="/admin" data-testid="link-admin">
        <Button variant="ghost" className="hover-elevate active-elevate-2">
          <Shield className="w-4 h-4 mr-2" />
          Admin Dashboard
        </Button>
      </Link>
      <Link href="/admin/support" data-testid="link-admin-support">
        <Button variant="ghost" className="hover-elevate active-elevate-2">
          <MessageSquare className="w-4 h-4 mr-2" />
          Support Tickets
        </Button>
      </Link>
      <Link href="/support" data-testid="link-support">
        <Button variant="ghost" className="hover-elevate active-elevate-2">
          <HelpCircle className="w-4 h-4 mr-2" />
          Help Center
        </Button>
      </Link>
    </nav>
  );
}
