import { useEffect, useRef } from 'react';
import { useMinutesOfDay, useToday } from '@/core/use-today';
import { toMinutes } from '@/domains/day/model';
import { useGoals, useHabitHistory, useHabits } from '@/domains/habits/hooks';
import { doneDays, streak, streakText } from '@/domains/habits/model';
import { useDoneToday, useOpenTasks } from '@/domains/tasks/hooks';
import { selectToday } from '@/domains/tasks/model';
import { celebrate, useCompanionSettings, useDataChangedSync, useTodayBlocks } from '../hooks';
import { closureStep, isStreakMilestone, newlyAchieved, type ClosureState } from '../model';
import { playChime } from '../sounds';
import { FocusMode } from './FocusMode';
import { MorningScreen } from './MorningScreen';

/**
 * Petites célébrations, discrètes : la journée bouclée, une série qui atteint un palier, un objectif
 * atteint. Elles suivent ce qui change pendant que Cockpit est ouvert, jamais au lancement.
 */
function CelebrationWatcher() {
  const today = useToday();
  const { celebrations } = useCompanionSettings();
  const { data: open } = useOpenTasks();
  const { data: doneToday } = useDoneToday(today);
  const { data: habits } = useHabits();
  const { data: activity } = useHabitHistory();
  const { data: goals } = useGoals();
  const closure = useRef<ClosureState>({ previous: null, pending: false });
  const habitsDone = useRef<Map<string, boolean> | null>(null);
  const achieved = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!open || !doneToday) return;
    const groups = selectToday(open, today);
    const step = closureStep(closure.current, groups.overdue.length + groups.today.length, doneToday.length);
    closure.current = step.state;
    if (step.celebrate) celebrate('Journée bouclée : tout ce qui était prévu aujourd’hui est fait.', celebrations);
  }, [open, doneToday, today, celebrations]);

  useEffect(() => {
    if (!habits || !activity) return;
    const next = new Map<string, boolean>();
    for (const habit of habits) {
      const done = doneDays(habit, activity.logs, activity.doneBlocks);
      const isDone = done.has(today);
      next.set(habit.id, isDone);
      if (habitsDone.current?.get(habit.id) === false && isDone) {
        const series = streak(habit, done, today);
        if (isStreakMilestone(series)) celebrate(`${habit.name} : ${streakText(series)}, continue !`, celebrations);
      }
    }
    habitsDone.current = next;
  }, [habits, activity, today, celebrations]);

  useEffect(() => {
    if (!goals) return;
    const reached = new Set(goals.filter((g) => g.achievedAt || (g.steps.length > 0 && g.steps.every((s) => s.doneAt))).map((g) => g.id));
    for (const id of newlyAchieved(achieved.current, reached)) {
      const goal = goals.find((g) => g.id === id);
      if (goal) celebrate(`Objectif atteint : ${goal.title}. Bravo !`, celebrations);
    }
    achieved.current = reached;
  }, [goals, celebrations]);

  return null;
}

/** Un son doux à la fin d'un bloc prévu (si les sons sont activés, et Cockpit ouvert). */
function BlockChimes() {
  const { sounds } = useCompanionSettings();
  const { blocks } = useTodayBlocks();
  const minutes = useMinutesOfDay();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!sounds || !blocks) return;
    const ended = blocks.find((b) => b.status === 'planned' && toMinutes(b.endsAt) === minutes);
    if (!ended) return;
    const key = `${ended.id}:${minutes}`;
    if (last.current === key) return;
    last.current = key;
    playChime('block');
  }, [sounds, blocks, minutes]);
  return null;
}

/** Le compagnon (V2, étape 7), monté une fois dans la coquille. */
export function Companion() {
  useDataChangedSync();
  return (
    <>
      <MorningScreen />
      <FocusMode />
      <CelebrationWatcher />
      <BlockChimes />
    </>
  );
}
