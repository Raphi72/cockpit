import { RefreshCw } from 'lucide-react';
import { Button } from '@/ui/primitives/Button';
import { useCheckUpdate } from '../hooks';
import { APP_VERSION, updatesAvailable } from '../native';

/** La version de Cockpit, et « Rechercher une mise à jour » (Paramètres du PC, Réglages du téléphone). */
export function UpdateRow() {
  const check = useCheckUpdate();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="tnum">Cockpit {APP_VERSION}</span>
      {updatesAvailable() && (
        <Button variant="ghost" icon={RefreshCw} onClick={() => check.mutate()} disabled={check.isPending} className="-ml-2">
          {check.isPending ? 'Recherche…' : 'Rechercher une mise à jour'}
        </Button>
      )}
    </div>
  );
}
