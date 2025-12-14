import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface UnreadCountResponse {
  count: number;
}

export function InboxIndicator() {
  const { data } = useQuery<UnreadCountResponse>({
    queryKey: ["/api/inbox/unread-count"],
    refetchInterval: 30000,
  });

  const unreadCount = data?.count ?? 0;

  return (
    <Link href="/inbox" data-testid="link-inbox">
      <Button 
        variant="ghost" 
        size="icon" 
        className="relative"
        aria-label={`Inbox${unreadCount > 0 ? ` - ${unreadCount} unread` : ''}`}
        data-testid="button-inbox"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span 
            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full min-w-5 h-5 flex items-center justify-center px-1"
            data-testid="badge-unread-count"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>
    </Link>
  );
}
