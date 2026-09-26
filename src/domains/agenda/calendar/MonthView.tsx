import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useRef } from 'react';
import { formatLongDate, monthOf } from '@/core/dates';
import { FILL_BOTTOM_GAP } from '@/ui/layout/Page';
import { useFillHeight } from '@/ui/layout/use-fill-height';
import { layoutRow, monthCellLimit, weekdayShort, type AgendaItem } from '../model';
import { DayItems } from './AgendaChip';
import { useDayDrop } from './drag';
import { SpanBars, lanesSpacer } from './SpanBars';

/** Haut d'une case jusqu'à la première barre : marge (4 px), numéro du jour (24 + 2 px), espace (1 px). */
const SPANS_TOP = 31;

/** Ce qu'une case prend hors éléments : marges (4 + 6 px) et numéro du jour (26 px). */
const CELL_CHROME = 36;

/** Une ligne d'élément (22 px) et son espace (1 px) ; une barre de plusieurs jours prend la même place. */
const LINE_HEIGHT = 23;

/** En dessous (le numéro du jour et deux lignes), la page défile plutôt que de tasser les cases. */
const MIN_ROW_HEIGHT = 82;

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
  /** Hauteur de la rangée, et le nombre de lignes qui y tiennent. */
  height: number;
  lines: number;
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
      style={{ height: props.height }}
      className={
        'flex min-w-0 cursor-default flex-col gap-px overflow-hidden border-t border-line px-1 pt-1 pb-1.5 ' +
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
        limit={monthCellLimit(props.lines, props.lanes, props.items.length)}
        today={today}
        onOpen={props.onOpen}
        onShowDay={() => props.onShowDay(day)}
      />
    </div>
  );
}

/**
 * Les semaines du mois × 7 jours, séparées par des filets fins, sans cadre. Chaque semaine est une
 * rangée : ce qui dure plusieurs jours y est dessiné en une seule barre continue. Les rangées se
 * partagent la hauteur de la fenêtre ; chaque case montre ce qui y tient, puis « +N ».
 */
export function MonthView({ anchor, days, items, today, onOpen, onCreate, onShowDay }: MonthViewProps) {
  const month = monthOf(anchor);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const grid = useRef<HTMLDivElement>(null);
  const available = useFillHeight(grid, FILL_BOTTOM_GAP);
  const height = Math.max(MIN_ROW_HEIGHT, Math.floor((available ?? 0) / weeks.length));
  const lines = Math.floor((height - CELL_CHROME) / LINE_HEIGHT);
  return (
    <div>
      <div className="grid grid-cols-7">
        {days.slice(0, 7).map((day) => (
          <div key={day} className="px-2 pb-2 text-meta text-ink-3">
            {weekdayShort(day)}
          </div>
        ))}
      </div>
      <div ref={grid}>
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
                  height={height}
                  lines={lines}
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
    </div>
  );
}
