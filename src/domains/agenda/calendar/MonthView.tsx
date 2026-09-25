import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatLongDate, monthOf } from '@/core/dates';
import { layoutRow, weekdayShort, type AgendaItem } from '../model';
import { DayItems } from './AgendaChip';
import { useDayDrop } from './drag';
import { SpanBars, lanesSpacer } from './SpanBars';

/** 3 éléments au plus par jour (barres comprises), puis « +N ». */
const MAX_PER_DAY = 3;

/** Haut d'une case jusqu'à la première barre : marge (4 px), numéro du jour (24 + 2 px), espace (1 px). */
const SPANS_TOP = 31;

type MonthViewProps = {
  anchor: string;
  days: string[];
  items: AgendaItem[];
  today: string;
  onOpen: (item: AgendaItem) => void;
  /** Clic sur un jour vide : nouvel événement ce jour-là. */
  onCreate: (day: string) => void;
  onShowDay: (day: string) => void;
};

/**
 * Une case du mois : le numéro du jour (qui ouvre la journée), les éléments du jour, et un clic dans
 * le vide pour créer un événement. On peut y déposer un élément pris ailleurs (glisser-déposer).
 */
function MonthDay(props: {
  day: string;
  first: boolean;
  inMonth: boolean;
  today: string;
  /** Couloirs de barres de la semaine : la place à réserver en haut. */
  lanes: number;
  items: AgendaItem[];
  onOpen: (item: AgendaItem) => void;
  onCreate: (day: string) => void;
  onShowDay: (day: string) => void;
}) {
  const { day, today } = props;
  const drop = useDayDrop(day);
  const isToday = day === today;
  // Le 1er de chaque mois porte le nom du mois : on s'y retrouve dans les jours voisins.
  const label = day.endsWith('-01') ? format(parseISO(day), 'd MMM', { locale: fr }) : String(Number(day.slice(8)));
  return (
    <div
      ref={drop.setNodeRef}
      data-day={day}
      onClick={() => props.onCreate(day)}
      title="Clic : nouvel événement ce jour-là"
      className={
        'flex min-h-[92px] min-w-0 cursor-default flex-col gap-px border-t border-line px-1 pt-1 pb-1.5 ' +
        'transition-colors duration-[120ms] ease-soft ' +
        (drop.isOver ? 'bg-accent-soft ' : 'hover:bg-hover/50 ') +
        (props.first ? '' : 'border-l')
      }
    >
      <div className="px-0.5 pb-0.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            props.onShowDay(day);
          }}
          title={`Voir la journée · ${formatLongDate(parseISO(day))}`}
          className={
            'tnum grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-meta transition-colors duration-[120ms] ease-soft ' +
            (isToday
              ? 'bg-accent font-semibold text-canvas'
              : props.inMonth
                ? 'text-ink-2 hover:bg-active hover:text-ink'
                : 'text-ink-3 hover:bg-active hover:text-ink')
          }
        >
          {label}
        </button>
      </div>
      {props.lanes > 0 && <div className="shrink-0" style={{ height: lanesSpacer(props.lanes) }} />}
      <DayItems
        day={day}
        items={props.items}
        limit={Math.max(MAX_PER_DAY - props.lanes, 1)}
        today={today}
        onOpen={props.onOpen}
        onShowDay={() => props.onShowDay(day)}
      />
    </div>
  );
}

/**
 * Grille de 6 semaines × 7 jours, séparée par des filets fins, sans cadre. Chaque semaine est une
 * rangée : ce qui dure plusieurs jours y est dessiné en une seule barre continue.
 */
export function MonthView({ anchor, days, items, today, onOpen, onCreate, onShowDay }: MonthViewProps) {
  const month = monthOf(anchor);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  return (
    <div>
      <div className="grid grid-cols-7">
        {days.slice(0, 7).map((day) => (
          <div key={day} className="px-2 pb-2 text-meta text-ink-3">
            {weekdayShort(day)}
          </div>
        ))}
      </div>
      {weeks.map((week) => {
        const row = layoutRow(items, week);
        return (
          <div key={week[0]} className="relative grid grid-cols-7">
            {week.map((day, index) => (
              <MonthDay
                key={day}
                day={day}
                first={index === 0}
                inMonth={monthOf(day) === month}
                today={today}
                lanes={row.lanes}
                items={row.singles.get(day) ?? []}
                onOpen={onOpen}
                onCreate={onCreate}
                onShowDay={onShowDay}
              />
            ))}
            <SpanBars
              spans={row.spans}
              columns={7}
              today={today}
              onOpen={onOpen}
              rowKey={week[0]!}
              className="inset-x-0"
              style={{ top: SPANS_TOP }}
            />
          </div>
        );
      })}
    </div>
  );
}
