import Header from "./Header"
import FeatureList from "./FeatureList"
import { ComponentType, SVGProps } from "react"

interface FeatureProps {
  name: string
  description: string
  href: string
  Icon: ComponentType<
    SVGProps<SVGSVGElement> & { title?: string; titleId?: string }
  >
}

interface Content {
  features: FeatureProps[]
  headerTitle: string
  headerSubtitle: string
  headerDescription: string
}

interface ThreeColumnBlockProps {
  content: Content
}

const ThreeColumnBlock: React.FC<ThreeColumnBlockProps> = ({ content }) => (
  <div className="py-24 sm:py-24">
    <div className="mx-auto max-w-7xl px-6 lg:px-8">
      <Header
        title={content.headerTitle}
        subtitle={content.headerSubtitle}
        description={content.headerDescription}
      />
      <FeatureList features={content.features} />
    </div>
  </div>
)

export default ThreeColumnBlock
