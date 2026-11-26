import { Plus } from 'lucide-react';
import { useState } from 'react';
import { addDaysISO, formatDateField } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { useCoursesBetween, useGoogleEventSheet, useHasSchoolCalendar } from '@/domains/google/hooks';
import { Button } from '@/ui/primitives/Button';
import { SlotDialog } from '../timetable/components/SlotDialog';
import { useSlots } from '../timetable/hooks';
import { WEEKDAY_LABELS, slotRoom, type TimetableSlot } from '../timetable/model';

/** Les prochains cours d'une matière, lus dans l'agenda des cours, sur 4 semaines. */
const UPCOMING_DAYS = 28;
const UPCOMING_SHOWN = 6;

/** Avec l'agenda des cours de Google : les prochaines séances de la matière ; un clic ouvre le cours. */
function GoogleClasses({ subjectId }: { subjectId: string }) {
  const today = useToday();
  const openCourse = useGoogleEventSheet((state) => state.open);
  const { data: courses = [] } = useCoursesBetween(today, addDaysISO(today, UPCOMING_DAYS));
  const mine = courses.filter((course) => course.subjectId === subjectId).slice(0, UPCOMING_SHOWN);

  return (
    <section>
      <h2 className="mb-1.5 font-semibold">Prochains cours</h2>
      {mine.length === 0 ? (
        <p className="py-2 text-ink-3">Aucun cours dans les 4 prochaines semaines.</p>
      ) : (
        <ul>
          {mine.map((course) => (
            <li key={course.itemId}>
              <button
                type="button"
                onClick={() => openCourse(course.itemId)}
                className="-mx-2.5 flex min-h-10 w-[calc(100%+20px)] items-baseline gap-2 rounded-md px-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover"
              >
                <span className="first-letter:uppercase">{formatDateField(course.startsAt.slice(0, 10), today)}</span>
                <span className="tnum text-ink-2">{course.startsAt.slice(11, 16)}</span>
                <span className="truncate text-meta text-ink-3">
                  {[course.courseKind && course.courseKind.toLowerCase() !== 'cours' ? course.courseKind : null, course.location].filter(Boolean).join(' · ')}
                </span>
                {course.homeworkOpen > 0 && (
                  <span className="ml-auto shrink-0 text-meta text-ink-2">
                    {course.homeworkOpen} devoir{course.homeworkOpen > 1 ? 's' : ''}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Sans Google : les cours de la semaine type, saisis à la main. */
function WeeklySlots({ subjectId }: { subjectId: string }) {
  const { data: slots = [] } = useSlots();
  const [editing, setEditing] = useState<{ slot?: TimetableSlot } | null>(null);
  const mine = slots.filter((slot) => slot.subjectId === subjectId);

  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <h2 className="font-semibold">Cours</h2>
        <Button variant="ghost" icon={Plus} className="ml-auto" onClick={() => setEditing({})}>
          Ajouter
        </Button>
      </div>
      {mine.length === 0 ? (
        <p className="py-2 text-ink-3">Pas encore dans l’emploi du temps.</p>
      ) : (
        <ul>
          {mine.map((slot) => (
            <li key={slot.id}>
              <button
                type="button"
                onClick={() => setEditing({ slot })}
                className="-mx-2.5 flex min-h-10 w-[calc(100%+20px)] items-baseline gap-2 rounded-md px-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover"
              >
                <span>{WEEKDAY_LABELS[slot.weekday]}</span>
                <span className="tnum text-ink-2">
                  {slot.startsAt} – {slot.endsAt}
                </span>
                <span className="truncate text-meta text-ink-3">{[slot.label, slotRoom(slot)].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <SlotDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        slot={editing?.slot}
        defaults={{ subjectId }}
      />
    </section>
  );
}

/** Fiche d'une matière : ses prochains cours (Google Agenda), ou, sans Google, ses cours de la semaine type. */
export function SubjectClasses({ subjectId }: { subjectId: string }) {
  const { data: hasSchoolCalendar } = useHasSchoolCalendar();
  if (hasSchoolCalendar === undefined) return null;
  return hasSchoolCalendar ? <GoogleClasses subjectId={subjectId} /> : <WeeklySlots subjectId={subjectId} />;
}
