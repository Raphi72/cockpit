import { useQueryClient } from '@tanstack/react-query';
import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useMemo } from 'react';
import { addDaysISO } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { useBlocks } from '@/domains/day/hooks';
import { useTasksInBlocks } from '@/domains/tasks/hooks';
import { useSetting } from '@/domains/settings/hooks';
import { SETTINGS } from '@/domains/settings/model';
import { toast } from '@/ui/overlays/toast';
import { DATA_CHANGED_EVENT } from './native';

/** Les réglages du compagnon, avec leur valeur par défaut tant qu'ils ne sont pas lus. */
export function useCompanionSettings() {
  const { data: morningScreen = SETTINGS.morningScreen.fallback } = useSetting(SETTINGS.morningScreen);
  const { data: celebrations = SETTINGS.celebrations.fallback } = useSetting(SETTINGS.celebrations);
  const { data: sounds = SETTINGS.sounds.fallback } = useSetting(SETTINGS.sounds);
  const { data: pomodoroWork = SETTINGS.pomodoroWork.fallback } = useSetting(SETTINGS.pomodoroWork);
  const { data: pomodoroBreak = SETTINGS.pomodoroBreak.fallback } = useSetting(SETTINGS.pomodoroBreak);
  return { morningScreen, celebrations, sounds, pomodoroWork, pomodoroBreak };
}

/** Les blocs d'aujourd'hui et les tâches rangées dedans. */
export function useTodayBlocks() {
  const today = useToday();
  const range = useMemo(() => ({ from: today, to: addDaysISO(today, 1) }), [today]);
  const { data: blocks } = useBlocks(range);
  const { data: tasks } = useTasksInBlocks(range);
  return { today, blocks, tasks };
}

/** Une petite célébration (compagnon) : un mot dans un toast, avec une étincelle. Rien si elles sont désactivées. */
export function celebrate(message: string, enabled: boolean): void {
  if (enabled) toast(message, { tone: 'celebrate' });
}

/** La mini-fenêtre « En ce moment » a coché une tâche : la fenêtre principale relit ce qu'elle montre. */
export function useDataChangedSync(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isTauri()) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen(DATA_CHANGED_EVENT, () => void queryClient.invalidateQueries()).then((unlisten) => {
        if (cancelled) unlisten();
        else off = unlisten;
      }),
    );
    return () => {
      cancelled = true;
      off?.();
    };
  }, [queryClient]);
}
