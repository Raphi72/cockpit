import { PhoneLink } from '@/domains/sync/components/PhoneLink';
import { ScreenHeader } from './parts';

/** Réglages du téléphone : le relier au PC (Google et synchronisation), et les agendas à montrer. Le reste se règle sur le PC. */
export function SettingsScreen() {
  return (
    <>
      <ScreenHeader title="Réglages" subtitle="Le reste se règle sur le PC." />
      <div className="px-5 pb-28">
        <PhoneLink />
      </div>
    </>
  );
}
