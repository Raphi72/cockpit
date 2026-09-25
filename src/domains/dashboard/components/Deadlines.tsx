import { Link } from '@tanstack/react-router';
import { parseISO } from 'date-fns';
import { Flag } from 'lucide-react';
import { useState } from 'react';
import { formatLongDate } from '@/core/dates';
import { deadlineStatus } from '@/core/deadline';
import { useEventSheet } from '@/domains/agenda/event-sheet-store';
import { useUpdateTask } from '@/domains/tasks/hooks';
import { useTaskSheet } from '@/domains/tasks/sheet-store';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { DatePicker } from '@/ui/primitives/DatePicker';
import { DEADLINE_DAYS, type DeadlineEntry } from '../model';

/** Nombre de deadlines montrées d'emblée : au-delà, on les déplie à la demande. */
const VISIBLE_DEADLINES = 4;

const titleClass =
  'truncate outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-accent-soft';

/** Le titre ouvre la source (fiche projet, tâche, événement) ; son lien couvre toute la ligne. */
function EntryTitle({ entry }: { entry: DeadlineEntry }) {
  const openTask = useTaskSheet((state) => state.openTask);
  const openEvent = useEventSheet((state) => state.openEvent);
  if (entry.source === 'project') {
    return (
      <Link to="/projects/$projectId" params={{ projectId: entry.id }} className={`${titleClass} font-medium`}>
        {entry.title}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => (entry.source === 'task' ? openTask(entry.id) : openEvent(entry.id))}
      className={`${titleClass} text-left`}
    >
      {entry.title}
    </button>
  );
}

/**
 * « Prévoir… » sur une tâche qui n'a pas encore de début : choisir le jour où s'y mettre.
 * Visible au survol (ou au clavier), par-dessus le compte à rebours, sans décaler le texte.
 */
function PlanButton({ taskId }: { taskId: string }) {
  const update = useUpdateTask();
  return (
    <DatePicker value={null} align="end" onPick={(scheduledDate) => update.mutate({ id: taskId, patch: { scheduledDate } })}>
      <button
        type="button"
        className={
          'absolute top-1/2 right-2.5 z-10 h-7 -translate-y-1/2 rounded-md border border-line bg-elevated px-2.5 text-meta text-ink-2 ' +
          'opacity-0 transition-opacity duration-[120ms] ease-soft group-focus-within:opacity-100 group-hover:opacity-100 ' +
          'hover:text-ink data-[state=open]:opacity-100'
        }
      >
        Prévoir…
      </button>
    </DatePicker>
  );
}

/** Deux lignes, comme « À surveiller » : le titre en entier, puis le projet (et « à prévoir »). */
function DeadlineRow({ entry, today }: { entry: DeadlineEntry; today: string }) {
  const { text, tone } = deadlineStatus(entry.date, today);
  return (
    <div className="group relative -mx-2.5 grid grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-2.5 py-2.5 transition-colors duration-[120ms] ease-soft hover:bg-hover">
      <Flag aria-hidden className={`mt-[3px] size-3.5 ${DEADLINE_TONE_CLASS[tone]}`} strokeWidth={2} />
      <span className="flex min-w-0 flex-col">
        <EntryTitle entry={entry} />
        {(entry.detail || entry.toPlan) && (
          <span className="truncate text-meta text-ink-3">
            {entry.detail}
            {entry.toPlan && <span className="text-ink-2">{entry.detail ? ' · ' : ''}pas encore prévue</span>}
          </span>
        )}
      </span>
      <span className={`tnum pt-px text-meta ${DEADLINE_TONE_CLASS[tone]}`} title={formatLongDate(parseISO(entry.date))}>
        {text}
      </span>
      {entry.toPlan && <PlanButton taskId={entry.id} />}
    </div>
  );
}

/**
 * Bloc « Deadlines » du dashboard : ce qui doit être fini d'ici 7 jours, projets, tâches et échéances,
 * avec un compte à rebours coloré (rouge aujourd'hui ou en retard, ambre à 3 jours, bleu dans la
 * semaine). Une tâche qui n'a pas encore de début est « à prévoir ».
 */
export function Deadlines({ entries, today }: { entries: DeadlineEntry[]; today: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, VISIBLE_DEADLINES);
  const hidden = entries.length - visible.length;

  return (
    <section>
      <div className="mb-1 flex items-baseline gap-2.5">
        <h2 className="font-semibold">Deadlines</h2>
        <span className="text-meta text-ink-3">{DEADLINE_DAYS} prochains jours</span>
      </div>
      {entries.length === 0 ? (
        <p className="pt-1 text-ink-3">Aucune deadline d’ici {DEADLINE_DAYS} jours.</p>
      ) : (
        <>
          {visible.map((entry) => (
            <DeadlineRow key={entry.key} entry={entry} today={today} />
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-1 text-meta text-ink-3 transition-colors hover:text-ink"
            >
              {hidden} autre{hidden > 1 ? 's' : ''} deadline{hidden > 1 ? 's' : ''}
            </button>
          )}
        </>
      )}
    </section>
  );
}
