import Link from '@docusaurus/Link'
import clsx from 'clsx'

function StarIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function ArrowIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="m11.5 6.5 3 3.5m0 0-3 3.5m3-3.5h-9"
      />
    </svg>
  )
}

type EnterpriseNoteProps = {
  children?: React.ReactNode
  className?: string
}

export function EnterpriseNote({ children, className }: EnterpriseNoteProps) {
  return (
    <div
      className={clsx(
        'my-6 flex items-center gap-3 rounded-lg border p-4',
        'border-[#d75c82]/30 bg-[#d75c82]/5',
        'dark:border-[#d9688b]/30 dark:bg-[#d9688b]/5',
        className
      )}
    >
      <StarIcon className="h-5 w-5 flex-none text-[#a23154] dark:text-[#d9688b]" />
      <div className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
        <span className="font-semibold text-[#a23154] dark:text-[#d9688b]">
          Enterprise
        </span>
        <span className="mx-2">—</span>
        {children || 'This feature is available in QuestDB Enterprise.'}
      </div>
      <Link
        to="https://questdb.com/enterprise/"
        className={clsx(
          'flex-none text-xs font-medium flex items-center gap-0.5',
          'text-zinc-500 hover:text-[#a23154]',
          'dark:text-zinc-400 dark:hover:text-[#d9688b]',
          'transition-colors'
        )}
      >
        Learn more
        <ArrowIcon className="h-4 w-4" />
      </Link>
    </div>
  )
}

export default EnterpriseNote
