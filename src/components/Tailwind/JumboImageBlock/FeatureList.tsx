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
  ChatBubbleLeftRightIcon,
  BanknotesIcon,
  ClipboardDocumentCheckIcon,
  FolderArrowDownIcon,
  MagnifyingGlassIcon,
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
  ChatBubbleLeftRightIcon,
  BanknotesIcon,
  ClipboardDocumentCheckIcon,
  FolderArrowDownIcon,
  MagnifyingGlassIcon,
  CircleStackIcon,
}

type Feature = {
  name: string
  description: string
  icon: string
}

export default function FeatureList({ features }: { features: Feature[] }) {
  return (
    <dl className="mt-10 max-w-xl mx-auto text-base leading-7 sm:content-center sm:flex sm:flex-col sm:max-w-fit lg:max-w-none lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-10 xl:grid-cols-3">
      {" "}
      {features.map((feature) => {
        const IconComponent = icons[feature.icon]
        return (
          <div key={feature.name} className="relative pl-9 mb-8 lg:mb-0">
            <dt className="inline font-semibold">
              <IconComponent
                className="absolute left-1 top-1 h-5 w-5 text-primary"
                aria-hidden="true"
              />
              {feature.name}
            </dt>
            <dd
              className="inline ml-2 sm:ml-4"
              dangerouslySetInnerHTML={{ __html: feature.description }}
            />
          </div>
        )
      })}
    </dl>
  )
}
