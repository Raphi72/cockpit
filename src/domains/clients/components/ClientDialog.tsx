import { Link } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useCreateStore } from '@/app/create-store';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { Input, Textarea } from '@/ui/primitives/Input';
import { ColorDot } from '@/ui/data/ColorDot';
import { useProjects } from '@/domains/projects/hooks';
import { PROJECT_STATUSES, STATUS_LABELS } from '@/domains/projects/model';
import { useClientEditor } from '../editor-store';
import { useClients, useCreateClient, useDeleteClient, useUpdateClient } from '../hooks';
import { validateClient, type Client, type ClientInput } from '../model';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

function ClientProjects({ clientId, onNavigate }: { clientId: string; onNavigate: () => void }) {
  const { data: projects = [] } = useProjects({ statuses: PROJECT_STATUSES, clientId });
  if (projects.length === 0) return <p className="pt-2 text-ink-3">Aucun projet pour ce client.</p>;
  return (
    <ul>
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            onClick={onNavigate}
            className="-mx-2 flex h-9 items-center gap-3 rounded-md px-2 hover:bg-hover"
          >
            <ColorDot color={project.typeColor} />
            <span className="flex-1 truncate">{project.name}</span>
            <span className="text-meta text-ink-3">{STATUS_LABELS[project.status]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ClientForm({ client, onDone }: { client?: Client; onDone: () => void }) {
  const [input, setInput] = useState<ClientInput>({
    name: client?.name ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    notes: client?.notes ?? '',
  });
  const [submitted, setSubmitted] = useState(false);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const errors = validateClient(input);
  const set = (key: keyof ClientInput) => (value: string) => setInput((prev) => ({ ...prev, [key]: value }));

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    if (client) {
      updateClient.mutate({ id: client.id, input }, { onSuccess: onDone });
    } else {
      createClient.mutate(input, {
        onSuccess: () => {
          toast('Client créé.');
          onDone();
        },
      });
    }
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          submit();
        }
      }}
      className="mt-5"
    >
      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <Row label="Nom">
          <Input autoFocus value={input.name} onChange={(e) => set('name')(e.target.value)} aria-label="Nom" />
          {submitted && errors.name && <p className="mt-1.5 text-meta text-danger">{errors.name}</p>}
        </Row>
        <Row label="E-mail">
          <Input
            type="email"
            value={input.email ?? ''}
            onChange={(e) => set('email')(e.target.value)}
            placeholder="Facultatif"
            aria-label="E-mail"
          />
          {submitted && errors.email && <p className="mt-1.5 text-meta text-danger">{errors.email}</p>}
        </Row>
        <Row label="Téléphone">
          <Input
            value={input.phone ?? ''}
            onChange={(e) => set('phone')(e.target.value)}
            placeholder="Facultatif"
            aria-label="Téléphone"
          />
        </Row>
        <Row label="Notes">
          <Textarea
            value={input.notes ?? ''}
            onChange={(e) => set('notes')(e.target.value)}
            placeholder="Contact, conditions, remarques…"
            aria-label="Notes"
          />
        </Row>
        {client && (
          <Row label="Projets">
            <ClientProjects clientId={client.id} onNavigate={onDone} />
          </Row>
        )}
      </div>

      <DialogFooter>
        {client && (
          <Button
            variant="ghost"
            className="mr-auto !text-danger"
            onClick={() => deleteClient.mutate(client.id, { onSuccess: onDone })}
          >
            Supprimer
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵">
          {client ? 'Enregistrer' : 'Créer le client'}
        </Button>
      </DialogFooter>
    </form>
  );
}

type ClientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent : création. Présent : modification. */
  client?: Client;
};

export function ClientDialog({ open, onOpenChange, client }: ClientDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={client ? client.name : 'Nouveau client'} restoreFocus={Boolean(client)}>
      {open && <ClientForm client={client} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function ClientEditor({ clientId }: { clientId: string }) {
  const close = useClientEditor((state) => state.close);
  const { data: clients } = useClients();
  const client = clients?.find((c) => c.id === clientId);
  // Client introuvable (supprimé entre-temps) : rien ne doit rester en attente d'ouverture.
  useEffect(() => {
    if (clients && !client) close();
  }, [clients, client, close]);
  return <ClientDialog open={Boolean(client)} onOpenChange={(next) => !next && close()} client={client} />;
}

/** Client ouvert par son identifiant (recherche Ctrl+K). La liste n'est lue qu'à ce moment-là. */
export function ClientEditorDialog() {
  const clientId = useClientEditor((state) => state.clientId);
  return clientId ? <ClientEditor clientId={clientId} /> : null;
}

/** Fenêtre de création globale (bouton « Nouveau »). */
export function CreateClientDialog() {
  const open = useCreateStore((state) => state.open?.kind === 'client');
  const close = useCreateStore((state) => state.close);
  return <ClientDialog open={open} onOpenChange={(next) => !next && close()} />;
}
