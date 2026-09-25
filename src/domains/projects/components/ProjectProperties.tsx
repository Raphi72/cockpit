import { formatCompletedAt, formatShortDate } from '@/core/dates';
import { deadlineStatus } from '@/core/deadline';
import { ClientPicker } from '@/domains/clients/components/ClientPicker';
import { ColorDot } from '@/ui/data/ColorDot';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { ProgressBar } from '@/ui/data/ProgressBar';
import { PropertyRow } from '@/ui/layout/PropertyRow';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/ui/overlays/Menu';
import { toast } from '@/ui/overlays/toast';
import { InlineDate } from '@/ui/primitives/InlineFields';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useProjectTypes, useSetProjectClient, useUpdateProject } from '../hooks';
import {
  PRIORITY_LABELS,
  CLOSED_STATUSES,
  PROJECT_STATUSES,
  STATUS_LABELS,
  isAutoStarted,
  projectProgress,
  type Priority,
  type ProjectDetail,
  type ProjectStatus,
} from '../model';
import { StatusIcon } from './StatusIcon';

/**
 * Sous la deadline : « Dans 6 jours », « En retard de 2 jours »… Rien pour un projet clos, ni
 * au-delà d'une semaine (ce serait la date, déjà affichée au-dessus).
 */
function DeadlineHint({ project, today }: { project: ProjectDetail; today: string }) {
  if (!project.deadline || CLOSED_STATUSES.includes(project.status)) return null;
  const { text, tone } = deadlineStatus(project.deadline, today);
  return tone === 'later' ? null : <span className={DEADLINE_TONE_CLASS[tone]}>{text}</span>;
}

/**
 * Sous le statut : depuis quand il est en cours tout seul (date de début), ou quand il a été terminé.
 * Rouvrir le projet efface la date de fin.
 */
function StatusHint({ project, today }: { project: ProjectDetail; today: string }) {
  if (project.status === 'done' && project.completedAt) {
    return <span className="text-ink-3">Terminé {formatCompletedAt(project.completedAt, today)}</span>;
  }
  if (isAutoStarted(project, today) && project.startDate) {
    return <span className="text-ink-3">Depuis le {formatShortDate(project.startDate, today)}, sa date de début</span>;
  }
  return null;
}

/** Sous la date de début d'un projet « À venir » : ce qui se passera ce jour-là. */
function StartHint({ project, today }: { project: ProjectDetail; today: string }) {
  if (project.savedStatus !== 'planned' || !project.startDate || project.startDate <= today) return null;
  return <span className="text-ink-3">Passera En cours ce jour-là</span>;
}

/** Panneau des propriétés : tout se modifie sur place, sans formulaire. */
export function ProjectProperties({ project, today }: { project: ProjectDetail; today: string }) {
  const { data: types = [] } = useProjectTypes();
  const update = useUpdateProject(project.id);
  const setClient = useSetProjectClient(project.id);
  const progress = projectProgress(project);

  const setStatus = (status: ProjectStatus) => {
    update.mutate({ status });
    // « À venir » avec une date de début passée : il reste En cours, et on dit pourquoi.
    if (status === 'planned' && project.startDate && project.startDate <= today) {
      toast(
        `Il a commencé le ${formatShortDate(project.startDate, today)} : il reste En cours. Repousse sa date de début pour le remettre À venir.`,
      );
    }
  };

  return (
    <div>
      <PropertyRow label="Statut" hint={<StatusHint project={project} today={today} />}>
        <Menu>
          <MenuTrigger asChild>
            <PropertyButton aria-label="Statut">
              <StatusIcon status={project.status} />
              {STATUS_LABELS[project.status]}
            </PropertyButton>
          </MenuTrigger>
          <MenuContent>
            <MenuRadioGroup value={project.status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
              {PROJECT_STATUSES.map((status) => (
                <MenuRadioItem key={status} value={status} leading={<StatusIcon status={status} />}>
                  {STATUS_LABELS[status]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
      </PropertyRow>

      <PropertyRow label="Type">
        <Menu>
          <MenuTrigger asChild>
            <PropertyButton aria-label="Type">
              <ColorDot color={project.typeColor} />
              {project.typeName}
            </PropertyButton>
          </MenuTrigger>
          <MenuContent>
            <MenuRadioGroup value={project.typeId} onValueChange={(typeId) => update.mutate({ typeId })}>
              {types.map((type) => (
                <MenuRadioItem key={type.id} value={type.id} leading={<ColorDot color={type.color} />}>
                  {type.name}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
      </PropertyRow>

      <PropertyRow label="Client">
        <ClientPicker
          value={
            project.clientId && project.clientName
              ? { kind: 'existing', id: project.clientId, name: project.clientName }
              : { kind: 'none' }
          }
          onChange={(choice) => setClient.mutate(choice)}
        />
      </PropertyRow>

      <PropertyRow label="Priorité">
        <Menu>
          <MenuTrigger asChild>
            <PropertyButton aria-label="Priorité">{PRIORITY_LABELS[project.priority]}</PropertyButton>
          </MenuTrigger>
          <MenuContent>
            <MenuRadioGroup
              value={String(project.priority)}
              onValueChange={(v) => update.mutate({ priority: Number(v) as Priority })}
            >
              {([3, 2, 1, 0] as Priority[]).map((p) => (
                <MenuRadioItem key={p} value={String(p)}>
                  {PRIORITY_LABELS[p]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </Menu>
      </PropertyRow>

      <PropertyRow label="Début" hint={<StartHint project={project} today={today} />}>
        <InlineDate value={project.startDate} onSave={(startDate) => update.mutate({ startDate })} aria-label="Date de début" />
      </PropertyRow>

      <PropertyRow label="Deadline" hint={<DeadlineHint project={project} today={today} />}>
        <InlineDate value={project.deadline} onSave={(deadline) => update.mutate({ deadline })} aria-label="Deadline" />
      </PropertyRow>

      <PropertyRow label="Progression">
        <div className="flex h-8 items-center">
          {progress === null ? (
            <span className="text-ink-3">Aucune tâche</span>
          ) : (
            <span className="w-full">
              <ProgressBar percent={progress} />
            </span>
          )}
        </div>
      </PropertyRow>
    </div>
  );
}
