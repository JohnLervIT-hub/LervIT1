import ChatInterface from '../ChatInterface'
import moverPhoto from '@assets/generated_images/male_mover_profile_photo.png'

//todo: remove mock functionality
const mockMessages = [
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

export default function ChatInterfaceExample() {
  return (
    <div className="max-w-3xl p-4 h-screen">
      <ChatInterface
        bookingId="1"
        otherUserName="Mike Johnson"
        otherUserPhoto={moverPhoto}
        pickupAddress="123 Main St SW, Calgary, AB"
        dropoffAddress="456 Oak Ave NW, Calgary, AB"
        date="Dec 28, 2024"
        time="2:00 PM"
        messages={mockMessages}
        onSendMessage={(message) => console.log('Send message:', message)}
      />
    </div>
  )
}
