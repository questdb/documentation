import {
  ArrowPathIcon,
  LockOpenIcon,
  LockClosedIcon,
  BookOpenIcon,
  RocketLaunchIcon,
  BoltIcon,
  CubeTransparentIcon,
  GiftIcon,
  ScaleIcon,
  CloudArrowUpIcon,
  CloudIcon,
  FolderArrowDownIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  CurrencyDollarIcon,
  CircleStackIcon,
} from "@heroicons/react/20/solid"

const icons = {
  ArrowPathIcon,
  LockOpenIcon,
  LockClosedIcon,
  BookOpenIcon,
  RocketLaunchIcon,
  BoltIcon,
  CubeTransparentIcon,
  GiftIcon,
  ScaleIcon,
  CloudArrowUpIcon,
  CloudIcon,
  FolderArrowDownIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  CurrencyDollarIcon,
  CircleStackIcon,
}

type Feature = {
  name: string
  description: string
  icon: string
}

export default function FeatureList({ features }: { features: Feature[] }) {
  return (
    <div className="pb-4 sm:pb-12 lg:pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <dl className="mt-2 max-w-xl text-base leading-7 lg:max-w-none lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-10 xl:grid-cols-3">
          {features.map((feature) => {
            const IconComponent = icons[feature.icon]
            if (!IconComponent) {
              console.error(`Icon "${feature.icon}" not found in icons object.`)
              return null
            }
            return (
              <div key={feature.name} className="relative pl-9 mb-8 lg:mb-0">
                <dt className="inline font-semibold">
                  <IconComponent
                    className="absolute left-1 top-1 h-5 w-5 text-primary"
                    aria-hidden="true"
                  />
                  {feature.name}
                </dt>
                <dd className="inline ml-2">{feature.description}</dd>
              </div>
            )
          })}
        </dl>
      </div>
    </div>
  )
}
