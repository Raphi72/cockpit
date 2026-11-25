import { formatMonth, monthOf } from '@/core/dates';
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

// ─── Chiffre d'affaires (pour l'URSSAF) ─────────────────────────────────────

/**
 * Chiffre d'affaires : tous les encaissements reçus, comptés à leur date de réception. C'est la même
 * règle que « Encaissé ce mois » : les deux chiffres ne se contredisent jamais. Calculé, jamais stocké.
 */
export type MonthRevenue = {
  /** 'YYYY-MM' */
  month: string;
  cents: number;
  /** Nombre d'encaissements reçus ce mois-là. */
  count: number;
};

export type QuarterNumber = 1 | 2 | 3 | 4;

export type QuarterRevenue = {
  quarter: QuarterNumber;
  /** Ses trois mois, dans l'ordre, même sans encaissement. */
  months: MonthRevenue[];
  cents: number;
  count: number;
};

export type YearRevenue = { year: number; quarters: QuarterRevenue[]; cents: number; count: number };

/** Trimestre civil d'un mois : '2026-11' → 4. */
export function quarterOf(month: string): QuarterNumber {
  return (Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1) as QuarterNumber;
}

/**
 * L'année entière, trimestre par trimestre et mois par mois, à partir des mois qui ont des
 * encaissements (les autres valent zéro). Les lignes d'une autre année sont ignorées.
 */
export function buildYearRevenue(year: number, rows: MonthRevenue[]): YearRevenue {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  const quarters = ([1, 2, 3, 4] as QuarterNumber[]).map((quarter): QuarterRevenue => {
    const months = [0, 1, 2].map((offset) => {
      const month = `${year}-${String((quarter - 1) * 3 + offset + 1).padStart(2, '0')}`;
      return byMonth.get(month) ?? { month, cents: 0, count: 0 };
    });
    return {
      quarter,
      months,
      cents: months.reduce((sum, m) => sum + m.cents, 0),
      count: months.reduce((sum, m) => sum + m.count, 0),
    };
  });
  return {
    year,
    quarters,
    cents: quarters.reduce((sum, q) => sum + q.cents, 0),
    count: quarters.reduce((sum, q) => sum + q.count, 0),
  };
}

/** « 1er trimestre », « 2e trimestre »… */
export function quarterLabel(quarter: QuarterNumber): string {
  return `${quarter}${quarter === 1 ? 'er' : 'e'} trimestre`;
}

/** « janvier – mars » (sans l'année : elle est déjà au-dessus). */
export function quarterPeriod(quarter: QuarterRevenue): string {
  const name = (month: string) => formatMonth(month, month).toLowerCase();
  return `${name(quarter.months[0]!.month)} – ${name(quarter.months[2]!.month)}`;
}

/** Où en est une période par rapport à aujourd'hui : passée (chiffre définitif), en cours, ou à venir. */
export type PeriodState = 'past' | 'current' | 'future';

export function monthState(month: string, today: string): PeriodState {
  const current = monthOf(today);
  return month < current ? 'past' : month === current ? 'current' : 'future';
}

export function quarterState(quarter: QuarterRevenue, today: string): PeriodState {
  const states = quarter.months.map((m) => monthState(m.month, today));
  if (states.every((state) => state === 'past')) return 'past';
  return states.every((state) => state === 'future') ? 'future' : 'current';
}

/** « 1 encaissement », « 3 encaissements » ; rien pour zéro. */
export function revenueCountLabel(count: number): string | null {
  if (count === 0) return null;
  return `${count} encaissement${count > 1 ? 's' : ''}`;
}

/**
 * Année affichée : celle demandée, entre la première année qui a des encaissements et l'année en
 * cours. Sans encaissement, ou avec une valeur inattendue : l'année en cours.
 */
export function resolveRevenueYear(wanted: number | undefined, firstYear: number | null, today: string): number {
  const current = Number(today.slice(0, 4));
  if (wanted === undefined || !Number.isInteger(wanted)) return current;
  return Math.min(Math.max(wanted, Math.min(firstYear ?? current, current)), current);
}
