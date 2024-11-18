import { ComponentType, SVGProps } from "react"

interface FeatureProps {
  name: string
  description: string
  href: string
  Icon: ComponentType<
    SVGProps<SVGSVGElement> & { title?: string; titleId?: string }
  >
}

const Feature: React.FC<FeatureProps> = ({ name, description, Icon }) => (
  <div className="flex flex-col">
    <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 mb-0">
      <Icon className="h-5 w-5 flex-none text-primary" aria-hidden="true" />
      {name}
    </dt>
    <dd className="mt-2 ml-8 flex flex-auto flex-col text-base leading-5 mb-0">
      <p className="flex-auto">{description}</p>
    </dd>
  </div>
)

export default Feature
