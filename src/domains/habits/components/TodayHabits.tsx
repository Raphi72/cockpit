import { Link } from '@tanstack/react-router';
import { Check, X } from 'lucide-react';
import { useUiStore } from '@/app/ui-store';
import { moduleIcon } from '@/domains/day/icons';
import { useHabitHistory, useHabits, useToggleHabit } from '../hooks';
import { doneDays, isoWeekday, isScheduled, mondayOf, weekProgress, type Habit } from '../model';

/** Une habitude du jour : une pastille qu'on coche d'un clic, pleine de sa couleur une fois faite. */
function HabitPill({ habit, done, today, note }: { habit: Habit; done: boolean; today: string; note: string | null }) {
  const toggle = useToggleHabit();
  const Icon = done ? Check : moduleIcon(habit.icon);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      onClick={() => toggle.mutate({ habitId: habit.id, day: today, done: !done })}
      title={done ? 'Fait aujourd’hui · cliquer pour décocher' : 'Cliquer quand c’est fait'}
      className={`flex h-8 items-center gap-2 rounded-full border px-3 text-meta transition-colors duration-[120ms] ease-soft ${done ? 'border-transparent text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink'}`}
      style={done ? { backgroundColor: `color-mix(in srgb, var(--p-${habit.color}) 22%, transparent)` } : undefined}
    >
      <Icon className="size-3.5" strokeWidth={done ? 2.5 : 1.75} style={{ color: `var(--p-${habit.color})` }} />
      <span className={done ? 'font-medium' : ''}>{habit.name}</span>
      {note && <span className="tnum text-ink-3">{note}</span>}
    </button>
  );
}

/**
 * Les habitudes du jour sur Aujourd'hui (les deux modes) : celles prévues ce jour, et celles « X fois par
 * semaine » pas encore tenues (ou cochées aujourd'hui). Rien quand aucune habitude n'est suivie.
 */
export function TodayHabits({ today, className = '' }: { today: string; className?: string }) {
  const { data: habits } = useHabits();
  const { data: activity } = useHabitHistory();
  if (!habits || !activity || habits.length === 0) return null;
  const items = habits.flatMap((habit): { habit: Habit; done: boolean; note: string | null }[] => {
    const done = doneDays(habit, activity.logs, activity.doneBlocks);
    const doneToday = done.has(today);
    if (habit.frequency === 'weekly') {
      const week = weekProgress(habit, done, today);
      if (week.done >= week.target && !doneToday) return [];
      return [{ habit, done: doneToday, note: `${week.done}/${week.target}` }];
    }
    if (!isScheduled(habit, today) && !doneToday) return [];
    return [{ habit, done: doneToday, note: null }];
  });
  if (items.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {items.map(({ habit, done, note }) => (
        <HabitPill key={habit.id} habit={habit} done={done} today={today} note={note} />
      ))}
      <Link to="/habits" className="ml-1 text-meta text-ink-3 hover:text-ink">
        Habitudes →
      </Link>
    </div>
  );
}

/** Le dimanche, un bandeau propose la revue de la semaine ; fermé, il ne revient que la semaine suivante. */
export function ReviewBanner({ today, className = '' }: { today: string; className?: string }) {
  const dismissed = useUiStore((state) => state.reviewDismissed);
  const dismiss = useUiStore((state) => state.dismissReview);
  const monday = mondayOf(today);
  if (isoWeekday(today) !== 7 || dismissed === monday) return null;
  return (
    <div className={`flex items-center gap-4 rounded-lg bg-hover px-4 py-3 ${className}`}>
      <span className="text-ink-2">C’est dimanche : ta revue de la semaine est prête.</span>
      <Link to="/habits" search={{ tab: 'review' }} className="font-medium hover:underline">
        Voir la revue
      </Link>
      <button
        type="button"
        onClick={() => dismiss(monday)}
        aria-label="Fermer jusqu’à la semaine prochaine"
        title="Fermer jusqu’à la semaine prochaine"
        className="ml-auto grid size-6 place-items-center rounded text-ink-3 hover:text-ink"
      >
        <X className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
