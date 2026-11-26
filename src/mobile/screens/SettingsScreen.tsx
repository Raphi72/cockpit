import { GoogleSettings } from '@/domains/google/components/GoogleSettings';
import { SyncSettings } from '@/domains/sync/components/SyncSettings';
import { ScreenHeader } from './parts';

/** Réglages du téléphone : la connexion Google et la synchronisation avec le PC. Le reste se règle sur le PC. */
export function SettingsScreen() {
  return (
    <>
      <ScreenHeader title="Réglages" subtitle="Le reste se règle sur le PC." />
      <div className="px-5 pb-28">
        <GoogleSettings />
        <SyncSettings />
      </div>
    </>
  );
}
