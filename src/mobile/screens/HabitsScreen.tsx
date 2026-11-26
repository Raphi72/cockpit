import { useToday } from '@/core/use-today';
import { moduleIcon } from '@/domains/day/icons';
import { HabitCheck } from '@/domains/habits/components/HabitList';
import { useHabitHistory, useHabits } from '@/domains/habits/hooks';
import { doneDays, frequencyText, streak, streakText } from '@/domains/habits/model';
import { ScreenHeader } from './parts';

/** Les habitudes : cocher celle du jour, voir sa série. Elles se créent et se règlent sur le PC. */
export function HabitsScreen() {
  const today = useToday();
  const { data: habits } = useHabits();
  const { data: activity } = useHabitHistory();
  if (!habits || !activity) return null;
  return (
    <>
      <ScreenHeader title="Habitudes" />
      {habits.length === 0 ? (
        <p className="px-5 text-ink-3">Aucune habitude suivie : elles se créent dans la page Habitudes du PC.</p>
      ) : (
        <ul className="px-5">
          {habits.map((habit) => {
            const done = doneDays(habit, activity.logs, activity.doneBlocks);
            const Icon = moduleIcon(habit.icon);
            const series = streakText(streak(habit, done, today));
            return (
              <li key={habit.id} className="flex min-h-14 items-center gap-3.5 border-b border-line/60 py-2">
                <HabitCheck habit={habit} done={done.has(today)} day={today} />
                <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{habit.name}</span>
                  <span className="block text-meta text-ink-3">{[frequencyText(habit), series].filter(Boolean).join(' · ')}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
