import FeatureList from "./FeatureList"

function ContentBlock({ title, subtitle, description, features }) {
  return (
    <div className="px-6 md:px-0 lg:pr-4 lg:pt-4">
      <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-lg">
        <h2 className="text-base font-semibold leading-7 text-primary">
          {title}
        </h2>
        <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {subtitle}
        </p>
        <p className="mt-6 text-lg leading-8">{description}</p>
        <FeatureList features={features} />
      </div>
    </div>
  )
}

export default ContentBlock
