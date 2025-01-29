import { DocButton } from '../DocButton'

const guides = [
  {
    href: '/docs/deployment/capacity-planning/',
    name: 'Capacity planning',
    description: 'Select a storage medium, plan, size and compress your QuestDB deployment.',
  },
  {
    href: '/docs/operations/design-for-performance/',
    name: 'Design for performance',
    description: 'Design and tweak your data model to set yourself up for reliable, optimal performance.',
  },
  {
    href: '/docs/guides/working-with-timestamps-timezones/',
    name: 'Working with time',
    description:
      `It's about time. Learn how to work with timestamps and timezones in QuestDB.`,
  },
  {
    href: '/docs/operations/backup/',
    name: 'Backup and restore',
    description:
      'Safety is key! See the methods to backup and restore your QuestDB deployment.',
  },
]

export function Guides() {
  return (
    <div className="xl:max-w-none">
      <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-4 sm:grid-cols-2 xl:grid-cols-4 dark:border-white/5">
        {guides.map((guide) => (
          <div key={guide.href}>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              {guide.name}
            </h3>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
              {guide.description}
            </p>
            <p className="mt-4">
              <DocButton href={guide.href} variant="text" arrow="right">
                Read more
              </DocButton>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
