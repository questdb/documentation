import Link from '@docusaurus/Link'
import useBaseUrl from '@docusaurus/useBaseUrl'
import type { ReactNode } from 'react'

interface IntegrationGridProps {
  children: ReactNode
}

interface IntegrationCardProps {
  name: string
  href: string
  // Without a logo, the card shows the first letter of the name instead.
  // The site is dark-only, so use the variant made for dark backgrounds.
  logo?: string
  children: ReactNode
}

export function IntegrationGrid({ children }: IntegrationGridProps) {
  return (
    <div className="not-prose my-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {children}
    </div>
  )
}

export function IntegrationCard({
  name,
  href,
  logo,
  children,
}: IntegrationCardProps) {
  const logoUrl = useBaseUrl(logo ?? '')

  return (
    <div className="relative flex gap-4 rounded-lg border border-solid border-white/10 p-4 transition-colors hover:border-white/25">
      {/* Wider than tall, so wide marks such as Superset get more room */}
      <div className="flex h-10 w-14 shrink-0 items-center justify-center">
        {logo ? (
          <img
            src={logoUrl}
            alt={`${name} logo`}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-lg font-semibold text-zinc-300"
          >
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-auto">
        {/* The ::after overlay makes the whole card open the page */}
        <Link
          to={href}
          className="font-semibold text-white after:absolute after:inset-0 after:content-[''] hover:no-underline"
        >
          {name}
        </Link>
        {/* Clicks fall through to the overlay, except on links in the text */}
        <div className="pointer-events-none relative mt-1 text-sm text-zinc-300 [&_a]:pointer-events-auto [&_p]:m-0">
          {children}
        </div>
      </div>
    </div>
  )
}
