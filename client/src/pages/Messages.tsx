import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useRoute } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";

type Message = {
  id: string;
  bookingId: string;
  senderId: string;
  text: string;
  createdAt: string;
};

type Booking = {
  id: string;
  customerId: string;
  moverId: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  status: string;
  customer: {
    id: string;
    name: string;
    email: string;
  } | null;
  mover: {
    id: string;
    name: string;
  } | null;
};

export default function Messages() {
  const { user } = useAuth();
  const [, params] = useRoute("/messages/:bookingId");
  const [, setLocation] = useLocation();
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bookingId = params?.bookingId;

  const { data: booking } = useQuery<Booking>({
    queryKey: [`/api/bookings/${bookingId}`],
    enabled: !!bookingId,
  });

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: [`/api/messages?bookingId=${bookingId}`],
    enabled: !!bookingId,
    refetchInterval: 3000,
  });

  // Mark messages as read when viewing the conversation
  const markAsReadMutation = useMutation({
    mutationFn: async (targetBookingId: string) => {
      return apiRequest("POST", `/api/messages/${targetBookingId}/mark-read`, {});
    },
    onSuccess: () => {
      // Invalidate notifications to update the badge count
      queryClient.invalidateQueries({ queryKey: ["/api/messages/notifications"] });
    },
  });

  // Mark messages as read on component mount and when new messages arrive
  useEffect(() => {
    // Guard: only run when bookingId is defined, messages exist, and mutation isn't already pending
    if (!bookingId || !messages || messages.length === 0 || markAsReadMutation.isPending) {
      return;
    }
    // Only mark as read if there are messages from others (not self)
    const hasOtherMessages = messages.some(m => m.senderId !== user?.id);
    if (hasOtherMessages) {
      markAsReadMutation.mutate(bookingId);
    }
  }, [bookingId, messages?.length, user?.id]);

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      return apiRequest("POST", "/api/messages", {
        bookingId,
        senderId: user?.id,
        text,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/messages?bookingId=${bookingId}`] });
      setMessageText("");
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageText.trim() && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate(messageText);
    }
  };

  if (!user || !bookingId) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-muted-foreground">Invalid booking.</p>
        </div>
      </div>
    );
  }

  const otherParty = booking?.customer?.id === user.id ? booking?.mover : booking?.customer;

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(user.role === "mover" ? "/mover-dashboard" : "/my-bookings")}
            className="mb-4 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/20"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold mb-2">Messages</h1>
          <p className="text-muted-foreground">
            Conversation with {otherParty?.name || "Unknown"}
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>
                  {otherParty?.name?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle>{otherParty?.name || "Unknown"}</CardTitle>
                <CardDescription>
                  Move #{bookingId.slice(0, 8)}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            <div className="h-[400px] overflow-y-auto p-4 space-y-4" data-testid="messages-container">
              {isLoading ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Loading messages...</p>
                </div>
              ) : !messages || messages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((message) => {
                  const isOwnMessage = message.senderId === user.id;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                      data-testid={`message-${message.id}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-4 py-2 ${
                          isOwnMessage
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm">{message.text}</p>
                        <p className={`text-xs mt-1 ${isOwnMessage ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {format(new Date(message.createdAt), "h:mm a")}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            <Separator />
            <form onSubmit={handleSendMessage} className="p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Type your message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  disabled={sendMessageMutation.isPending}
                  data-testid="input-message"
                />
                <Button
                  type="submit"
                  disabled={!messageText.trim() || sendMessageMutation.isPending}
                  data-testid="button-send"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
