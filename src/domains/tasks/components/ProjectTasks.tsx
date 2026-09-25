import { Columns3, List } from 'lucide-react';
import { useUiStore } from '@/app/ui-store';
import { useProjectTasks } from '../hooks';
import { leafProgress, projectTaskTree } from '../model';
import { DoneFold } from './TaskGroups';
import { InlineAddTask } from './InlineAddTask';
import { TaskBoard } from './TaskBoard';
import { TaskTree, TreeEndZone } from './TaskTree';

function ModeToggle() {
  const mode = useUiStore((state) => state.projectTasksMode);
  const setMode = useUiStore((state) => state.setProjectTasksMode);
  const button = (value: 'list' | 'board', label: string, Icon: typeof List) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      title={label}
      className={`grid size-7 place-items-center rounded-md transition-colors ${mode === value ? 'bg-active text-ink' : 'text-ink-3 hover:bg-hover hover:text-ink'}`}
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </button>
  );
  return (
    <div className="flex items-center gap-0.5">
      {button('list', 'Liste', List)}
      {button('board', 'Kanban', Columns3)}
    </div>
  );
}

/**
 * Tâches d'un projet : liste en arbre (par défaut), chaque tâche suivie de ses sous-tâches, où l'on
 * glisse et dépose (voir ProjectPlan), ou kanban. Le compteur suit la progression du projet (les
 * sous-tâches, pas leur catégorie).
 */
export function ProjectTasks({ projectId, today }: { projectId: string; today: string }) {
  const { data: tasks = [] } = useProjectTasks(projectId);
  const mode = useUiStore((state) => state.projectTasksMode);
  const tree = projectTaskTree(tasks);
  const progress = leafProgress(tasks);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2.5">
        <h2 className="font-semibold">Tâches</h2>
        {progress.total > 0 && (
          <span className="tnum text-meta text-ink-3">
            {progress.done} / {progress.total}
          </span>
        )}
        <span className="ml-auto">
          <ModeToggle />
        </span>
      </div>

      {mode === 'board' ? (
        <div className="pt-2">
          <TaskBoard tasks={tasks} today={today} />
          <div className="mt-2">
            <InlineAddTask projectId={projectId} />
          </div>
        </div>
      ) : (
        <>
          <TaskTree nodes={tree.open} today={today} projectId={projectId} />
          <TreeEndZone>
            <InlineAddTask projectId={projectId} />
          </TreeEndZone>
          <DoneFold tasks={tree.done} today={today} showProject={false} showCompletion />
        </>
      )}
    </section>
  );
}
