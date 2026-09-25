export type SettingDef<T> = { key: string; fallback: T };

/** Réglages de l'app, gardés dans la table `settings` (une valeur JSON par clé), avec leur valeur par défaut. */
export const SETTINGS = {
  /** Soldes des comptes dans les chiffres clés du dashboard (la page Finances les montre toujours). */
  dashboardShowAccounts: { key: 'dashboard.showAccounts', fallback: true } as SettingDef<boolean>,
};
