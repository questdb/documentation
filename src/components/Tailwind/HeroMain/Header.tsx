import { ChevronRightIcon } from "@heroicons/react/20/solid"
import { Release } from "../../../utils"
import { usePluginData } from "@docusaurus/useGlobalData"

export default function Header() {
  const { release } = usePluginData("fetch-latest-release") as {
    release: Release
  }

  return (
    <div className="mx-auto max-w-2xl lg:max-w-full lg:pt-0 lg:mt-2 sm:mt-2 lg:pl-10">
      <div className="mt-6 sm:mt-6 lg:mt-8">
        <a
          href={`https://github.com/questdb/questdb/releases/tag/${release.name}`}
          className="inline-flex space-x-6 no-underline hover:no-underline"
        >
          <span className="rounded-full bg-primary text-white px-3 py-1 text-sm font-semibold leading-6 ring-inset ring-primary">
            <span className="border-b-2 border-white inline-block hover:underline">
              What's new
            </span>
          </span>
          <span className="inline-flex items-center space-x-2 text-sm font-medium leading-6 text-gray-900 dark:text-white">
            <span className="inline-block border-b-2 border-transparent hover:border-current text-current hover:underline">
              Just shipped {release.name}
            </span>
            <ChevronRightIcon
              aria-hidden="true"
              className="h-5 w-5 text-gray-500 dark:text-gray-300"
            />
          </span>
        </a>
      </div>
      <h1 className="mt-6 text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight text-gray-900 dark:text-white lg:w-[60%]">
        <span className="block sm:inline-block">Peak</span>{" "}
        <span className="block sm:inline-block">time-series</span>{" "}
        <span className="block sm:inline-block">performance</span>
      </h1>
      <p className="mt-6 text-xl leading-8 text-gray-700 dark:text-gray-300 lg:w-[75%]">
        QuestDB is the world's fastest growing open-source time-series database.
        It offers massive ingestion throughput, millisecond queries, powerful
        time-series SQL extensions, and scales well with minimal and maximal
        hardware. Save costs with better performance and efficiency.
      </p>
      <div className="mt-10 flex items-center gap-x-6">
        <a
          href="https://demo.questdb.io/"
          className="rounded-md bg-primary text-white px-3.5 py-2.5 text-sm font-semibold shadow-sm ring-1 ring-primary hover:bg-white hover:text-primary dark:hover:bg-gray-200"
        >
          View Live Demo
        </a>
        <a
          href="/enterprise/"
          className="text-sm font-semibold leading-6 text-gray-900 dark:text-white hover:underline"
        >
          <span className="border-b-2 border-transparent hover:border-gray-900 dark:hover:border-white">
            See Enterprise
          </span>{" "}
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  )
}
