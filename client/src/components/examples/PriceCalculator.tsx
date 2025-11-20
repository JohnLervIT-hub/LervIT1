import PriceCalculator from '../PriceCalculator'

export default function PriceCalculatorExample() {
  return (
    <div className="max-w-md p-4">
      <PriceCalculator
        distance={5.2}
        loadSize="medium"
        baseRate={15}
        showBreakdown={true}
      />
    </div>
  )
}
