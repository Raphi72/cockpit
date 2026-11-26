import { Plus } from 'lucide-react';
import { useCreateStore } from '@/app/create-store';
import { useToday } from '@/core/use-today';
import { DoneFold } from '@/domains/tasks/components/TaskGroups';
import { TaskList } from '@/domains/tasks/components/TaskList';
import { useDoneTasks, useOpenTasks } from '@/domains/tasks/hooks';
import { Button } from '@/ui/primitives/Button';
import { selectHomeworkDue } from '../homework/model';

/** Fiche d'une matière : ses devoirs à rendre (les plus proches d'abord), puis ceux rendus, repliés. */
export function SubjectHomework({ subjectId }: { subjectId: string }) {
  const today = useToday();
  const openCreate = useCreateStore((state) => state.openCreate);
  const open = (useOpenTasks().data ?? []).filter((t) => t.subjectId === subjectId);
  const done = (useDoneTasks().data ?? []).filter((t) => t.subjectId === subjectId);
  // Les datés d'abord (du plus proche au plus lointain), puis ceux sans date.
  const dated = selectHomeworkDue(open, today, 3650);
  const datedIds = new Set(dated.map((t) => t.id));
  const undated = open.filter((t) => t.parentId === null && !datedIds.has(t.id));
  const ordered = [...dated, ...undated].flatMap((task) => [task, ...open.filter((t) => t.parentId === task.id)]);

  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <h2 className="font-semibold">Devoirs</h2>
        <Button
          variant="ghost"
          icon={Plus}
          className="ml-auto"
          onClick={() => openCreate('homework', { subjectId })}
        >
          Ajouter un devoir
        </Button>
      </div>
      {ordered.length === 0 ? (
        <p className="py-2 text-ink-3">Aucun devoir à rendre.</p>
      ) : (
        <TaskList tasks={ordered} today={today} showProject={false} nested />
      )}
      <DoneFold tasks={done} today={today} showProject={false} showCompletion />
    </section>
  );
}
