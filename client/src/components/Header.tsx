import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, Truck } from "lucide-react";
import { useState } from "react";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

          <nav className="hidden md:flex items-center gap-1">
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

          <div className="hidden md:flex items-center gap-2">
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
          </div>
        </div>
      )}
    </header>
  );
}
