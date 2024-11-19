import BackgroundSVG from "../HeroMain/BackgroundSVG"

import { Section } from "../../../components/Section"

export function FinanceHeader() {
  return (
    <div className="relative isolate overflow-hidden pb-16 sm:pb-20">
      <div className="dark:block hidden">
        <BackgroundSVG />
      </div>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl sm:pt-32 lg:pb-48 lg:pt-48 lg:pb:48">
          <div className="hidden sm:mb-8 sm:flex sm:justify-center">
            <div className="relative rounded-full px-3 py-1 text-sm leading-6 text-gray-600 dark:text-gray-400 ring-1 ring-gray-300 dark:ring-white/10 hover:ring-gray-400 dark:hover:ring-white/20">
              Introducing our live Grafana charts{" "}
              <a
                href="/dashboards/crypto/"
                className="font-semibold text-black dark:text-white"
              >
                <span aria-hidden="true" className="absolute inset-0" />
                View <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-8xl  font-bold tracking-tight sm:text-6xl">
              Next generation finance
            </h1>
            <p className="mt-6 text-xl leading-8 dark:text-gray-300">
              QuestDB a premium, open source tick database. Stream tick data and
              offload older data to open formats (Parquet). Leverage SQL and
              powerful time series extensions to query market data blazingly
              fast.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <a
                href="/enterprise/contact/"
                className="rounded-md bg-primary px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
              >
                Contact us
              </a>
              <a
                href="/dashboards/crypto/"
                className="text-sm font-semibold leading-6 text-gray-600 dark:text-white"
              >
                Live demo <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </div>

        <Section fullWidth noGap>
          <div className="mx-auto max-w-lg grid-cols-4 items-center gap-x-8 gap-y-10 lg:mx-0 lg:max-w-none pl-24 invisible lg:visible sm:grid">
            <img
              alt="B3 Exchange"
              src="/images/pages/customers/logos/b3.svg"
              width={150}
              height={48}
              loading="lazy"
              className="col-span-1 object-contain invert dark:brightness-100 brightness-50 contrast-90 dark:invert-0"
            />
            <img
              alt="Aquis Exchange"
              src="/images/pages/customers/cards/aquis.svg"
              width={150}
              height={48}
              loading="lazy"
              className="col-span-1 object-contain invert dark:brightness-100 brightness-50 contrast-90 dark:invert-0"
            />
            <img
              alt="xrp"
              src="/images/pages/customers/logos/xrp.svg"
              width={150}
              height={50}
              loading="lazy"
              className="col-span-1 object-contain invert dark:brightness-100 brightness-50 contrast-90 dark:invert-0"
            />
            <img
              alt="OKX"
              src="/images/pages/customers/logos/okx.svg"
              width={110}
              height={48}
              loading="lazy"
              className="col-span-1 object-contain invert dark:brightness-100 brightness-50 contrast-90 dark:invert-0"
            />
            <img
              alt="wellwing capital"
              src="/images/pages/customers/logos/welwing_capital.svg"
              width={299}
              height={50}
              loading="lazy"
              className="col-span-1 object-contain pl-2 invert dark:brightness-100 brightness-50 contrast-90 dark:invert-0"
            />

            <img
              alt="Energetech"
              src="/images/pages/customers/logos/energetech.svg"
              width={150}
              height={50}
              loading="lazy"
              className="col-span-1 object-contain invert brightness-50 dark:brightness-100 contrast-90 dark:invert-0"
            />
            <img
              alt="S&P global"
              src="/images/pages/customers/logos/sp_global.svg"
              width={135}
              height={50}
              loading="lazy"
              className="col-span-1 object-contain pl-2 invert brightness-50 dark:brightness-100 contrast-90 dark:invert-0"
            />
            <img
              alt="Norlys Energy Trading"
              src="/images/pages/customers/logos/norlys-energy-trading.svg"
              width={150}
              height={50}
              loading="lazy"
              className="col-span-1 object-contain invert brightness-50 dark:brightness-100 contrast-90 dark:invert-0 pr-10"
            />
          </div>
        </Section>
      </div>
    </div>
  )
}
