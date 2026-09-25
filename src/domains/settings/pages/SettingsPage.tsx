import { useRef, useState, type ReactNode } from 'react';
import {
  cancelRestore,
  describeCandidate,
  formatBackupDate,
  openBackupDir,
  openDataDir,
  parseBackupStamp,
  useAppInfo,
  useBackupNow,
  useChooseBackupDir,
  useResetBackupDir,
  useRestoreConfirm,
  useRestorePick,
  type RestoreCandidate,
} from '@/domains/data';
import { CategoriesEditor } from '@/domains/finance/transactions/components/CategoriesEditor';
import { ProjectTypesEditor } from '@/domains/projects/components/ProjectTypesEditor';
import { Page } from '@/ui/layout/Page';
import { Section } from '@/ui/layout/Section';
import { ConfirmDialog } from '@/ui/overlays/ConfirmDialog';
import { Button } from '@/ui/primitives/Button';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { useSaveSetting, useSetting } from '../hooks';
import { SETTINGS } from '../model';

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-11 grid-cols-[200px_minmax(0,1fr)] items-baseline gap-6 py-2.5">
      <span className="text-ink-2">{label}</span>
      <span className="min-w-0 break-words select-text">{children}</span>
    </div>
  );
}

function DataSection() {
  const { data: info, isError } = useAppInfo();
  const backupNow = useBackupNow();
  const chooseDir = useChooseBackupDir();
  const resetDir = useResetBackupDir();
  const restorePick = useRestorePick();
  const restoreConfirm = useRestoreConfirm();
  const [candidate, setCandidate] = useState<RestoreCandidate | null>(null);
  const confirmed = useRef(false);

  if (isError) {
    return (
      <Section title="Données">
        <p className="text-ink-2">Informations indisponibles hors de l'application desktop.</p>
      </Section>
    );
  }
  if (!info) return null;

  const lastBackup = info.lastBackup ? parseBackupStamp(info.lastBackup) : null;
  const pickRestore = () =>
    restorePick.mutate(undefined, {
      onSuccess: (picked) => {
        confirmed.current = false;
        setCandidate(picked);
      },
    });

  return (
    <Section title="Données" meta="tout est stocké sur cet ordinateur">
      <InfoRow label="Sauvegardes">
        Chaque jour, les 14 dernières sont conservées
        <span className="block text-meta text-ink-3">
          {lastBackup ? `Dernière : ${formatBackupDate(lastBackup)}` : 'Aucune sauvegarde pour le moment'}
        </span>
        <span className="mt-3 flex gap-2">
          <Button onClick={() => backupNow.mutate()} disabled={backupNow.isPending}>
            Sauvegarder maintenant…
          </Button>
          <Button variant="ghost" onClick={pickRestore} disabled={restorePick.isPending || restoreConfirm.isPending}>
            Restaurer une sauvegarde…
          </Button>
        </span>
      </InfoRow>
      <InfoRow label="Dossier des sauvegardes">
        <span className="text-meta">{info.backupDir}</span>
        {info.chosenBackupDirUnavailable ? (
          <span className="mt-1 block text-meta text-warning">
            Le dossier choisi est introuvable ({info.chosenBackupDir}) : les sauvegardes vont dans le dossier par
            défaut en attendant.
          </span>
        ) : (
          !info.chosenBackupDir && (
            <span className="mt-1 block text-meta text-ink-3">
              Un dossier OneDrive en garde une copie hors de cet ordinateur.
            </span>
          )
        )}
        <span className="mt-3 flex gap-2">
          <Button onClick={() => chooseDir.mutate()} disabled={chooseDir.isPending}>
            Changer…
          </Button>
          <Button variant="ghost" onClick={openBackupDir}>
            Ouvrir
          </Button>
          {info.chosenBackupDir && (
            <Button variant="ghost" onClick={() => resetDir.mutate()} disabled={resetDir.isPending}>
              Revenir au dossier par défaut
            </Button>
          )}
        </span>
      </InfoRow>
      <InfoRow label="Base de données">
        <span className="text-meta">{info.dbPath}</span>
        <span className="mt-3 flex">
          <Button variant="ghost" onClick={openDataDir} className="-ml-3">
            Ouvrir le dossier des données
          </Button>
        </span>
      </InfoRow>
      <InfoRow label="Version du schéma">
        <span className="tnum">{info.schemaVersion}</span>
      </InfoRow>

      <ConfirmDialog
        open={candidate !== null}
        onOpenChange={(open) => {
          if (open) return;
          // Fermée sans confirmer : la copie vérifiée est effacée.
          if (!confirmed.current) cancelRestore();
          setCandidate(null);
        }}
        title="Restaurer cette sauvegarde ?"
        description={
          candidate
            ? `${describeCandidate(candidate)} Elle remplacera toutes tes données actuelles, qui sont d’abord copiées dans le dossier des sauvegardes.`
            : ''
        }
        confirmLabel="Restaurer"
        onConfirm={() => {
          confirmed.current = true;
          restoreConfirm.mutate();
        }}
      />
    </Section>
  );
}

function DashboardSection() {
  const { data: showAccounts } = useSetting(SETTINGS.dashboardShowAccounts);
  const save = useSaveSetting(SETTINGS.dashboardShowAccounts);
  if (showAccounts === undefined) return null;
  return (
    <Section title="Tableau de bord">
      <Checkbox checked={showAccounts} onChange={(checked) => save.mutate(checked)}>
        Afficher les soldes des comptes
      </Checkbox>
      <p className="mt-1.5 pl-[26px] text-meta text-ink-3">Ils restent toujours visibles dans Finances.</p>
    </Section>
  );
}

export function SettingsPage() {
  return (
    <Page title="Paramètres">
      <DashboardSection />
      <Section title="Types de projet" meta="clique sur un nom ou une couleur pour le modifier">
        <ProjectTypesEditor />
      </Section>
      <Section title="Catégories de transactions" meta="clique sur un nom pour le modifier">
        <CategoriesEditor />
      </Section>
      <DataSection />
    </Page>
  );
}
