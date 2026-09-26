import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';
import { db } from '@/core/db';
import { setWeekStartsOn } from '@/core/week-start';
import { useSetting } from '@/domains/settings/hooks';
import { SETTINGS, resolveTheme, resolveWeekStart, type ThemeChoice } from '@/domains/settings/model';
import { getSetting } from '@/domains/settings/repository';

/**
 * Thème forcé : l'attribut `data-theme` choisit les couleurs (tokens.css) ; la barre de titre de Windows
 * suit aussi. « Comme Windows » retire les deux et laisse faire le système.
 */
function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  if (isTauri()) void getCurrentWindow().setTheme(theme === 'system' ? null : theme).catch(() => undefined);
}

/**
 * Lu avant le premier rendu (la fenêtre est encore cachée) : ni éclair de l'autre thème,
 * ni calendrier qui se redessine au démarrage.
 */
export async function loadPreferences(): Promise<void> {
  try {
    const [theme, weekStartsOn] = await Promise.all([
      getSetting(db, SETTINGS.theme.key),
      getSetting(db, SETTINGS.weekStartsOn.key),
    ]);
    applyTheme(resolveTheme(theme));
    setWeekStartsOn(resolveWeekStart(weekStartsOn));
  } catch {
    // Base illisible : les valeurs par défaut suffisent, l'app affichera l'erreur ailleurs.
  }
}

/** Applique tout de suite un changement fait dans Paramètres (ou une restauration). */
export function usePreferencesSync(): void {
  const { data: theme } = useSetting(SETTINGS.theme);
  const { data: weekStartsOn } = useSetting(SETTINGS.weekStartsOn);
  useEffect(() => {
    if (theme !== undefined) applyTheme(resolveTheme(theme));
  }, [theme]);
  useEffect(() => {
    if (weekStartsOn !== undefined) setWeekStartsOn(resolveWeekStart(weekStartsOn));
  }, [weekStartsOn]);
}
