import { addDaysISO } from '@/core/dates';
import type { AppColor, PaletteKey } from '@/ui/data/ColorDot';

/**
 * Google Agenda en lecture seule (V2, étape 8). La connexion, les jetons et les appels réseau sont côté
 * Rust (src-tauri/src/google.rs) ; ici, ce que l'interface fait de ce qu'il renvoie.
 */

/** Où en est la connexion : identifiants du client enregistrés, compte connecté. */
/** `syncAllowed` : le droit sur le dossier caché de Drive (synchronisation, étape 9) a été donné. */
export type GoogleStatus = { configured: boolean; connected: boolean; account: string | null; clientHint: string | null; syncAllowed: boolean };

/** Un agenda tel que Google le décrit. */
export type RemoteCalendar = { id: string; name: string; color: string | null; primary: boolean; selected: boolean };

/** Un événement tel que Google le renvoie : un jour ('YYYY-MM-DD', fin exclue) ou une heure avec son décalage. */
export type RemoteEvent = {
  id: string;
  title: string;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
};

/** Un agenda gardé en local, avec les choix faits dans Paramètres (affiché, couleur). */
export type GoogleCalendar = {
  id: string;
  name: string;
  googleColor: string | null;
  color: AppColor;
  isPrimary: boolean;
  shown: boolean;
  /** L'agenda des cours (l'emploi du temps de l'intranet, relié par iCal) : ses événements sont des cours. */
  isSchool: boolean;
  syncedAt: string | null;
};

/** La copie d'un événement, aux formes du calendrier de Cockpit. */
export type LocalEvent = {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  htmlLink: string | null;
  /** Pour un agenda des cours : l'intitulé ramené au cours (voir parseCourseTitle), son type et ses profs. */
  course?: string | null;
  courseKind?: string | null;
  teacher?: string | null;
};

/**
 * Réglage : l'utilisateur a choisi lui-même l'agenda des cours dans Paramètres. Dès lors, Cockpit ne le
 * reconnaît plus tout seul (sans quoi un agenda décoché reviendrait à la relecture suivante).
 */
export const SCHOOL_MANUAL_SETTING = 'google.schoolManual';

/** Relecture : au lancement puis toutes les 15 minutes, tant que Cockpit tourne et que Google est connecté. */
export const GOOGLE_SYNC_MINUTES = 15;

/** Les événements copiés : un mois en arrière, un peu plus d'un an en avant. */
export function syncWindow(today: string): { from: string; to: string; timeMin: string; timeMax: string } {
  const from = addDaysISO(today, -35);
  const to = addDaysISO(today, 400);
  return { from, to, timeMin: `${from}T00:00:00Z`, timeMax: `${to}T00:00:00Z` };
}

/**
 * Aux formes du calendrier : une heure locale 'YYYY-MM-DDTHH:MM' (Google l'écrit déjà dans le fuseau
 * demandé, il suffit de couper le décalage), ou des journées avec le dernier jour compris.
 */
export function toLocalEvent(remote: RemoteEvent): LocalEvent {
  const base = { id: remote.id, title: remote.title, location: remote.location, htmlLink: remote.htmlLink, allDay: remote.allDay };
  if (remote.allDay) {
    const last = addDaysISO(remote.end, -1);
    return { ...base, startsAt: remote.start, endsAt: last > remote.start ? last : null };
  }
  return { ...base, startsAt: remote.start.slice(0, 16), endsAt: remote.end.slice(0, 16) };
}

/** Les couleurs de la palette (tokens.css, thème clair), pour retrouver la plus proche d'une couleur Google. */
const PALETTE_RGB: Record<PaletteKey, [number, number, number]> = {
  slate: [0x8b, 0x8d, 0x98],
  blue: [0x3e, 0x7b, 0xfa],
  violet: [0x8a, 0x63, 0xd2],
  pink: [0xd6, 0x58, 0x9a],
  red: [0xdc, 0x50, 0x50],
  orange: [0xe0, 0x7b, 0x39],
  amber: [0xd4, 0xa0, 0x18],
  green: [0x3a, 0xa5, 0x6b],
  teal: [0x2a, 0x9d, 0x9a],
};

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) return null;
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)];
}

/** Teinte (0-360) et saturation (0-1) : la teinte départage mieux deux couleurs que la distance RVB. */
function hueSat([r, g, b]: [number, number, number]): { hue: number; sat: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  if (delta === 0) return { hue: 0, sat: 0 };
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  let hue = max === rr ? ((gg - bb) / delta) % 6 : max === gg ? (bb - rr) / delta + 2 : (rr - gg) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  const light = (max + min) / 2;
  return { hue, sat: delta / (1 - Math.abs(2 * light - 1)) };
}

/** La couleur de la palette la plus proche d'une couleur Google (grise si elle est terne ou inconnue). */
export function nearestPaletteKey(hex: string | null): PaletteKey {
  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) return 'slate';
  const color = hueSat(rgb);
  if (color.sat < 0.18) return 'slate';
  let best: PaletteKey = 'blue';
  let bestDistance = Infinity;
  for (const [key, value] of Object.entries(PALETTE_RGB) as [PaletteKey, [number, number, number]][]) {
    if (key === 'slate') continue;
    const { hue } = hueSat(value);
    const around = Math.abs(hue - color.hue);
    const distance = Math.min(around, 360 - around);
    if (distance < bestDistance) {
      best = key;
      bestDistance = distance;
    }
  }
  return best;
}

