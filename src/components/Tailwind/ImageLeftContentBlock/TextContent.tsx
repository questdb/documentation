import FeatureItem from "./FeatureItem"

const TextContent = ({ title, headline, description, features }) => {
  return (
    <div className="lg:ml-auto lg:pl-4 lg:pt-4">
      <div className="lg:max-w-lg">
        <h2 className="text-base font-semibold leading-7 text-primary">
          {title}
        </h2>
        <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {headline}
        </p>
        <p
          className="mt-6 text-lg leading-8"
          dangerouslySetInnerHTML={{ __html: description }}
        />
        <dl className="mt-10 ml-auto max-w-xl space-y-8 text-base leading-7 lg:max-w-none">
          {features.map((feature) => (
            <FeatureItem key={feature.name} {...feature} Icon={feature.icon} />
          ))}
        </dl>
      </div>
    </div>
  )
}

export default TextContent
