import StarRating from "../StarRating"

const CommunityCallOut = ({
  title,
  description,
  mainText,
  secondaryText,
  rating,
  totalStars,
  mainUrl,
  secondaryUrl,
}) => {
  return (
    <div>
      <div className="mx-auto max-w-7xl py-4 sm:px-6 sm:py-2 lg:px-8">
        <div
          className="relative isolate overflow-hidden px-6 py-24 text-center shadow-3xl sm:rounded-3xl sm:px-16 border border-gray-500 rounded-xl"
          style={{ backgroundColor: "rgb(38, 40, 51)" }}
        >
          <div className="flex justify-center mb-4">
            <StarRating rating={rating} totalStars={totalStars} />
          </div>

          <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {title}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-gray-300">
            {description}
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <a
              href={mainUrl}
              className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {mainText}
            </a>
            <a
              href={secondaryUrl}
              className="text-sm font-semibold leading-6 text-white"
            >
              {secondaryText} <span aria-hidden="true">→</span>
            </a>
          </div>
          <svg
            viewBox="0 0 1024 1024"
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -z-10 h-[64rem] w-[64rem] -translate-x-1/2 [mask-image:radial-gradient(closest-side,white,transparent)]"
          >
            <circle
              r={512}
              cx={512}
              cy={512}
              fill="url(#827591b1-ce8c-4110-b064-7cb85a0b1217)"
              fillOpacity="1"
            />
            <defs>
              <radialGradient id="827591b1-ce8c-4110-b064-7cb85a0b1217">
                <stop stopColor="#a23154" />
                <stop offset={1} stopColor="#be2f5b" />
              </radialGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  )
}

export default CommunityCallOut
