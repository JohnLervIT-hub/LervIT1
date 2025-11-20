import MoverCard from '../MoverCard'
import moverPhoto from '@assets/generated_images/male_mover_profile_photo.png'

export default function MoverCardExample() {
  return (
    <div className="max-w-sm p-4">
      <MoverCard
        id="1"
        name="Mike Johnson"
        photo={moverPhoto}
        rating={4.9}
        reviewCount={142}
        vehicleType="Large Truck (26ft)"
        distance="2.3 km"
        price={185}
        verified={true}
        completedMoves={235}
        onSelect={(id) => console.log('Selected mover:', id)}
      />
    </div>
  )
}
