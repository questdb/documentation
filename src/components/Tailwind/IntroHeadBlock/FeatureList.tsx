import FeatureItem from "./FeatureItem"

function FeatureList({ features }) {
  return (
    <dl className="mt-10 max-w-xl space-y-8 text-base leading-7 lg:max-w-none">
      {features.map((feature) => (
        <FeatureItem key={feature.name} feature={feature} />
      ))}
    </dl>
  )
}

export default FeatureList
