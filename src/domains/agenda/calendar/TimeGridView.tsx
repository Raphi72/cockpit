import { parseISO } from 'date-fns';
import type { MouseEvent } from 'react';
import { formatLongDate } from '@/core/dates';
import { useMinutesOfDay } from '@/core/use-today';
import {
  agendaTooltip,
  groupByDay,
  itemTimeRange,
  layoutRow,
  layoutTimedItems,
  slotStart,
  visibleHours,
  weekdayShort,
  type AgendaItem,
  type TimedBlock,
} from '../model';
import { DayItems } from './AgendaChip';
import { useAgendaDrag, useDayDrop, useSlotDrop } from './drag';
import { SpanBars, lanesSpacer } from './SpanBars';

/** Une heure a la hauteur d'une ligne de liste. */
const HOUR_HEIGHT = 44;

/** Dans la ligne « journée » d'une semaine, 3 éléments au plus par jour, puis « +N ». */
const MAX_ALL_DAY = 3;

type TimeGridViewProps = {
  days: string[];
  items: AgendaItem[];
  today: string;
  onOpen: (item: AgendaItem) => void;
  /** Clic sur un créneau ('YYYY-MM-DDTHH:MM') ou dans la ligne « journée » d'un jour. */
  onCreate: (start: string, allDay: boolean) => void;
  onShowDay: (day: string) => void;
};

function TimedBlockButton({
  block,
  day,
  firstHour,
  onOpen,
}: {
  block: TimedBlock;
  day: string;
  firstHour: number;
  onOpen: (item: AgendaItem) => void;
}) {
  const { item } = block;
  const drag = useAgendaDrag(item, `${item.key}@${day}`);
  const top = ((block.start - firstHour * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(((block.end - block.start) / 60) * HOUR_HEIGHT - 2, 18);
  const compact = height < 40;
  const time = itemTimeRange(item);
  return (
    <button
      ref={drag.setNodeRef}
      {...drag.listeners}
      type="button"
      title={agendaTooltip(item)}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(item);
      }}
      style={{
        top,
        height,
        left: `calc(${(block.column / block.columns) * 100}% + 2px)`,
        width: `calc(${100 / block.columns}% - 4px)`,
        borderLeftColor: item.color ? `var(--p-${item.color})` : 'var(--text-3)',
      }}
      className={
        'absolute z-[1] overflow-hidden rounded-md border-l-2 bg-hover px-1.5 text-left text-meta leading-snug ' +
        'transition-colors duration-[120ms] ease-soft hover:bg-active ' +
        (compact ? 'flex items-center gap-1.5' : 'py-1') +
        (drag.isDragging ? ' opacity-40' : '')
      }
    >
      {compact ? (
        <>
          <span className="tnum shrink-0 text-ink-3">{time?.slice(0, 5)}</span>
          <span className="truncate font-medium">{item.title}</span>
        </>
      ) : (
        <>
          <span className="block truncate font-medium">{item.title}</span>
          <span className="tnum block truncate text-ink-3">
            {time}
            {item.detail && ` · ${item.detail}`}
          </span>
        </>
      )}
    </button>
  );
}

/** Case « journée » d'un jour : ses éléments, un clic pour créer, et on peut y déposer un élément. */
function AllDayCell(props: {
  day: string;
  lanes: number;
  items: AgendaItem[];
  limit: number;
  today: string;
  onOpen: (item: AgendaItem) => void;
  onCreate: () => void;
  onShowDay: () => void;
}) {
  const drop = useDayDrop(props.day);
  return (
    <div
      ref={drop.setNodeRef}
      data-day={props.day}
      onClick={props.onCreate}
      title="Clic : nouvel événement sur la journée"
      className={
        'flex min-h-9 min-w-0 cursor-default flex-col gap-px border-l border-line p-1 transition-colors duration-[120ms] ease-soft ' +
        (drop.isOver ? 'bg-accent-soft' : 'hover:bg-hover/50')
      }
    >
      {props.lanes > 0 && <div className="shrink-0" style={{ height: lanesSpacer(props.lanes) }} />}
      <DayItems
        day={props.day}
        items={props.items}
        limit={props.limit}
        today={props.today}
        onOpen={props.onOpen}
        onShowDay={props.onShowDay}
      />
    </div>
  );
}

/**
 * Colonne horaire d'un jour : un clic crée un événement à la demi-heure cliquée ; on peut y déposer
 * un élément (un événement à heure fixe y prend l'heure du créneau).
 */
