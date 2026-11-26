import { useNavigate, useSearch } from '@tanstack/react-router';
import { NotebookPen, Plus } from 'lucide-react';
import { useCreateStore } from '@/app/create-store';
import { useToday } from '@/core/use-today';
import { GroupHeading } from '@/domains/tasks/components/TaskGroups';
import { TaskList } from '@/domains/tasks/components/TaskList';
import { useDoneTasks, useOpenTasks } from '@/domains/tasks/hooks';
import { tasksOfMode } from '@/domains/tasks/model';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { SegmentedTabs } from '@/ui/primitives/SegmentedTabs';
import { useSubjects } from '../subjects/hooks';
import { groupHomework, homeworkSummary, type HomeworkView } from '../homework/model';

/** Devoirs (P14) : à rendre (en retard, puis jour par jour) et rendus. */
export function HomeworkPage() {
  const search = useSearch({ from: '/homework' });
  const navigate = useNavigate({ from: '/homework' });
  const openCreate = useCreateStore((state) => state.openCreate);
  const today = useToday();
  const view: HomeworkView = search.view ?? 'todo';
  const { data: subjects } = useSubjects();
  const open = tasksOfMode(useOpenTasks().data ?? [], 'school');
  const done = tasksOfMode(useDoneTasks().data ?? [], 'school');
  if (!subjects) return null;

  const groups = groupHomework(open, today);
  const newHomework = () => openCreate('homework', {});

  return (
    <Page
      title="Devoirs"
      subtitle={homeworkSummary(open, today)}
      actions={
        <Button variant="secondary" icon={Plus} shortcut="N" onClick={newHomework}>
          Nouveau devoir
        </Button>
      }
    >
      {subjects.length === 0 ? (
        <EmptyState icon={NotebookPen} title="Commence par tes matières">
          <p>Un devoir appartient toujours à une matière : ajoute-les d’abord, ensuite tes devoirs.</p>
          <div className="mt-4">
            <Button variant="primary" icon={Plus} onClick={() => openCreate('subject')}>
              Ajouter une matière
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="mb-6">
            <SegmentedTabs
              tabs={[
                { value: 'todo', label: 'À rendre', count: open.filter((t) => t.parentId === null).length || undefined },
                { value: 'done', label: 'Rendus' },
              ]}
              value={view}
              onChange={(next) => void navigate({ search: next === 'done' ? { view: 'done' } : {} })}
            />
          </div>

          {view === 'todo' &&
            (groups.length === 0 ? (
              <p className="py-6 text-ink-3">Aucun devoir à rendre. Profites-en.</p>
            ) : (
              groups.map((group) => (
                <section key={group.key} className="mb-6">
                  <GroupHeading tone={group.tone}>{group.heading}</GroupHeading>
                  <TaskList tasks={group.tasks} today={today} nested />
                </section>
              ))
            ))}

          {view === 'done' &&
            (done.length === 0 ? (
              <p className="py-6 text-ink-3">Aucun devoir rendu pour l’instant.</p>
            ) : (
              <TaskList tasks={done} today={today} showCompletion />
            ))}
        </>
      )}
    </Page>
  );
}
