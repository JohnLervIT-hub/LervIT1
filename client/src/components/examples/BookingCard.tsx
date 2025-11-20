import BookingCard from '../BookingCard'
import moverPhoto from '@assets/generated_images/female_mover_profile_photo.png'

export default function BookingCardExample() {
  return (
    <div className="max-w-2xl p-4">
      <BookingCard
        id="1"
        moverName="Sarah Chen"
        moverPhoto={moverPhoto}
        pickupAddress="123 Main St SW, Calgary, AB"
        dropoffAddress="456 Oak Ave NW, Calgary, AB"
        date="Dec 28, 2024"
        time="2:00 PM"
        status="confirmed"
        price={185}
        onMessage={(id) => console.log('Message booking:', id)}
        onViewDetails={(id) => console.log('View details:', id)}
      />
    </div>
  )
}
