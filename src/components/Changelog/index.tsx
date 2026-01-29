import { usePluginData } from "@docusaurus/useGlobalData"
import Link from "@docusaurus/Link"

function RssIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      width="20"
      height="20"
    >
      <circle cx="6.18" cy="17.82" r="2.18" />
      <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z" />
    </svg>
  )
}

type ChangelogItem = {
  title: string
  url: string
  date: string
  excerpt: string
}

type ChangelogData = {
  changelog: ChangelogItem[]
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

function getRelativeUrl(fullUrl: string): string {
  // Extract path from full URL for internal linking
  try {
    const url = new URL(fullUrl)
    return url.pathname
  } catch {
    return fullUrl
  }
}

function groupByDate(items: ChangelogItem[]): Map<string, ChangelogItem[]> {
  const groups = new Map<string, ChangelogItem[]>()

  for (const item of items) {
    const date = new Date(item.date)
    const dateKey = date.toISOString().split("T")[0]

    if (!groups.has(dateKey)) {
      groups.set(dateKey, [])
    }
    groups.get(dateKey)!.push(item)
  }

  return groups
}

export default function Changelog() {
  const data = usePluginData("docs-rss") as ChangelogData | undefined

  if (!data?.changelog?.length) {
    return (
      <div className="text-gray-400">
        No recent documentation updates found.
      </div>
    )
  }

  const groupedItems = groupByDate(data.changelog)

  return (
    <div className="changelog">
      <div className="mb-6">
        <a
          href="/docs/rss.xml"
          aria-label="Subscribe to documentation updates via RSS feed"
          className="inline-flex items-center gap-2 px-4 py-2 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 rounded-lg text-pink-400 hover:text-pink-300 transition-colors no-underline hover:no-underline"
        >
          <RssIcon />
          <span>Subscribe to RSS Feed</span>
        </a>
      </div>

      {Array.from(groupedItems.entries()).map(([dateKey, items]) => (
        <div key={dateKey} className="mb-8">
          <h3 className="text-lg font-semibold text-gray-300 mb-4 border-b border-gray-700 pb-2">
            {formatDate(items[0].date)}
          </h3>
          <ul className="space-y-4">
            {items.map((item, index) => (
              <li key={`${dateKey}-${index}`} className="pl-4 border-l-2 border-gray-700">
                <Link
                  to={getRelativeUrl(item.url)}
                  className="text-pink-400 hover:text-pink-300 font-medium text-base"
                >
                  {item.title}
                </Link>
                {item.excerpt && (
                  <p className="text-gray-400 text-sm mt-1 mb-0">
                    {item.excerpt}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

    </div>
  )
}
