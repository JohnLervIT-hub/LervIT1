import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, MapPin, Calendar } from "lucide-react";
import { useState, memo, useCallback } from "react";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isCurrentUser: boolean;
}

// Memoized individual message component to prevent re-renders
const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  return (
    <div
      className={`flex ${message.isCurrentUser ? 'justify-end' : 'justify-start'}`}
      data-testid={`message-${message.id}`}
    >
      <div className={`max-w-[70%] ${message.isCurrentUser ? 'order-2' : 'order-1'}`}>
        <div
          className={`px-4 py-2 rounded-lg ${
            message.isCurrentUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          }`}
        >
          <p className="text-sm">{message.text}</p>
        </div>
        <div className="text-xs text-muted-foreground mt-1 px-2">
          {message.timestamp}
        </div>
      </div>
    </div>
  );
});

interface ChatInterfaceProps {
  bookingId: string;
  otherUserName: string;
  otherUserPhoto: string;
  pickupAddress: string;
  dropoffAddress: string;
  date: string;
  time: string;
  messages: Message[];
  onSendMessage: (message: string) => void;
}

function ChatInterface({
  bookingId,
  otherUserName,
  otherUserPhoto,
  pickupAddress,
  dropoffAddress,
  date,
  time,
  messages,
  onSendMessage,
}: ChatInterfaceProps) {
  const [newMessage, setNewMessage] = useState("");

  // Memoize send handler to prevent child re-renders
  const handleSend = useCallback(() => {
    if (newMessage.trim()) {
      onSendMessage(newMessage);
      setNewMessage("");
    }
  }, [newMessage, onSendMessage]);

  return (
    <div className="flex flex-col h-full max-h-[800px]">
      <Card className="mb-4">
        <CardHeader className="flex flex-row flex-wrap items-center gap-4 space-y-0 pb-4">
          <Avatar className="w-12 h-12">
            <AvatarImage src={otherUserPhoto} alt={otherUserName} />
            <AvatarFallback>{otherUserName.split(' ').map(n => n[0]).join('')}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold" data-testid="text-chat-user">{otherUserName}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-3 h-3" />
              <span data-testid="text-chat-datetime">{date} at {time}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium">Pickup</div>
              <div className="text-muted-foreground" data-testid="text-chat-pickup">{pickupAddress}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium">Dropoff</div>
              <div className="text-muted-foreground" data-testid="text-chat-dropoff">{dropoffAddress}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </CardContent>

        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              data-testid="input-message"
            />
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim()}
              data-testid="button-send"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Export memoized component to prevent re-renders when parent changes
export default memo(ChatInterface);
