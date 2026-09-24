import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { formatMoney } from '@/core/money';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { ClientDialog } from '../components/ClientDialog';
import { useClients } from '../hooks';
import type { ClientListItem } from '../model';

export function ClientsPage() {
  const { data: clients } = useClients();
  const openCreate = useCreateStore((state) => state.openCreate);
  const [editing, setEditing] = useState<ClientListItem | null>(null);

  if (!clients) return null;

  return (
    <Page
      title="Clients"
      subtitle={clients.length > 0 ? `${clients.length} client${clients.length > 1 ? 's' : ''}` : undefined}
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
        <ul>
          {clients.map((client) => (
            <li key={client.id}>
              <button
                type="button"
                onClick={() => setEditing(client)}
                className="-mx-2.5 grid min-h-11 w-[calc(100%+20px)] grid-cols-[minmax(0,1fr)_auto_120px] items-center gap-6 rounded-md px-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover"
              >
                <span className="truncate">
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
          ))}
        </ul>
      )}

      <ClientDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        client={editing ?? undefined}
      />
    </Page>
  );
}
