import ChatInterface from "@/components/ChatInterface";
import { useState } from "react";
import moverPhoto from "@assets/generated_images/male_mover_profile_photo.png";

//todo: remove mock functionality
const initialMessages = [
  {
    id: '1',
    senderId: 'mover-1',
    senderName: 'Mike Johnson',
    text: 'Hi! I can help you with your move. What items do you need to transport?',
    timestamp: '10:30 AM',
    isCurrentUser: false,
  },
  {
    id: '2',
    senderId: 'customer-1',
    senderName: 'You',
    text: 'Hello! I need to move a 2-bedroom apartment worth of furniture.',
    timestamp: '10:32 AM',
    isCurrentUser: true,
  },
  {
    id: '3',
    senderId: 'mover-1',
    senderName: 'Mike Johnson',
    text: 'Perfect! I have a large truck that can handle that. Do you need help packing as well?',
    timestamp: '10:33 AM',
    isCurrentUser: false,
  },
];

export default function Messages() {
  const [messages, setMessages] = useState(initialMessages);

  const handleSendMessage = (text: string) => {
    const newMessage = {
      id: Date.now().toString(),
      senderId: 'customer-1',
      senderName: 'You',
      text,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      isCurrentUser: true,
    };
    setMessages([...messages, newMessage]);
    console.log('Sent message:', text);
  };

  return (
    <div className="min-h-screen pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold">
            Messages
          </h1>
        </div>

        <ChatInterface
          bookingId="1"
          otherUserName="Mike Johnson"
          otherUserPhoto={moverPhoto}
          pickupAddress="123 Main St SW, Calgary, AB"
          dropoffAddress="456 Oak Ave NW, Calgary, AB"
          date="Dec 28, 2024"
          time="2:00 PM"
          messages={messages}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  );
}
