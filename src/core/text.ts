/** Coupe un texte trop long pour un message bref : « Faire la refonte graphique du s… ». */
export function shorten(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Texte comparable sans tenir compte des majuscules ni des accents : « Échéance » → « echeance ». */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
