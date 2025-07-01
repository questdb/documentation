import { useState, useRef, useEffect, useCallback } from "react"
import {
  Popover,
  PopoverButton,
  PopoverGroup,
  PopoverPanel,
  Transition,
} from "@headlessui/react"
import {
  Bars3Icon,
  PlayCircleIcon,
  ArrowTrendingUpIcon,
  PresentationChartLineIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline"
import { ChevronDownIcon } from "@heroicons/react/20/solid"
import SearchBar from "@theme/SearchBar"
import MobileNav from "./MobileNav"
import { MainCTA } from "../../../components/MainCTA"
import { Release } from "../../../utils"
import { usePluginData } from "@docusaurus/useGlobalData"

import InfluxSVG from "../../../../static/images/logos/influxdb.svg"
import TimescaleSVG from "../../../../static/images/logos/timescale.svg"
import KXSVG from "../../../../static/images/logos/kx.svg"

import styles from "./styles.module.css"

const navLinks = [
  {
    name: "Enterprise",
    href: "/enterprise/",
  },
  {
    name: "Customers",
    href: "/customers/",
  },
  {
    name: "Docs",
    href: "/docs/",
  },
  {
    name: "Blog",
    href: "/blog/",
  },
]

const productFeatures = [
  {
    name: "Capital Markets",
    description:
      "Explore QuestDB use cases across Capital Markets.",
    href: "/market-data/",
    icon: ArrowTrendingUpIcon,
  },
  {
    name: "Live Crypto Price Charts",
    description: "Tick-by-tick data ingested into QuestDB: Trade Blotter · OHLC · VWAP · RSI · Bollinger Bands",
    href: "/dashboards/crypto/",
    icon: PresentationChartLineIcon,
  },
  {
    name: "Explore Live Demo",
    description: "Query real-time data in an interactive QuestDB sandbox.",
    href: "https://demo.questdb.io/",
    icon: PlayCircleIcon,
  },
  {
    name: "Download QuestDB",
    description: "Get started with QuestDB by downloading the latest version.",
    href: "/download/",
    icon: ArrowDownTrayIcon,
  },
]

const compareFeatures = [
  {
    name: "vs. kdb+",
    description:
      "Compare QuestDB with kdb+ for high-performance time-series data processing and analytics.",
    href: "/compare/questdb-vs-kdb",
    icon: KXSVG,
  },
  {
    name: "vs. InfluxDB",
    description:
      "Is InfluxDB and its multiple offerings the right choice for modern workloads? We'll explore.",
    href: "/blog/2024/02/26/questdb-versus-influxdb/",
    svg: InfluxSVG,
  },
  {
    name: "vs. TimescaleDB",
    description:
      "Timescale offers enhanced PostgreSQL for time-series data. How does it compare to QuestDB?",
    href: "/blog/timescaledb-vs-questdb-comparison/",
    svg: TimescaleSVG,
  },
]

export default function WideNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { release } = usePluginData("fetch-latest-release") as {
    release: Release
  }

  const productPopoverButtonRef = useRef<HTMLButtonElement>(null)
  const comparePopoverButtonRef = useRef<HTMLButtonElement>(null)
  const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false)
  const [isComparePopoverOpen, setIsComparePopoverOpen] = useState(false)
  const productTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const compareTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleProductMouseEnter = () => {
    clearTimeout(productTimeoutRef.current!)
    setIsProductPopoverOpen(true)
    setIsComparePopoverOpen(false)
    if (compareTimeoutRef.current) {
      clearTimeout(compareTimeoutRef.current)
    }
  }

  const handleProductMouseLeave = () => {
    productTimeoutRef.current = setTimeout(() => {
      setIsProductPopoverOpen(false)
    }, 250)
  }

  const handleProductFocus = () => {
    clearTimeout(productTimeoutRef.current!)
    setIsProductPopoverOpen(true)
  }

  const handleProductBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsProductPopoverOpen(false)
    }
  }

  const handleCompareMouseEnter = () => {
    clearTimeout(compareTimeoutRef.current!)
    setIsComparePopoverOpen(true)
    setIsProductPopoverOpen(false)
    if (productTimeoutRef.current) {
      clearTimeout(productTimeoutRef.current)
    }
  }

  const handleCompareMouseLeave = () => {
    compareTimeoutRef.current = setTimeout(() => {
      setIsComparePopoverOpen(false)
    }, 250)
  }

  const handleCompareFocus = () => {
    clearTimeout(compareTimeoutRef.current!)
    setIsComparePopoverOpen(true)
  }

  const handleCompareBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsComparePopoverOpen(false)
    }
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsProductPopoverOpen(false)
      setIsComparePopoverOpen(false)
    }
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  return (
    <header className="fixed top-0 left-0 right-0 z-[99] bg-white dark:bg-[rgb(33,34,44)] shadow-md">
      <nav
        aria-label="Global"
        className="mx-auto flex max-w-[90rem] items-center justify-between px-6 lg:px-8 border-b border-gray-300"
      >
        <div className="flex lg:flex-1 items-center py-6">
          <a className={styles.brand} href="/">
            QuestDB
          </a>
        </div>
        <div className="flex lg:hidden py-6">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 bg-white text-gray-700 dark:bg-[rgb(38,40,51)] dark:text-gray-300"
          >
            <span className="sr-only">Open main menu</span>
            <Bars3Icon aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>
        <PopoverGroup className="hidden lg:flex lg:gap-x-9 xl:gap-x-12 lg:items-center">
          <Popover>
            <PopoverButton
              ref={productPopoverButtonRef}
              onMouseEnter={handleProductMouseEnter}
              onMouseLeave={handleProductMouseLeave}
              onFocus={handleProductFocus}
              onBlur={handleProductBlur}
              onClick={(e) => {
                e.preventDefault()
                setIsProductPopoverOpen(!isProductPopoverOpen)
              }}
              className="px-0 py-6 border-none bg-transparent hover:underline flex items-center gap-x-1 font-semibold text-base font-sans leading-6 text-black dark:text-white whitespace-nowrap hover:cursor-pointer focus:outline-none"
            >
              Product
              <ChevronDownIcon
                aria-hidden="true"
                className={`h-5 w-5 ${isProductPopoverOpen ? "rotate-180" : ""}`}
              />
            </PopoverButton>

            <Transition
              show={isProductPopoverOpen}
              enter="transition ease-out duration-100"
              enterFrom="opacity-0 translate-y-1"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-1"
            >
              <PopoverPanel
                onMouseEnter={handleProductMouseEnter}
                onMouseLeave={handleProductMouseLeave}
                onFocus={handleProductFocus}
                onBlur={handleProductBlur}
                className="absolute w-[80%] xl:w-[70%] 2xl:w-[60%] max-w-[90rem] top-full !left-1/2 -translate-x-1/2 z-10 bg-[rgba(38,40,51,0.98)] shadow-lg ring-1 ring-gray-900/5 dark:ring-gray-500/5 transition data-[closed]:-translate-y-1 data-[closed]:opacity-0 data-[enter]:duration-200 data-[leave]:duration-150 data-[enter]:ease-out data-[leave]:ease-in border-solid border-[1px] border-[#ffffff1a] rounded-lg"
              >
                <div className="mx-auto grid grid-cols-4 gap-x-4 px-3 pt-4 pb-4 lg:px-8 xl:gap-x-8">
                  {productFeatures.map((item) => (
                    <div
                      key={item.name}
                      className="group relative rounded-lg p-3 text-sm leading-6 hover:bg-gray-700 cursor-pointer"
                    >
                      <div className="relative">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg">
                          <item.icon
                            aria-hidden="true"
                            className="h-6 w-6 text-gray-300 group-hover:text-primary"
                          />
                        </div>
                        <a
                          href={item.href}
                          className="mt-6 block font-semibold text-white hover:no-underline group-hover:text-primary"
                        >
                          {item.name}
                          <span className="absolute inset-0" />
                        </a>
                        <p className="mt-1 text-gray-600 dark:text-gray-300">
                          {item.description}
                        </p>
                      </div>
                      <div className="absolute inset-0 rounded-lg bg-inherit transition-transform duration-200 ease-in-out group-hover:scale-[1.03] cursor-pointer -z-10" />
                    </div>
                  ))}
                </div>
              </PopoverPanel>
            </Transition>
          </Popover>
          <Popover>
            <PopoverButton
              ref={comparePopoverButtonRef}
              onMouseEnter={handleCompareMouseEnter}
              onMouseLeave={handleCompareMouseLeave}
              onFocus={handleCompareFocus}
              onBlur={handleCompareBlur}
              onClick={(e) => {
                e.preventDefault()
                setIsComparePopoverOpen(!isComparePopoverOpen)
              }}
              className="px-0 py-6 border-none bg-transparent hover:underline flex items-center gap-x-1 font-semibold text-base font-sans leading-6 text-white whitespace-nowrap hover:cursor-pointer focus:outline-none"
            >
              Compare
              <ChevronDownIcon
                aria-hidden="true"
                className={`h-5 w-5 ${isComparePopoverOpen ? "rotate-180" : ""}`}
              />
            </PopoverButton>

            <Transition
              show={isComparePopoverOpen}
              enter="transition ease-out duration-100"
              enterFrom="opacity-0 translate-y-1"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-1"
            >
              <PopoverPanel
                onMouseEnter={handleCompareMouseEnter}
                onMouseLeave={handleCompareMouseLeave}
                onFocus={handleCompareFocus}
                onBlur={handleCompareBlur}
                className="absolute w-[80%] xl:w-[70%] 2xl:w-[60%] max-w-[90rem] top-full !left-1/2 -translate-x-1/2 z-10 bg-[rgba(38,40,51,0.98)] shadow-lg ring-1 ring-gray-900/5 dark:ring-gray-500/5 transition data-[closed]:-translate-y-1 data-[closed]:opacity-0 data-[enter]:duration-200 data-[leave]:duration-150 data-[enter]:ease-out data-[leave]:ease-in border-solid border-[1px] border-[#ffffff1a] rounded-lg"
              >
                <div className="mx-auto grid grid-cols-3 gap-x-4 px-3 pt-4 pb-4 lg:px-4 xl:gap-x-8">
                  {compareFeatures.map((item) => (
                    <div
                      key={item.name}
                      className="group relative rounded-lg p-3 text-sm leading-6 hover:bg-gray-700 cursor-pointer"
                    >
                      <div className="relative">
                        <div
                          className="relative flex h-11 w-11 items-center justify-center rounded-lg bg-[rgb(38,40,51)] group-hover:bg-gray-700"
                        >
                          {item.icon ? (
                            <item.icon
                              aria-hidden="true"
                              className="h-6 w-6 text-gray-300 group-hover:text-primary group-hover:fill-primary"
                            />
                          ) : (
                            <item.svg
                              aria-hidden="true"
                              className="h-6 w-6 fill-current text-gray-300 group-hover:text-primary group-hover:fill-primary"
                            />
                          )}
                        </div>
                        <a
                          href={item.href}
                          className="mt-6 block font-semibold text-white hover:no-underline group-hover:text-primary"
                        >
                          {item.name}
                          <span className="absolute inset-0" />
                        </a>
                        <p className="mt-1 text-gray-300">
                          {item.description}
                        </p>
                      </div>
                      <div className="absolute inset-0 rounded-lg bg-inherit transition-transform duration-200 ease-in-out group-hover:scale-[1.03] cursor-pointer -z-10" />
                    </div>
                  ))}
                </div>
              </PopoverPanel>
            </Transition>
          </Popover>
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="font-semibold text-base font-sans leading-6 text-black dark:text-white whitespace-nowrap"
            >
              {link.name}
            </a>
          ))}
          <div className="navbar__items navbar__items--right release-dropdown hidden xl:flex">
            <div className="navbar__item dropdown dropdown--hoverable dropdown--left">
              <a
                href={`https://github.com/questdb/questdb/releases/tag/${release.name}`}
                aria-label="GitHub repository"
                className="navbar__item navbar__link header-github-link font-semibold font-sans font-normal"
              >
                {release.name}
              </a>
              <ul className="dropdown__menu">
                <li>
                  <a
                    href="https://github.com/orgs/questdb/projects/1/views/5"
                    className="dropdown__link font-semibold"
                    rel="noreferrer"
                    target="_blank"
                  >
                    Roadmap
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <SearchBar />
        </PopoverGroup>

        <div className="hidden lg:flex lg:flex-1 lg:justify-end py-6">
          <MainCTA />
        </div>
        <MobileNav
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
          productFeatures={productFeatures}
          compareFeatures={compareFeatures}
          navLinks={navLinks}
        />
      </nav>
    </header>
  )
}
