import { isWeekStart, type WeekStart } from '@/core/week-start';

export type SettingDef<T> = { key: string; fallback: T };

/** Thème : celui de Windows (par défaut), ou forcé clair ou sombre. */
export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Comme Windows' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

export const WEEK_START_CHOICES: { value: WeekStart; label: string }[] = [
  { value: 1, label: 'Lundi' },
  { value: 0, label: 'Dimanche' },
];

/** Réglages de l'app, gardés dans la table `settings` (une valeur JSON par clé), avec leur valeur par défaut. */
export const SETTINGS = {
  /**
   * Montants sur le dashboard : chiffres clés (soldes, à recevoir, encaissé du mois), montants des
   * paiements dans « À surveiller », « Prochains jours » et les notifications. La page Finances les montre toujours.
   */
  dashboardShowAmounts: { key: 'dashboard.showAmounts', fallback: true } as SettingDef<boolean>,
  theme: { key: 'appearance.theme', fallback: 'system' } as SettingDef<ThemeChoice>,
  /** Calendrier (mois et semaine), planning et sélecteur de date. */
  weekStartsOn: { key: 'calendar.weekStartsOn', fallback: 1 } as SettingDef<WeekStart>,
};

/** Une valeur inattendue en base (modifiée à la main…) retombe sur la valeur par défaut. */
export function resolveTheme(value: unknown): ThemeChoice {
  return THEME_CHOICES.some((choice) => choice.value === value) ? (value as ThemeChoice) : SETTINGS.theme.fallback;
}

export function resolveWeekStart(value: unknown): WeekStart {
  return isWeekStart(value) ? value : SETTINGS.weekStartsOn.fallback;
}
