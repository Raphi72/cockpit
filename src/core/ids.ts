/** Les IDs sont générés côté app : un lot d'instructions n'a jamais besoin d'un ID inséré par SQLite. */
export function newId(): string {
  return crypto.randomUUID();
}
