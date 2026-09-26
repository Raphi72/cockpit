import { ChevronRight, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { formatMoney } from '@/core/money';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { ClientDialog } from '../components/ClientDialog';
import { useClients } from '../hooks';
import { splitArchived, type ClientListItem } from '../model';

function ClientRow({ client, onOpen }: { client: ClientListItem; onOpen: () => void }) {
  const archived = client.archivedAt !== null;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="-mx-2.5 grid min-h-11 w-[calc(100%+20px)] grid-cols-[minmax(0,1fr)_auto_120px] items-center gap-6 rounded-md px-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover"
      >
        <span className={`truncate ${archived ? 'text-ink-2' : ''}`}>
          {client.name}
          {client.email && <span className="ml-2.5 text-meta text-ink-3">{client.email}</span>}
        </span>
        <span className="text-meta text-ink-3">
          {client.projectCount === 0
            ? 'Aucun projet'
            : `${client.projectCount} projet${client.projectCount > 1 ? 's' : ''}`}
        </span>
        <span className="tnum text-right text-meta">
          {client.dueCents > 0 ? (
            <>
              <span className="text-ink">{formatMoney(client.dueCents)}</span>
              <span className="text-ink-3"> à recevoir</span>
            </>
          ) : null}
        </span>
      </button>
    </li>
  );
}

export function ClientsPage() {
  const { data: clients } = useClients();
  const openCreate = useCreateStore((state) => state.openCreate);
  const [editing, setEditing] = useState<ClientListItem | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  if (!clients) return null;
  const { active, archived } = splitArchived(clients);
  // La fiche ouverte suit la liste (archivée ou réactivée depuis la fiche, elle reste à jour).
  const opened = editing ? (clients.find((client) => client.id === editing.id) ?? editing) : undefined;

  return (
    <Page
      title="Clients"
      subtitle={active.length > 0 ? `${active.length} client${active.length > 1 ? 's' : ''}` : undefined}
      actions={
        <Button variant="secondary" icon={Plus} onClick={() => openCreate('client')}>
          Nouveau client
        </Button>
      }
    >
      {clients.length === 0 ? (
        <EmptyState icon={Users} title="Aucun client pour l’instant">
          <p>Un client, une école, une asso : toute organisation pour qui tu travailles.</p>
          <p className="mt-1">Tu peux aussi en créer un directement depuis un projet.</p>
        </EmptyState>
      ) : (
        <>
          {active.length === 0 ? (
            <p className="text-ink-3">Aucun client actif.</p>
          ) : (
            <ul>
              {active.map((client) => (
                <ClientRow key={client.id} client={client} onOpen={() => setEditing(client)} />
              ))}
            </ul>
          )}

          {archived.length > 0 && (
            <section className="mt-10">
              <Button
                variant="ghost"
                icon={ChevronRight}
                aria-expanded={showArchived}
                onClick={() => setShowArchived((open) => !open)}
                className={`-ml-3 [&>svg]:transition-transform ${showArchived ? '[&>svg]:rotate-90' : ''}`}
              >
                {archived.length} client{archived.length > 1 ? 's' : ''} archivé{archived.length > 1 ? 's' : ''}
              </Button>
              {showArchived && (
                <ul className="mt-1">
                  {archived.map((client) => (
                    <ClientRow key={client.id} client={client} onOpen={() => setEditing(client)} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <ClientDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} client={opened} />
    </Page>
  );
}
