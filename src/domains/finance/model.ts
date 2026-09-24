import type { Account } from './accounts/model';

/** Nombre de jours pris en compte pour « prévu » (encaissements attendus prochainement). */
export const UPCOMING_DAYS = 30;

export type AccountFigure = Account & {
  /** Dépenses du mois sur ce compte (négatif), hors virements et ajustements. */
  monthExpenseCents: number;
  /** Variation du mois : tous les mouvements, virements compris, hors ajustements. */
  monthChangeCents: number;
};

/** Chiffres de l'en-tête Finances (et, plus tard, du dashboard). Tous calculés, jamais stockés. */
export type FinanceSummary = {
  accounts: AccountFigure[];
  /** Encaissements non reçus. */
  dueCents: number;
  /** Dont ceux dont la date prévue est passée. */
  lateCents: number;
  lateCount: number;
  /** Encaissé ce mois : encaissements reçus dont la date de réception tombe dans le mois. */
  receivedMonthCents: number;
  /** Prévu : non reçus attendus d'aujourd'hui à J+30. */
  upcomingCents: number;
  /** Dépenses pro du mois : dépenses des comptes pro, hors virements et ajustements (négatif). */
  businessExpenseMonthCents: number;
};
