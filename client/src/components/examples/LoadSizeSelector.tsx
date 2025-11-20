import { useState } from 'react'
import LoadSizeSelector from '../LoadSizeSelector'

export default function LoadSizeSelectorExample() {
  const [selectedSize, setSelectedSize] = useState('medium')

  return (
    <div className="max-w-5xl p-4">
      <h2 className="text-2xl font-bold mb-6">Select Load Size</h2>
      <LoadSizeSelector
        selectedSize={selectedSize}
        onSelectSize={(size) => {
          setSelectedSize(size)
          console.log('Selected load size:', size)
        }}
      />
    </div>
  )
}
