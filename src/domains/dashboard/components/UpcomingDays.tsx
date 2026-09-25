import { Link } from '@tanstack/react-router';
import { Circle, Flag } from 'lucide-react';
import { formatMoney } from '@/core/money';
import {
  AgendaMarker,
  UPCOMING_AGENDA_DAYS,
  agendaTooltip,
  itemTime,
  upcomingDayLabel,
  upcomingDetail,
  useOpenAgendaItem,
  type AgendaItem,
} from '@/domains/agenda';
import type { TaskItem } from '@/domains/tasks/model';
import { useTaskSheet } from '@/domains/tasks/sheet-store';
import { UPCOMING_TASKS_PER_DAY, type UpcomingDay } from '../model';

function rowClass(withTimes: boolean): string {
  return (
    '-mx-2.5 grid min-h-10 w-[calc(100%+20px)] items-center gap-2.5 rounded-md px-2.5 text-left ' +
    'transition-colors duration-[120ms] ease-soft hover:bg-hover ' +
    (withTimes ? 'grid-cols-[12px_40px_minmax(0,1fr)_auto]' : 'grid-cols-[12px_minmax(0,1fr)_auto]')
  );
}

function UpcomingRow({
  item,
  today,
  withTimes,
  showAmounts,
  onOpen,
}: {
  item: AgendaItem;
  today: string;
  withTimes: boolean;
  showAmounts: boolean;
  onOpen: (item: AgendaItem) => void;
}) {
  const detail = upcomingDetail(item, today);
  return (
    <button type="button" title={agendaTooltip(item, showAmounts)} onClick={() => onOpen(item)} className={rowClass(withTimes)}>
      <AgendaMarker item={item} late={false} />
      {withTimes && <span className="tnum text-meta text-ink-3">{itemTime(item)}</span>}
      <span className="truncate">
        <span className={item.kind === 'project_deadline' ? 'font-medium' : ''}>{item.title}</span>
        {detail && <span className="ml-2 text-meta text-ink-3">{detail}</span>}
      </span>
      <span className="tnum font-medium">{showAmounts && item.amountCents !== null && formatMoney(item.amountCents)}</span>
    </button>
  );
}

/** Tâche prévue ce jour-là : un rond comme dans la palette, son projet en gris ; un clic ouvre la tâche. */
function UpcomingTaskRow({ task, day, withTimes }: { task: TaskItem; day: string; withTimes: boolean }) {
  const openTask = useTaskSheet((state) => state.openTask);
  const due = task.dueDate === day;
  return (
    <button
      type="button"
      title={[due ? 'Deadline de la tâche' : 'Tâche prévue', task.title, task.projectName].filter(Boolean).join(' · ')}
      onClick={() => openTask(task.id)}
      className={rowClass(withTimes)}
    >
      <Circle aria-hidden className="size-3 text-ink-3" strokeWidth={2} />
      {withTimes && <span />}
      <span className="truncate">
        {task.title}
        {task.projectName && <span className="ml-2 text-meta text-ink-3">{task.projectName}</span>}
      </span>
      <span>{due && <Flag aria-label="Deadline" className="size-3 text-ink-3" strokeWidth={2} />}</span>
    </button>
  );
}

/**
 * « Prochains jours » du dashboard : rendez-vous, deadlines et débuts de projet, encaissements
 * attendus et, à partir de demain, les tâches prévues, groupés par jour. Seuls les jours qui ont
 * quelque chose sont montrés, chacun sous un petit intitulé : la liste tient dans la colonne étroite.
 * Au-delà de quelques tâches, « +N tâches » ouvre ce jour dans le bloc de tâches.
 */
export function UpcomingDays({
  days,
  today,
  showAmounts = true,
  onShowDay,
}: {
  days: UpcomingDay[];
  today: string;
  /** Faux : les encaissements restent listés, sans leur montant. */
  showAmounts?: boolean;
  onShowDay: (day: string) => void;
}) {
  const open = useOpenAgendaItem();
  // La colonne des heures n'apparaît que si un élément en a une.
  const withTimes = days.some((group) => group.items.some((item) => itemTime(item) !== null));

  return (
    <section>
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-semibold">Prochains jours</h2>
        <Link to="/calendar" className="ml-auto text-meta text-ink-3 hover:text-ink">
          Calendrier →
        </Link>
      </div>
      {days.length === 0 ? (
        <p className="pt-2 text-ink-3">Rien de prévu dans les {UPCOMING_AGENDA_DAYS} prochains jours.</p>
      ) : (
        days.map(({ day, items, tasks }) => {
          const { label, date } = upcomingDayLabel(day, today);
          const hidden = tasks.length - UPCOMING_TASKS_PER_DAY;
          return (
            <div key={day}>
              <h3
                className={`flex items-baseline gap-2 pt-3.5 pb-0.5 text-meta font-medium ${day === today ? 'text-accent' : 'text-ink-2'}`}
              >
                {label}
                {date && <span className="font-normal text-ink-3">{date}</span>}
              </h3>
              {items.map((item) => (
                <UpcomingRow
                  key={item.key}
                  item={item}
                  today={today}
                  withTimes={withTimes}
                  showAmounts={showAmounts}
                  onOpen={open}
                />
              ))}
              {tasks.slice(0, UPCOMING_TASKS_PER_DAY).map((task) => (
                <UpcomingTaskRow key={task.id} task={task} day={day} withTimes={withTimes} />
              ))}
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => onShowDay(day)}
                  className={`mt-0.5 text-meta text-ink-3 transition-colors hover:text-ink ${withTimes ? 'ml-[72px]' : 'ml-[22px]'}`}
                >
                  +{hidden} tâche{hidden > 1 ? 's' : ''}
                </button>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
