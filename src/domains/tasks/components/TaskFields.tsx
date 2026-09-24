import { Circle, CircleCheck, CircleDot, type LucideIcon } from 'lucide-react';
import { useProjects } from '@/domains/projects/hooks';
import { OPEN_STATUSES, PRIORITY_LABELS, type Priority } from '@/domains/projects/model';
import { ColorDot } from '@/ui/data/ColorDot';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { ESTIMATE_PRESETS, TASK_STATUSES, TASK_STATUS_LABELS, formatDuration, type TaskStatus } from '../model';

/** Sélecteurs partagés par la fenêtre de création et le panneau d'édition d'une tâche. */

const STATUS_ICONS: Record<TaskStatus, { icon: LucideIcon; className: string }> = {
  todo: { icon: Circle, className: 'text-ink-3' },
  in_progress: { icon: CircleDot, className: 'text-accent' },
  done: { icon: CircleCheck, className: 'text-accent' },
};

export function TaskStatusIcon({ status }: { status: TaskStatus }) {
  const { icon: Icon, className } = STATUS_ICONS[status];
  return <Icon aria-hidden className={`size-4 shrink-0 ${className}`} strokeWidth={1.75} />;
}

type Variant = { variant?: 'field' | 'inline' };

export function TaskStatusMenu({ value, onChange, variant }: { value: TaskStatus; onChange: (s: TaskStatus) => void } & Variant) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton variant={variant} aria-label="Statut">
          <TaskStatusIcon status={value} />
          {TASK_STATUS_LABELS[value]}
        </PropertyButton>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as TaskStatus)}>
          {TASK_STATUSES.map((status) => (
            <MenuRadioItem key={status} value={status} leading={<TaskStatusIcon status={status} />}>
              {TASK_STATUS_LABELS[status]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/** Projets proposés : ceux qui sont actifs, plus le projet actuel de la tâche s'il est clos. */
export function TaskProjectMenu({
  value,
  currentName,
  onChange,
  variant,
}: { value: string | null; currentName?: string | null; onChange: (id: string | null) => void } & Variant) {
  const { data: projects = [] } = useProjects({ statuses: OPEN_STATUSES });
  const selected = projects.find((p) => p.id === value);
  const label = selected?.name ?? (value ? currentName : null);

  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton variant={variant} aria-label="Projet">
          {label ? (
            <>
              {selected && <ColorDot color={selected.typeColor} />}
              <span className="truncate">{label}</span>
            </>
          ) : (
            <span className="text-ink-3">Sans projet</span>
          )}
        </PropertyButton>
      </MenuTrigger>
      <MenuContent className="max-h-80 overflow-y-auto">
        <MenuRadioGroup value={value ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
          <MenuRadioItem value="none">Sans projet</MenuRadioItem>
          {projects.length > 0 && <MenuSeparator />}
          {projects.map((project) => (
            <MenuRadioItem key={project.id} value={project.id} leading={<ColorDot color={project.typeColor} />}>
              {project.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

export function TaskPriorityMenu({ value, onChange, variant }: { value: Priority; onChange: (p: Priority) => void } & Variant) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton variant={variant} aria-label="Priorité">
          {value >= 2 && <span className={`size-1.5 rounded-full ${value === 3 ? 'bg-danger' : 'bg-warning'}`} />}
          {PRIORITY_LABELS[value]}
        </PropertyButton>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup value={String(value)} onValueChange={(v) => onChange(Number(v) as Priority)}>
          {([3, 2, 1, 0] as Priority[]).map((p) => (
            <MenuRadioItem key={p} value={String(p)}>
              {PRIORITY_LABELS[p]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

export function TaskEstimateMenu({
  value,
  onChange,
  variant,
}: { value: number | null; onChange: (minutes: number | null) => void } & Variant) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton variant={variant} aria-label="Estimation">
          {value ? <span className="tnum">{formatDuration(value)}</span> : <span className="text-ink-3">Aucune</span>}
        </PropertyButton>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup value={String(value ?? 'none')} onValueChange={(v) => onChange(v === 'none' ? null : Number(v))}>
          <MenuRadioItem value="none">Aucune</MenuRadioItem>
          <MenuSeparator />
          {ESTIMATE_PRESETS.map((minutes) => (
            <MenuRadioItem key={minutes} value={String(minutes)}>
              {formatDuration(minutes)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
