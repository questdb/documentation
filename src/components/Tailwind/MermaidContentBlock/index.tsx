import TextBlock from "../ImageWithCTA/TextBlock"
import MermaidBlock from "./MermaidBlock"
import CallToAction from "../ImageWithCTA/CallToAction"
import CustomerQuote from "../ImageWithCTA/CustomerQuote"

const MermaidContentBlock = ({ contentData }) => {
  const hasQuoteData =
    contentData.customerQuote && contentData.customerQuote.quote

  const hasCtaData = contentData.callToAction && contentData.callToAction.href

  const { jumbo } = contentData

  return (
    <div className="overflow-hidden bg-background py-12 sm:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {jumbo ? (
          <>
            <div className="mx-auto max-w-3xl">
              <TextBlock
                title={contentData.textBlock.title}
                subtitle={contentData.textBlock.subtitle}
                description={contentData.textBlock.description}
              />
              {hasCtaData && (
                <div className="mt-8">
                  <CallToAction
                    href={contentData.callToAction.href}
                    label={contentData.callToAction.label}
                  />
                </div>
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
            <div className="mt-12">
              <MermaidBlock chart={contentData.mermaidBlock.chart} />
            </div>
          </>
        ) : (
          <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 sm:gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:items-start">
            <div className="lg:col-span-1 lg:pr-4 lg:pt-4">
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
            <div className="lg:col-span-2">
              <MermaidBlock chart={contentData.mermaidBlock.chart} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MermaidContentBlock
