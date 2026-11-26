import { useNavigate, useSearch } from '@tanstack/react-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Dumbbell, Plus } from 'lucide-react';
import { useState } from 'react';
import { usePageShortcuts } from '@/app/shortcuts';
import { addDaysISO, formatShortDate } from '@/core/dates';
import { formatMoney } from '@/core/money';
import { useToday } from '@/core/use-today';
import { formatMinutes } from '@/domains/day/model';
import { ProgressBar } from '@/ui/data/ProgressBar';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { SegmentedTabs } from '@/ui/primitives/SegmentedTabs';
import { GoalDialog } from '../components/GoalDialog';
import { HabitDialog } from '../components/HabitDialog';
import { HabitList } from '../components/HabitList';
import { useWorkoutEditor } from '../components/WorkoutDialog';
import { useExercises, useGoals, useWeekReview, useWorkouts } from '../hooks';
import {
  FEELINGS,
  exerciseProgress,
  goalProgress,
  mondayOf,
  reviewSentence,
  setsSummary,
  weekLabel,
  type Exercise,
  type Goal,
  type Workout,
} from '../model';
import type { HabitsTab } from '../search';

const day = (iso: string) => new Date(`${iso}T12:00:00`);

// ─── Habitudes et objectifs ─────────────────────────────────────────────────

function GoalRow({ goal, today, onOpen }: { goal: Goal; today: string; onOpen: () => void }) {
  const progress = goalProgress(goal);
  const late = !goal.achievedAt && goal.dueDate !== null && goal.dueDate < today;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="-mx-2.5 grid min-h-12 w-[calc(100%+20px)] grid-cols-[minmax(0,1fr)_200px_110px] items-center gap-6 rounded-md px-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover"
      >
        <span className={`truncate ${goal.achievedAt ? 'text-ink-3' : ''}`}>{goal.title}</span>
        <span>
          {progress ? (
            <ProgressBar percent={Math.round(progress.ratio * 100)} tone={progress.ratio === 1 ? 'success' : 'default'} />
          ) : (
            <span className="text-meta text-ink-3">Sans étape</span>
          )}
        </span>
        <span className={`text-right text-meta ${late ? 'text-danger' : 'text-ink-3'}`}>
          {goal.achievedAt ? 'Atteint' : goal.dueDate ? `Pour ${formatShortDate(goal.dueDate, today)}` : ''}
        </span>
      </button>
    </li>
  );
}

