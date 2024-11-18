import { CheckIcon } from "@heroicons/react/20/solid"

type Feature = {
  name: string
  description: string
}

type TextPrimePackProps = {
  title: string
  subtitle: string
  description: string
  features: Feature[]
}

export default function TextPrimePack({
  title,
  subtitle,
  description,
  features,
}: TextPrimePackProps) {
  return (
    <div className="lg:py-24 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto lg:max-w-2xl sm:mx-4">
          <p className="text-m font-semibold tracking-tight sm:text-m text-primary">
            {subtitle}
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h2>
          <p className="mt-6 text-lg leading-8">{description}</p>
        </div>
        <dl className="mx-0 mt-8 sm:mt-16 grid max-w-2xl grid-cols-1 gap-x-6 gap-y-12 text-base leading-7 sm:grid-cols-1 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.name} className="relative pl-9 ">
              <dt className="font-semibold text-primary ml-10 sm:ml-2">
                <CheckIcon
                  aria-hidden="true"
                  className="absolute left-0 top-1 h-5 w-5 text-primary ml-8 sm:ml-2"
                />
                {feature.name}
              </dt>
              <dd className="mt-1 sm:ml-2">{feature.description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
