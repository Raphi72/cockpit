import { daysBetween, relativeDateLabel } from '@/core/dates';
import { ClientPicker } from '@/domains/clients/components/ClientPicker';
import { ColorDot } from '@/ui/data/ColorDot';
import { ProgressBar } from '@/ui/data/ProgressBar';
import { PropertyRow } from '@/ui/layout/PropertyRow';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/ui/overlays/Menu';
import { InlineDate } from '@/ui/primitives/InlineFields';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useProjectTypes, useSetProjectClient, useUpdateProject } from '../hooks';
import {
  PRIORITY_LABELS,
  PROJECT_STATUSES,
  STATUS_LABELS,
  deadlineTone,
  projectProgress,
  type Priority,
  type ProjectDetail,
  type ProjectStatus,
} from '../model';
import { StatusIcon } from './StatusIcon';

function DeadlineHint({ project, today }: { project: ProjectDetail; today: string }) {
  const tone = deadlineTone(project, today);
  if (!project.deadline || !tone || tone === 'normal') return null;
  if (tone === 'late') {
    return <span className="text-danger">En retard de {daysBetween(project.deadline, today)} j</span>;
  }
  return <span className="text-warning">C'est {relativeDateLabel(project.deadline, today)}</span>;
}

/** Panneau des propriétés : tout se modifie sur place, sans formulaire. */
export function ProjectProperties({ project, today }: { project: ProjectDetail; today: string }) {
  const { data: types = [] } = useProjectTypes();
  const update = useUpdateProject(project.id);
  const setClient = useSetProjectClient(project.id);
  const progress = projectProgress(project);

  return (
    <div>
      <PropertyRow label="Statut">
        <Menu>
          <MenuTrigger asChild>
            <PropertyButton aria-label="Statut">
              <StatusIcon status={project.status} />
              {STATUS_LABELS[project.status]}
            </PropertyButton>
          </MenuTrigger>
          <MenuContent>
            <MenuRadioGroup value={project.status} onValueChange={(v) => update.mutate({ status: v as ProjectStatus })}>
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

      <PropertyRow label="Début">
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
