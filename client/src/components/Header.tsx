import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, Truck, User, LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CustomerNav } from "./CustomerNav";
import { MoverNav } from "./MoverNav";
import { AdminNav } from "./AdminNav";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" data-testid="link-home">
            <div className="flex items-center gap-2 hover-elevate active-elevate-2 px-3 py-2 rounded-md cursor-pointer">
              <Truck className="w-6 h-6 text-primary" />
              <span className="text-xl font-bold">MoveIt</span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {user ? (
              <>
                {user.role === "customer" && <CustomerNav />}
                {user.role === "mover" && <MoverNav />}
                {user.role === "admin" && <AdminNav />}
              </>
            ) : (
              <nav className="flex items-center gap-1">
                <Link href="/demo" data-testid="link-demo">
                  <Button variant="outline" size="sm">
                    🗺️ Map
                  </Button>
                </Link>
                <Link href="/lifecycle" data-testid="link-lifecycle">
                  <Button variant="outline" size="sm">
                    🎬 Customer
                  </Button>
                </Link>
                <Link href="/mover-lifecycle" data-testid="link-mover-lifecycle">
                  <Button variant="default" size="sm" className="bg-gradient-to-r from-primary to-green-500">
                    🚚 Mover
                  </Button>
                </Link>
                <Link href="/browse-movers" data-testid="link-browse-movers">
                  <Button variant="ghost" className="hover-elevate active-elevate-2">
                    Find Movers
                  </Button>
                </Link>
                <Link href="/how-it-works" data-testid="link-how-it-works">
                  <Button variant="ghost" className="hover-elevate active-elevate-2">
                    How It Works
                  </Button>
                </Link>
                <Link href="/become-mover" data-testid="link-become-mover">
                  <Button variant="ghost" className="hover-elevate active-elevate-2">
                    Become a Mover
                  </Button>
                </Link>
              </nav>
            )}
          </div>

          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover-elevate active-elevate-2" data-testid="button-user-menu">
                    <User className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    {user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground capitalize">
                    Role: {user.role}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} data-testid="button-logout">
                    <LogOut className="w-4 h-4 mr-2" />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link href="/login" data-testid="link-login">
                  <Button variant="ghost" className="hover-elevate active-elevate-2">
                    Sign In
                  </Button>
                </Link>
                <Link href="/request-move" data-testid="link-request-move">
                  <Button data-testid="button-book-move">
                    Book a Move
                  </Button>
                </Link>
              </>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden hover-elevate active-elevate-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="button-mobile-menu"
          >
            <Menu className="w-6 h-6" />
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <div className="px-4 py-4 space-y-2">
            {user ? (
              <>
                {user.role === "customer" && (
                  <>
                    <Link href="/request-move" data-testid="link-mobile-request-move">
                      <Button variant="ghost" className="w-full justify-start hover-elevate active-elevate-2">
                        Request Move
                      </Button>
                    </Link>
                    <Link href="/my-bookings" data-testid="link-mobile-my-bookings">
                      <Button variant="ghost" className="w-full justify-start hover-elevate active-elevate-2">
                        My Bookings
                      </Button>
                    </Link>
                    <Link href="/dashboard" data-testid="link-mobile-dashboard">
                      <Button variant="ghost" className="w-full justify-start hover-elevate active-elevate-2">
                        Dashboard
                      </Button>
                    </Link>
                  </>
                )}
                {user.role === "mover" && (
                  <>
                    <Link href="/mover-dashboard" data-testid="link-mobile-mover-dashboard">
                      <Button variant="ghost" className="w-full justify-start hover-elevate active-elevate-2">
                        Mover Dashboard
                      </Button>
                    </Link>
                  </>
                )}
                {user.role === "admin" && (
                  <>
                    <Link href="/admin" data-testid="link-mobile-admin">
                      <Button variant="ghost" className="w-full justify-start hover-elevate active-elevate-2">
                        Admin Dashboard
                      </Button>
                    </Link>
                  </>
                )}
                <Button 
                  variant="outline" 
                  className="w-full hover-elevate active-elevate-2"
                  onClick={logout}
                  data-testid="button-mobile-logout"
                >
                  Log Out
                </Button>
              </>
            ) : (
              <>
                <Link href="/demo" data-testid="link-mobile-demo">
                  <Button variant="ghost" className="w-full justify-start hover-elevate active-elevate-2">
                    🗺️ Map Demo
                  </Button>
                </Link>
                <Link href="/lifecycle" data-testid="link-mobile-lifecycle">
                  <Button variant="ghost" className="w-full justify-start hover-elevate active-elevate-2">
                    🎬 Customer Lifecycle
                  </Button>
                </Link>
                <Link href="/mover-lifecycle" data-testid="link-mobile-mover-lifecycle">
                  <Button variant="ghost" className="w-full justify-start hover-elevate active-elevate-2">
                    🚚 Mover Lifecycle
                  </Button>
                </Link>
                <Link href="/browse-movers" data-testid="link-mobile-browse">
                  <Button variant="ghost" className="w-full justify-start hover-elevate active-elevate-2">
                    Find Movers
                  </Button>
                </Link>
                <Link href="/how-it-works" data-testid="link-mobile-how">
                  <Button variant="ghost" className="w-full justify-start hover-elevate active-elevate-2">
                    How It Works
                  </Button>
                </Link>
                <Link href="/become-mover" data-testid="link-mobile-become">
                  <Button variant="ghost" className="w-full justify-start hover-elevate active-elevate-2">
                    Become a Mover
                  </Button>
                </Link>
                <Link href="/login" data-testid="link-mobile-login">
                  <Button variant="outline" className="w-full hover-elevate active-elevate-2">
                    Sign In
                  </Button>
                </Link>
                <Link href="/request-move" data-testid="link-mobile-request">
                  <Button className="w-full">
                    Book a Move
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
