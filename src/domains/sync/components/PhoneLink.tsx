import { useState } from 'react';
import { formatCompletedAt } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { CalendarList } from '@/domains/google/components/GoogleSettings';
import { googleError, useGoogleStatus, useSyncGoogle } from '@/domains/google/hooks';
import { Section } from '@/ui/layout/Section';
import { Button } from '@/ui/primitives/Button';
import { useLinkPhone, useSyncNow, useSyncStatus, useUnlinkPhone } from '../hooks';
import { isPhoneLinkQr } from '../model';
import { scanQrCode } from '../native';

/**
 * Réglages du téléphone (V2, étape 10) : relier au PC en lisant le code QR qu'il affiche. Le téléphone reçoit
 * l'accès Google et la clé du PC : rien à coller, pas de connexion Google à refaire. Une fois relié : la
 * synchronisation, et les agendas à montrer (choisis sur chaque appareil).
 */
export function PhoneLink() {
  const today = useToday();
  const { data: google } = useGoogleStatus();
  const { data: status } = useSyncStatus();
  const link = useLinkPhone();
  const unlink = useUnlinkPhone();
  const sync = useSyncNow();
  const refreshGoogle = useSyncGoogle();
  const [scanError, setScanError] = useState<string | null>(null);

  if (!status) return null;
  if (!status.available) {
    return (
      <Section title="Relier au PC">
        <p className="text-ink-3">Seulement dans l’appli du téléphone, pas dans le navigateur de développement.</p>
      </Section>
    );
  }

  const scan = async () => {
    setScanError(null);
    link.reset();
    try {
      const text = await scanQrCode();
      if (text === null) return;
      if (!isPhoneLinkQr(text)) return setScanError('Ce n’est pas le code QR de Cockpit : sur le PC, Paramètres › Synchronisation › Relier le téléphone.');
      link.mutate(text);
    } catch (error) {
      setScanError(googleError(error));
    }
  };

  if (!google?.connected || !status.hasKey) {
    const error = scanError ?? (link.error ? googleError(link.error) : null);
    return (
      <Section title="Relier au PC">
        <p className="mb-4 text-ink-2">
          Sur le PC : Paramètres › Synchronisation › <span className="font-medium">Relier le téléphone</span>. Un code QR s’affiche ; scanne-le
          ici. Tes données arrivent alors sur le téléphone, et ce que tu y changes repart vers le PC.
        </p>
        <Button variant="primary" size="lg" disabled={link.isPending} onClick={() => void scan()}>
          {link.isPending ? 'Réception de tes données…' : 'Scanner le code du PC'}
        </Button>
        {error && <p className="mt-3 text-meta text-danger">{error}</p>}
      </Section>
    );
  }

  return (
    <>
      <Section title="Synchronisation" meta={google.account ? `par le Drive de ${google.account}` : 'avec le PC'}>
        <p className="text-ink-2">
          {status.lastSync ? `Synchronisé ${formatCompletedAt(status.lastSync, today)}` : 'Pas encore synchronisé'}, puis toutes les minutes tant que
          Cockpit est ouvert.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? 'Synchronisation…' : 'Synchroniser maintenant'}
          </Button>
          <Button variant="ghost" className="!text-danger" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
            Délier ce téléphone
          </Button>
        </div>
      </Section>
      <Section title="Agendas Google" meta="sur ce téléphone">
        <CalendarList />
        <div className="mt-4">
          <Button variant="secondary" disabled={refreshGoogle.isPending} onClick={() => refreshGoogle.mutate()}>
            {refreshGoogle.isPending ? 'Relecture…' : 'Actualiser'}
          </Button>
        </div>
      </Section>
    </>
  );
}
