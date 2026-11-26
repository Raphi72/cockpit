import { useNavigate } from '@tanstack/react-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarClock, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { addDaysISO, timeToMinutes } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { useCoursesBetween, useGoogleEventSheet, useHasSchoolCalendar } from '@/domains/google/hooks';
import type { CourseOnDay } from '@/domains/google/repository';
import { formatDuration } from '@/domains/tasks/model';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { SchoolCalendarDialog } from '../periods/components/SchoolCalendarDialog';
import { CourseWeekGrid } from '../timetable/components/CourseWeekGrid';
import { isoWeekday } from '../timetable/model';

const mondayOf = (day: string) => addDaysISO(day, 1 - isoWeekday(day));

/** « du 30 nov. au 4 déc. » (la semaine de cours, du lundi au vendredi). */
function weekLabel(monday: string): string {
  const friday = addDaysISO(monday, 4);
  return `du ${format(parseISO(monday), 'd MMM', { locale: fr })} au ${format(parseISO(friday), 'd MMM', { locale: fr })}`;
}

/** Heures de cours d'une semaine, en minutes (les cours d'un seul jour). */
function weekMinutes(courses: CourseOnDay[]): number {
  return courses.reduce((sum, course) => {
    if (!course.endsAt || course.endsAt.slice(0, 10) !== course.startsAt.slice(0, 10)) return sum;
    return sum + Math.max(0, timeToMinutes(course.endsAt.slice(11, 16)) - timeToMinutes(course.startsAt.slice(11, 16)));
  }, 0);
}

/**
 * Emploi du temps : ta vraie semaine, lue dans l'agenda des cours de Google Agenda (reconnu tout seul),
 * de semaine en semaine. Un clic sur un cours l'ouvre : ses devoirs, « Ajouter un devoir ». La semaine
 * type saisie à la main a disparu (retours du 26/11/2026) : tout vient de Google.
 */
export function TimetablePage() {
  const today = useToday();
  const navigate = useNavigate();
  const openCourse = useGoogleEventSheet((state) => state.open);
  const [monday, setMonday] = useState(() => mondayOf(today));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { data: hasSchoolCalendar } = useHasSchoolCalendar();
  const { data: courses } = useCoursesBetween(monday, addDaysISO(monday, 7));
  if (hasSchoolCalendar === undefined || !courses) return null;

  const minutes = weekMinutes(courses);
  const thisWeek = monday === mondayOf(today);
  const subtitle = hasSchoolCalendar
    ? [`Semaine ${weekLabel(monday)}`, minutes > 0 ? `${formatDuration(minutes)} de cours` : null].filter(Boolean).join(' · ')
    : 'Ta semaine de cours, lue dans Google Agenda.';

  return (
    <Page
      title="Emploi du temps"
      subtitle={subtitle}
      actions={
        <>
          <Button variant="ghost" icon={CalendarRange} onClick={() => setCalendarOpen(true)}>
            Semestres et vacances
          </Button>
          {hasSchoolCalendar && (
            <div className="ml-2 flex items-center gap-1">
              <Button variant="ghost" icon={ChevronLeft} aria-label="Semaine précédente" title="Semaine précédente" onClick={() => setMonday(addDaysISO(monday, -7))} />
              <Button variant="secondary" disabled={thisWeek} onClick={() => setMonday(mondayOf(today))}>
                Cette semaine
              </Button>
              <Button variant="ghost" icon={ChevronRight} aria-label="Semaine suivante" title="Semaine suivante" onClick={() => setMonday(addDaysISO(monday, 7))} />
            </div>
          )}
        </>
      }
    >
      {!hasSchoolCalendar ? (
        <EmptyState icon={CalendarClock} title="Ton emploi du temps vient de Google Agenda">
          <p>
            Connecte Google Agenda dans Paramètres : l’agenda de ton emploi du temps (celui de l’intranet, relié par son lien iCal) est
            reconnu tout seul, et ta semaine s’affiche ici.
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => void navigate({ to: '/settings' })}>
              Ouvrir les paramètres
            </Button>
          </div>
        </EmptyState>
      ) : courses.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Pas de cours cette semaine">
          <p>Rien dans ton agenda des cours {weekLabel(monday)}.</p>
        </EmptyState>
      ) : (
        <CourseWeekGrid monday={monday} courses={courses} today={today} onOpen={openCourse} />
      )}

      <SchoolCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} />
    </Page>
  );
}
