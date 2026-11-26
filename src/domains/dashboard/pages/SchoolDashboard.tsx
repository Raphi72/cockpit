import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { GraduationCap, Plus, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { usePageShortcuts } from '@/app/shortcuts';
import { addDaysISO, timeToMinutes } from '@/core/dates';
import { useMinutesOfDay, useToday } from '@/core/use-today';
import { UPCOMING_AGENDA_DAYS, useAgenda } from '@/domains/agenda';
import { useExamEditor } from '@/domains/school/exams/components/ExamDialog';
import { countdownTone } from '@/domains/school/exams/components/ExamRow';
import { useExams } from '@/domains/school/exams/hooks';
import { examCountdown, examWhen, splitExams, type Exam } from '@/domains/school/exams/model';
import { usePeriods } from '@/domains/school/periods/hooks';
import { holidayOn } from '@/domains/school/periods/model';
import { useSubjects } from '@/domains/school/subjects/hooks';
import { useSlots } from '@/domains/school/timetable/hooks';
import { classesOn, slotRoom, type ClassOccurrence } from '@/domains/school/timetable/model';
import { useGoogleCourses, useGoogleEventSheet } from '@/domains/google/hooks';
import type { CourseOnDay } from '@/domains/google/repository';
import { DoneFold } from '@/domains/tasks/components/TaskGroups';
import { TaskList } from '@/domains/tasks/components/TaskList';
import { useDoneToday, useOpenTasks } from '@/domains/tasks/hooks';
import { ReviewBanner, TodayHabits } from '@/domains/habits/components/TodayHabits';
import { tasksOfMode, type TaskItem } from '@/domains/tasks/model';
import { useWorkPlanDialog } from '@/domains/tasks/work-plan-store';
import { ColorDot } from '@/ui/data/ColorDot';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { DayTitle } from '../components/DayTitle';
import { UpcomingDays } from '../components/UpcomingDays';
import { dayMarks, dayTasksHeading, upcomingWithTasks } from '../model';
import { homeworkForDay, schoolDaySummary, schoolUpcomingItems } from '../school-model';

function SectionHeading({ title, link }: { title: string; link?: { to: '/timetable' | '/homework' | '/exams'; label: string } }) {
  return (
    <div className="mb-1.5 flex items-baseline gap-2.5">
      <h2 className="font-semibold">{title}</h2>
      {link && (
        <Link to={link.to} className="ml-auto text-meta text-ink-3 hover:text-ink">
          {link.label} →
        </Link>
      )}
    </div>
  );
}

/**
 * Un cours du jour, qu'il vienne de l'emploi du temps (semaine type) ou de l'agenda des cours (Google) :
 * le second s'ouvre d'un clic (sa matière, ses devoirs, « Ajouter un devoir »).
 */
type CourseLine = {
  key: string;
  start: string;
  end: string;
  subjectId: string | null;
  subjectName: string;
  subjectColor: string;
  label: string | null;
  room: string | null;
  googleItemId: string | null;
};

function slotLine({ slot }: ClassOccurrence): CourseLine {
  return { key: `slot:${slot.id}`, start: slot.startsAt, end: slot.endsAt, subjectId: slot.subjectId, subjectName: slot.subjectName, subjectColor: slot.subjectColor, label: slot.label, room: slotRoom(slot), googleItemId: null };
}

function googleLine(course: CourseOnDay): CourseLine {
  const start = course.startsAt.slice(11, 16);
  return {
    key: `google:${course.itemId}`,
    start,
    end: course.endsAt?.slice(11, 16) ?? start,
    subjectId: course.subjectId,
    subjectName: course.subjectName ?? course.title,
    subjectColor: course.subjectColor ?? 'slate',
    label: course.subjectName && course.title !== course.subjectName ? course.title : null,
    room: course.location,
    googleItemId: course.itemId,
  };
}

/** Un cours de la journée ; aujourd'hui, celui en cours est mis en avant et ceux passés s'effacent. */
function ClassRow({ line, state }: { line: CourseLine; state: 'past' | 'now' | 'next' | 'later' }) {
  const openGoogle = useGoogleEventSheet((s) => s.open);
  const name = (
    <>
      <ColorDot color={line.subjectColor} />
      <span className="truncate">{line.subjectName}</span>
      {line.label && <span className="min-w-0 shrink truncate text-meta text-ink-3">{line.label}</span>}
    </>
  );
  return (
    <li className={`grid min-h-10 grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 ${state === 'past' ? 'text-ink-3' : ''}`}>
      <span className={`tnum text-meta ${state === 'past' ? '' : 'text-ink-2'}`}>
        {line.start} – {line.end}
      </span>
      {line.googleItemId ? (
        <button type="button" onClick={() => openGoogle(line.googleItemId!)} title="Ouvrir le cours : matière, devoirs" className="flex min-w-0 items-center gap-2.5 text-left hover:text-ink">
          {name}
        </button>
      ) : line.subjectId ? (
        <Link to="/subjects/$subjectId" params={{ subjectId: line.subjectId }} className="flex min-w-0 items-center gap-2.5 hover:text-ink">
          {name}
        </Link>
      ) : (
        <span className="flex min-w-0 items-center gap-2.5">{name}</span>
      )}
      <span className="flex items-center gap-3 text-meta text-ink-3">
        <span className="max-w-[140px] truncate">{line.room}</span>
        {state === 'now' && <span className="font-medium text-accent">En cours</span>}
        {state === 'next' && <span className="text-ink-2">Ensuite</span>}
      </span>
    </li>
  );
}

/** Les cours du jour affiché : la semaine type et l'agenda des cours. Redessiné chaque minute (cours en cours). */
function ClassesSection(props: { day: string; today: string; lines: CourseLine[]; holidayName: string | null; hasSlots: boolean }) {
  const minutes = useMinutesOfDay();
  const isToday = props.day === props.today;
  const current = isToday ? props.lines.find((line) => timeToMinutes(line.end) > minutes) : undefined;
  const stateOf = (line: CourseLine) => {
    if (!isToday) return 'later' as const;
    if (timeToMinutes(line.end) <= minutes) return 'past' as const;
    if (current === line) return timeToMinutes(line.start) <= minutes ? ('now' as const) : ('next' as const);
    return 'later' as const;
  };
  const heading = isToday ? 'Cours du jour' : `Cours · ${dayTasksHeading(props.day, props.today).toLowerCase()}`;

  return (
    <section>
      <SectionHeading title={heading} link={{ to: '/timetable', label: 'Emploi du temps' }} />
      {props.holidayName ? (
        <p className="py-2 text-ink-3">{props.holidayName} : pas de cours.</p>
      ) : !props.hasSlots && props.lines.length === 0 ? (
        <p className="py-2 text-ink-3">
          Ton emploi du temps est vide.{' '}
          <Link to="/timetable" className="text-accent">
            Le remplir
          </Link>
          , ou marque ton agenda des cours dans Paramètres › Google Agenda.
        </p>
      ) : props.lines.length === 0 ? (
        <p className="py-2 text-ink-3">Pas de cours ce jour-là.</p>
      ) : (
        <ul>
          {props.lines.map((line) => (
            <ClassRow key={line.key} line={line} state={stateOf(line)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HomeworkSection(props: { day: string; today: string; homework: TaskItem[]; doneToday: TaskItem[] }) {
  const openPlan = useWorkPlanDialog((state) => state.openPlan);
  const openCreate = useCreateStore((state) => state.openCreate);
  const isToday = props.day === props.today;
  return (
    <section>
      <div className="mb-1 flex items-baseline gap-2.5">
        <h2 className="font-semibold">Devoirs à rendre</h2>
        {isToday && (
          <button
            type="button"
            onClick={openPlan}
            title="Composer le programme d’aujourd’hui · P"
            className="ml-auto flex items-center gap-1.5 text-meta text-ink-2 transition-colors hover:text-ink"
          >
            <Timer className="size-3.5" strokeWidth={1.75} />
            Je veux travailler…
          </button>
        )}
        <Link to="/homework" className={`${isToday ? 'ml-4' : 'ml-auto'} text-meta text-ink-3 hover:text-ink`}>
          Tous les devoirs →
        </Link>
      </div>
      {props.homework.length === 0 ? (
        <p className="py-2 text-ink-3">Rien à rendre cette semaine.</p>
      ) : (
        <TaskList tasks={props.homework} today={props.today} />
      )}
      {isToday && <DoneFold tasks={props.doneToday} today={props.today} />}
      <button
        type="button"
        onClick={() => openCreate('homework', {})}
        className="mt-1 flex h-9 items-center gap-2 text-meta text-ink-3 transition-colors hover:text-ink"
      >
        <Plus className="size-3.5" strokeWidth={2} />
        Ajouter un devoir
      </button>
    </section>
  );
}

/** Le prochain examen, bien visible, puis les deux suivants en une ligne chacun. */
function NextExamSection({ exams, today }: { exams: Exam[]; today: string }) {
  const openExam = useExamEditor((state) => state.openExam);
  const openCreate = useCreateStore((state) => state.openCreate);
  const { upcoming } = splitExams(exams, today);
  const [next, ...others] = upcoming;
  return (
    <section>
      <SectionHeading title="Prochain examen" link={{ to: '/exams', label: 'Tous' }} />
      {!next ? (
        <p className="py-2 text-ink-3">
          Aucun examen prévu.{' '}
          <button type="button" onClick={() => openCreate('exam')} className="text-accent">
            En ajouter un
          </button>
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => openExam(next.id)}
            className="-mx-2.5 block w-[calc(100%+20px)] rounded-md px-2.5 py-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[15px] font-medium">{next.title}</span>
              <span className={`shrink-0 text-meta font-medium ${countdownTone(next, today)}`}>{examCountdown(next, today)}</span>
            </span>
            <span className="mt-1 flex items-center gap-2 text-meta text-ink-2">
              <ColorDot color={next.subjectColor} />
              {next.subjectName}
            </span>
            <span className="mt-0.5 block text-meta text-ink-3">{examWhen(next)}</span>
            {next.notes && <span className="mt-1.5 line-clamp-2 block text-meta text-ink-2">{next.notes}</span>}
          </button>
          {others.slice(0, 2).map((exam) => (
            <button
              key={exam.id}
              type="button"
              onClick={() => openExam(exam.id)}
              className="-mx-2.5 grid min-h-9 w-[calc(100%+20px)] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2.5 text-left text-meta transition-colors duration-[120ms] ease-soft hover:bg-hover"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ColorDot color={exam.subjectColor} />
                <span className="truncate text-ink-2">{exam.title}</span>
              </span>
              <span className="text-ink-3">{examCountdown(exam, today)}</span>
            </button>
          ))}
        </>
      )}
    </section>
  );
}

/** Aujourd’hui en mode Cours : la journée de cours (P13). Deux colonnes, comme en mode Travail. */
export function SchoolDashboard() {
  const today = useToday();
  const search = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  const day = search.day ?? today;
  const openCreate = useCreateStore((state) => state.openCreate);
  const openPlan = useWorkPlanDialog((state) => state.openPlan);
  const [pickerOpen, setPickerOpen] = useState(false);
  const agendaRange = useMemo(() => ({ from: today, to: addDaysISO(today, UPCOMING_AGENDA_DAYS) }), [today]);

  const { data: subjects } = useSubjects();
  const { data: slots } = useSlots();
  const { data: periods } = usePeriods();
  const { data: exams } = useExams();
  const { data: allOpen } = useOpenTasks();
  const doneToday = tasksOfMode(useDoneToday(today).data ?? [], 'school');
  const { data: agenda } = useAgenda(agendaRange);
  const { data: googleCourses = [] } = useGoogleCourses(day);

  const goTo = (next: string) => void navigate({ search: next === today ? {} : { day: next } });
  usePageShortcuts({
    arrowleft: () => goTo(addDaysISO(day, -1)),
    arrowright: () => goTo(addDaysISO(day, 1)),
    t: () => goTo(today),
    d: () => setPickerOpen(true),
    p: openPlan,
  });

  if (!subjects || !slots || !periods || !exams || !allOpen || !agenda) return null;

  const open = tasksOfMode(allOpen, 'school');
  const holiday = holidayOn(periods, day);
  // Les cours du jour : la semaine type (hors vacances), et l'agenda des cours de Google.
  const lines = [...(holiday ? [] : classesOn(slots, periods, day).map(slotLine)), ...googleCourses.map(googleLine)].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const homework = homeworkForDay(open, day, today);
  const title = (
    <DayTitle
      day={day}
      today={today}
      marks={dayMarks({ projects: [], tasks: open })}
      onGo={goTo}
      pickerOpen={pickerOpen}
      onPickerOpenChange={setPickerOpen}
    />
  );

  if (subjects.length === 0) {
    return (
      <Page title={title} subtitle="Rien de prévu pour l’instant.">
        <TodayHabits today={today} className="mb-10" />
        <EmptyState icon={GraduationCap} title="Ton espace Cours commence par tes matières">
          <p>Ensuite, ton emploi du temps, tes devoirs et tes examens : cette page te montrera ta journée de cours.</p>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" icon={Plus} onClick={() => openCreate('subject')}>
              Ajouter une matière
            </Button>
          </div>
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page
      title={title}
      subtitle={schoolDaySummary({ day, today, classes: lines.length, holidayName: holiday?.name ?? null, homework })}
      actions={
        day !== today && (
          <Button variant="secondary" shortcut="T" onClick={() => goTo(today)}>
            Aujourd’hui
          </Button>
        )
      }
    >
      {day === today && (
        <>
          <ReviewBanner today={today} className="mb-10" />
          <TodayHabits today={today} className="mb-12" />
        </>
      )}
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] items-start gap-x-18">
        <div className="min-w-0">
          <ClassesSection day={day} today={today} lines={lines} holidayName={holiday?.name ?? null} hasSlots={slots.length > 0} />
          <div className="mt-14">
            <HomeworkSection day={day} today={today} homework={homework} doneToday={doneToday} />
          </div>
        </div>

        <div className="min-w-0">
          <NextExamSection exams={exams} today={today} />
          <div className="mt-12">
            <UpcomingDays
              days={upcomingWithTasks(schoolUpcomingItems(agenda), open, today, day)}
              today={today}
              showAmounts={false}
              onShowDay={goTo}
            />
          </div>
        </div>
      </div>
    </Page>
  );
}
