import { Check } from 'lucide-react';
import { useState } from 'react';
import { addDaysISO } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { moduleIcon } from '@/domains/day/icons';
import { useHabitHistory, useHabits, useToggleHabit } from '../hooks';
import { doneDays, frequencyText, isScheduled, mondayOf, streak, streakText, successRate, type Habit } from '../model';
import { HabitDialog } from './HabitDialog';

const WEEKDAY_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Case ronde à la couleur de l'habitude : cocher ou décocher le jour donné. */
export function HabitCheck({ habit, done, day, size = 'md' }: { habit: Habit; done: boolean; day: string; size?: 'md' | 'sm' }) {
  const toggle = useToggleHabit();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Décocher « ${habit.name} »` : `Cocher « ${habit.name} »`}
      onClick={(event) => {
        event.stopPropagation();
        toggle.mutate({ habitId: habit.id, day, done: !done });
      }}
      className={`grid shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-[120ms] ease-soft ${size === 'md' ? 'size-[18px]' : 'size-4'} ${done ? 'check-pop' : 'border-line-strong hover:border-ink-3'}`}
      style={done ? { backgroundColor: `var(--p-${habit.color})`, borderColor: `var(--p-${habit.color})` } : undefined}
    >
      {done && <Check className="size-3 text-white" strokeWidth={3} />}
    </button>
  );
}

/** Les 7 jours de la semaine en cours : plein si fait, cerclé si encore attendu, pâle sinon. */
function WeekDots({ habit, done, today }: { habit: Habit; done: Set<string>; today: string }) {
  const monday = mondayOf(today);
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {WEEKDAY_SHORT.map((letter, index) => {
        const day = addDaysISO(monday, index);
        const isDone = done.has(day);
        const expected = habit.frequency !== 'weekly' && isScheduled(habit, day);
        return (
          <span
            key={day}
            title={letter}
            className={`size-2 rounded-full ${isDone ? '' : expected && day >= today ? 'ring-1 ring-line-strong ring-inset' : expected ? 'bg-danger/25' : 'bg-active'}`}
            style={isDone ? { backgroundColor: `var(--p-${habit.color})` } : undefined}
          />
        );
      })}
    </span>
  );
}

function HabitRow({ habit, done, today, onOpen }: { habit: Habit; done: Set<string>; today: string; onOpen: () => void }) {
  const Icon = moduleIcon(habit.icon);
  const series = streakText(streak(habit, done, today));
  const rate = successRate(habit, done, today);
  const week = habit.frequency === 'weekly' ? [...done].filter((d) => d >= mondayOf(today) && d <= today).length : null;
  return (
    <li className="-mx-2.5 grid min-h-12 grid-cols-[18px_minmax(0,1fr)_auto_120px_48px] items-center gap-4 rounded-md px-2.5 transition-colors duration-[120ms] ease-soft hover:bg-hover">
      <HabitCheck habit={habit} done={done.has(today)} day={today} />
      <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-2.5 text-left">
        <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
        <span className="truncate">{habit.name}</span>
        <span className="shrink-0 text-meta text-ink-3">
          {frequencyText(habit)}
          {week !== null && ` · ${week}/${habit.timesPerWeek} cette semaine`}
        </span>
      </button>
      <WeekDots habit={habit} done={done} today={today} />
      <span className="truncate text-right text-meta text-ink-2">{series ?? ''}</span>
      <span className="tnum text-right text-meta text-ink-3" title="Réussite sur les 30 derniers jours">
        {rate === null ? '' : `${Math.round(rate * 100)} %`}
      </span>
    </li>
  );
}

/** Les habitudes suivies : cocher aujourd'hui, la semaine en cours, la série, le taux sur 30 jours. */
export function HabitList({ onCreate }: { onCreate: () => void }) {
  const today = useToday();
  const { data: habits } = useHabits();
  const { data: activity } = useHabitHistory();
  // L'habitude ouverte reste connue pendant la fermeture de la fenêtre (pas de titre qui change).
  const [openId, setOpenId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (!habits || !activity) return null;
  const opened = habits.find((h) => h.id === openId);

  if (habits.length === 0) {
    return (
      <div className="py-2 text-ink-2">
        <p>Aucune habitude suivie pour l’instant.</p>
        <p className="mt-1 text-meta text-ink-3">
          Une habitude se coche chaque jour (ou quelques fois par semaine) ; liée à un module de la Journée, elle se coche toute seule quand le bloc est fait.
        </p>
        <button type="button" onClick={onCreate} className="mt-3 text-meta text-ink-2 transition-colors hover:text-ink">
          + Nouvelle habitude
        </button>
      </div>
    );
  }

  return (
    <>
      <ul>
        {habits.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            done={doneDays(habit, activity.logs, activity.doneBlocks)}
            today={today}
            onOpen={() => {
              setOpenId(habit.id);
              setOpen(true);
            }}
          />
        ))}
      </ul>
      {opened && <HabitDialog open={open} onOpenChange={setOpen} habit={opened} />}
    </>
  );
}
