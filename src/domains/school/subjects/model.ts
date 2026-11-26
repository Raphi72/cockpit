import { paletteKeys, type AppColor } from '@/ui/data/ColorDot';

/** Une matière (V2, étape 2) : ses devoirs, ses cours, ses examens et ses notes s'y rattachent. */
export type Subject = {
  id: string;
  name: string;
  color: AppColor;
  teacher: string | null;
  /** Salle habituelle ; un cours de l'emploi du temps peut en avoir une autre. */
  room: string | null;
  /** Poids de la matière dans la moyenne générale. */
  coefficient: number;
  sortOrder: number;
  createdAt: string;
};

/** Liste des matières : de quoi dire en un coup d'œil où l'on en est (calculé). */
export type SubjectListItem = Subject & {
  /** Devoirs pas encore rendus. */
  openHomework: number;
};

export type SubjectInput = {
  name: string;
  color: AppColor;
  teacher: string;
  room: string;
  /** Saisi en texte : « 1,5 » comme « 1.5 ». */
  coefficient: string;
};

export type NormalizedSubject = {
  name: string;
  color: AppColor;
  teacher: string | null;
  room: string | null;
  coefficient: number;
};

/** « 1,5 » ou « 1.5 » → 1.5 ; `null` si ce n'est pas un nombre strictement positif. */
export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** 1.5 → « 1,5 », 2 → « 2 » (deux décimales au plus). */
export function formatDecimal(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

export function validateSubject(input: SubjectInput): Partial<Record<'name' | 'coefficient', string>> {
  const errors: Partial<Record<'name' | 'coefficient', string>> = {};
  if (input.name.trim() === '') errors.name = 'Donne un nom à la matière.';
  const coefficient = parseDecimal(input.coefficient);
  if (coefficient === null || coefficient <= 0) errors.coefficient = 'Un nombre plus grand que 0 (1, 2, 1,5…).';
  return errors;
}

export function normalizeSubject(input: SubjectInput): NormalizedSubject {
  return {
    name: input.name.trim(),
    color: input.color,
    teacher: input.teacher.trim() || null,
    room: input.room.trim() || null,
    coefficient: parseDecimal(input.coefficient) ?? 1,
  };
}

export function subjectToInput(subject: Subject): SubjectInput {
  return {
    name: subject.name,
    color: subject.color,
    teacher: subject.teacher ?? '',
    room: subject.room ?? '',
    coefficient: formatDecimal(subject.coefficient),
  };
}

/** Couleur proposée pour une nouvelle matière : la première que n'utilise encore aucune autre. */
export function nextSubjectColor(used: AppColor[]): AppColor {
  const colors = paletteKeys.filter((key) => key !== 'slate');
  return colors.find((color) => !used.includes(color)) ?? colors[used.length % colors.length] ?? 'blue';
}

/** « Mme Martin · B204 · coef. 2 » : ce qui décrit la matière sous son nom. */
export function subjectDetails(subject: Pick<Subject, 'teacher' | 'room' | 'coefficient'>): string {
  return [subject.teacher, subject.room, `coef. ${formatDecimal(subject.coefficient)}`].filter(Boolean).join(' · ');
}

/** Ce qu'emporte la suppression d'une matière, pour le message (« avec 3 devoirs et 2 notes »). */
export type SubjectRemoval = { homework: number; slots: number; exams: number; grades: number };

export function removalSummary(removal: SubjectRemoval): string {
  const parts = [
    [removal.homework, 'devoir', 'devoirs'],
    [removal.slots, 'cours', 'cours'],
    [removal.exams, 'examen', 'examens'],
    [removal.grades, 'note', 'notes'],
  ]
    .filter(([count]) => (count as number) > 0)
    .map(([count, one, many]) => `${count} ${(count as number) > 1 ? many : one}`);
  if (parts.length === 0) return 'Matière supprimée.';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`;
  return `Matière supprimée, avec ${list}.`;
}
