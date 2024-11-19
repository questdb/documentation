export default function LogoStrip() {
  return (
    <div className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto grid max-w-lg grid-cols-4 items-center gap-x-8 gap-y-12 sm:max-w-xl sm:grid-cols-6 sm:gap-x-10 sm:gap-y-14 lg:mx-0 lg:max-w-none lg:grid-cols-5">
          <img
            alt="Aquis"
            src="/images/pages/customers/cards/aquis.svg"
            width={158}
            height={48}
            loading="lazy"
            className="col-span-2 max-h-12 w-full object-contain lg:col-span-1"
          />
          <img
            alt="OKX"
            src="/images/pages/customers/logos/okx.svg"
            width={158}
            height={48}
            loading="lazy"
            className="col-span-2 max-h-12 w-full object-contain lg:col-span-1"
          />
          <img
            alt="B3"
            src="/images/pages/customers/logos/b3.svg"
            width={158}
            height={48}
            loading="lazy"
            className="col-span-2 max-h-12 w-full object-contain lg:col-span-1"
          />
          <img
            alt="airtel"
            src="/images/pages/customers/logos/airtel.svg"
            width={158}
            height={48}
            loading="lazy"
            className="col-span-2 max-h-12 w-full object-contain sm:col-start-2 lg:col-span-1"
          />
          <img
            alt="xrp"
            src="/images/pages/customers/logos/xrp.svg"
            width={158}
            height={48}
            loading="lazy"
            className="col-span-2 col-start-2 max-h-12 w-full object-contain sm:col-start-auto lg:col-span-1"
          />
        </div>
      </div>
    </div>
  )
}
