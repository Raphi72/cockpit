import { Link } from '@tanstack/react-router';
import { memo } from 'react';
import { formatCompletedAt, formatShortDate, toISODate } from '@/core/dates';
import { deadlineStatus } from '@/core/deadline';
import { ColorDot } from '@/ui/data/ColorDot';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { ProgressBar } from '@/ui/data/ProgressBar';
import { CLOSED_STATUSES, projectProgress, type ProjectListItem } from '../model';

/**
 * Deadline d'un projet : même texte et mêmes couleurs que pour les tâches, en version courte.
 * Un projet terminé montre plutôt quand il l'a été.
 */
export function DeadlineLabel({ project, today }: { project: ProjectListItem; today: string }) {
  if (project.status === 'done' && project.completedAt) {
    const deadline = project.deadline ? ` · deadline : ${formatShortDate(project.deadline, today)}` : '';
    return (
      <span className="tnum text-meta text-ink-3" title={`Terminé ${formatCompletedAt(project.completedAt, today)}${deadline}`}>
        Terminé le {formatShortDate(toISODate(new Date(project.completedAt)), today)}
      </span>
    );
  }
  if (!project.deadline) return <span className="text-meta text-ink-3">—</span>;
  // Un projet clos garde sa date, sans urgence.
  const closed = CLOSED_STATUSES.includes(project.status);
  const { text, tone } = closed
    ? { text: formatShortDate(project.deadline, today), tone: 'later' as const }
    : deadlineStatus(project.deadline, today, { short: true });
  return (
    <span className={`tnum text-meta ${DEADLINE_TONE_CLASS[tone]}`} title={`Deadline : ${formatShortDate(project.deadline, today)}`}>
      {text}
    </span>
  );
}

/**
 * Ligne de projet : pastille, nom, client, progression, deadline. Rien de plus.
 * `compact` (colonne étroite du dashboard) : sans le client, colonnes resserrées.
 */
export const ProjectRow = memo(function ProjectRow({
  project,
  today,
  compact = false,
}: {
  project: ProjectListItem;
  today: string;
  compact?: boolean;
}) {
  const progress = projectProgress(project);
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className={
        '-mx-2.5 grid min-h-11 items-center gap-4 rounded-md px-2.5 transition-colors duration-[120ms] ease-soft hover:bg-hover ' +
        (compact ? 'grid-cols-[8px_minmax(0,1fr)_80px_84px]' : 'grid-cols-[8px_minmax(0,1fr)_104px_120px]')
      }
    >
      <ColorDot color={project.typeColor} />
      <span className="truncate">
        {project.name}
        {!compact && project.clientName && <span className="ml-2.5 text-meta text-ink-3">{project.clientName}</span>}
      </span>
      <span>{progress !== null && <ProgressBar percent={progress} />}</span>
      <span className="text-right">
        <DeadlineLabel project={project} today={today} />
      </span>
    </Link>
  );
});
