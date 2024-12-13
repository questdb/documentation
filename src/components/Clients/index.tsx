import { DocButton } from '../DocButton'

const clients = [
  {
    href: '/docs/clients/ingest-c-and-cpp',
    name: 'C & C++',
    description:
      'High-performance client for systems programming and embedded applications.',
    logo: '/images/logos/cplusplus.svg',
  },
  {
    href: '/docs/clients/ingest-dotnet',
    name: '.NET',
    description:
      'Cross-platform client for building applications with .NET technologies.',
    logo: '/images/logos/dotnet.svg',
  },
  {
    href: '/docs/clients/ingest-go',
    name: 'Go',
    description:
      'An open-source programming language supported by Google with built-in concurrency.',
    logo: '/images/logos/go.svg',
  },
  {
    href: '/docs/clients/java_ilp',
    name: 'Java',
    description:
      'Platform-independent client for enterprise applications and Android development.',
    logo: '/images/logos/java.svg',
  },
  {
    href: '/docs/clients/ingest-node',
    name: 'Node.js',
    description:
      'Node.js® is an open-source, cross-platform JavaScript runtime environment.',
    logo: '/images/logos/nodejs-light.svg',
  },
  {
    href: '/docs/clients/ingest-python',
    name: 'Python',
    description:
      'Python is a programming language that lets you work quickly and integrate systems more effectively.',
    logo: '/images/logos/python.svg',
  },
  {
    href: '/docs/clients/ingest-rust',
    name: 'Rust',
    description:
      'Systems programming language focused on safety, speed, and concurrency.',
    logo: '/images/logos/rust.svg',
  },
]

export function Clients() {
  return (
    <div className="my-16 xl:max-w-none">
      <div className="not-prose mt-4 grid grid-cols-1 gap-x-6 gap-y-10 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:max-w-none xl:grid-cols-3 dark:border-white/5">
        {clients.map((client) => (
          <div key={client.name} className="flex flex-row-reverse gap-6">
            <div className="flex-auto">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                {client.name}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {client.description}
              </p>
              <p className="mt-4">
                <DocButton href={client.href} variant="text" arrow="right">
                  Read more
                </DocButton>
              </p>
            </div>
            <img
              src={client.logo}
              alt={`${client.name} logo`}
              className={`h-12 w-12 ${client.name === 'Rust' ? 'dark:invert' : ''}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
