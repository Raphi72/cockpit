import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { db } from '@/core/db';
import { UserError } from '@/core/db/errors';
import { queryKeys } from '@/core/query-keys';
import { getSetting, setSettingStatement } from '@/domains/settings/repository';
import {
  AUTOSTART_DECIDED,
  AUTOSTART_UNAVAILABLE,
  TRAY_HINT,
  TRAY_HINT_SHOWN,
  shouldEnableAutostartByDefault,
  type AutostartState,
} from './model';

/** Événement natif : la fenêtre vient d'être cachée dans la zone de notification. */
const HIDDEN_EVENT = 'cockpit:hidden';

function readAutostart(): Promise<AutostartState> {
  return isTauri() ? invoke<AutostartState>('autostart_get') : Promise.resolve(AUTOSTART_UNAVAILABLE);
}

/** Démarrage avec Windows : l'état réel, lu auprès de Windows. */
export function useAutostart() {
  return useQuery({ queryKey: queryKeys.autostart, queryFn: readAutostart });
}

/** Active ou coupe le démarrage avec Windows ; le choix est noté, pour ne plus l'activer d'office. */
export function useSetAutostart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      await invoke('autostart_set', { enabled }).catch((error: unknown) => {
        throw new UserError(String(error));
      });
      await db.batch([setSettingStatement(AUTOSTART_DECIDED.key, true)]);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.autostart }),
  });
}

/** Premier lancement de l'app installée : le démarrage avec Windows est activé d'office (réglable ensuite). */
async function enableAutostartByDefault(queryClient: QueryClient): Promise<void> {
  const [state, decided] = await Promise.all([readAutostart(), getSetting<boolean>(db, AUTOSTART_DECIDED.key)]);
  if (!shouldEnableAutostartByDefault(state, decided)) return;
  await invoke('autostart_set', { enabled: true });
  await db.batch([setSettingStatement(AUTOSTART_DECIDED.key, true)]);
  void queryClient.invalidateQueries({ queryKey: queryKeys.autostart });
}

/** La première fois que la fenêtre se ferme sans quitter Cockpit, une notification l'explique. */
async function explainTrayOnce(): Promise<void> {
  if (await getSetting<boolean>(db, TRAY_HINT_SHOWN.key)) return;
  await db.batch([setSettingStatement(TRAY_HINT_SHOWN.key, true)]);
  await invoke('notify', TRAY_HINT);
}

/** « Toujours là », côté interface, lancé une fois pour toute l'app (AppShell). Rien dans le navigateur. */
export function usePresence(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isTauri()) return;
    enableAutostartByDefault(queryClient).catch((error: unknown) => console.error('Démarrage avec Windows :', error));
    const unlisten = listen(HIDDEN_EVENT, () => {
      explainTrayOnce().catch((error: unknown) => console.error('Zone de notification :', error));
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [queryClient]);
}

/** Quitter pour de bon (la fermeture de la fenêtre, elle, garde Cockpit dans la zone de notification). */
export function quitApp(): void {
  if (isTauri()) void invoke('quit');
}
