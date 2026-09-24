/** Texte comparable sans tenir compte des majuscules ni des accents : « Échéance » → « echeance ». */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
