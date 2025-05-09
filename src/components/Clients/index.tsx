import { DocButton } from '../DocButton'; // Assuming DocButton is in the parent directory

interface Client {
  href: string;
  name: string;
  description: string;
  logo: string;
  protocol: 'ILP' | 'PGWire'; // Protocol type
}

const clientsData: Client[] = [
  {
    href: '/docs/clients/ingest-c-and-cpp',
    name: 'C & C++',
    description:
      'High-performance client for systems programming and embedded applications.',
    logo: '/images/logos/cplusplus.svg',
    protocol: 'ILP',
  },
  {
    href: '/docs/clients/ingest-dotnet',
    name: '.NET',
    description:
      'Cross-platform client for building applications with .NET technologies.',
    logo: '/images/logos/dotnet.svg',
    protocol: 'ILP',
  },
  {
    href: '/docs/pgwire/c-sharp',
    name: '.NET',
    description:
      'Cross-platform clients for building applications with .NET technologies.',
    logo: '/images/logos/dotnet.svg',
    protocol: 'PGWire',
  },
  {
    href: '/docs/clients/ingest-go',
    name: 'Go',
    description:
      'An open-source programming language supported by Google with built-in concurrency.',
    logo: '/images/logos/go.svg',
    protocol: 'ILP',
  },
  {
    href: '/docs/pgwire/go',
    name: 'Go',
    description:
      'An open-source programming language supported by Google with built-in concurrency.',
    logo: '/images/logos/go.svg',
    protocol: 'PGWire',
  },
  {
    href: '/docs/clients/java_ilp',
    name: 'Java',
    description:
      'Platform-independent client for enterprise applications and Android development.',
    logo: '/images/logos/java.svg',
    protocol: 'ILP',
  },
  {
    href: '/docs/pgwire/java',
    name: 'Java',
    description:
      'Platform-independent clients for enterprise applications and Android development.',
    logo: '/images/logos/java.svg',
    protocol: 'PGWire',
  },
  {
    href: '/docs/clients/ingest-node',
    name: 'Node.js',
    description:
      'Node.js® is an open-source, cross-platform JavaScript runtime environment.',
    logo: '/images/logos/nodejs-light.svg',
    protocol: 'ILP',
  },
  {
    href: '/docs/pgwire/javascript',
    name: 'Node.js',
    description:
      'Node.js® is an open-source, cross-platform JavaScript runtime environment.',
    logo: '/images/logos/nodejs-light.svg',
    protocol: 'PGWire',
  },
  {
    href: '/docs/clients/ingest-python',
    name: 'Python',
    description:
      'Python is a programming language that lets you work quickly and integrate systems more effectively.',
    logo: '/images/logos/python.svg',
    protocol: 'ILP',
  },
  {
    href: '/docs/pgwire/python/',
    name: 'Python',
    description:
      'Python is a programming language that lets you work quickly and integrate systems more effectively.',
    logo: '/images/logos/python.svg',
    protocol: 'PGWire',
  },
  {
    href: '/docs/clients/ingest-rust',
    name: 'Rust',
    description:
      'Systems programming language focused on safety, speed, and concurrency.',
    logo: '/images/logos/rust.svg',
    protocol: 'ILP',
  },
  {
    href: '/docs/pgwire/rust',
    name: 'Rust',
    description:
      'Systems programming language focused on safety, speed, and concurrency.',
    logo: '/images/logos/rust.svg',
    protocol: 'PGWire',
  },
  {
    href: '/docs/pgwire/php',
    name: 'PHP',
    description:
      'PHP is a popular general-purpose scripting language that is especially suited to web development.',
    logo: '/images/logos/php.svg',
    protocol: 'PGWire',
  },
  {
    href: '/docs/pgwire/rpostgres',
    name: 'R',
    description:
      'R is a programming language and free software environment for statistical computing and graphics supported by the R Foundation for Statistical Computing.',
    logo: '/images/logos/php.svg',
    protocol: 'PGWire',
  },
];

interface ClientDisplayProps {
  showProtocol?: 'ILP' | 'PGWire';
}

export function Clients({ showProtocol }: ClientDisplayProps) {
  const protocolToDisplay = showProtocol || 'ILP';

  const filteredClients = clientsData.filter(
    (client) => client.protocol === protocolToDisplay
  );

  if (filteredClients.length === 0) {
    return (
      <div className="my-16 xl:max-w-none">
        <p className="text-center text-zinc-600 dark:text-zinc-300">
          No clients available for the "{protocolToDisplay}" protocol.
        </p>
      </div>
    );
  }

  return (
    <div className="my-16 xl:max-w-none">
      <div className="not-prose mt-4 grid grid-cols-1 gap-x-6 gap-y-10 border-t border-zinc-900/5 pt-10 sm:grid-cols-2 xl:max-w-none xl:grid-cols-3 dark:border-white/5">
        {filteredClients.map((client) => (
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
  );
}