'use client'

import Link from '@docusaurus/Link'
import {
  type MotionValue,
  motion,
  useMotionTemplate,
  useMotionValue,
} from 'framer-motion'

import { GridPattern } from '../GridPattern'
import { BoltIcon } from '../../assets/icons/tailwind/BoltIcon'
import { CogIcon } from '../../assets/icons/tailwind/CogIcon'
import { MagnifyingGlassIcon } from '../../assets/icons/tailwind/MagnifyingGlassIcon'
import { UsersIcon } from '../../assets/icons/tailwind/UsersIcon'

interface Resource {
  href: string
  name: string    
  description: string
  icon: React.ComponentType<{ className?: string }>
  pattern: Omit<
    React.ComponentPropsWithoutRef<typeof GridPattern>,
    'width' | 'height' | 'x'
  >
}

const resources: Array<Resource> = [
  {
    href: '/docs/reference/sql/overview/',
    name: 'SQL overview',
    description:
      'Learn about our powerful extended SQL language and how to use it to query QuestDB.',
    icon: MagnifyingGlassIcon,
    pattern: {
      y: 16,
      squares: [
        [0, 1],
        [1, 3],
      ],
    },
  },
  {
    href: '/docs/ingestion-overview/#first-party-clients',
    name: 'Language clients',
    description:
      'Explore our language clients and how to use them to ingest data into QuestDB.',
    icon: BoltIcon,
    pattern: {
      y: -6,
      squares: [
        [-1, 2],
        [1, 3],
      ],
    },
  },
  {
    href: '/docs/configuration/',
    name: 'Configuration',
    description:
      'See all of our available configuration options and fine-tune to match your use case.',
    icon: CogIcon,
    pattern: {
      y: 32,
      squares: [
        [0, 2],
        [1, 4],
      ],
    },
  },
  {
    href: '/docs/third-party-tools/overview/',
    name: 'Third-Party Tools',
    description:
      'Our recommended third-party tools can aid you in analyzing and visualizing your data.',
    icon: UsersIcon,
    pattern: {
      y: 22,
      squares: [[0, 1]],
    },
  },
]

function ResourceIcon({ icon: Icon }: { icon: Resource['icon'] }) {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/5 ring-1 ring-zinc-900/25 backdrop-blur-[2px] transition duration-300 group-hover:ring-zinc-900/25 dark:bg-white/7.5 dark:ring-white/15 dark:group-hover:bg-[var(--ifm-color-primary)]/10 dark:group-hover:ring-[var(--ifm-color-primary)]">
      <Icon className="h-5 w-5 fill-zinc-700/10 stroke-zinc-700 transition-colors duration-300 group-hover:stroke-zinc-900 dark:fill-white/10 dark:stroke-zinc-400 dark:group-hover:fill-[var(--ifm-color-primary)]/10 dark:group-hover:stroke-[var(--ifm-color-primary)]" />
    </div>
  )
}

function ResourcePattern({
  mouseX,
  mouseY,
  ...gridProps
}: Resource['pattern'] & {
  mouseX: MotionValue<number>
  mouseY: MotionValue<number>
}) {
  let maskImage = useMotionTemplate`radial-gradient(180px at ${mouseX}px ${mouseY}px, white, transparent)`
  let style = { maskImage, WebkitMaskImage: maskImage }

  return (
    <div className="pointer-events-none">
      <div className="absolute inset-0 rounded-2xl transition duration-300 [mask-image:linear-gradient(white,transparent)] group-hover:opacity-50">
        <GridPattern
          width={72}
          height={56}
          x="50%"
          className="absolute inset-x-0 inset-y-[-30%] h-[160%] w-full skew-y-[-18deg] fill-black/[0.02] stroke-black/5 dark:fill-white/1 dark:stroke-white/2.5"
          {...gridProps}
        />
      </div>
      <motion.div
        className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[var(--ifm-color-primary-light)] to-[var(--ifm-color-primary-lightest)] opacity-0 transition duration-300 group-hover:opacity-100 dark:from-[var(--palette-rock)] dark:to-[var(--palette-gray)]"
        style={style}
      />
      <motion.div
        className="absolute inset-0 rounded-2xl opacity-0 mix-blend-overlay transition duration-300 group-hover:opacity-100"
        style={style}
      >
        <GridPattern
          width={72}
          height={56}
          x="50%"
          className="absolute inset-x-0 inset-y-[-30%] h-[160%] w-full skew-y-[-18deg] fill-black/50 stroke-black/70 dark:fill-white/2.5 dark:stroke-white/10"
          {...gridProps}
        />
      </motion.div>
    </div>
  )
}

function Resource({ resource }: { resource: Resource }) {
  let mouseX = useMotionValue(0)
  let mouseY = useMotionValue(0)

  function onMouseMove({
    currentTarget,
    clientX,
    clientY,
  }: React.MouseEvent<HTMLDivElement>) {
    let { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  return (
    <div
      key={resource.href}
      onMouseMove={onMouseMove}
      className="group relative flex rounded-2xl bg-[var(--ifm-color-primary-lightest)]/10 transition-shadow hover:shadow-md hover:shadow-zinc-900/5 dark:bg-white/2.5 dark:hover:shadow-black/5"
    >
      <ResourcePattern {...resource.pattern} mouseX={mouseX} mouseY={mouseY} />
      <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-[var(--ifm-color-primary)]/20 group-hover:ring-[var(--ifm-color-primary)] dark:ring-white/10 dark:group-hover:ring-[var(--ifm-color-primary)]" />
      <div className="relative rounded-2xl px-4 pb-4 pt-4">
        <ResourceIcon icon={resource.icon} />
        <h3 className="mt-4 text-sm font-semibold leading-7 text-[var(--ifm-color-primary-darker)] dark:text-white">
          <Link 
            href={resource.href}
            className="text-[var(--ifm-color-primary-darker)] hover:text-[var(--ifm-color-primary)] dark:text-white dark:hover:text-white no-underline"
          >
            <span className="absolute inset-0 rounded-2xl" />
            {resource.name}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {resource.description}
        </p>
      </div>
    </div>
  )
}

export function Resources() {
  return (
    <div className="mb-4 xl:max-w-none">
      <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:grid-cols-4 dark:border-white/5">
        {resources.map((resource) => (
          <Resource key={resource.href} resource={resource} />
        ))}
      </div>
    </div>
  )
}
