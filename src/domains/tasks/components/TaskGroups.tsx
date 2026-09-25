import { ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useDoneOn } from '../hooks';
import { selectPlannedOn, selectToPlan, selectToday, totalEstimate, formatDuration, type TaskItem } from '../model';
import { InlineAddTask } from './InlineAddTask';
import { TaskList } from './TaskList';

export function GroupHeading({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'danger' }) {
  return (
    <h3 className={`flex items-center gap-2 pt-4 pb-1.5 text-meta font-medium ${tone === 'danger' ? 'text-danger' : 'text-ink-3'}`}>
      {children}
    </h3>
  );
}

/** Tâches terminées repliées : présentes, mais sans encombrer. */
export function DoneFold({ tasks, today, showProject = true }: { tasks: TaskItem[]; today: string; showProject?: boolean }) {
  const [open, setOpen] = useState(false);
  if (tasks.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="-mx-2.5 flex min-h-10 w-[calc(100%+20px)] items-center gap-2 rounded-md px-2.5 text-meta text-ink-3 transition-colors hover:text-ink-2"
      >
        <ChevronRight className={`size-3.5 transition-transform duration-[120ms] ${open ? 'rotate-90' : ''}`} strokeWidth={2} />
        {tasks.length} terminée{tasks.length > 1 ? 's' : ''}
      </button>
      {open && <TaskList tasks={tasks} today={today} showProject={showProject} />}
    </div>
  );
}

/** Estimation totale : « ~5 h estimées ». */
export function estimateSummary(tasks: TaskItem[]): string | null {
  const minutes = totalEstimate(tasks);
  return minutes > 0 ? `~${formatDuration(minutes)} estimées` : null;
}

/**
 * Vue « Aujourd'hui » : retards, puis le jour, ajout express et terminées repliées ;
 * enfin « À prévoir », les deadlines de la semaine qui n'ont pas encore de début.
 */
export function TodayTasks({ open, doneToday, today }: { open: TaskItem[]; doneToday: TaskItem[]; today: string }) {
  const groups = selectToday(open, today);
  const toPlan = selectToPlan(open, today);
  const empty = groups.overdue.length === 0 && groups.today.length === 0;

  return (
    <div>
      {groups.overdue.length > 0 && (
        <>
          <GroupHeading tone="danger">En retard</GroupHeading>
          <TaskList tasks={groups.overdue} today={today} />
        </>
      )}
      {groups.today.length > 0 && (
        <>
          {groups.overdue.length > 0 && <GroupHeading>À faire aujourd’hui</GroupHeading>}
          <TaskList tasks={groups.today} today={today} />
        </>
      )}
      {empty && (
        <p className="py-2 text-ink-3">
          {doneToday.length > 0 ? 'Tout est fait pour aujourd’hui.' : 'Rien de prévu aujourd’hui.'}
        </p>
      )}
      <InlineAddTask scheduledDate={today} label="Ajouter une tâche pour aujourd’hui" />
      <DoneFold tasks={doneToday} today={today} />
      {toPlan.length > 0 && (
        <>
          <GroupHeading>À prévoir</GroupHeading>
          <TaskList tasks={toPlan} today={today} />
        </>
      )}
    </div>
  );
}

/** Un jour à venir : les tâches prévues ce jour-là, et l'ajout express pour ce jour. */
export function FutureDayTasks({ open, day, today, addLabel }: { open: TaskItem[]; day: string; today: string; addLabel: string }) {
  const tasks = selectPlannedOn(open, day, today);
  return (
    <div>
      {tasks.length > 0 ? (
        <TaskList tasks={tasks} today={today} shownDay={day} />
      ) : (
        <p className="py-2 text-ink-3">Rien de prévu ce jour-là.</p>
      )}
      <InlineAddTask scheduledDate={day} label={addLabel} />
    </div>
  );
}

/**
 * Un jour passé : ce qui a été terminé ce jour-là, puis ce qui y était prévu et n'est pas fait
 * (reporté dans Aujourd'hui, et toujours à cocher ici).
 */
export function PastDayTasks({ open, day, today }: { open: TaskItem[]; day: string; today: string }) {
  const { data: done = [] } = useDoneOn(day);
  const notDone = selectPlannedOn(open, day, today);
  return (
    <div>
      {done.length > 0 ? (
        <TaskList tasks={done} today={today} />
      ) : (
        <p className="py-2 text-ink-3">Aucune tâche terminée ce jour-là.</p>
      )}
      {notDone.length > 0 && (
        <>
          <GroupHeading>Pas faites, reportées à aujourd’hui</GroupHeading>
          <TaskList tasks={notDone} today={today} />
        </>
      )}
    </div>
  );
}
