import CodeContentBlock from "./CodeContentBlock"
import TextContentBlock from "./TextContentBlock"
import CallToAction from "../ImageWithCTA/CallToAction"

function BlockWithCode({
  code,
  text,
  cta,
  language,
  reverse,
  codeOnly,
  secondCode,
  secondLanguage,
}) {
  const hasCtaData = cta && cta.href && cta.label
  const isDoubleCodeBlocks = codeOnly && secondCode

  const paddingClass = isDoubleCodeBlocks
    ? "overflow-hidden pt-12"
    : "overflow-hidden py-24"

  return (
    <div className={paddingClass}>
      {codeOnly ? (
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <TextContentBlock
            title={text.title}
            subtitle={text.subtitle}
            description={text.description}
            center={true}
          />
          {hasCtaData && (
            <div className="mt-8 text-center">
              <CallToAction href={cta.href} label={cta.label} />
            </div>
          )}
          <div className="mt-12">
            {secondCode ? (
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <div className="flex justify-center">
                  <CodeContentBlock code={code} language={language} />
                </div>
                <div className="flex justify-center">
                  <CodeContentBlock
                    code={secondCode}
                    language={secondLanguage}
                  />
                </div>
              </div>
            ) : (
              <CodeContentBlock code={code} language={language} />
            )}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-x-8 gap-y-16 sm:gap-y-20 lg:grid-cols-2 lg:items-start">
            {!reverse && <CodeContentBlock code={code} language={language} />}
            <div>
              <TextContentBlock
                title={text.title}
                subtitle={text.subtitle}
                description={text.description}
                center={false}
              />
              {hasCtaData && (
                <div className="mt-8 pl-4">
                  <CallToAction href={cta.href} label={cta.label} />
                </div>
              )}
            </div>
            {reverse && <CodeContentBlock code={code} language={language} />}
          </div>
        </div>
      )}
    </div>
  )
}

export default BlockWithCode
