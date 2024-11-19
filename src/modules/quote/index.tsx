import React, { useCallback, useState } from "react"
import clsx from "clsx"

import seCss from "../../css/section.module.css"
import quCss from "../../css/customers/quote.module.css"
import Chevron from "@theme/Chevron"
import { CSSTransition, TransitionGroup } from "react-transition-group"
import useResizeObserver from "@theme/useResizeObserver"

import quotes from "../../assets/quotes"
import SvgImage from "../../components/SvgImage"

type Props = {
  noIndex?: boolean
}

const QUOTE_WIDTH = 350

const companiesToInclude: Array<{ name: string; id?: number }> = [
  {
    name: "Airbus",
  },
  {
    name: "Yahoo",
  },
  {
    name: "Airtel",
  },
  {
    name: "Aquis Exchange",
  },
  {
    name: "Syndica",
  },
  {
    name: "Copenhagen Atomics",
  },
  {
    name: "LiveAction",
  },
  {
    name: "TQS Integration",
  },
  {
    name: "Brightcom",
  },
  {
    name: "Reflexivity",
  },
  {
    name: "Prediko",
  },
  {
    name: "Motion",
    id: 2,
  },
]

type BulletProps = {
  index: number
  onClick: (index: number) => void
  page: number
  viewportSize: number
}

const Bullet = ({ index, onClick, page, viewportSize }: BulletProps) => {
  const handleClick = useCallback(() => {
    onClick(index * viewportSize)
  }, [index, onClick, viewportSize])

  return (
    <span
      className={clsx(quCss.controls__pin, {
        [quCss["controls__pin--selected"]]: page === index,
      })}
      onClick={handleClick}
    />
  )
}

const filteredQuotes = quotes
  .filter((quote) =>
    companiesToInclude.some((company) =>
      company.id !== undefined
        ? company.name === quote.company && company.id === quote.id
        : company.name === quote.company,
    ),
  )
  .sort((a, b) => {
    const companyNames = companiesToInclude.map((company) => company.name)
    return companyNames.indexOf(a.company) - companyNames.indexOf(b.company)
  })

export const Quote = ({ noIndex = false }: Props) => {
  const { ref, width } = useResizeObserver<HTMLDivElement>()
  const [index, setIndex] = useState(0)
  const viewportSize = Math.max(1, Math.floor((width ?? 0) / QUOTE_WIDTH))
  const viewportCount =
    viewportSize === 0 ? 0 : Math.ceil(filteredQuotes.length / viewportSize)
  const page = Math.floor(index / viewportSize)
  const visibleQuotes = filteredQuotes.slice(
    page * viewportSize,
    (page + 1) * viewportSize,
  )

  return (
    <section
      className={clsx(seCss["section--inner"], seCss["section--column"])}
      {...(noIndex ? { content: "noindex, nofollow" } : {})}
    >
      <h2 className={quCss.title}>What our users say about QuestDB</h2>

      <div className={quCss.carousel} ref={ref}>
        <TransitionGroup component={null}>
          <CSSTransition key={page} timeout={200} classNames="item">
            <div className={quCss.carousel__group}>
              {visibleQuotes.map(({ company, logo, text, author, role }, i) => (
                <div key={`${company}-${i}`} className={quCss.quote}>
                  <div className={quCss.quote__symbol} />

                  <div className={quCss.quote__logo}>
                    <SvgImage
                      title={logo.alt}
                      image={React.createElement(logo.svg, {
                        alt: logo.alt,
                        width: logo.width,
                        height: logo.height,
                        src: logo.src,
                      })}
                    />
                  </div>

                  <p className={quCss.quote__content}>{text}</p>

                  {typeof author === "string" && (
                    <p className={quCss.quote__author}>
                      <span className={quCss.quote__chevron}>&gt;</span>
                      {author}
                      <br />
                      {role}
                      ,&nbsp;
                      {company}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CSSTransition>
        </TransitionGroup>
      </div>

      <div className={quCss.controls}>
        <div
          className={clsx(
            quCss["controls__chevron-wrapper"],
            quCss["controls__chevron-wrapper--left"],
            {
              [quCss["controls__chevron-wrapper--hidden"]]: page === 0,
            },
          )}
          onClick={() => {
            setIndex((index) => Math.max(index - viewportSize, 0))
          }}
        >
          <Chevron className={quCss.controls__chevron} side="left" />
        </div>

        <div className={quCss.controls__middle}>
          {Array(viewportCount)
            .fill(0)
            .map((_, idx) => (
              <Bullet
                index={idx}
                key={idx}
                onClick={setIndex}
                page={page}
                viewportSize={viewportSize}
              />
            ))}
        </div>

        <div
          className={clsx(
            quCss["controls__chevron-wrapper"],
            quCss["controls__chevron-wrapper--right"],
            {
              [quCss["controls__chevron-wrapper--hidden"]]:
                page === viewportCount - 1,
            },
          )}
          onClick={() => {
            setIndex((index) =>
              Math.min(index + viewportSize, quotes.length - 1),
            )
          }}
        >
          <Chevron className={quCss.controls__chevron} side="right" />
        </div>
      </div>
    </section>
  )
}
