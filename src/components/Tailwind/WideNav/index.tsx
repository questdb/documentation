import { useState, useRef } from "react"
import {
  Popover,
  PopoverButton,
  PopoverGroup,
  PopoverPanel,
  Transition,
} from "@headlessui/react"
import {
  EnvelopeIcon,
  Bars3Icon,
  PlayCircleIcon,
  RocketLaunchIcon,
  PresentationChartLineIcon,
} from "@heroicons/react/24/outline"
import { ChevronDownIcon } from "@heroicons/react/20/solid"
import SearchBar from "@theme/SearchBar"
import MobileNav from "./MobileNav"
import { MainCTA } from "../../../components/MainCTA"
import { Release } from "../../../utils"
import { usePluginData } from "@docusaurus/useGlobalData"

import InfluxSVG from "../../../../static/images/logos/influxdb.svg"
import TimescaleSVG from "../../../../static/images/logos/timescale.svg"
import MongoDBSVG from "../../../../static/images/logos/mongodb.svg"

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

const features = [
  {
    name: "Capital Markets",
    description:
      "Explore QuestDB use cases across Capital Markets.",
    href: "/market-data/",
    icon: RocketLaunchIcon,
  },
  {
    name: "vs. MongoDB",
    description:
      "Can MongoDB keep up with a specialized time-series database? Read our comparison.",
    href: "/blog/mongodb-time-series-benchmark-review/",
    svg: MongoDBSVG,
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

const callsToAction = [
  {
    name: "Explore live demo",
    href: "https://demo.questdb.io/",
    icon: PlayCircleIcon,
  },
  {
    name: "Contact for pricing",
    href: "/enterprise/contact/",
    icon: EnvelopeIcon,
  },
  {
    name: "View real-time crypto dashboards",
    href: "/dashboards/crypto/",
    icon: PresentationChartLineIcon,
  },
]

export default function WideNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { release } = usePluginData("fetch-latest-release") as {
    release: Release
  }

  const popoverButtonRef = useRef<HTMLButtonElement>(null)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Hover and Focus Handlers
  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current!)
    setIsPopoverOpen(true)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsPopoverOpen(false)
    }, 250)
  }

  const handleFocus = () => {
    clearTimeout(timeoutRef.current!)
    setIsPopoverOpen(true)
  }

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsPopoverOpen(false)
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-[99] bg-white dark:bg-[rgb(33,34,44)] shadow-md">
      <nav
        aria-label="Global"
        className="mx-auto flex max-w-7xl items-center justify-between p-6 lg:px-8 border-b border-gray-300"
      >
        <div className="flex lg:flex-1">
          <a className={styles.brand} href="/">
            QuestDB
          </a>
        </div>
        <div className="flex lg:hidden">
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
              ref={popoverButtonRef}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className="border-none bg-transparent hover:underline flex items-center gap-x-1 font-semibold text-base font-sans leading-6 text-black dark:text-white whitespace-nowrap hover:cursor-pointer"
            >
              Product
              <ChevronDownIcon
                aria-hidden="true"
                className={`h-5 w-5 ${isPopoverOpen ? "rotate-180" : ""}`}
              />
            </PopoverButton>

            <Transition
              show={isPopoverOpen}
              enter="transition ease-out duration-200"
              enterFrom="opacity-0 translate-y-1"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-1"
            >
              <PopoverPanel
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onFocus={handleFocus}
                onBlur={handleBlur}
                anchor="bottom"
                className="absolute w-[70%] xl:w-[60%] 2xl:w-[50%] top-0 !left-1/2 -translate-x-1/2 translate-y-8 z-10 bg-white dark:bg-[rgb(38,40,51)] shadow-lg ring-1 ring-gray-900/5 dark:ring-gray-500/5 transition data-[closed]:-translate-y-1 data-[closed]:opacity-0 data-[enter]:duration-200 data-[leave]:duration-150 data-[enter]:ease-out data-[leave]:ease-in border-solid border-[1px] border-[#ffffff1a] rounded-lg"
              >
                <div className="mx-auto grid grid-cols-4 gap-x-4 px-3 pt-4 pb-4 lg:px-8 xl:gap-x-8">
                  {features.map((item) => (
                    <div
                      key={item.name}
                      className="group relative rounded-lg p-3 text-sm leading-6 hover:bg-gray-50 dark:hover:bg-[rgb(33,34,44)]"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-50 dark:bg-[rgb(33,34,44)] group-hover:bg-white dark:group-hover:bg-gray-700">
                        {item.svg ? (
                          <item.svg
                            aria-hidden="true"
                            className="h-6 w-6 fill-current text-gray-600 dark:text-white group-hover:text-primary dark:group-hover:text-primary"
                          />
                        ) : (
                          <item.icon
                            aria-hidden="true"
                            className="h-6 w-6 text-gray-600 dark:text-white group-hover:text-primary dark:group-hover:text-primary"
                          />
                        )}
                      </div>
                      <a
                        href={item.href}
                        className="mt-6 block font-semibold text-gray-900 dark:text-white"
                      >
                        {item.name}
                        <span className="absolute inset-0" />
                      </a>
                      <p className="mt-1 text-gray-600 dark:text-gray-300">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mx-auto px-6 lg:px-8 pb-4">
                  <div className="grid grid-cols-3 divide-x divide-gray-900/5 border-solid border-[1px] border-primary rounded-lg bg-gray-50 dark:bg-[rgb(33,34,44)] group-hover:bg-white dark:group-hover:bg-gray-700">
                    {callsToAction.map((item) => (
                      <a
                        key={item.name}
                        href={item.href}
                        className="flex items-center justify-center gap-x-2.5 p-4 text-sm font-semibold leading-6 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                      >
                        <item.icon
                          aria-hidden="true"
                          className="h-5 w-5 flex-none text-gray-400"
                        />
                        {item.name}
                      </a>
                    ))}
                  </div>
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
          <div className="navbar__items navbar__items--right">
            <div className="navbar__item dropdown dropdown--hoverable dropdown--left">
              <a
                href={`https://github.com/questdb/questdb/releases/tag/${release.name}`}
                aria-label="GitHub repository"
                className="navbar__item navbar__link header-github-link font-semibold font-sans"
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

        <div className="hidden lg:flex lg:flex-1 lg:justify-end">
          <MainCTA className={styles.navbarCTA} />
        </div>
        <MobileNav
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
          features={features}
          navLinks={navLinks}
        />
      </nav>
    </header>
  )
}
