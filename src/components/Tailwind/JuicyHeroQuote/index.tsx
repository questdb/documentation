import ImageComponent from "./ImageComponent"
import QuoteComponent from "./QuoteComponent"
import AuthorComponent from "./AuthorComponent"

function JuicyHeroQuote({
  quote,
  authorName,
  authorTitle,
  imageUrl,
  imageAlt,
  caseStudyUrl,
}) {
  return (
    <div className="py-0 sm:py-8 xl:py-2">
      <div className="py-0 sm:py-8 xl:py-0">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-x-4 gap-y-4 sm:gap-x-8 sm:gap-y-8 px-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center">
          <div className="hidden md:flex md:items-center">
            <ImageComponent imageUrl={imageUrl} imageAlt={imageAlt} />
          </div>
          <div className="w-full max-w-2xl xl:max-w-none xl:flex-auto xl:px-16 xl:py-12">
            <figure className="relative isolate pt-0 sm:pt-4">
              <QuoteComponent quote={quote} />
              <AuthorComponent
                authorName={authorName}
                authorTitle={authorTitle}
                caseStudyUrl={caseStudyUrl}
              />
            </figure>
          </div>
        </div>
      </div>
    </div>
  )
}

export default JuicyHeroQuote
