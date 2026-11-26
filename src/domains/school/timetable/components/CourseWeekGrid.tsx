import { NotebookPen } from 'lucide-react';
import { addDaysISO, timeToMinutes } from '@/core/dates';
import { courseLabel } from '@/domains/google/components/CoursePicker';
import type { CourseOnDay } from '@/domains/google/repository';
import { colorVar } from '@/ui/data/ColorDot';
import { WEEKDAY_SHORT, gridHours, gridWeekdays, isoWeekday, layoutDay, type SlotBlock, type Weekday } from '../model';

/** Une heure de la grille, en pixels. */
const HOUR_HEIGHT = 48;

/** Un cours de Google placé dans la grille : son jour de la semaine et ses heures 'HH:MM' de ce jour-là. */
type WeekCourse = { course: CourseOnDay; weekday: Weekday; startsAt: string; endsAt: string };

function toWeekCourse(course: CourseOnDay): WeekCourse {
  const day = course.startsAt.slice(0, 10);
  const startsAt = course.startsAt.slice(11, 16);
  // Sans fin, ou une fin un autre jour : jusqu'à la fin de l'heure, pour rester dans la colonne.
  const sameDayEnd = course.endsAt && course.endsAt.slice(0, 10) === day ? course.endsAt.slice(11, 16) : null;
  const endsAt = sameDayEnd && sameDayEnd > startsAt ? sameDayEnd : `${String(Math.min(Number(startsAt.slice(0, 2)) + 1, 23)).padStart(2, '0')}:59`;
  return { course, weekday: isoWeekday(day), startsAt, endsAt };
}

function CourseButton({ block, firstHour, onOpen }: { block: SlotBlock<WeekCourse>; firstHour: number; onOpen: (itemId: string) => void }) {
  const { course, startsAt, endsAt } = block.slot;
  const start = timeToMinutes(startsAt);
  const end = timeToMinutes(endsAt);
  const top = ((start - firstHour * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT - 2, 18);
  const compact = height < 40;
  const label = courseLabel(course);
  return (
    <button
      type="button"
      onClick={() => onOpen(course.itemId)}
      title={[label, `${startsAt} – ${endsAt}`, course.location, course.teacher].filter(Boolean).join(' · ')}
      style={{
        top,
        height,
        left: `calc(${(block.lane / block.lanes) * 100}% + 2px)`,
        width: `calc(${100 / block.lanes}% - 4px)`,
        borderLeftColor: colorVar(course.subjectColor ?? 'slate'),
      }}
      className={
        'absolute z-[1] overflow-hidden rounded-md border-l-2 bg-hover px-1.5 text-left text-meta leading-snug ' +
        'transition-colors duration-[120ms] ease-soft hover:bg-active ' +
        (compact ? 'flex items-center gap-1.5' : 'flex flex-col justify-start py-1')
      }
    >
      {course.homeworkOpen > 0 && (
        <span
          className="tnum absolute top-1 right-1.5 flex items-center gap-0.5 text-ink-2"
          title={course.homeworkOpen === 1 ? '1 devoir à rendre' : `${course.homeworkOpen} devoirs à rendre`}
        >
          <NotebookPen className="size-3" strokeWidth={2} />
          {course.homeworkOpen}
        </span>
      )}
      {compact ? (
        <>
          <span className="tnum shrink-0 text-ink-3">{startsAt}</span>
          <span className="truncate font-medium">{label}</span>
        </>
      ) : (
        <>
          <span className={`block truncate font-medium ${course.homeworkOpen > 0 ? 'pr-7' : ''}`}>{label}</span>
          <span className="tnum block truncate text-ink-3">
            {startsAt} – {endsAt}
            {course.location && ` · ${course.location}`}
          </span>
        </>
      )}
    </button>
  );
}

/**
 * Une vraie semaine de cours, lue dans l'agenda des cours de Google : une colonne par jour (lundi à
 * vendredi, plus le week-end s'il a des cours). Un clic ouvre le cours (ses devoirs, « Ajouter un devoir »).
 */
export function CourseWeekGrid(props: { monday: string; courses: CourseOnDay[]; today: string; onOpen: (itemId: string) => void }) {
  const placed = props.courses.map(toWeekCourse);
  const days = gridWeekdays(placed);
  const hours = gridHours(placed);
  const height = (hours.last - hours.first) * HOUR_HEIGHT;
  const hourList = Array.from({ length: hours.last - hours.first }, (_, i) => hours.first + i);
  const dateOf = (weekday: Weekday) => addDaysISO(props.monday, weekday - 1);

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }}>
        <span />
        {days.map((day) => {
          const date = dateOf(day);
          const isToday = date === props.today;
          return (
            <span key={day} className={`pb-2 text-center text-meta font-medium ${isToday ? 'text-accent' : 'text-ink-2'}`}>
              {WEEKDAY_SHORT[day]} <span className="tnum">{Number(date.slice(8, 10))}</span>
            </span>
          );
        })}
      </div>
      <div className="grid border-t border-line" style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`, height }}>
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
            className={`relative border-l border-line ${dateOf(day) === props.today ? 'bg-accent-soft/30' : ''}`}
            style={{
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT}px)`,
            }}
          >
            {layoutDay(placed.filter((course) => course.weekday === day)).map((block) => (
              <CourseButton key={block.slot.course.itemId} block={block} firstHour={hours.first} onOpen={props.onOpen} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
