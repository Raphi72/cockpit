import { useState, type FormEvent } from 'react';
import { formatCompletedAt } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { Section } from '@/ui/layout/Section';
import { Button } from '@/ui/primitives/Button';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { ColorChoice } from '@/ui/primitives/ColorChoice';
import { Input } from '@/ui/primitives/Input';
import {
  googleAvailable,
  googleError,
  useCalendarActions,
  useConnectGoogle,
  useDisconnectGoogle,
  useGoogleCalendars,
  useGoogleStatus,
  useSaveGoogleClient,
  useSyncGoogle,
} from '../hooks';

/** L'ID et le code secret du client, collés depuis la console Google Cloud (docs/google-cloud.md). */
function ClientForm({ onDone }: { onDone?: () => void }) {
  const save = useSaveGoogleClient();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ clientId, clientSecret }, { onSuccess: onDone });
  };
  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-2.5">
      <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="ID du client (…apps.googleusercontent.com)" aria-label="ID du client" spellCheck={false} />
      <Input
        type="password"
        value={clientSecret}
        onChange={(e) => setClientSecret(e.target.value)}
        placeholder="Code secret du client"
        aria-label="Code secret du client"
        spellCheck={false}
        autoComplete="off"
      />
      {save.error && <p className="text-meta text-danger">{googleError(save.error)}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending || !clientId.trim() || !clientSecret.trim()}>
          Enregistrer
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Annuler
          </Button>
        )}
      </div>
      <p className="text-meta text-ink-3">Gardés dans le Gestionnaire d’identification de Windows : jamais dans la base, ni dans les exports.</p>
    </form>
  );
}

function CalendarList() {
  const today = useToday();
  const { data: calendars = [] } = useGoogleCalendars();
  const actions = useCalendarActions();
  if (calendars.length === 0) return <p className="text-ink-3">Aucun agenda pour l’instant : « Actualiser » les relit.</p>;
  const synced = calendars.map((c) => c.syncedAt).filter((s): s is string => s !== null).sort().at(-1);
  return (
    <>
      <ul className="flex flex-col">
        {calendars.map((calendar) => (
          <li key={calendar.id} className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-6">
            <Checkbox checked={calendar.shown} onChange={(shown) => void actions.setShown(calendar.id, shown)}>
              <span className="truncate">{calendar.name}</span>
              {calendar.isPrimary && <span className="text-meta text-ink-3">principal</span>}
            </Checkbox>
            {calendar.shown && <ColorChoice value={calendar.color} onChange={(color) => void actions.setColor(calendar.id, color)} label={`Couleur de ${calendar.name}`} />}
          </li>
        ))}
      </ul>
      {synced && <p className="mt-3 text-meta text-ink-3">Relu {formatCompletedAt(synced, today)}, puis toutes les 15 minutes tant que Cockpit tourne.</p>}
    </>
  );
}

/** Paramètres › Google Agenda : identifiants du client, connexion, agendas affichés et leur couleur. */
export function GoogleSettings() {
  const { data: status } = useGoogleStatus();
  const connect = useConnectGoogle();
  const disconnect = useDisconnectGoogle();
  const forget = useDisconnectGoogle(true);
  const sync = useSyncGoogle();
  const [changing, setChanging] = useState(false);

  if (!googleAvailable()) {
    return (
      <Section title="Google Agenda">
        <p className="text-ink-3">La connexion à Google n’existe que dans l’application, pas dans le navigateur de développement.</p>
      </Section>
    );
  }
  if (!status) return null;

  if (!status.configured || changing) {
    return (
      <Section title="Google Agenda" meta="lecture seule">
        <p className="mb-4 max-w-xl text-ink-2">
          Pour voir tes agendas Google dans le calendrier, la Journée et Aujourd’hui, crée une fois un projet Google Cloud (guide :
          docs/google-cloud.md dans le dépôt), puis colle ici l’ID et le code secret de son client « Application de bureau ».
        </p>
        <ClientForm onDone={changing ? () => setChanging(false) : undefined} />
      </Section>
    );
  }

  if (!status.connected) {
    return (
      <Section title="Google Agenda" meta="lecture seule">
        <p className="mb-4 text-ink-2">
          Identifiants enregistrés <span className="text-ink-3">(client {status.clientHint}…)</span>. Connecte ton compte : ton navigateur s’ouvre sur la page de
          Google, qui demande la lecture de tes agendas et le dossier caché de Cockpit sur ton Drive (synchronisation).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={connect.isPending} onClick={() => connect.mutate(undefined)}>
            {connect.isPending ? 'En attente du navigateur…' : 'Se connecter à Google'}
          </Button>
          <Button variant="ghost" onClick={() => setChanging(true)}>
            Changer les identifiants
          </Button>
          <Button variant="ghost" className="!text-danger" onClick={() => forget.mutate(undefined)}>
            Tout oublier
          </Button>
        </div>
        {connect.error && <p className="mt-3 text-meta text-danger">{googleError(connect.error)}</p>}
      </Section>
    );
  }

  return (
    <Section title="Google Agenda" meta={status.account ? `connecté : ${status.account}` : 'connecté'}>
      <CalendarList />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={sync.isPending} onClick={() => sync.mutate()}>
          {sync.isPending ? 'Relecture…' : 'Actualiser'}
        </Button>
        <Button variant="ghost" onClick={() => disconnect.mutate(undefined)}>
          Se déconnecter
        </Button>
      </div>
    </Section>
  );
}
