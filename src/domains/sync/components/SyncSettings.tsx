import { useState, type FormEvent } from 'react';
import { formatCompletedAt } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { googleError, useConnectGoogle, useGoogleStatus } from '@/domains/google/hooks';
import { Section } from '@/ui/layout/Section';
import { Button } from '@/ui/primitives/Button';
import { Input } from '@/ui/primitives/Input';
import { useCreateSyncKey, useJoinSync, useStopSync, useSyncNow, useSyncStatus } from '../hooks';
import { normalizeKeyCode } from '../model';
import { phoneLinkCode, showSyncCode } from '../native';
import { QrCode } from './QrCode';

/** Le code de la clé : à recopier sur un autre PC (et à garder en lieu sûr). */
function CodeBox({ code }: { code: string }) {
  return (
    <p className="my-3 w-fit max-w-72 rounded-lg bg-hover px-4 py-3 font-mono text-[15px] tracking-wider select-all" aria-label="Code de synchronisation">
      {code}
    </p>
  );
}

/** Le code QR qui relie le téléphone : il porte l'accès Google de ce PC, donc à ne montrer à personne d'autre. */
function PhoneLinkBox({ text }: { text: string }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-8">
      <QrCode text={text} label="Code QR pour relier le téléphone" />
      <div className="max-w-sm text-ink-2">
        <p className="mb-2">Sur le téléphone, ouvre Cockpit › Réglages › Scanner le code du PC.</p>
        <p className="text-meta text-ink-3">
          Ce code donne au téléphone l’accès à ton compte Google et la clé de chiffrement : ne le montre à personne, et masque-le une fois le
          téléphone relié.
        </p>
      </div>
    </div>
  );
}

function JoinForm() {
  const join = useJoinSync();
  const [code, setCode] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (normalizeKeyCode(code)) join.mutate(code);
  };
  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-2.5">
      <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH-…" aria-label="Code de l’autre appareil" spellCheck={false} className="font-mono" />
      {join.error && <p className="text-meta text-danger">{googleError(join.error)}</p>}
      <div>
        <Button type="submit" variant="secondary" disabled={join.isPending || !normalizeKeyCode(code)}>
          {join.isPending ? 'Réception…' : 'Rejoindre la synchronisation'}
        </Button>
      </div>
    </form>
  );
}

type Shown = { kind: 'code'; code: string } | { kind: 'phone'; text: string } | null;

/** Paramètres › Synchronisation : entre tes appareils, par le dossier caché de Cockpit sur ton Google Drive. */
export function SyncSettings() {
  const today = useToday();
  const { data: google } = useGoogleStatus();
  const { data: status } = useSyncStatus();
  const connect = useConnectGoogle();
  const create = useCreateSyncKey();
  const sync = useSyncNow();
  const stop = useStopSync();
  const [shown, setShown] = useState<Shown>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  if (!status) return null;
  const title = 'Synchronisation';
  if (!status.available) {
    return (
      <Section title={title}>
        <p className="text-ink-3">La synchronisation n’existe que dans l’application, pas dans le navigateur de développement.</p>
      </Section>
    );
  }
  if (!google?.connected) {
    return (
      <Section title={title} meta="entre tes appareils, par Google Drive">
        <p className="text-ink-3">Connecte d’abord ton compte Google (section Google Agenda ci-dessus).</p>
      </Section>
    );
  }
  if (!google.syncAllowed) {
    return (
      <Section title={title} meta="entre tes appareils, par Google Drive">
        <p className="mb-3 max-w-xl text-ink-2">
          Google n’a pas encore autorisé Cockpit à utiliser son dossier caché sur ton Drive. Reconnecte-toi : la page de Google le demandera (dans le
          projet Google Cloud, l’API Google Drive doit être activée).
        </p>
        <Button variant="secondary" disabled={connect.isPending} onClick={() => connect.mutate(undefined)}>
          {connect.isPending ? 'En attente du navigateur…' : 'Autoriser la synchronisation'}
        </Button>
        {connect.error && <p className="mt-2 text-meta text-danger">{googleError(connect.error)}</p>}
      </Section>
    );
  }

  if (!status.hasKey) {
    return (
      <Section title={title} meta="entre tes appareils, par Google Drive">
        <p className="mb-4 max-w-xl text-ink-2">
          Chaque appareil garde toutes tes données et marche hors connexion ; leurs changements passent, chiffrés, par un dossier caché de ton Drive.
          Google ne peut pas les lire.
        </p>
        <div className="grid max-w-2xl grid-cols-2 gap-10">
          <div>
            <h3 className="mb-1.5 font-medium">Premier appareil</h3>
            <p className="mb-3 text-meta text-ink-3">Crée la clé de chiffrement et envoie tes données.</p>
            <Button
              variant="primary"
              disabled={create.isPending}
              onClick={() => create.mutate(undefined, { onSuccess: (code) => setShown({ kind: 'code', code }) })}
            >
              {create.isPending ? 'Envoi…' : 'Activer ici'}
            </Button>
            {create.error && <p className="mt-2 text-meta text-danger">{googleError(create.error)}</p>}
          </div>
          <div>
            <h3 className="mb-1.5 font-medium">Autre PC</h3>
            <p className="mb-3 text-meta text-ink-3">Saisis le code affiché sur ton premier PC.</p>
            <JoinForm />
          </div>
        </div>
      </Section>
    );
  }

  const toggle = (kind: 'code' | 'phone') => {
    setLinkError(null);
    if (shown?.kind === kind) return setShown(null);
    const reveal = kind === 'code' ? showSyncCode().then((code) => ({ kind, code })) : phoneLinkCode().then((text) => ({ kind, text }));
    void reveal.then(setShown, (error: unknown) => setLinkError(googleError(error)));
  };

  return (
    <Section title={title} meta={google.account ? `par le Drive de ${google.account}` : 'par Google Drive'}>
      <p className="text-ink-2">
        {status.lastSync ? `Synchronisé ${formatCompletedAt(status.lastSync, today)}` : 'Pas encore synchronisé'}, puis toutes les minutes tant que
        Cockpit tourne.
      </p>
      {shown?.kind === 'code' && (
        <>
          <p className="mt-3 text-meta text-ink-3">À recopier sur un autre PC, et à noter en lieu sûr :</p>
          <CodeBox code={shown.code} />
        </>
      )}
      {shown?.kind === 'phone' && <PhoneLinkBox text={shown.text} />}
      {linkError && <p className="mt-3 text-meta text-danger">{linkError}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={sync.isPending} onClick={() => sync.mutate()}>
          {sync.isPending ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </Button>
        <Button variant="ghost" onClick={() => toggle('phone')}>
          {shown?.kind === 'phone' ? 'Masquer le code QR' : 'Relier le téléphone'}
        </Button>
        <Button variant="ghost" onClick={() => toggle('code')}>
          {shown?.kind === 'code' ? 'Masquer le code' : 'Afficher le code'}
        </Button>
        <Button variant="ghost" className="!text-danger" onClick={() => stop.mutate(undefined, { onSuccess: () => setShown(null) })}>
          Arrêter sur cet appareil
        </Button>
      </div>
    </Section>
  );
}