function DayColumn(props: {
  day: string;
  hours: { first: number; last: number };
  /** Minutes depuis minuit si c'est aujourd'hui : la ligne « maintenant ». */
  now: number | null;
  blocks: TimedBlock[];
  onOpen: (item: AgendaItem) => void;
  onCreate: (start: string, allDay: boolean) => void;
}) {
  const { day, hours, now } = props;
  const drop = useSlotDrop(day, hours.first, HOUR_HEIGHT);
  const hourCount = hours.last - hours.first;
  const showNow = now !== null && now >= hours.first * 60 && now < hours.last * 60;
  const createAt = (event: MouseEvent<HTMLDivElement>) => {
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    props.onCreate(`${day}T${slotStart(hours.first * 60 + (y / HOUR_HEIGHT) * 60)}`, false);
  };
  return (
    <div
      ref={drop.setNodeRef}
      data-day={day}
      onClick={createAt}
      title="Clic : nouvel événement à cette heure"
      className={`relative cursor-default border-l border-line transition-colors duration-[120ms] ease-soft ${drop.isOver ? 'bg-accent-soft' : ''}`}
      style={{ height: hourCount * HOUR_HEIGHT }}
    >
      {Array.from({ length: hourCount }, (_, index) => (
        <div key={index} className="border-t border-line" style={{ height: HOUR_HEIGHT }} />
      ))}
      {showNow && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-[2] border-t-2 border-accent"
          style={{ top: ((now - hours.first * 60) / 60) * HOUR_HEIGHT - 1 }}
        >
          <span className="absolute -top-[5px] -left-[4px] size-2 rounded-full bg-accent" />
        </div>
      )}
      {props.blocks.map((block) => (
        <TimedBlockButton key={block.item.key} block={block} day={day} firstHour={hours.first} onOpen={props.onOpen} />
      ))}
    </div>
  );
}

/**
 * Semaine ou jour : les éléments « journée » en haut, puis les heures (8 h – 20 h, élargies
 * si besoin) où chaque événement occupe la hauteur de sa durée.
 */
export function TimeGridView({ days, items, today, onOpen, onCreate, onShowDay }: TimeGridViewProps) {
  const now = useMinutesOfDay();
  // Ligne « journée » : ce qui dure plusieurs jours en barres continues, le reste dans sa case.
  const allDay = layoutRow(
    items.filter((item) => item.allDay),
    days,
  );
  const timed = groupByDay(
    items.filter((item) => !item.allDay),
    days,
  );
  const blocksByDay = days.map((day) => layoutTimedItems(timed.get(day) ?? []));
  const hours = visibleHours(blocksByDay.flat());
  const hourCount = hours.last - hours.first;
  const columns = { gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` };
  const multiDay = days.length > 1;

  return (
    <div>
      {multiDay && (
        <div className="grid" style={columns}>
          <div />
          {days.map((day) => (
            <div key={day} className="px-1 pb-2">
              <button
                type="button"
                onClick={() => onShowDay(day)}
                title={`Voir la journée · ${formatLongDate(parseISO(day))}`}
                className={
                  'flex h-7 items-center gap-1.5 rounded-md px-1.5 text-meta transition-colors duration-[120ms] ease-soft hover:bg-hover ' +
                  (day === today ? 'text-accent' : 'text-ink-2')
                }
              >
                {weekdayShort(day)}
                <span className={`tnum ${day === today ? 'grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1 font-semibold text-canvas' : 'text-ink'}`}>
                  {Number(day.slice(8))}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Ligne « journée » : deadlines, encaissements, événements sans heure, tâches du début à la deadline. */}
      <div className="relative grid border-y border-line" style={columns}>
        <div className="pt-1.5 pr-2 text-right text-meta text-ink-3">Journée</div>
        {days.map((day) => (
          <AllDayCell
            key={day}
            day={day}
            lanes={allDay.lanes}
            items={allDay.singles.get(day) ?? []}
            limit={multiDay ? Math.max(MAX_ALL_DAY - allDay.lanes, 1) : Infinity}
            today={today}
            onOpen={onOpen}
            onCreate={() => onCreate(day, true)}
            onShowDay={() => onShowDay(day)}
          />
        ))}
        {/* Au-dessus des colonnes des jours (après les 52 px des heures), sous la marge des cases. */}
        <SpanBars
          spans={allDay.spans}
          columns={days.length}
          today={today}
          onOpen={onOpen}
          rowKey={days[0]!}
          style={{ left: 52, right: 0, top: 4 }}
        />
      </div>

      {/* Heures */}
      <div className="grid pt-2" style={columns}>
        <div className="relative" style={{ height: hourCount * HOUR_HEIGHT }}>
          {Array.from({ length: hourCount }, (_, index) => (
            <span
              key={index}
              className="tnum absolute right-2 -translate-y-1/2 text-meta text-ink-3"
              style={{ top: index * HOUR_HEIGHT }}
            >
              {String(hours.first + index).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {days.map((day, dayIndex) => (
          <DayColumn
            key={day}
            day={day}
            hours={hours}
            now={day === today ? now : null}
            blocks={blocksByDay[dayIndex]!}
            onOpen={onOpen}
            onCreate={onCreate}
          />
        ))}
      </div>
    </div>
  );
}
