export type SettingDef<T> = { key: string; fallback: T };

/** Réglages de l'app, gardés dans la table `settings` (une valeur JSON par clé), avec leur valeur par défaut. */
export const SETTINGS = {
  /**
   * Montants sur le dashboard : chiffres clés (soldes, à recevoir, encaissé du mois), montants des
   * paiements dans « À surveiller » et « Prochains jours ». La page Finances les montre toujours.
   */
  dashboardShowAmounts: { key: 'dashboard.showAmounts', fallback: true } as SettingDef<boolean>,
};
