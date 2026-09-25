import { invoke } from '@tauri-apps/api/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserError } from '@/core/db/errors';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import type { AppInfo, RestoreCandidate } from './model';

/** Commandes natives de src-tauri/src/data.rs : leurs erreurs sont déjà rédigées pour l'utilisateur. */
function call<T>(command: string): Promise<T> {
  return invoke<T>(command).catch((error: unknown) => {
    throw new UserError(String(error));
  });
}

export function useAppInfo() {
  return useQuery({
    queryKey: queryKeys.appInfo,
    queryFn: () => invoke<AppInfo>('app_info'),
  });
}

/**
 * « Sauvegarder maintenant… » : fenêtre native « Enregistrer sous », ouverte par défaut sur
 * le dossier des sauvegardes avec un nom daté (Entrée suffit).
 */
export function useBackupNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call<string | null>('backup_export'),
    onSuccess: (fileName) => {
      if (!fileName) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.appInfo });
      toast(`Sauvegarde enregistrée : ${fileName}`);
    },
  });
}

export function useChooseBackupDir() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call<boolean>('backup_choose_dir'),
    onSuccess: (changed) => {
      if (!changed) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.appInfo });
      toast('Les sauvegardes iront dans ce dossier. Une première copie vient d’y être faite.');
    },
  });
}

export function useResetBackupDir() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => call<void>('backup_reset_dir'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.appInfo });
      toast('Les sauvegardes reviennent dans le dossier par défaut.');
    },
  });
}

/** Étape 1 : choisir et vérifier une sauvegarde. Rien n'est remplacé à ce stade. */
export function useRestorePick() {
  return useMutation({ mutationFn: () => call<RestoreCandidate | null>('restore_pick') });
}

/** Retenu le temps du rechargement, pour confirmer la restauration une fois l'interface revenue. */
const RESTORED_FLAG = 'cockpit.restored';

/** Étape 2 : remplacer les données, puis recharger l'interface sur la base restaurée. */
export function useRestoreConfirm() {
  return useMutation({
    mutationFn: () => call<void>('restore_confirm'),
    onSuccess: () => {
      try {
        sessionStorage.setItem(RESTORED_FLAG, '1');
      } catch {
        // Sans stockage de session, seul le message de confirmation manquera.
      }
      window.location.reload();
    },
  });
}

export function cancelRestore(): void {
  void invoke('restore_cancel').catch(() => undefined);
}

/** Après le rechargement qui suit une restauration : un seul message, une seule fois. */
export function announceRestoreIfDone(): void {
  let restored = false;
  try {
    restored = sessionStorage.getItem(RESTORED_FLAG) !== null;
    sessionStorage.removeItem(RESTORED_FLAG);
  } catch {
    return;
  }
  if (restored) {
    toast('Sauvegarde restaurée. Tes données d’avant sont gardées dans le dossier des sauvegardes.', {
      action: { label: 'Afficher', onClick: openBackupDir },
    });
  }
}

export function openDataDir(): void {
  void call('open_data_dir').catch((error: Error) => toast(error.message, { tone: 'danger' }));
}

export function openBackupDir(): void {
  void call('open_backup_dir').catch((error: Error) => toast(error.message, { tone: 'danger' }));
}
