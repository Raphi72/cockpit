import { Link } from '@tanstack/react-router';
import { useToday } from '@/core/use-today';
import { ColorDot } from '@/ui/data/ColorDot';
import { useProjects } from '../hooks';
import { deadlineTone } from '../model';

const ACTIVE: ['active'] = ['active'];

/** Accès direct aux projets en cours depuis la barre latérale. */
export function ActiveProjectsNav() {
  const { data: projects = [] } = useProjects({ statuses: ACTIVE });
  const today = useToday();
  if (projects.length === 0) return null;

  return (
    <div className="mt-6 flex min-h-0 flex-col">
      <div className="px-[9px] pb-2 text-meta font-medium text-ink-3">Projets en cours</div>
      <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {projects.map((project) => (
          <Link
            key={project.id}
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="flex h-[34px] shrink-0 items-center gap-3 rounded-md px-[9px] text-ink-2 transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink"
            activeProps={{ className: 'bg-active !text-ink font-medium' }}
          >
            <span className="grid size-4 place-items-center">
              <ColorDot color={project.typeColor} />
            </span>
            <span className="flex-1 truncate">{project.name}</span>
            {deadlineTone(project, today) === 'late' && (
              <span className="size-1.5 rounded-full bg-danger" title="Deadline dépassée" />
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
