import TextBlock from "./TextBlock"
import ImageComponent from "./ImageComponent"
import CallToAction from "./CallToAction"
import CustomerQuote from "./CustomerQuote"
import MermaidBlock from "../MermaidContentBlock/MermaidBlock"

const ImageWithCTA = ({ contentData }) => {
  const hasQuoteData =
    contentData.customerQuote && contentData.customerQuote.quote

  const hasCtaData = contentData.callToAction && contentData.callToAction.href

  return (
    <div
      id="peak-performance"
      className="overflow-hidden bg-background py-12 sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 sm:gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-2 lg:items-start">
          <div className="lg:pr-4 lg:pt-4">
            <TextBlock
              title={contentData.textBlock.title}
              subtitle={contentData.textBlock.subtitle}
              description={contentData.textBlock.description}
            />
            {hasCtaData && (
              <CallToAction
                href={contentData.callToAction.href}
                label={contentData.callToAction.label}
              />
            )}
            {hasQuoteData && (
              <CustomerQuote
                quote={contentData.customerQuote.quote}
                author={contentData.customerQuote.author}
                position={contentData.customerQuote.position}
                imageUrl={contentData.customerQuote.imageUrl}
              />
            )}
          </div>
          {contentData.useMermaid ? (
            <MermaidBlock chart={contentData.mermaidChart} />
          ) : (
            <ImageComponent
              src={contentData.imageComponent.src}
              alt={contentData.imageComponent.alt}
              width={contentData.imageComponent.width}
              customStyles={contentData.imageComponent.customStyles}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default ImageWithCTA
