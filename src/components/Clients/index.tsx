import { DocButton } from '../DocButton'; // Assuming DocButton is in the parent directory
import useBaseUrl from '@docusaurus/useBaseUrl';
import clients from '../../../shared/clients.json';

interface Client {
  href: string;
  name: string;
  description: string;
  logo: string;
  protocol: 'ILP' | 'PGWire'; // Protocol type
}

interface ClientDisplayProps {
  showProtocol?: 'ILP' | 'PGWire';
}

const clientsData = clients as Client[];

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
              src={useBaseUrl(client.logo)}
              alt={`${client.name} logo`}
              className={`h-12 w-12 ${client.name === 'Rust' ? 'dark:invert' : ''}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}