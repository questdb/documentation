import ContentBlock from "./ContentBlock"
import ImageBlock from "./ImageBlock"

export default function IntroHeadBlock({
  title,
  subtitle,
  description,
  features,
  imageUrl,
  imageAlt,
}) {
  return (
    <div className="mx-auto max-w-7xl md:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-x-8 gap-y-16 sm:gap-y-20 lg:grid-cols-2 lg:items-start">
        <ContentBlock
          title={title}
          subtitle={subtitle}
          description={description}
          features={features}
        />
        <ImageBlock imageUrl={imageUrl} imageAlt={imageAlt} />
      </div>
    </div>
  )
}
