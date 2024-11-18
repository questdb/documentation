import HeaderSection from "./HeaderSection"
import ImageSection from "./ImageSection"
import FeatureList from "./FeatureList"

type Feature = {
  name: string
  description: string
  icon: string
}

type JumboFeatures = {
  features: Feature[]
  imageSrc: string
  imageAlt: string
  headerTitle: string
  headerSubtitle: string
  headerDescription: string
}

type JumboImageBlockProps = {
  jumboFeatures: JumboFeatures
  imageClassName?: string
  withoutImage?: boolean
}

export default function JumboImageBlock({
  jumboFeatures,
  imageClassName,
  withoutImage,
}: JumboImageBlockProps) {
  const {
    features,
    imageSrc,
    imageAlt,
    headerTitle,
    headerSubtitle,
    headerDescription,
  } = jumboFeatures

  return (
    <div className="py-4 sm:py-12 lg:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <HeaderSection
          title={headerTitle}
          subtitle={headerSubtitle}
          description={headerDescription}
        />
        {!withoutImage && (
          <ImageSection
            src={imageSrc}
            alt={imageAlt}
            className={imageClassName}
          />
        )}
        <FeatureList features={features} />
      </div>
    </div>
  )
}
