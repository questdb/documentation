import React from "react"
import CodeDisplay from "./CodeDisplay"

export interface HeroCodeProps {
  content: {
    title: string
    description: string
    newFeatureText: string
    newFeatureLinkText?: string
    ctaLink: string
    ctaLinkText: string
    githubLink?: string
    queryLink?: string
    code: string
  }
}

const HeroCode: React.FC<HeroCodeProps> = ({ content }) => {
  return (
    <div>
      <div className="relative isolate overflow-hidden">
        <div className="mx-auto max-w-7xl pb-24 pt-2 mb-10 sm:pb-32 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:px-8 lg:py-20">
          <div className="px-6 lg:px-0 lg:pt-4">
            <div className="mx-auto max-w-2xl">
              <div className="max-w-lg">
                <div className="mt-12 sm:mt-12 lg:mt-6">
                  <span className="inline-flex space-x-6 rounded-full no-underline text-primary px-3 py-1 text-sm font-semibold leading-6 ring-1 ring-primary ring-inset">
                    {content.newFeatureText}
                  </span>
                </div>
                <h1 className="mt-10 text-4xl font-bold tracking-tight sm:text-6xl">
                  {content.title}
                </h1>
                <p className="mt-6 text-lg leading-8">{content.description}</p>
                <div className="mt-10 flex items-center gap-x-6">
                  <a
                    href={content.ctaLink}
                    className="rounded-md hover:text-white bg-primary text-white px-3.5 py-2.5 text-sm font-semibold shadow-sm ring-1 ring-primary hover:underline"
                  >
                    {content.ctaLinkText}
                  </a>
                </div>
              </div>
            </div>
          </div>
          <CodeDisplay code={content.code} queryLink={content.queryLink} />
        </div>
        <div />
      </div>
    </div>
  )
}

export default HeroCode
