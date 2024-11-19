import { ComponentType, SVGProps } from "react"
import Feature from "./Feature"

interface FeatureProps {
  name: string
  description: string
  href: string
  Icon: ComponentType<
    SVGProps<SVGSVGElement> & { title?: string; titleId?: string }
  >
}

interface FeatureListProps {
  features: FeatureProps[]
}

const FeatureList: React.FC<FeatureListProps> = ({ features }) => (
  <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
    <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
      {features.map((feature) => (
        <Feature
          key={feature.name}
          name={feature.name}
          description={feature.description}
          href={feature.href}
          Icon={feature.Icon}
        />
      ))}
    </dl>
  </div>
)

export default FeatureList
