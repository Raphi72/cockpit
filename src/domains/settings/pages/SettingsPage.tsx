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
  useExport,
  useResetBackupDir,
  useRestoreConfirm,
  useRestorePick,
  type ExportKind,
  type RestoreCandidate,
} from '@/domains/data';
import { CategoriesEditor } from '@/domains/finance/transactions/components/CategoriesEditor';
import { NotificationSettings } from '@/domains/notifications';
import { ProjectTypesEditor } from '@/domains/projects/components/ProjectTypesEditor';
import { Page } from '@/ui/layout/Page';
import { Section } from '@/ui/layout/Section';
import { ConfirmDialog } from '@/ui/overlays/ConfirmDialog';
import { Button } from '@/ui/primitives/Button';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { useSaveSetting, useSetting } from '../hooks';
import { SETTINGS, THEME_CHOICES, WEEK_START_CHOICES, resolveTheme, resolveWeekStart } from '../model';

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

/** Thème et premier jour de la semaine : appliqués tout de suite (app/preferences.ts). */
function AppearanceSection() {
  const { data: theme } = useSetting(SETTINGS.theme);
  const { data: weekStartsOn } = useSetting(SETTINGS.weekStartsOn);
  const saveTheme = useSaveSetting(SETTINGS.theme);
  const saveWeekStart = useSaveSetting(SETTINGS.weekStartsOn);
  if (theme === undefined || weekStartsOn === undefined) return null;
  return (
    <Section title="Apparence">
      <InfoRow label="Thème">
        <ChoiceChips label="Thème" options={THEME_CHOICES} value={resolveTheme(theme)} onChange={(v) => saveTheme.mutate(v)} />
      </InfoRow>
      <InfoRow label="Premier jour de la semaine">
        <ChoiceChips
          label="Premier jour de la semaine"
          options={WEEK_START_CHOICES.map(({ value, label }) => ({ value: String(value), label }))}
          value={String(resolveWeekStart(weekStartsOn))}
          onChange={(v) => saveWeekStart.mutate(resolveWeekStart(Number(v)))}
        />
        <span className="mt-1.5 block text-meta text-ink-3">Dans le calendrier, le planning et le choix des dates.</span>
      </InfoRow>
    </Section>
  );
}

const EXPORTS: { kind: ExportKind; label: string }[] = [
  { kind: 'data', label: 'Toutes les données (JSON)…' },
  { kind: 'transactions', label: 'Transactions (CSV)…' },
  { kind: 'payments', label: 'Encaissements (CSV)…' },
];

/** Exports : un fichier à garder ou à ouvrir ailleurs. Rien n'est modifié dans Cockpit. */
function ExportSection() {
  const exportFile = useExport();
  return (
    <Section title="Exports" meta="enregistrés où tu veux, Documents par défaut">
      <p className="text-ink-2">
        Toutes tes données dans un fichier JSON, ou tes finances en CSV, qui s’ouvre directement dans Excel.
      </p>
      <span className="mt-3 flex flex-wrap gap-2">
        {EXPORTS.map(({ kind, label }, index) => (
          <Button
            key={kind}
            variant={index === 0 ? 'secondary' : 'ghost'}
            onClick={() => exportFile.mutate(kind)}
            disabled={exportFile.isPending}
          >
            {label}
          </Button>
        ))}
      </span>
    </Section>
  );
}

function DashboardSection() {
  const { data: showAmounts } = useSetting(SETTINGS.dashboardShowAmounts);
  const save = useSaveSetting(SETTINGS.dashboardShowAmounts);
  if (showAmounts === undefined) return null;
  return (
    <Section title="Tableau de bord">
      <Checkbox checked={showAmounts} onChange={(checked) => save.mutate(checked)}>
        Afficher les montants
      </Checkbox>
      <p className="mt-1.5 pl-[26px] text-meta text-ink-3">
        Soldes, à recevoir, encaissé du mois et montants des paiements, notifications comprises. Ils restent toujours
        visibles dans Finances.
      </p>
    </Section>
  );
}

export function SettingsPage() {
  return (
    <Page title="Paramètres">
      <AppearanceSection />
      <DashboardSection />
      <NotificationSettings />
      <Section title="Types de projet" meta="clique sur un nom ou une couleur pour le modifier">
        <ProjectTypesEditor />
      </Section>
      <Section title="Catégories de transactions" meta="clique sur un nom pour le modifier">
        <CategoriesEditor />
      </Section>
      <ExportSection />
      <DataSection />
    </Page>
  );
}