function GoalList({ onOpen }: { onOpen: (id: string) => void }) {
  const today = useToday();
  const { data: goals } = useGoals();
  const [showAchieved, setShowAchieved] = useState(false);
  if (!goals) return null;
  const current = goals.filter((g) => !g.achievedAt);
  const achieved = goals.filter((g) => g.achievedAt);
  if (goals.length === 0) {
    return <p className="text-ink-3">Aucun objectif. Un objectif se découpe en étapes, et une habitude peut le servir.</p>;
  }
  return (
    <>
      {current.length === 0 && <p className="text-ink-3">Tous tes objectifs sont atteints.</p>}
      <ul>
        {current.map((goal) => (
          <GoalRow key={goal.id} goal={goal} today={today} onOpen={() => onOpen(goal.id)} />
        ))}
      </ul>
      {achieved.length > 0 && (
        <>
          <button type="button" onClick={() => setShowAchieved((v) => !v)} className="mt-3 text-meta text-ink-3 transition-colors hover:text-ink">
            {showAchieved ? 'Masquer' : 'Voir'} les objectifs atteints ({achieved.length})
          </button>
          {showAchieved && (
            <ul className="mt-1">
              {achieved.map((goal) => (
                <GoalRow key={goal.id} goal={goal} today={today} onOpen={() => onOpen(goal.id)} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function HabitsTabView({ onNewHabit }: { onNewHabit: () => void }) {
  const [goalId, setGoalId] = useState<string | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const openGoal = (id: string | null) => {
    setGoalId(id);
    setGoalOpen(true);
  };
  return (
    <>
      <section className="mb-16">
        <HabitList onCreate={onNewHabit} />
      </section>
      <section>
        <div className="mb-3.5 flex items-baseline gap-2.5">
          <h2 className="font-semibold">Objectifs</h2>
          <button type="button" onClick={() => openGoal(null)} className="ml-auto text-meta text-ink-3 transition-colors hover:text-ink">
            + Nouvel objectif
          </button>
        </div>
        <GoalList onOpen={openGoal} />
      </section>
      <GoalDialog open={goalOpen} onOpenChange={setGoalOpen} goalId={goalId} />
    </>
  );
}

// ─── Séances ────────────────────────────────────────────────────────────────

const decimal = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');

/** La courbe d'un exercice : son meilleur résultat de chaque séance. */
function Sparkline({ points }: { points: { date: string; value: number }[] }) {
  const width = 560;
  const height = 96;
  const pad = 6;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (points.length === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (points.length - 1));
  const y = (v: number) => (max === min ? height / 2 : height - pad - ((v - min) * (height - 2 * pad)) / (max - min));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full max-w-[560px] overflow-visible" role="img" aria-label="Progression">
      <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={`${p.date}-${i}`} cx={x(i)} cy={y(p.value)} r={3} fill="var(--bg)" stroke="var(--accent)" strokeWidth={1.5}>
          <title>{`${format(day(p.date), 'd MMM', { locale: fr })} : ${decimal(p.value)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function ExerciseProgressView({ workouts, exercises }: { workouts: Workout[]; exercises: Exercise[] }) {
  const tracked = exercises.filter((e) => exerciseProgress(workouts, e).length > 0);
  const [selected, setSelected] = useState<string | null>(null);
  const exercise = tracked.find((e) => e.id === selected) ?? tracked[0];
  if (!exercise) return null;
  const points = exerciseProgress(workouts, exercise);
  const last = points[points.length - 1];
  if (!last) return null;
  const sets = workouts.flatMap((w) => w.sets.filter((s) => s.exerciseId === exercise.id));
  const weighted = sets.some((s) => s.weightKg !== null);
  const unit = exercise.kind === 'strength' ? (weighted ? 'kg' : 'répét.') : sets.some((s) => s.distanceKm !== null) ? 'km' : 'min';
  const best = Math.max(...points.map((p) => p.value));
  return (
    <section className="mt-16">
      <h2 className="mb-3.5 font-semibold">Progression</h2>
      {tracked.length > 1 && (
        <div className="mb-4">
          <ChoiceChips label="Exercice" options={tracked.map((e) => ({ value: e.id, label: e.name }))} value={exercise.id} onChange={setSelected} />
        </div>
      )}
      <p className="mb-3 text-meta text-ink-2">
        {exercise.name} · dernière séance <span className="tnum text-ink">{decimal(last.value)} {unit}</span> · record{' '}
        <span className="tnum text-ink">{decimal(best)} {unit}</span>
        {exercise.kind === 'strength' && <span className="text-ink-3">{weighted ? ' (charge la plus lourde)' : ' (le plus de répétitions)'}</span>}
      </p>
      {points.length > 1 ? <Sparkline points={points} /> : <p className="text-meta text-ink-3">La courbe apparaît à partir de la deuxième séance.</p>}
    </section>
  );
}

function WorkoutRow({ workout, exercises, today, onOpen }: { workout: Workout; exercises: Exercise[]; today: string; onOpen: () => void }) {
  const ids = [...new Set(workout.sets.map((s) => s.exerciseId))];
  const summary = ids
    .map((id) => {
      const exercise = exercises.find((e) => e.id === id);
      if (!exercise) return null;
      return `${exercise.name} ${setsSummary(workout.sets.filter((s) => s.exerciseId === id), exercise.kind)}`;
    })
    .filter(Boolean)
    .join(' · ');
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="-mx-2.5 grid min-h-12 w-[calc(100%+20px)] grid-cols-[120px_minmax(0,1fr)_96px] items-center gap-6 rounded-md px-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover"
      >
        <span className="text-meta text-ink-2">{formatShortDate(workout.date, today)}</span>
        <span className="truncate">{summary || workout.notes || 'Séance'}</span>
        <span className="text-right text-meta text-ink-3">{workout.feeling ? FEELINGS[workout.feeling - 1] : ''}</span>
      </button>
    </li>
  );
}

/** Au-delà, les séances plus anciennes se déplient à la demande. */
const VISIBLE_WORKOUTS = 8;

function WorkoutsTabView() {
  const today = useToday();
  const openWorkout = useWorkoutEditor((state) => state.openWorkout);
  const { data: workouts } = useWorkouts();
  const { data: exercises } = useExercises();
  const [all, setAll] = useState(false);
  if (!workouts || !exercises) return null;
  if (workouts.length === 0) {
    return (
      <EmptyState icon={Dumbbell} title="Aucune séance notée">
        <p>Note tes séances de muscu (séries, répétitions, charge) ou de cardio (durée, distance), avec ton ressenti : la courbe de chaque exercice se dessine au fil des séances.</p>
        <p className="mt-1">Depuis la Journée, un bloc Sport propose aussi « Noter la séance ».</p>
      </EmptyState>
    );
  }
  const visible = all ? workouts : workouts.slice(0, VISIBLE_WORKOUTS);
  return (
    <>
      <ul>
        {visible.map((workout) => (
          <WorkoutRow key={workout.id} workout={workout} exercises={exercises} today={today} onOpen={() => openWorkout({ workoutId: workout.id })} />
        ))}
      </ul>
      {workouts.length > visible.length && (
        <button type="button" onClick={() => setAll(true)} className="mt-2 text-meta text-ink-3 transition-colors hover:text-ink">
          {workouts.length - visible.length} séance{workouts.length - visible.length > 1 ? 's' : ''} plus ancienne{workouts.length - visible.length > 1 ? 's' : ''}
        </button>
      )}
      <ExerciseProgressView workouts={workouts} exercises={exercises} />
    </>
  );
}

// ─── Revue de la semaine ────────────────────────────────────────────────────

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-meta text-ink-3">{label}</p>
      <p className="tnum mt-1 text-lg font-medium">{value}</p>
    </div>
  );
}

function ReviewTabView({ monday, onGo }: { monday: string; onGo: (monday: string) => void }) {
  const today = useToday();
  const current = mondayOf(today);
  const { data: review } = useWeekReview(monday);
  usePageShortcuts({
    arrowleft: () => onGo(addDaysISO(monday, -7)),
    arrowright: () => monday < current && onGo(addDaysISO(monday, 7)),
  });
  const hours = (minutes: number) => (minutes > 0 ? formatMinutes(minutes) : '—');
  return (
    <>
      <div className="mb-8 flex items-center gap-2">
        <Button variant="ghost" icon={ChevronLeft} aria-label="Semaine précédente" title="Semaine précédente · ←" onClick={() => onGo(addDaysISO(monday, -7))} />
        <h2 className="min-w-64 text-center font-semibold">{weekLabel(monday)}</h2>
        <Button
          variant="ghost"
          icon={ChevronRight}
          aria-label="Semaine suivante"
          title="Semaine suivante · →"
          disabled={monday >= current}
          onClick={() => onGo(addDaysISO(monday, 7))}
        />
        {monday !== current && (
          <Button variant="secondary" className="ml-2" onClick={() => onGo(current)}>
            Cette semaine
          </Button>
        )}
      </div>
      {review && (
        <>
          <p className="mb-10 max-w-2xl text-lg">{reviewSentence(review)}</p>
          <div className="mb-14 grid max-w-3xl grid-cols-3 gap-x-12 gap-y-8">
            <Figure label="Travail" value={hours(review.workMinutes)} />
            <Figure label="Cours et devoirs" value={hours(review.schoolMinutes)} />
            <Figure label="Sport" value={hours(review.sportMinutes)} />
            <Figure label="Tâches terminées" value={String(review.tasksDone)} />
            <Figure label="Devoirs faits" value={String(review.homeworkDone)} />
            <Figure label="Encaissé" value={review.revenueCents > 0 ? formatMoney(review.revenueCents) : '—'} />
          </div>
          {review.habits.length > 0 && (
            <section>
              <h3 className="mb-3 font-semibold">Habitudes</h3>
              <ul className="max-w-xl">
                {review.habits.map((habit) => (
                  <li key={habit.name} className="grid min-h-10 grid-cols-[minmax(0,1fr)_160px_48px] items-center gap-6">
                    <span className="truncate">{habit.name}</span>
                    <span className="h-1 overflow-hidden rounded-full bg-active">
                      <span
                        className={`block h-full rounded-full ${habit.done >= habit.target ? 'bg-success' : 'bg-ink-2'}`}
                        style={{ width: `${Math.min(100, (habit.done / Math.max(1, habit.target)) * 100)}%` }}
                      />
                    </span>
                    <span className="tnum text-right text-meta text-ink-2">
                      {habit.done}/{habit.target}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="mt-10 text-meta text-ink-3">Les heures comptent les blocs marqués faits dans la Journée et, pour les cours, l’emploi du temps.</p>
        </>
      )}
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

/** Habitudes (étape 6) : les habitudes et objectifs, le carnet de séances, la revue de la semaine. */
export function HabitsPage() {
  const today = useToday();
  const search = useSearch({ from: '/habits' });
  const navigate = useNavigate({ from: '/habits' });
  const tab: HabitsTab = search.tab ?? 'habits';
  const monday = search.week ? mondayOf(search.week) : mondayOf(today);
  const openWorkout = useWorkoutEditor((state) => state.openWorkout);
  const [habitOpen, setHabitOpen] = useState(false);

  const setTab = (next: HabitsTab) => void navigate({ search: next === 'habits' ? {} : { tab: next } });
  const goToWeek = (next: string) => void navigate({ search: { tab: 'review', week: next === mondayOf(today) ? undefined : next } });

  return (
    <Page
      title="Habitudes"
      actions={
        <>
          {tab === 'habits' && (
            <Button variant="primary" icon={Plus} onClick={() => setHabitOpen(true)}>
              Nouvelle habitude
            </Button>
          )}
          {tab === 'workouts' && (
            <Button variant="primary" icon={Plus} onClick={() => openWorkout({ date: today })}>
              Noter une séance
            </Button>
          )}
        </>
      }
    >
      <div className="-mt-4 mb-10">
        <SegmentedTabs<HabitsTab>
          tabs={[
            { value: 'habits', label: 'Habitudes et objectifs' },
            { value: 'workouts', label: 'Séances' },
            { value: 'review', label: 'Revue de la semaine' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'habits' && <HabitsTabView onNewHabit={() => setHabitOpen(true)} />}
      {tab === 'workouts' && <WorkoutsTabView />}
      {tab === 'review' && <ReviewTabView monday={monday} onGo={goToWeek} />}
      <HabitDialog open={habitOpen} onOpenChange={setHabitOpen} />
    </Page>
  );
}
