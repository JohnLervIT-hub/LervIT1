import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";

type MessageNotification = {
  bookingId: string;
  count: number;
  latestMessage: {
    id: string;
    text: string;
    createdAt: string;
    senderId: string;
  };
};

type NotificationResponse = {
  totalUnread: number;
  byBooking: MessageNotification[];
};

export function MessageNotification() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: notifications } = useQuery<NotificationResponse>({
    queryKey: ["/api/messages/notifications"],
    enabled: !!user,
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 3000,
  });

  if (!user || !notifications || notifications.totalUnread === 0) {
    return (
      <Button 
        variant="ghost" 
        size="icon" 
        className="relative hover-elevate active-elevate-2"
        aria-label="Notifications"
        data-testid="button-notifications"
      >
        <Bell className="w-5 h-5" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative hover-elevate active-elevate-2"
          aria-label={`${notifications.totalUnread} unread messages`}
          data-testid="button-notifications"
        >
          <Bell className="w-5 h-5" />
          <Badge 
            className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center text-xs px-1 bg-destructive text-destructive-foreground"
            data-testid="badge-unread-count"
          >
            {notifications.totalUnread > 99 ? "99+" : notifications.totalUnread}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Messages</span>
          <Badge variant="secondary" className="text-xs">
            {notifications.totalUnread} unread
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.byBooking.slice(0, 5).map((notification) => (
          <DropdownMenuItem
            key={notification.bookingId}
            className="flex flex-col items-start gap-1 cursor-pointer py-3"
            onClick={() => setLocation(`/messages/${notification.bookingId}`)}
            data-testid={`notification-booking-${notification.bookingId}`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-medium text-sm">
                Move #{notification.bookingId.slice(0, 8)}
              </span>
              <Badge variant="secondary" className="text-xs">
                {notification.count} new
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {notification.latestMessage.text}
            </p>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(notification.latestMessage.createdAt), { addSuffix: true })}
            </span>
          </DropdownMenuItem>
        ))}
        {notifications.byBooking.length > 5 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-center text-sm text-primary cursor-pointer justify-center"
              onClick={() => setLocation(user.role === "mover" ? "/mover-dashboard" : "/my-bookings")}
            >
              View all messages
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
