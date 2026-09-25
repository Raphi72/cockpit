import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCreateStore } from '@/app/create-store';
import { useToday } from '@/core/use-today';
import { ColorDot } from '@/ui/data/ColorDot';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { SegmentedTabs } from '@/ui/primitives/SegmentedTabs';
import { GroupHeading, TodayTasks, estimateSummary } from '../components/TaskGroups';
import { InlineAddTask } from '../components/InlineAddTask';
import { TaskList } from '../components/TaskList';
import { useDoneTasks, useDoneToday, useOpenTasks } from '../hooks';
import { dayHeading, groupByProject, selectOverdue, selectPriority, selectToday, selectUpcoming, type TaskItem } from '../model';
import { TASK_VIEWS, TASK_VIEW_LABELS, type TaskView } from '../search';

function Empty({ children }: { children: string }) {
  return <p className="py-6 text-ink-3">{children}</p>;
}

function UpcomingView({ open, today }: { open: TaskItem[]; today: string }) {
  const days = selectUpcoming(open, today);
  if (days.length === 0) return <Empty>Rien de prévu dans les 7 prochains jours.</Empty>;
  return (
    <>
      {days.map((day) => (
        <section key={day.date} className="mb-6">
          <GroupHeading>{dayHeading(day.date, today)}</GroupHeading>
          <TaskList tasks={day.tasks} today={today} />
        </section>
      ))}
    </>
  );
}

function AllView({ open, today }: { open: TaskItem[]; today: string }) {
  const groups = groupByProject(open);
  return (
    <>
      {groups.length === 0 && <Empty>Aucune tâche à faire.</Empty>}
      {groups.map((group) => (
        <section key={group.projectId ?? 'none'} className="mb-8">
          <GroupHeading>
            {group.color && <ColorDot color={group.color} />}
            {group.name}
            <span className="tnum">{group.tasks.length}</span>
          </GroupHeading>
          <TaskList tasks={group.tasks} today={today} showProject={false} nested />
        </section>
      ))}
      <InlineAddTask label="Ajouter une tâche sans date" />
    </>
  );
}

export function TasksPage() {
  const search = useSearch({ from: '/tasks' });
  const navigate = useNavigate({ from: '/tasks' });
  const openCreate = useCreateStore((state) => state.openCreate);
  const today = useToday();
  const view: TaskView = search.view ?? 'today';

  const { data: open = [] } = useOpenTasks();
  const { data: doneToday = [] } = useDoneToday(today);
  const doneAll = useDoneTasks();

  const todayGroups = selectToday(open, today);
  const todayTasks = [...todayGroups.overdue, ...todayGroups.today];
  const overdue = selectOverdue(open, today);
  const counts: Partial<Record<TaskView, number>> = {
    today: todayTasks.length,
    upcoming: selectUpcoming(open, today).reduce((sum, day) => sum + day.tasks.length, 0),
    overdue: overdue.length,
    priority: selectPriority(open).length,
    all: open.length,
  };

  const subtitle = [
    `${todayTasks.length} aujourd’hui`,
    overdue.length > 0 ? `${overdue.length} en retard` : null,
    estimateSummary(todayTasks),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Page
      title="Tâches"
      subtitle={subtitle}
      actions={
        <Button variant="secondary" icon={Plus} shortcut="N" onClick={() => openCreate('task', { scheduledDate: today })}>
          Nouvelle tâche
        </Button>
      }
    >
      <div className="mb-6">
        <SegmentedTabs
          tabs={TASK_VIEWS.map((v) => ({ value: v, label: TASK_VIEW_LABELS[v], count: counts[v] || undefined }))}
          value={view}
          onChange={(next) => void navigate({ search: { view: next === 'today' ? undefined : next } })}
        />
      </div>

      {view === 'today' && <TodayTasks open={open} doneToday={doneToday} today={today} />}
      {view === 'upcoming' && <UpcomingView open={open} today={today} />}
      {view === 'overdue' &&
        (overdue.length ? <TaskList tasks={overdue} today={today} /> : <Empty>Aucune tâche en retard.</Empty>)}
      {view === 'priority' &&
        (counts.priority ? (
          <TaskList tasks={selectPriority(open)} today={today} />
        ) : (
          <Empty>Aucune tâche haute ou urgente.</Empty>
        ))}
      {view === 'all' && <AllView open={open} today={today} />}
      {view === 'done' &&
        (doneAll.data?.length ? (
          <TaskList tasks={doneAll.data} today={today} showCompletion />
        ) : (
          <Empty>Aucune tâche terminée pour l’instant.</Empty>
        ))}
    </Page>
  );
}
