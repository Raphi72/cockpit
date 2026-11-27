import { addDaysISO } from '@/core/dates';

/**
 * Google Agenda en écriture (après la 2.7.0). Une modification d'un événement Google est notée
 * (google_edits, synchronisée entre les appareils), s'applique tout de suite à la copie locale, et part
 * chez Google dès qu'un appareil autorisé a du réseau. Sur un agenda en lecture seule (l'intranet, par
 * iCal), elle reste une retouche dans Cockpit. Ici, les règles pures : rien ne touche la base ni le réseau.
 */

export type EditOp = 'insert' | 'patch' | 'delete';
/** `this` : cet événement (ou cette occurrence) ; `all` : toute la série. */
export type EditScope = 'this' | 'all';
/** `pending` : à envoyer ; `local` : retouche qui reste dans Cockpit ; `done` : envoyée, en attente de relecture. */
export type EditStatus = 'pending' | 'local' | 'done';
/** Ce qu'un 'patch' change ; `time` : début, fin et journée entière ; `link` : projet et matière. */
export type EditField = 'title' | 'location' | 'notes' | 'time' | 'link';

/** Le contenu d'un événement, aux formes de la copie locale (google_events). */
export type EventContent = {
  title: string;
  location: string | null;
  notes: string | null;
  /** 'YYYY-MM-DD' (journée entière) ou 'YYYY-MM-DDTHH:MM' (heure locale). */
  startsAt: string;
  /** Même forme ; pour des journées, le dernier jour compris (null : un seul jour). */
  endsAt: string | null;
  allDay: boolean;
  projectId: string | null;
  subjectId: string | null;
};

export type GoogleEdit = Partial<EventContent> & {
  id: string;
  /** Une création qui se répète : sa règle (RRULE). */
  recurrence?: string | null;
  calendarId: string;
  eventId: string;
  seriesId: string | null;
  op: EditOp;
  scope: EditScope;
  fields: EditField[];
  status: EditStatus;
  error: string | null;
  createdAt: string;
};

/**
 * L'identifiant d'un événement créé par Cockpit, choisi d'avance (Google l'accepte : chiffres et lettres
 * a à v) : le même pour tous les appareils, un second envoi ne crée pas de double.
 */
export function googleEventId(editId: string): string {
  return `cockpit${editId.replace(/-/g, '').toLowerCase()}`;
}

/** Une modification part chez Google si l'agenda l'accepte ; sinon, elle reste une retouche locale. */
export function editStatusFor(writable: boolean): EditStatus {
  return writable ? 'pending' : 'local';
}

type GoogleTime = { date?: string | null; dateTime?: string | null; timeZone?: string };

/**
 * Début et fin au format de Google. Une journée entière finit le lendemain du dernier jour (fin exclue) ;
 * une heure sans fin dure une heure. Passer de l'un à l'autre vide l'autre forme.
 */
export function googleTimes(content: Pick<EventContent, 'startsAt' | 'endsAt' | 'allDay'>, timeZone: string): { start: GoogleTime; end: GoogleTime } {
  if (content.allDay) {
    const first = content.startsAt.slice(0, 10);
    const last = (content.endsAt ?? first).slice(0, 10);
    return { start: { date: first, dateTime: null }, end: { date: addDaysISO(last > first ? last : first, 1), dateTime: null } };
  }
  const start = content.startsAt.length === 10 ? `${content.startsAt}T09:00` : content.startsAt;
  const end = content.endsAt && content.endsAt.length > 10 ? content.endsAt : plusOneHour(start);
  return { start: { dateTime: `${start}:00`, timeZone, date: null }, end: { dateTime: `${end}:00`, timeZone, date: null } };
}

function plusOneHour(start: string): string {
  const [day, time] = [start.slice(0, 10), start.slice(11, 16)];
  const [h, m] = time.split(':').map(Number) as [number, number];
  if (h >= 23) return `${day}T23:59`;
  return `${day}T${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Le rattachement, dans les champs privés de l'événement : vide, il est retiré. */
function linkProperties(content: Pick<EventContent, 'projectId' | 'subjectId'>) {
  return { private: { cockpitProjectId: content.projectId ?? '', cockpitSubjectId: content.subjectId ?? '' } };
}

/** L'événement à créer chez Google. */
export function insertPayload(edit: GoogleEdit & EventContent, timeZone: string): Record<string, unknown> {
  return {
    id: edit.eventId,
    summary: edit.title,
    location: edit.location ?? '',
    description: edit.notes ?? '',
    ...googleTimes(edit, timeZone),
    extendedProperties: linkProperties(edit),
    ...(edit.recurrence ? { recurrence: [`RRULE:${edit.recurrence}`] } : {}),
  };
}

/**
 * Ce qu'un 'patch' envoie : seulement les champs changés. Pour toute une série, l'heure part à part
 * (`google_series_retime` : le premier événement garde son jour) ; ici, seulement le reste.
 */
export function patchPayload(edit: GoogleEdit, timeZone: string): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (edit.fields.includes('title')) body.summary = edit.title ?? '';
  if (edit.fields.includes('location')) body.location = edit.location ?? '';
  if (edit.fields.includes('notes')) body.description = edit.notes ?? '';
  if (edit.fields.includes('link')) body.extendedProperties = linkProperties({ projectId: edit.projectId ?? null, subjectId: edit.subjectId ?? null });
  if (edit.fields.includes('time') && edit.scope === 'this' && edit.startsAt) {
    Object.assign(body, googleTimes({ startsAt: edit.startsAt, endsAt: edit.endsAt ?? null, allDay: edit.allDay ?? false }, timeZone));
  }
  return body;
}

/** Toute une série à une autre heure : les heures 'HH:MM' de début et de fin (une série à l'heure seulement). */
export function seriesRetime(edit: GoogleEdit): { startTime: string; endTime: string } | null {
  if (edit.scope !== 'all' || !edit.fields.includes('time') || edit.allDay || !edit.startsAt || edit.startsAt.length <= 10) return null;
  const startTime = edit.startsAt.slice(11, 16);
  const endTime = edit.endsAt && edit.endsAt.length > 10 ? edit.endsAt.slice(11, 16) : plusOneHour(edit.startsAt).slice(11, 16);
  return { startTime, endTime };
}

/** Un refus de Google, tel que Rust le dit : `genre|message`. */
export type WriteFailure = { kind: 'offline' | 'denied' | 'error'; message: string };

export function parseWriteError(error: unknown): WriteFailure {
  const text = error instanceof Error ? error.message : String(error);
  const [kind, ...rest] = text.split('|');
  if (kind === 'offline' || kind === 'denied' || kind === 'error') return { kind, message: rest.join('|') };
  return { kind: 'error', message: text };
}

/** Les champs que change une modification, entre l'événement d'avant et celui d'après. */
export function changedFields(before: EventContent, after: EventContent): EditField[] {
  const fields: EditField[] = [];
  if (before.title !== after.title) fields.push('title');
  if ((before.location ?? '') !== (after.location ?? '')) fields.push('location');
  if ((before.notes ?? '') !== (after.notes ?? '')) fields.push('notes');
  if (before.startsAt !== after.startsAt || (before.endsAt ?? null) !== (after.endsAt ?? null) || before.allDay !== after.allDay) fields.push('time');
  if ((before.projectId ?? null) !== (after.projectId ?? null) || (before.subjectId ?? null) !== (after.subjectId ?? null)) fields.push('link');
  return fields;
}
