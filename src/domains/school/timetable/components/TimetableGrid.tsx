import type { MouseEvent } from 'react';
import { minutesToTime, timeToMinutes } from '@/core/dates';
import {
  WEEKDAY_LABELS,
  gridHours,
  gridWeekdays,
  layoutDay,
  slotRoom,
  type SlotBlock,
  type TimetableSlot,
  type Weekday,
} from '../model';
import { colorVar } from '@/ui/data/ColorDot';

/** Une heure de la grille, en pixels. */
const HOUR_HEIGHT = 48;

function SlotButton({ block, firstHour, onOpen }: { block: SlotBlock; firstHour: number; onOpen: (slot: TimetableSlot) => void }) {
  const { slot } = block;
  const start = timeToMinutes(slot.startsAt);
  const end = timeToMinutes(slot.endsAt);
  const top = ((start - firstHour * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT - 2, 18);
  const compact = height < 40;
  const room = slotRoom(slot);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(slot);
      }}
      title={[slot.subjectName, slot.label, `${slot.startsAt} – ${slot.endsAt}`, room].filter(Boolean).join(' · ')}
      style={{
        top,
        height,
        left: `calc(${(block.lane / block.lanes) * 100}% + 2px)`,
        width: `calc(${100 / block.lanes}% - 4px)`,
        borderLeftColor: colorVar(slot.subjectColor),
      }}
      className={
        'absolute z-[1] overflow-hidden rounded-md border-l-2 bg-hover px-1.5 text-left text-meta leading-snug ' +
        'transition-colors duration-[120ms] ease-soft hover:bg-active ' +
        (compact ? 'flex items-center gap-1.5' : 'py-1')
      }
    >
      {compact ? (
        <>
          <span className="tnum shrink-0 text-ink-3">{slot.startsAt}</span>
          <span className="truncate font-medium">{slot.subjectName}</span>
        </>
      ) : (
        <>
          <span className="block truncate font-medium">{slot.subjectName}</span>
          <span className="tnum block truncate text-ink-3">
            {slot.startsAt} – {slot.endsAt}
            {slot.label && ` · ${slot.label}`}
            {room && ` · ${room}`}
          </span>
        </>
      )}
    </button>
  );
}

/**
 * La semaine type : une colonne par jour (lundi à vendredi, plus le week-end s'il a des cours).
 * Un clic sur un créneau libre ajoute un cours à cette heure (à la demi-heure près).
 */
export function TimetableGrid(props: {
  slots: TimetableSlot[];
  /** Jour de la semaine d'aujourd'hui, mis en avant (sauf en vacances). */
  todayWeekday: Weekday | null;
  onOpen: (slot: TimetableSlot) => void;
  onCreate: (weekday: Weekday, startsAt: string) => void;
}) {
  const days = gridWeekdays(props.slots);
  const hours = gridHours(props.slots);
  const height = (hours.last - hours.first) * HOUR_HEIGHT;
  const hourList = Array.from({ length: hours.last - hours.first }, (_, i) => hours.first + i);

  const create = (weekday: Weekday) => (event: MouseEvent<HTMLDivElement>) => {
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    const minutes = hours.first * 60 + Math.floor((y / HOUR_HEIGHT) * 2) * 30;
    props.onCreate(weekday, minutesToTime(Math.min(minutes, 23 * 60)));
  };

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }}>
        <span />
        {days.map((day) => (
          <span
            key={day}
            className={`pb-2 text-center text-meta font-medium ${day === props.todayWeekday ? 'text-accent' : 'text-ink-2'}`}
          >
            {WEEKDAY_LABELS[day]}
          </span>
        ))}
      </div>
      <div
        className="grid border-t border-line"
        style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`, height }}
      >
        <div className="relative">
          {hourList.map((hour) => (
            <span
              key={hour}
              className="tnum absolute right-2 -translate-y-1/2 text-meta text-ink-3"
              style={{ top: (hour - hours.first) * HOUR_HEIGHT }}
            >
              {hour > hours.first && `${hour} h`}
            </span>
          ))}
        </div>
        {days.map((day) => (
          <div
            key={day}
            onClick={create(day)}
            title="Clic : ajouter un cours à cette heure"
            className={`relative cursor-default border-l border-line ${day === props.todayWeekday ? 'bg-accent-soft/30' : ''}`}
            style={{
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT}px)`,
            }}
          >
            {layoutDay(props.slots.filter((slot) => slot.weekday === day)).map((block) => (
              <SlotButton key={block.slot.id} block={block} firstHour={hours.first} onOpen={props.onOpen} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
