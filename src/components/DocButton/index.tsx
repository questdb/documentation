import Link from '@docusaurus/Link'
import clsx from 'clsx'

function ArrowIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m11.5 6.5 3 3.5m0 0-3 3.5m3-3.5h-9"
      />
    </svg>
  )
}

const variantStyles = {
  primary:
    'rounded-full bg-[#a23154] py-1 px-3 text-white hover:bg-[#9c274b] dark:bg-[#d9688b]/10 dark:text-[#d9688b] dark:ring-1 dark:ring-inset dark:ring-[#d9688b]/20 dark:hover:bg-[#d9688b]/10 dark:hover:text-[#e289a4] dark:hover:ring-[#e289a4]',
  secondary:
    'rounded-full bg-zinc-100 py-1 px-3 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:ring-1 dark:ring-inset dark:ring-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-300',
  filled:
    'rounded-full bg-[#a23154] py-1 px-3 text-white hover:bg-[#9c274b] dark:bg-[#d75c82] dark:text-white dark:hover:bg-[#d9688b]',
  outline:
    'rounded-full py-1 px-3 text-zinc-700 ring-1 ring-inset ring-zinc-900/10 hover:bg-zinc-900/2.5 hover:text-zinc-900 dark:text-zinc-400 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-white',
  text: 'text-[#d75c82] hover:text-[#d9688b] dark:text-[#d9688b] dark:hover:text-[#e289a4]',
}

type ButtonProps = {
  variant?: keyof typeof variantStyles
  arrow?: 'left' | 'right'
  absolute?: boolean
} & (
  | React.ComponentPropsWithoutRef<typeof Link>
  | (React.ComponentPropsWithoutRef<'button'> & { href?: undefined })
)

export function DocButton({
  variant = 'primary',
  className,
  children,
  arrow,
  absolute,
  ...props
}: ButtonProps) {
  className = clsx(
    'inline-flex gap-0.5 justify-center overflow-hidden text-sm font-medium transition',
    variantStyles[variant],
    className,
  )

  let arrowIcon = (
    <ArrowIcon
      className={clsx(
        'mt-0.5 h-5 w-5',
        variant === 'text' && 'relative top-px',
        arrow === 'left' && '-ml-1 rotate-180',
        arrow === 'right' && '-mr-1',
      )}
    />
  )

  let inner = (
    <>
      {arrow === 'left' && arrowIcon}
      {children}
      {arrow === 'right' && arrowIcon}
    </>
  )

  if (typeof props.href === 'undefined') {
    const buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement> = {
      className,
      ...props,
      type: props.type || 'button',
    }
    return (
      <button {...buttonProps}>
        {inner}
      </button>
    )
  }

  if (absolute && props.href?.startsWith('/')) {
    return (
      <a className={className} {...props}>
        {inner}
      </a>
    )
  }

  return (
    <Link className={className} {...props}>
      {inner}
    </Link>
  )
}
