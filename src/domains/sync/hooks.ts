import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { queryKeys } from '@/core/query-keys';
import { reapplyEdits } from '@/domains/google/edits/service';
import { googleError, useGoogleStatus } from '@/domains/google/hooks';
import { toast } from '@/ui/overlays/toast';
import { SYNC_INTERVAL_MS } from './model';
import { applyPhoneLink, createSyncKey, forgetPhoneLink, forgetSyncKey, hasSyncKey, joinSync, nativeTransport, syncAvailable } from './native';
import { getSyncState, setSyncStateStatement } from './repository';
import { resetDeviceStatements, syncOnce } from './service';

/** Où en est la synchronisation de cet appareil : clé présente, dernière synchronisation réussie. */
export function useSyncStatus() {
  return useQuery({
    queryKey: queryKeys.sync.status,
    queryFn: async () => ({
      available: syncAvailable(),
      hasKey: await hasSyncKey(),
      lastSync: await getSyncState(db, 'last_sync'),
    }),
  });
}

/** Une synchronisation à la fois : les suivantes attendent la même. */
let running: Promise<{ pulled: number; pushed: number }> | null = null;

function runSync(): Promise<{ pulled: number; pushed: number }> {
  running ??= (async () => {
    const now = nowTimestamp();
    const result = await syncOnce(db, nativeTransport, now);
    await db.batch([setSyncStateStatement('last_sync', now)]);
    // Des modifications d'événements Google reçues de l'autre appareil : la copie locale les montre tout de suite.
    if (result.pulled > 0) await reapplyEdits(db);
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

function afterSync(queryClient: QueryClient, pulled: number): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.sync.status });
  // Des changements reçus : tout ce qui est à l'écran peut en dépendre.
  if (pulled > 0) void queryClient.invalidateQueries();
}

/** Synchroniser maintenant (bouton). Une erreur est dite ; rien n'est perdu, la suivante reprendra. */
export function useSyncNow(options: { quiet?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runSync,
    onSuccess: ({ pulled }) => afterSync(queryClient, pulled),
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.google.status });
      if (!options.quiet) toast(googleError(error), { tone: 'danger' });
    },
  });
}

/**
 * Toutes les minutes tant que Cockpit est ouvert, et quand sa fenêtre se ferme (elle se cache dans la zone
 * de notification) : si Google est connecté, la synchronisation autorisée et la clé présente.
 */
export function useAutoSync(): void {
  const { data: google } = useGoogleStatus();
  const { data: status } = useSyncStatus();
  const { mutate } = useSyncNow({ quiet: true });
  const active = Boolean(google?.connected && google.syncAllowed && status?.hasKey);
  useEffect(() => {
    if (!active) return;
    mutate();
    const timer = setInterval(() => mutate(), SYNC_INTERVAL_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') mutate();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [active, mutate]);
}

/** Premier appareil : crée la clé, renvoie son code, puis envoie tout ce qui existe. */
export function useCreateSyncKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const code = await createSyncKey();
      await runSync().catch(() => undefined);
      return code;
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sync.status }),
  });
}

/** Autre appareil : vérifie le code, repart à neuf (nouvel identifiant), puis reçoit tout. */
export function useJoinSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      await joinSync(code);
      await db.batch(resetDeviceStatements());
      return runSync();
    },
    onSuccess: ({ pulled }) => {
      toast('Synchronisation activée sur cet appareil.');
      afterSync(queryClient, pulled);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sync.status }),
  });
}

/**
 * Téléphone : relier au PC avec le texte du code QR lu. Comme rejoindre : repart à neuf (nouvel identifiant),
 * puis reçoit tout. Google Agenda se relit ensuite seul (le téléphone est connecté).
 */
export function useLinkPhone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      await applyPhoneLink(text);
      await db.batch(resetDeviceStatements());
      return runSync();
    },
    onSuccess: ({ pulled }) => {
      toast('Téléphone relié au PC.');
      afterSync(queryClient, pulled);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.google.status });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sync.status });
    },
  });
}

/** Téléphone : délier. Les données restent sur le téléphone ; le PC n'est pas touché. */
export function useUnlinkPhone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: forgetPhoneLink,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.google.status });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sync.status });
    },
  });
}

/** Arrêter sur cet appareil : la clé est retirée ; les données restent, rien n'est effacé ailleurs. */
export function useStopSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: forgetSyncKey,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sync.status }),
  });
}
