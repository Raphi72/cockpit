import { normalizeText } from '@/core/text';

/** Ce que la recherche globale sait retrouver (une ligne de l'index `search_index` par élément). */
export type SearchEntity = 'project' | 'task' | 'client' | 'event' | 'payment' | 'transaction';

/** Ordre des groupes à pertinence égale. */
export const SEARCH_ENTITIES: SearchEntity[] = ['project', 'task', 'client', 'event', 'payment', 'transaction'];

export const SEARCH_GROUP_LABELS: Record<SearchEntity, string> = {
  project: 'Projets',
  task: 'Tâches',
  client: 'Clients',
  event: 'Événements',
  payment: 'Encaissements',
  transaction: 'Transactions',
};

/** Résultats montrés par groupe : la palette reste courte. */
export const SEARCH_LIMIT_PER_GROUP = 5;

export type SearchResult = {
  entity: SearchEntity;
  id: string;
  title: string;
  /** Rattachement affiché en gris : projet, client, compte ou e-mail. */
  context: string | null;
  /** Couleur du type de projet, pour la pastille. */
  color: string | null;
  /** Date utile : deadline, date prévue, début d'événement, échéance ou date de la transaction. */
  date: string | null;
  amountCents: number | null;
  /** Terminé, annulé, reçu ou passé : montré après le reste. */
  closed: boolean;
  /** Trouvé par le texte lui-même (sinon : lié à un projet ou un client trouvé). */
  direct: boolean;
  /** Pertinence FTS5 (bm25) : plus c'est bas, mieux c'est. Null pour un élément lié. */
  score: number | null;
};

export type SearchGroup = { entity: SearchEntity; label: string; results: SearchResult[] };

/**
 * Mots recherchés : lettres et chiffres, tout le reste sépare, comme le tokenizer `unicode61`.
 * Les mots ne contiennent donc jamais de caractère spécial pour FTS5 (guillemets, *, :…).
 */
export function searchTerms(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter((term) => term !== '').slice(0, 8);
}

/**
 * Filtre des commandes et des listes déjà chargées : chaque mot tapé doit apparaître quelque part,
 * sans tenir compte des majuscules ni des accents. « nouv tach » trouve « Nouvelle tâche ».
 */
export function matchesAllTerms(haystack: string, query: string): boolean {
  const text = normalizeText(haystack);
  return searchTerms(normalizeText(query)).every((term) => text.includes(term));
}

/** Requête FTS5 : chaque mot est un préfixe et tous doivent être présents. « marc ech » → "marc"* "ech"* */
export function toMatchQuery(terms: string[]): string {
  return terms.map((term) => `"${term}"*`).join(' ');
}

/**
 * Regroupe par type. Les groupes qui contiennent la meilleure correspondance passent en tête :
 * chercher un client montre d'abord le client, chercher un mot d'une tâche montre d'abord les tâches.
 */
export function groupResults(results: SearchResult[]): SearchGroup[] {
  const groups = SEARCH_ENTITIES.map((entity) => ({
    entity,
    label: SEARCH_GROUP_LABELS[entity],
    results: results.filter((r) => r.entity === entity),
  })).filter((group) => group.results.length > 0);

  const best = (group: SearchGroup) => {
    const scores = group.results.filter((r) => r.direct).map((r) => r.score ?? 0);
    return scores.length > 0 ? Math.min(...scores) : Infinity;
  };
  // Tri stable : à pertinence égale, l'ordre de SEARCH_ENTITIES est conservé.
  return groups.sort((a, b) => {
    const [x, y] = [best(a), best(b)];
    return x === y ? 0 : x - y;
  });
}
