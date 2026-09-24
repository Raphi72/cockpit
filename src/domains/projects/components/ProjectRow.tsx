import { Link } from '@tanstack/react-router';
import { memo } from 'react';
import { daysBetween, formatShortDate, relativeDateLabel } from '@/core/dates';
import { ColorDot } from '@/ui/data/ColorDot';
import { ProgressBar } from '@/ui/data/ProgressBar';
import { deadlineTone, projectProgress, type DeadlineTone, type ProjectListItem } from '../model';

const TONE_CLASS: Record<DeadlineTone, string> = {
  late: 'text-danger',
  soon: 'text-warning',
  normal: 'text-ink-3',
};

export function DeadlineLabel({ project, today }: { project: ProjectListItem; today: string }) {
  const tone = deadlineTone(project, today);
  if (!project.deadline || !tone) return <span className="text-meta text-ink-3">—</span>;
  const label =
    tone === 'late'
      ? `${daysBetween(project.deadline, today)} j de retard`
      : relativeDateLabel(project.deadline, today);
  return (
    <span className={`tnum text-meta ${TONE_CLASS[tone]}`} title={`Deadline : ${formatShortDate(project.deadline, today)}`}>
      {label}
    </span>
  );
}

/** Ligne de projet : pastille, nom, client, progression, deadline. Rien de plus. */
export const ProjectRow = memo(function ProjectRow({ project, today }: { project: ProjectListItem; today: string }) {
  const progress = projectProgress(project);
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="-mx-2.5 grid min-h-11 grid-cols-[8px_minmax(0,1fr)_104px_120px] items-center gap-4 rounded-md px-2.5 transition-colors duration-[120ms] ease-soft hover:bg-hover"
    >
      <ColorDot color={project.typeColor} />
      <span className="truncate">
        {project.name}
        {project.clientName && <span className="ml-2.5 text-meta text-ink-3">{project.clientName}</span>}
      </span>
      <span>{progress !== null && <ProgressBar percent={progress} />}</span>
      <span className="text-right">
        <DeadlineLabel project={project} today={today} />
      </span>
    </Link>
  );
});