/** Ce qu'une relecture dit des agendas : ceux à ajouter (affichés s'ils sont cochés dans Google), à mettre à jour, à retirer. */
export function planCalendars(
  remote: RemoteCalendar[],
  local: Pick<GoogleCalendar, 'id'>[],
): { added: RemoteCalendar[]; kept: RemoteCalendar[]; removed: string[] } {
  const known = new Set(local.map((c) => c.id));
  const seen = new Set(remote.map((c) => c.id));
  return {
    added: remote.filter((c) => !known.has(c.id)),
    kept: remote.filter((c) => known.has(c.id)),
    removed: local.filter((c) => !seen.has(c.id)).map((c) => c.id),
  };
}

// ─── Cours ──────────────────────────────────────────────────────────────────

/** Un morceau d'intitulé qui dit le type de séance ou le groupe, pas la matière : « TD », « CM 2 », « Groupe A ». */
const TYPE_SEGMENT =
  /^(?:(?:cm|td|tp|tds|tps|ds|de|cours|amphi|tutorat|examen|exam|partiel|contr[ôo]le|soutenance)\s*\d*\s*)+(?:(?:gr(?:oupe|\.)?|g)\s*[\w-]+)?$|^(?:gr(?:oupe|\.)?|g)\s*[\w-]+$/i;

/**
 * L'intitulé d'un cours ramené à sa matière : sans le type de séance ni le groupe. « Maths - TD » et
 * « Maths (CM) » donnent « Maths » ; « R1.01 - Initiation au développement - TP 2 » donne
 * « R1.01 - Initiation au développement ». Tous les cours d'une matière partagent ainsi un intitulé.
 */
export function courseName(title: string): string {
  return parseCourseTitle(title).name;
}

/** Un cours lu dans son intitulé : la matière, le type de séance (« Cours », « Examen », « TD »…) et les profs. */
export type CourseParts = { name: string; kind: string | null; teacher: string | null };

/** Un type ou un groupe collé à la fin du nom : « Physique TD2 », « Anglais Groupe B ». */
function withoutTrailingType(name: string): string {
  return name.replace(/\s+(?:cm|td|tp|tds|tps|ds)\s*\d*$/i, '').replace(/\s+(?:gr(?:oupe|\.)?|g)\s*[\w-]+$/i, '').trim();
}

/**
 * L'intitulé d'un cours. Les emplois du temps d'école exportés en iCal l'écrivent souvent
 * « Matière | Type | Prof {école} » : la matière est le premier morceau, le type le deuxième (vide parfois),
 * les profs le reste (sans « {…} », sans doublon). Sinon, l'intitulé est ramené à sa matière par les
 * séparateurs habituels (voir legacyCourseName).
 */
export function parseCourseTitle(title: string): CourseParts {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (!clean.includes('|')) return { name: legacyCourseName(clean), kind: null, teacher: null };
  const [first = '', kind = '', ...rest] = clean.split('|').map((part) => part.trim());
  const teachers = [
    ...new Set(
      rest
        .join(',')
        .split(',')
        .map((t) => t.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ),
  ];
  const name = withoutTrailingType(first) || first || clean;
  return { name, kind: kind || null, teacher: teachers.length ? teachers.join(', ') : null };
}

/** Un intitulé à la forme d'un emploi du temps d'école : « Matière | Type | Prof ». */
const TIMETABLE_TITLE = /^[^|]+\|[^|]*\|/;

/**
 * L'agenda d'un emploi du temps : au moins 5 événements à l'heure, et 60 % d'entre eux à la forme
 * « Matière | Type | Prof ». Les journées entières (jours fériés…) ne comptent pas.
 */
export function looksLikeTimetable(events: Pick<LocalEvent, 'title' | 'allDay'>[]): boolean {
  const timed = events.filter((event) => !event.allDay);
  const matching = timed.filter((event) => TIMETABLE_TITLE.test(event.title.trim())).length;
  return matching >= 5 && matching >= timed.length * 0.6;
}

/** Second indice : un agenda nommé comme un emploi du temps (« Emploi du temps », « EDT M1 », « Timetable »). */
export function isTimetableName(name: string): boolean {
  const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /emploi du temps|\bedt\b|timetable/.test(plain);
}

/** L'ancienne règle, pour les intitulés sans « | » : sans le type de séance ni le groupe. */
function legacyCourseName(title: string): string {
  let text = title.replace(/\s+/g, ' ').trim();
  text = text.replace(/\s*[([]\s*([^)\]]*?)\s*[)\]]/g, (whole, inner: string) => (TYPE_SEGMENT.test(inner.trim()) ? '' : whole)).trim();
  const parts = text.split(/\s+[-–—:|/]\s+/).map((p) => p.trim()).filter(Boolean);
  const kept = parts.filter((p) => !TYPE_SEGMENT.test(p));
  // Type ou groupe collé à la fin : « Physique TD2 », « Anglais Groupe B ».
  const name = withoutTrailingType((kept.length ? kept : parts).join(' - '));
  return name || title.trim();
}

/** Pour comparer un intitulé au nom d'une matière : sans accents ni majuscules. */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(a) === norm(b);
}

/** La couleur d'une matière créée toute seule : celle de la palette la moins prise par les autres. */
export function freeSubjectColor(used: string[]): PaletteKey {
  const choices: PaletteKey[] = ['blue', 'violet', 'green', 'orange', 'pink', 'teal', 'amber', 'red'];
  const count = (key: PaletteKey) => used.filter((c) => c === key).length;
  return choices.reduce((best, key) => (count(key) < count(best) ? key : best), choices[0]!);
}

/** Un événement Google dans l'agenda : l'agenda et l'événement, séparés par une barre (aucun des deux n'en contient). */
export function googleItemId(calendarId: string, eventId: string): string {
  return `${calendarId}|${eventId}`;
}

export function splitGoogleItemId(id: string): { calendarId: string; eventId: string } {
  const at = id.lastIndexOf('|');
  return { calendarId: id.slice(0, at), eventId: id.slice(at + 1) };
}
