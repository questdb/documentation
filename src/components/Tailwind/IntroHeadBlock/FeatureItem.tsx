function FeatureItem({ feature }) {
  return (
    <div key={feature.name} className="relative pl-9">
      <dt className="inline font-semibold">
        <feature.icon
          className="absolute left-1 top-1 h-5 w-5 text-primary"
          aria-hidden="true"
        />
        {feature.name}
      </dt>
      <dd className="inline ml-2">{feature.description}</dd>
    </div>
  )
}

export default FeatureItem
