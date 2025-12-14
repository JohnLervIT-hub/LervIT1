import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Bell, 
  Calendar, 
  MessageSquare, 
  CreditCard, 
  Star, 
  Truck, 
  AlertCircle,
  CheckCircle2,
  Inbox as InboxIcon,
  CheckCheck
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import type { InAppNotification } from "@shared/schema";

const NOTIFICATION_ICONS: Record<string, typeof Bell> = {
  booking_created: Calendar,
  booking_confirmed: CheckCircle2,
  booking_status_update: Truck,
  booking_cancelled: AlertCircle,
  booking_completed: CheckCircle2,
  payment_received: CreditCard,
  payment_failed: AlertCircle,
  mover_assigned: Truck,
  job_opportunity: Bell,
  job_expired: AlertCircle,
  new_message: MessageSquare,
  review_received: Star,
  support_ticket_update: MessageSquare,
  earnings_received: CreditCard,
  payout_completed: CreditCard,
  verification_update: CheckCircle2,
  system_message: Bell,
};

export default function Inbox() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: notifications, isLoading } = useQuery<InAppNotification[]>({
    queryKey: ["/api/inbox"],
    enabled: !!user,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return apiRequest("POST", `/api/inbox/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/inbox/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/unread-count"] });
    },
  });

  const handleNotificationClick = async (notification: InAppNotification) => {
    if (!notification.isRead) {
      await markAsReadMutation.mutateAsync(notification.id);
    }
    
    if (notification.actionUrl) {
      setLocation(notification.actionUrl);
    }
  };

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Please log in to view your inbox.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20 pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <CardTitle>Inbox</CardTitle>
              {unreadCount > 0 && (
                <Badge variant="destructive" data-testid="badge-inbox-unread">
                  {unreadCount} unread
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="w-4 h-4 mr-2" />
                Mark all read
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4">
                    <div className="flex gap-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications && notifications.length > 0 ? (
              <div className="divide-y">
                {notifications.map((notification) => {
                  const IconComponent = NOTIFICATION_ICONS[notification.type] || Bell;
                  return (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full text-left p-4 hover-elevate transition-colors ${
                        !notification.isRead ? "bg-muted/50" : ""
                      }`}
                      data-testid={`notification-item-${notification.id}`}
                    >
                      <div className="flex gap-3">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                          !notification.isRead 
                            ? "bg-primary/10 text-primary" 
                            : "bg-muted text-muted-foreground"
                        }`}>
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm ${!notification.isRead ? "font-semibold" : ""}`}>
                              {notification.title}
                            </p>
                            {!notification.isRead && (
                              <span className="flex-shrink-0 w-2 h-2 bg-primary rounded-full" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <InboxIcon className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No notifications yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  You'll be notified about booking updates, messages, and more.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
