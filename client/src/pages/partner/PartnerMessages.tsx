import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PartnerLayout } from "./PartnerLayout";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, MessageCircle, MapPin, Calendar, Package } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";

interface Conversation {
  bookingId: string;
  booking: {
    id: string;
    pickupAddress: string | null;
    dropoffAddress: string | null;
    preferredDate: string | null;
    status: string;
    enterpriseStatus: string | null;
  };
  customerName: string;
  lastMessage: {
    text: string;
    createdAt: string;
    senderId: string;
  };
  unreadCount: number;
}

interface Message {
  id: string;
  bookingId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  readAt: string | null;
  isPartnerMessage: boolean;
}

function formatMsgDate(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
}

function truncate(text: string, max = 60) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function ConversationSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-md">
          <Skeleton className="w-9 h-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ msg, isOwn }: { msg: Message; isOwn: boolean }) {
  return (
    <div className={cn("flex items-end gap-2 mb-3", isOwn ? "flex-row-reverse" : "flex-row")}>
      {!isOwn && (
        <Avatar className="w-7 h-7 shrink-0 mb-0.5">
          <AvatarFallback className="text-xs bg-muted text-muted-foreground">
            {msg.senderName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      <div className={cn("max-w-[70%] space-y-1", isOwn ? "items-end" : "items-start")}>
        {!isOwn && (
          <span className="text-xs text-muted-foreground ml-1">{msg.senderName}</span>
        )}
        <div
          className={cn(
            "px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm"
          )}
        >
          {msg.text}
        </div>
        <span className={cn("text-[11px] text-muted-foreground px-1", isOwn ? "text-right" : "text-left")}>
          {formatMsgDate(msg.createdAt)}
        </span>
      </div>
    </div>
  );
}

export default function PartnerMessages() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: conversations = [], isLoading: convLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/partner/messages"],
    refetchInterval: 12000,
  });

  const { data: thread = [], isLoading: threadLoading } = useQuery<Message[]>({
    queryKey: ["/api/partner/bookings", selectedBookingId, "messages"],
    queryFn: () =>
      fetch(`/api/partner/bookings/${selectedBookingId}/messages`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!selectedBookingId,
    refetchInterval: 8000,
  });

  const markRead = useMutation({
    mutationFn: (bookingId: string) =>
      apiRequest("POST", `/api/partner/messages/${bookingId}/mark-read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/partner/messages"] });
      qc.invalidateQueries({ queryKey: ["/api/partner/messages/unread-count"] });
    },
  });

  const sendMsg = useMutation({
    mutationFn: ({ bookingId, text }: { bookingId: string; text: string }) =>
      apiRequest("POST", `/api/partner/bookings/${bookingId}/messages`, { text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/partner/bookings", selectedBookingId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/partner/messages"] });
      setDraft("");
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  });

  // Auto-select first conversation
  useEffect(() => {
    if (!selectedBookingId && conversations.length > 0) {
      setSelectedBookingId(conversations[0].bookingId);
    }
  }, [conversations, selectedBookingId]);

  // Mark read when opening a conversation
  useEffect(() => {
    if (selectedBookingId) {
      markRead.mutate(selectedBookingId);
    }
  }, [selectedBookingId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  const selectedConv = conversations.find(c => c.bookingId === selectedBookingId);

  const handleSend = () => {
    if (!draft.trim() || !selectedBookingId || sendMsg.isPending) return;
    sendMsg.mutate({ bookingId: selectedBookingId, text: draft.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <PartnerLayout>
      <div className="flex h-full overflow-hidden">
        {/* Conversation list */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col">
          <div className="px-4 py-3.5 border-b border-border">
            <h2 className="text-sm font-semibold">Customer Messages</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Conversations per booking</p>
          </div>

          {convLoading ? (
            <ConversationSkeleton />
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <MessageCircle className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                When customers message you about a booking, it will appear here.
              </p>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="py-2">
                {conversations.map(conv => {
                  const isSelected = conv.bookingId === selectedBookingId;
                  return (
                    <button
                      key={conv.bookingId}
                      onClick={() => setSelectedBookingId(conv.bookingId)}
                      data-testid={`conv-${conv.bookingId}`}
                      className={cn(
                        "w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors",
                        isSelected
                          ? "bg-accent"
                          : "hover-elevate"
                      )}
                    >
                      <Avatar className="w-9 h-9 shrink-0 mt-0.5">
                        <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                          {conv.customerName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-medium truncate">{conv.customerName}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatMsgDate(conv.lastMessage.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {truncate(conv.lastMessage.text)}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                          #{conv.bookingId.slice(0, 8)} · {conv.booking.status?.replace(/_/g, " ")}
                        </p>
                      </div>
                      {conv.unreadCount > 0 && (
                        <Badge className="shrink-0 text-[10px] h-4.5 min-w-[18px] px-1 mt-0.5">
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Chat panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedBookingId ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-6">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageCircle className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Select a conversation</p>
              <p className="text-xs text-muted-foreground mt-1">Choose a booking from the left to view messages</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-5 py-3 border-b border-border bg-background">
                {selectedConv ? (
                  <div className="flex items-start gap-3">
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                        {selectedConv.customerName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{selectedConv.customerName}</p>
                      <div className="flex items-center gap-3 flex-wrap mt-0.5">
                        {selectedConv.booking.pickupAddress && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {truncate(selectedConv.booking.pickupAddress, 30)}
                          </span>
                        )}
                        {selectedConv.booking.preferredDate && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3 shrink-0" />
                            {format(new Date(selectedConv.booking.preferredDate), "MMM d, yyyy")}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Package className="w-3 h-3 shrink-0" />
                          #{selectedConv.bookingId.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Skeleton className="h-8 w-48" />
                )}
              </div>

              {/* Messages thread */}
              <ScrollArea className="flex-1 px-5 py-4">
                {threadLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className={cn("flex gap-2", i % 2 === 0 ? "flex-row-reverse" : "flex-row")}>
                        <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                        <Skeleton className={cn("h-10 rounded-2xl", i % 2 === 0 ? "w-40" : "w-56")} />
                      </div>
                    ))}
                  </div>
                ) : thread.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-16">
                    <MessageCircle className="w-8 h-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No messages in this booking yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Start the conversation below</p>
                  </div>
                ) : (
                  <>
                    {thread.map(msg => (
                      <MessageBubble
                        key={msg.id}
                        msg={msg}
                        isOwn={msg.isPartnerMessage}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </ScrollArea>

              {/* Compose bar */}
              <div className="px-5 py-3.5 border-t border-border bg-background">
                <div className="flex items-center gap-2">
                  <Input
                    ref={inputRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message…"
                    className="flex-1"
                    data-testid="input-message"
                    disabled={sendMsg.isPending}
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!draft.trim() || sendMsg.isPending}
                    data-testid="button-send-message"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Press Enter to send · Shift+Enter for new line
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </PartnerLayout>
  );
}
