import type { ReactNode } from 'react';
import { formatBackupDate, parseBackupStamp, useAppInfo } from '@/domains/data';
import { ProjectTypesEditor } from '@/domains/projects/components/ProjectTypesEditor';
import { Page } from '@/ui/layout/Page';
import { Section } from '@/ui/layout/Section';

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

  if (isError) {
    return (
      <Section title="Données">
        <p className="text-ink-2">Informations indisponibles hors de l'application desktop.</p>
      </Section>
    );
  }
  if (!info) return null;

  const lastBackup = info.lastBackup ? parseBackupStamp(info.lastBackup) : null;

  return (
    <Section title="Données" meta="tout est stocké sur cet ordinateur">
      <InfoRow label="Sauvegarde automatique">
        Chaque jour, les 14 dernières sont conservées
        <span className="block text-meta text-ink-3">
          {lastBackup ? `Dernière : ${formatBackupDate(lastBackup)}` : 'Aucune sauvegarde pour le moment'}
        </span>
      </InfoRow>
      <InfoRow label="Base de données">
        <span className="text-meta">{info.dbPath}</span>
      </InfoRow>
      <InfoRow label="Dossier des sauvegardes">
        <span className="text-meta">{info.backupDir}</span>
      </InfoRow>
      <InfoRow label="Version du schéma">
        <span className="tnum">{info.schemaVersion}</span>
      </InfoRow>
    </Section>
  );
}

export function SettingsPage() {
  return (
    <Page title="Paramètres">
      <Section title="Types de projet" meta="clique sur un nom ou une couleur pour le modifier">
        <ProjectTypesEditor />
      </Section>
      <DataSection />
    </Page>
  );
}
