import { useState } from 'react';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { openBackupDir, useRecovery } from '../hooks';
import { recoveryMessage } from '../model';

/**
 * Au lancement, si la base était abîmée : ce que Cockpit a fait, une seule fois. La base abîmée est
 * gardée dans le dossier des sauvegardes (« abimee_… ») ; ce qui a été saisi depuis cette sauvegarde
 * n'y est plus.
 */
export function RecoveryNotice() {
  const { data: recovery } = useRecovery();
  const [closed, setClosed] = useState(false);
  if (!recovery) return null;
  const folder = recovery.keptIn.split(/[\\/]/).pop();
  return (
    <Dialog open={!closed} onOpenChange={(open) => !open && setClosed(true)} title="Ta base de données était abîmée">
      <div className="mt-3 flex flex-col gap-3 text-ink-2">
        <p>{recoveryMessage(recovery)} Ce que tu as saisi depuis n’y est pas.</p>
        <p>
          Rien n’a été supprimé : la base abîmée est gardée dans le dossier des sauvegardes, sous <span className="font-medium text-ink">{folder}</span>.
        </p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => void openBackupDir()}>
          Ouvrir le dossier des sauvegardes
        </Button>
        <Button variant="primary" onClick={() => setClosed(true)}>
          Compris
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
