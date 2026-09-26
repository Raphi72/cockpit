import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { db } from '@/core/db';
import { useSaveSetting, useSetting } from '@/domains/settings/hooks';
import { toast } from '@/ui/overlays/toast';
import { RULES_SETTING, resolveRules, type NotificationRule } from './model';
import { startNotificationScheduler } from './scheduler';

/**
 * Notification Windows (commande Rust `notify`). Dans le navigateur de développement, qui n'en a pas,
 * un toast la remplace.
 */
export async function sendNotification({ title, body }: { title: string; body: string }): Promise<void> {
  if (isTauri()) {
    await invoke('notify', { title, body });
    return;
  }
  toast(`${title} · ${body}`);
}

/** Planificateur des notifications, lancé une fois pour toute l'app (AppShell). */
export function useNotificationScheduler(): void {
  useEffect(() => startNotificationScheduler(db, sendNotification), []);
}

/** Règles activées, et leur interrupteur. `rules` est absent tant que le réglage n'est pas lu. */
export function useNotificationRules() {
  const { data } = useSetting(RULES_SETTING);
  const save = useSaveSetting(RULES_SETTING);
  const rules = data === undefined ? undefined : resolveRules(data);
  const setRule = (rule: NotificationRule, enabled: boolean) => {
    if (rules) save.mutate({ ...rules, [rule]: enabled });
  };
  return { rules, setRule };
}

export function sendTestNotification(): void {
  sendNotification({ title: 'Notification d’essai', body: 'Les rappels de Cockpit s’afficheront ainsi.' })
    .then(() =>
      toast('Notification envoyée. Rien ne s’affiche ? Vérifie que « Ne pas déranger » est désactivé dans Windows.'),
    )
    .catch((error: unknown) => toast(`Notification impossible : ${String(error)}`, { tone: 'danger' }));
}
