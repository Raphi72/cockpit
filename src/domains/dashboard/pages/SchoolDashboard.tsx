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
import { useRevisionSession } from '@/domains/school/flashcards/components/RevisionSession';
import { useFlashcards } from '@/domains/school/flashcards/hooks';
import { dueSummary, isNew, todayQueue } from '@/domains/school/flashcards/model';
import { examCountdown, examWhen, splitExams, type Exam } from '@/domains/school/exams/model';
import { usePeriods } from '@/domains/school/periods/hooks';
import { holidayOn } from '@/domains/school/periods/model';
import { useSubjects } from '@/domains/school/subjects/hooks';
import { useSlots } from '@/domains/school/timetable/hooks';
import { classesOn, currentOrNextClass, slotRoom, type ClassOccurrence } from '@/domains/school/timetable/model';
import { DoneFold } from '@/domains/tasks/components/TaskGroups';
import { TaskList } from '@/domains/tasks/components/TaskList';
import { useDoneToday, useOpenTasks } from '@/domains/tasks/hooks';
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

function SectionHeading({ title, link }: { title: string; link?: { to: '/timetable' | '/homework' | '/exams' | '/revisions'; label: string } }) {
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

/** Un cours de la journée ; aujourd'hui, celui en cours est mis en avant et ceux passés s'effacent. */
function ClassRow({ occurrence, state }: { occurrence: ClassOccurrence; state: 'past' | 'now' | 'next' | 'later' }) {
  const { slot } = occurrence;
  const room = slotRoom(slot);
  return (
    <li className={`grid min-h-10 grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 ${state === 'past' ? 'text-ink-3' : ''}`}>
      <span className={`tnum text-meta ${state === 'past' ? '' : 'text-ink-2'}`}>
        {slot.startsAt} – {slot.endsAt}
      </span>
      <Link to="/subjects/$subjectId" params={{ subjectId: slot.subjectId }} className="flex min-w-0 items-center gap-2.5 hover:text-ink">
        <ColorDot color={slot.subjectColor} />
        <span className="truncate">{slot.subjectName}</span>
        {slot.label && <span className="shrink-0 text-meta text-ink-3">{slot.label}</span>}
      </Link>
      <span className="flex items-center gap-3 text-meta text-ink-3">
        {room}
        {state === 'now' && <span className="font-medium text-accent">En cours</span>}
        {state === 'next' && <span className="text-ink-2">Ensuite</span>}
      </span>
    </li>
  );
}

/** Les cours du jour affiché, calculés depuis la semaine type. Redessiné chaque minute (cours en cours). */
function ClassesSection(props: { day: string; today: string; classes: ClassOccurrence[]; holidayName: string | null; hasSlots: boolean }) {
  const minutes = useMinutesOfDay();
  const isToday = props.day === props.today;
  const current = isToday ? currentOrNextClass(props.classes, minutes) : null;
  const stateOf = (occurrence: ClassOccurrence) => {
    if (!isToday) return 'later' as const;
    if (timeToMinutes(occurrence.slot.endsAt) <= minutes) return 'past' as const;
    if (current?.occurrence === occurrence) return current.now ? ('now' as const) : ('next' as const);
    return 'later' as const;
  };
  const heading = isToday ? 'Cours du jour' : `Cours · ${dayTasksHeading(props.day, props.today).toLowerCase()}`;

  return (
    <section>
      <SectionHeading title={heading} link={{ to: '/timetable', label: 'Emploi du temps' }} />
      {props.holidayName ? (
        <p className="py-2 text-ink-3">{props.holidayName} : pas de cours.</p>
      ) : !props.hasSlots ? (
        <p className="py-2 text-ink-3">
          Ton emploi du temps est vide.{' '}
          <Link to="/timetable" className="text-accent">
            Le remplir
          </Link>
        </p>
      ) : props.classes.length === 0 ? (
        <p className="py-2 text-ink-3">Pas de cours ce jour-là.</p>
      ) : (
        <ul>
          {props.classes.map((occurrence) => (
            <ClassRow key={occurrence.slot.id} occurrence={occurrence} state={stateOf(occurrence)} />
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

/** Les flashcards du jour : combien à revoir (dont nouvelles), et une session d'un clic. Rien sans cartes. */
function DueCardsSection({ today }: { today: string }) {
  const { data: cards = [] } = useFlashcards();
  const start = useRevisionSession((state) => state.start);
  if (cards.length === 0) return null;
  const queue = todayQueue(cards, today);
  const fresh = queue.filter(isNew).length;
  return (
    <section className="mt-12">
      <SectionHeading title="Cartes à revoir" link={{ to: '/revisions', label: 'Révisions' }} />
      <div className="flex items-center gap-3 py-1">
        <span className="text-ink-2">
          {dueSummary(queue.length)}
          {fresh > 0 && <span className="text-ink-3"> · dont {fresh} nouvelle{fresh > 1 ? 's' : ''}</span>}
        </span>
        {queue.length > 0 && (
          <Button variant="secondary" className="ml-auto" onClick={() => start(queue, 'Révision du jour')}>
            Réviser
          </Button>
        )}
      </div>
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
  const classes = classesOn(slots, periods, day);
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
      subtitle={schoolDaySummary({ day, today, classes: classes.length, holidayName: holiday?.name ?? null, homework })}
      actions={
        day !== today && (
          <Button variant="secondary" shortcut="T" onClick={() => goTo(today)}>
            Aujourd’hui
          </Button>
        )
      }
    >
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] items-start gap-x-18">
        <div className="min-w-0">
          <ClassesSection day={day} today={today} classes={classes} holidayName={holiday?.name ?? null} hasSlots={slots.length > 0} />
          <div className="mt-14">
            <HomeworkSection day={day} today={today} homework={homework} doneToday={doneToday} />
          </div>
        </div>

        <div className="min-w-0">
          <NextExamSection exams={exams} today={today} />
          <DueCardsSection today={today} />
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
