import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { FileCheck, NotebookPen, Repeat, Sunrise, type LucideIcon } from 'lucide-react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useUiStore } from '@/app/ui-store';
import { addDaysISO, todayISO } from '@/core/dates';
import { useMinutesOfDay } from '@/core/use-today';
import { useAgenda } from '@/domains/agenda';
import { moduleIcon } from '@/domains/day/icons';
import { toMinutes, formatMinutes } from '@/domains/day/model';
import { useHabitHistory, useHabits } from '@/domains/habits/hooks';
import { doneDays, isScheduled, weekProgress } from '@/domains/habits/model';
import { useExams } from '@/domains/school/exams/hooks';
import { examCountdown, splitExams } from '@/domains/school/exams/model';
import { usePeriods } from '@/domains/school/periods/hooks';
import { useSlots } from '@/domains/school/timetable/hooks';
import { classesOn } from '@/domains/school/timetable/model';
import { useOpenTasks } from '@/domains/tasks/hooks';
import { isHomework, selectToday, tasksOfMode } from '@/domains/tasks/model';
import { useSaveSetting, useSetting } from '@/domains/settings/hooks';
import { SETTINGS } from '@/domains/settings/model';
import { transitionFor } from '@/ui/motion/presets';
import { Button } from '@/ui/primitives/Button';
import { useTodayBlocks } from '../hooks';
import { morningSentence, shouldShowMorning } from '../model';
import { useCompanion } from '../store';

function Line({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[20px_120px_minmax(0,1fr)] items-baseline gap-3">
      <Icon className="size-4 translate-y-0.5 text-ink-3" strokeWidth={1.75} />
      <span className="text-ink-3">{label}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** Le contenu : la journée en une phrase, le premier bloc, le devoir du jour, l'examen proche, les habitudes. */
function MorningContent({ onClose }: { onClose: () => void }) {
  const mode = useUiStore((state) => state.mode);
  const minutes = useMinutesOfDay();
  const { today, blocks = [] } = useTodayBlocks();
  const agendaRange = useMemo(() => ({ from: today, to: addDaysISO(today, 1) }), [today]);
  const { data: agenda = [] } = useAgenda(agendaRange);
  const { data: open = [] } = useOpenTasks();
  const { data: slots = [] } = useSlots();
  const { data: periods = [] } = usePeriods();
  const { data: exams = [] } = useExams();
  const { data: habits = [] } = useHabits();
  const { data: activity } = useHabitHistory();
  const disable = useSaveSetting(SETTINGS.morningScreen);

  const groups = selectToday(tasksOfMode(open, mode), today);
  const classes = mode === 'school' ? classesOn(slots, periods, today) : [];
  const events = agenda.filter((item) => item.source === 'event' || (item.source === 'google' && item.kind !== 'class'));
  const googleCourses = mode === 'school' ? agenda.filter((item) => item.source === 'google' && item.kind === 'class') : [];
  const sentence = morningSentence({ blocks: blocks.length, classes: classes.length + googleCourses.length, events: events.length, tasks: groups.overdue.length + groups.today.length });
  const firstBlock = [...blocks].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).find((b) => toMinutes(b.endsAt) > minutes);
  const homework = open
    .filter((t) => isHomework(t) && t.dueDate !== null && t.dueDate <= addDaysISO(today, 1))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))[0];
  const exam = splitExams(exams, today).upcoming.find((e) => e.date <= addDaysISO(today, 7));
  const habitsToKeep = activity
    ? habits.filter((habit) => {
        const done = doneDays(habit, activity.logs, activity.doneBlocks);
        if (done.has(today)) return false;
        if (habit.frequency === 'weekly') {
          const week = weekProgress(habit, done, today);
          return week.done < week.target;
        }
        return isScheduled(habit, today);
      })
    : [];

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center px-8">
      <p className="flex items-center gap-2 text-ink-3">
        <Sunrise className="size-4" strokeWidth={1.75} />
        Bonjour
      </p>
      <h1 className="mt-2 text-[34px] font-semibold tracking-tight first-letter:uppercase">
        {format(new Date(`${today}T12:00:00`), 'EEEE d MMMM', { locale: fr })}
      </h1>
      <p className="mt-3 text-lg text-ink-2">{sentence}</p>
      <ul className="mt-10 flex flex-col gap-3.5">
        {firstBlock && (
          <Line icon={moduleIcon(firstBlock.icon)} label={toMinutes(firstBlock.startsAt) <= minutes ? 'En ce moment' : 'Premier bloc'}>
            {firstBlock.title}{' '}
            <span className="tnum text-ink-3">
              {firstBlock.startsAt} – {firstBlock.endsAt} · {formatMinutes(toMinutes(firstBlock.endsAt) - toMinutes(firstBlock.startsAt))}
            </span>
          </Line>
        )}
        {homework && (
          <Line icon={NotebookPen} label="Devoir">
            {homework.title}{' '}
            <span className="text-ink-3">
              {homework.dueDate! < today ? 'en retard' : homework.dueDate === today ? 'pour aujourd’hui' : 'pour demain'}
            </span>
          </Line>
        )}
        {exam && (
          <Line icon={FileCheck} label="Examen">
            {exam.subjectName} · {exam.title} <span className="text-ink-3">{examCountdown(exam, today)}</span>
          </Line>
        )}
        {habitsToKeep.length > 0 && (
          <Line icon={Repeat} label={habitsToKeep.length > 1 ? 'Habitudes' : 'Habitude'}>
            {habitsToKeep.map((h) => h.name).join(', ')}
          </Line>
        )}
      </ul>
      <div className="mt-12 flex items-center gap-5">
        <Button variant="primary" size="lg" autoFocus shortcut="Entrée" onClick={onClose}>
          Commencer la journée
        </Button>
        <button
          type="button"
          onClick={() => {
            disable.mutate(false);
            onClose();
          }}
          className="text-meta text-ink-3 transition-colors hover:text-ink"
        >
          Ne plus afficher le matin
        </button>
      </div>
    </div>
  );
}

/**
 * L'écran du matin (P21) : à la première ouverture du jour, avant midi, un écran calme par-dessus tout.
 * Entrée, Échap ou Espace le ferment. Il ne revient pas avant le lendemain.
 */
export function MorningScreen() {
  const open = useCompanion((state) => state.morningOpen);
  const setOpen = useCompanion((state) => state.setMorningOpen);
  const { data: enabled } = useSetting(SETTINGS.morningScreen);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (enabled === undefined) return;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const now = new Date();
      const today = todayISO();
      const ui = useUiStore.getState();
      if (shouldShowMorning({ enabled, lastShown: ui.morningShown, today, minutes: now.getHours() * 60 + now.getMinutes() })) {
        ui.markMorningShown(today);
        setOpen(true);
      }
    };
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [enabled, setOpen]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          role="dialog"
          aria-modal="true"
          aria-label="Écran du matin"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transitionFor('screen', reduced)}
          className="fixed inset-0 z-[70] bg-canvas"
        >
          <MorningContent onClose={() => setOpen(false)} />
        </m.div>
      )}
    </AnimatePresence>
  );
}
