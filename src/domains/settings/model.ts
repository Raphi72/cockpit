export type SettingDef<T> = { key: string; fallback: T };

/** Réglages de l'app, gardés dans la table `settings` (une valeur JSON par clé), avec leur valeur par défaut. */
export const SETTINGS = {
  /** Chiffres clés en tête du dashboard : soldes, à recevoir, encaissé du mois (la page Finances les montre toujours). */
  dashboardShowFigures: { key: 'dashboard.showFigures', fallback: true } as SettingDef<boolean>,
};
