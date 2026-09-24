import { parseISO } from 'date-fns';
import type { MouseEvent } from 'react';
import { formatLongDate } from '@/core/dates';
import { useMinutesOfDay } from '@/core/use-today';
import {
  agendaTooltip,
  itemTimeRange,
  layoutTimedItems,
  slotStart,
  visibleHours,
  weekdayShort,
  type AgendaItem,
  type TimedBlock,
} from '../model';
import { DayItems } from './AgendaChip';

/** Une heure a la hauteur d'une ligne de liste. */
const HOUR_HEIGHT = 44;

/** Dans la ligne « journée » d'une semaine, 3 éléments au plus par jour, puis « +N ». */
const MAX_ALL_DAY = 3;

type TimeGridViewProps = {
  days: string[];
  groups: Map<string, AgendaItem[]>;
  today: string;
  onOpen: (item: AgendaItem) => void;
  /** Clic sur un créneau ('YYYY-MM-DDTHH:MM') ou dans la ligne « journée » d'un jour. */
  onCreate: (start: string, allDay: boolean) => void;
  onShowDay: (day: string) => void;
};

function TimedBlockButton({
  block,
  firstHour,
  onOpen,
}: {
  block: TimedBlock;
  firstHour: number;
  onOpen: (item: AgendaItem) => void;
}) {
  const { item } = block;
  const top = ((block.start - firstHour * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(((block.end - block.start) / 60) * HOUR_HEIGHT - 2, 18);
  const compact = height < 40;
  const time = itemTimeRange(item);
  return (
    <button
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
        (compact ? 'flex items-center gap-1.5' : 'py-1')
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

/**
 * Semaine ou jour : les éléments « journée » en haut, puis les heures (8 h – 20 h, élargies
 * si besoin) où chaque événement occupe la hauteur de sa durée.
 */
export function TimeGridView({ days, groups, today, onOpen, onCreate, onShowDay }: TimeGridViewProps) {
  const now = useMinutesOfDay();
  const blocksByDay = days.map((day) => layoutTimedItems(groups.get(day) ?? []));
  const hours = visibleHours(blocksByDay.flat());
  const hourCount = hours.last - hours.first;
  const columns = { gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` };
  const multiDay = days.length > 1;

  const createAt = (day: string) => (event: MouseEvent<HTMLDivElement>) => {
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    onCreate(`${day}T${slotStart(hours.first * 60 + (y / HOUR_HEIGHT) * 60)}`, false);
  };

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

      {/* Ligne « journée » : deadlines, encaissements, événements sans heure. */}
      <div className="grid border-y border-line" style={columns}>
        <div className="pt-1.5 pr-2 text-right text-meta text-ink-3">Journée</div>
        {days.map((day) => (
          <div
            key={day}
            onClick={() => onCreate(day, true)}
            title="Clic : nouvel événement sur la journée"
            className="flex min-h-9 min-w-0 cursor-default flex-col gap-px border-l border-line p-1 transition-colors duration-[120ms] ease-soft hover:bg-hover/50"
          >
            <DayItems
              items={(groups.get(day) ?? []).filter((item) => item.allDay)}
              limit={multiDay ? MAX_ALL_DAY : Infinity}
              today={today}
              onOpen={onOpen}
              onShowDay={() => onShowDay(day)}
            />
          </div>
        ))}
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
        {days.map((day, dayIndex) => {
          const showNow = day === today && now >= hours.first * 60 && now < hours.last * 60;
          return (
            <div
              key={day}
              onClick={createAt(day)}
              title="Clic : nouvel événement à cette heure"
              className="relative cursor-default border-l border-line"
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
              {blocksByDay[dayIndex]!.map((block) => (
                <TimedBlockButton key={block.item.key} block={block} firstHour={hours.first} onOpen={onOpen} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
