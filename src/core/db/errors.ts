/** Traduit les erreurs SQLite les plus courantes en messages compréhensibles. */
export function humanizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('UNIQUE constraint failed')) return 'Cette valeur existe déjà.';
  if (message.includes('FOREIGN KEY constraint failed')) {
    return 'Impossible : cet élément est encore utilisé ailleurs.';
  }
  if (message.includes('CHECK constraint failed')) return 'Valeur refusée : elle ne respecte pas les règles.';
  return `Une erreur est survenue : ${message}`;
}
