export type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export type ClientListItem = Client & {
  /** Archivé : il n'est plus proposé dans les projets ni les encaissements, mais garde tout son historique. */
  archivedAt: string | null;
  projectCount: number;
  /** Encaissements attendus de ses projets (ou directement liés au client), propositions exclues. */
  dueCents: number;
  /** Tout ce qu'il a déjà payé. */
  receivedCents: number;
};

/** Clients actifs, puis archivés : la page Clients les sépare, les formulaires ne proposent que les actifs. */
export function splitArchived<T extends { archivedAt: string | null }>(clients: T[]): { active: T[]; archived: T[] } {
  return {
    active: clients.filter((client) => client.archivedAt === null),
    archived: clients.filter((client) => client.archivedAt !== null),
  };
}

export type ClientInput = Omit<Client, 'id'>;

/** Client choisi dans un formulaire : aucun, existant, ou à créer à la volée. */
export type ClientChoice =
  | { kind: 'none' }
  | { kind: 'existing'; id: string; name: string }
  | { kind: 'new'; name: string };

export function validateClient(input: ClientInput): Partial<Record<keyof ClientInput, string>> {
  const errors: Partial<Record<keyof ClientInput, string>> = {};
  if (input.name.trim() === '') errors.name = 'Donne un nom au client.';
  if (input.email && !/^\S+@\S+\.\S+$/.test(input.email)) errors.email = 'Adresse e-mail invalide.';
  return errors;
}

/** Nettoie la saisie : espaces en trop retirés, champs vides → null. */
export function normalizeClient(input: ClientInput): ClientInput {
  const clean = (value: string | null) => (value && value.trim() !== '' ? value.trim() : null);
  return { name: input.name.trim(), email: clean(input.email), phone: clean(input.phone), notes: clean(input.notes) };
}
