import CodeContentBlock from "../BlockWithCode/CodeContentBlock"

export default function BoldStatsBlock({ codeBlockProps }) {
  const { stats, copy, image, code, language = "questdb-sql" } = codeBlockProps

  return (
    <div className="relative">
      {image ? (
        <img
          alt={image.alt}
          src={image.src}
          className="h-56 w-full bg-gray-50 object-cover lg:absolute lg:inset-y-0 lg:left-0 lg:h-full lg:w-1/2 rounded-sm"
          loading="lazy"
        />
      ) : code ? (
        <div className="hidden lg:block sm:pb-0 h-56 w-full object-cover lg:absolute lg:inset-y-0 lg:left-0 lg:h-full pt-4 lg:w-1/2 rounded-sm overflow-hidden">
          <CodeContentBlock code={code} language={language} fullHeight />
        </div>
      ) : null}
      <div className="mx-auto grid max-w-7xl lg:grid-cols-2 ">
        <div className="px-6 pb-24 pt-16 sm:pb-32 sm:pt-20 lg:col-start-2 lg:px-8 lg:pt-16">
          <div className="mx-auto max-w-2xl lg:mr-0 lg:max-w-lg">
            <h2 className="text-base font-semibold leading-8 text-primary">
              {copy.title}
            </h2>
            <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {copy.headline}
            </p>
            <p
              className="mt-6 text-lg leading-8"
              dangerouslySetInnerHTML={{ __html: copy.description }}
            />
            <dl className="mt-16 grid max-w-xl grid-cols-1 gap-8 sm:mt-20 sm:grid-cols-2 xl:mt-16">
              {stats.map((stat) => (
                <div
                  key={stat.id}
                  className="flex flex-col gap-y-3 border-l border-cyan-200 pl-6"
                >
                  <dt className="text-sm leading-6">{stat.name}</dt>
                  <dd className="order-first text-3xl font-semibold ml-5 tracking-tight text-primary">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
