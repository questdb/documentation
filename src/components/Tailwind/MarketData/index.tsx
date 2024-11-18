const MarketData = () => (
  <section id="financial-market-data">
    <div className="flex flex-col lg:flex-row max-w-7xl w-full mx-auto pt-24 pb-2 px-4">
      <img
        src="/images/pages/use-cases/financial-market-data-jumbo.svg"
        alt="An illustration of financial market data charts"
        className="w-full lg:w-1/2 lg:mb-0 sm:mb-0 lg:pt-28 sm:pt-2"
        loading="lazy"
      />
      <div className="w-full lg:w-1/2 flex-shrink-0">
        <p className="text-base font-semibold leading-7 text-primary text-center">
          Simply better tick storage
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl text-center">
          Efficient and feature rich
        </h2>
        <ul className="list-none sm:pl-2 sm:pr-2">
          <li className="relative mb-5 text-lg leading-8 pl-8">
            <span className="absolute left-0 top-0 text-pink-500">{">"}</span>
            Reliably ingest{" "}
            <a
              href="/glossary/tick-data/"
              className="underline hover:text-blue-700"
            >
              tick data
            </a>{" "}
            from low-latency feeds and exchanges. Store trades in separate
            tables. Match market data and trades based on the nearest timestamp
            via{" "}
            <a
              href="/docs/reference/sql/asof-join"
              className="underline hover:text-blue-700"
            >
              ASOF JOIN
            </a>
            .
          </li>
          <li className="relative mb-5 text-lg leading-8 pl-8">
            <span className="absolute left-0 top-0 text-pink-500">{">"}</span>
            Monitor market data, reference data, and trading activity (trades &
            volumes) in real-time via custom charts with{" "}
            <a
              href="/docs/third-party-tools/grafana/"
              className="underline hover:text-blue-700"
            >
              Grafana
            </a>
            ,{" "}
            <a
              href="/docs/third-party-tools/superset/"
              className="underline hover:text-blue-700"
            >
              Superset
            </a>{" "}
            , or{" "}
            <a
              href="/docs/third-party-tools/qstudio/"
              className="underline hover:text-blue-700"
            >
              qStudio
            </a>
            , like our{" "}
            <a
              href="/dashboards/crypto/"
              className="underline hover:text-blue-700"
            >
              real-time crypto dashboards
            </a>{" "}
            powered by SQL queries.
          </li>
          <li className="relative mb-5 text-lg leading-8 pl-8">
            <span className="absolute left-0 top-0 text-pink-500">{">"}</span>
            Empower quants and data scientists to explore and run trading and
            econometric models via ingest of{" "}
            <a
              href="/docs/third-party-tools/pandas/"
              className="underline hover:text-blue-700"
            >
              Pandas data frames
            </a>
            , Parquet exports, and an Apache ADBC endpoint to deliver in Arrow
            format (coming soon!).
          </li>
          <li className="relative mb-5 text-lg leading-8 pl-8">
            <span className="absolute left-0 top-0 text-pink-500">{">"}</span>
            Jump ahead of the curve with native{" "}
            <a
              href="/glossary/apache-parquet/"
              className="underline hover:text-blue-700"
            >
              Apache Parquet
            </a>{" "}
            support for efficiently storing historical tick data in object
            stores.
          </li>

          <li className="relative mb-5 text-lg leading-8 pl-8">
            <span className="absolute left-0 top-0 text-pink-500">{">"}</span>
            Dynamically support real-time feeds with flexible schemas. Create
            new columns as soon as data is processed from the feed handler.
          </li>
        </ul>
      </div>
    </div>
  </section>
)

export default MarketData
