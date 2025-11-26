import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield, HelpCircle, MessageSquare, FileCheck } from "lucide-react";

export function AdminNav() {
  const [location] = useLocation();
  
  const isActive = (path: string) => {
    if (path === "/admin") return location === "/admin";
    return location.startsWith(path);
  };

  return (
    <nav className="flex items-center gap-1 bg-blue-600 dark:bg-blue-700 px-2 py-1 rounded-lg">
      <Link href="/admin" data-testid="link-admin">
        <Button 
          variant="ghost" 
          size="sm"
          className={`text-white hover:bg-blue-500 dark:hover:bg-blue-600 ${isActive("/admin") ? "bg-blue-500 dark:bg-blue-600" : ""}`}
        >
          <Shield className="w-4 h-4 mr-2" />
          Dashboard
        </Button>
      </Link>
      <Link href="/admin/verification" data-testid="link-admin-verification">
        <Button 
          variant="ghost" 
          size="sm"
          className={`text-white hover:bg-blue-500 dark:hover:bg-blue-600 ${isActive("/admin/verification") ? "bg-blue-500 dark:bg-blue-600" : ""}`}
        >
          <FileCheck className="w-4 h-4 mr-2" />
          Verification
        </Button>
      </Link>
      <Link href="/admin/support" data-testid="link-admin-support">
        <Button 
          variant="ghost" 
          size="sm"
          className={`text-white hover:bg-blue-500 dark:hover:bg-blue-600 ${isActive("/admin/support") ? "bg-blue-500 dark:bg-blue-600" : ""}`}
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          Support
        </Button>
      </Link>
      <Link href="/support" data-testid="link-support">
        <Button 
          variant="ghost" 
          size="sm"
          className={`text-white hover:bg-blue-500 dark:hover:bg-blue-600 ${isActive("/support") ? "bg-blue-500 dark:bg-blue-600" : ""}`}
        >
          <HelpCircle className="w-4 h-4 mr-2" />
          Help
        </Button>
      </Link>
    </nav>
  );
}
