/** Les montants sont toujours manipulés en centimes (entiers) et formatés à l'affichage. */

const withCents = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const withoutCents = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** 150000 → « 1 500 € » ; 428050 → « 4 280,50 € » (centimes affichés seulement s'ils existent). */
export function formatMoney(cents: number): string {
  const formatter = cents % 100 === 0 ? withoutCents : withCents;
  return formatter.format(cents / 100).replace('-', '−');
}

/** Pour les mouvements : signe toujours explicite, « +2 000 € » ou « −35 € ». */
export function formatSignedMoney(cents: number): string {
  if (cents === 0) return formatMoney(0);
  return cents > 0 ? `+${formatMoney(cents)}` : formatMoney(cents);
}

/**
 * Lit un montant saisi librement : « 2000 », « 2 000 », « 1 234,56 », « 12.5 € ».
 * Renvoie des centimes, `null` pour une saisie vide et `undefined` si la saisie est invalide.
 * Avec `signed`, un montant négatif est accepté (« −120 » : un compte à découvert).
 */
export function parseMoneyInput(text: string, options: { signed?: boolean } = {}): number | null | undefined {
  const cleaned = text.replace(/[\s  €]/g, '').replace(',', '.').replace('−', '-');
  if (cleaned === '') return null;
  const pattern = options.signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(cleaned)) return undefined;
  return Math.round(Number(cleaned) * 100);
}

/** Valeur éditable d'un montant : 150000 → « 1500 », 123456 → « 1234,56 ». */
export function moneyToInput(cents: number | null): string {
  if (cents === null) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ',');
}
