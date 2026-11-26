import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { isISODate } from '@/core/dates';

/**
 * Calendrier scolaire. Les semestres rangent les notes (moyenne par semestre, puis de l'année) et
 * bornent l'emploi du temps ; les vacances sont des périodes sans cours. Dates incluses.
 */
export type PeriodKind = 'semester' | 'holiday';

export type SchoolPeriod = {
  id: string;
  kind: PeriodKind;
  name: string;
  startsOn: string;
  endsOn: string;
};

export type PeriodInput = Pick<SchoolPeriod, 'kind' | 'name' | 'startsOn' | 'endsOn'>;

const contains = (period: Pick<SchoolPeriod, 'startsOn' | 'endsOn'>, day: string) => day >= period.startsOn && day <= period.endsOn;

const byStart = (a: SchoolPeriod, b: SchoolPeriod) => a.startsOn.localeCompare(b.startsOn) || a.name.localeCompare(b.name, 'fr');

export function semesters(periods: SchoolPeriod[]): SchoolPeriod[] {
  return periods.filter((p) => p.kind === 'semester').sort(byStart);
}

export function holidays(periods: SchoolPeriod[]): SchoolPeriod[] {
  return periods.filter((p) => p.kind === 'holiday').sort(byStart);
}

/** Le semestre qui contient ce jour, s'il y en a un. */
export function semesterOn(periods: SchoolPeriod[], day: string): SchoolPeriod | null {
  return semesters(periods).find((p) => contains(p, day)) ?? null;
}

/** Les vacances qui contiennent ce jour, s'il y en a. */
export function holidayOn(periods: SchoolPeriod[], day: string): SchoolPeriod | null {
  return holidays(periods).find((p) => contains(p, day)) ?? null;
}

/**
 * Jour où l'emploi du temps s'applique : pas en vacances, et dans un semestre (sans aucun semestre
 * saisi, toute l'année compte : la semaine type s'applique dès qu'on la remplit).
 */
export function hasClassesOn(periods: SchoolPeriod[], day: string): boolean {
  if (holidayOn(periods, day)) return false;
  const list = semesters(periods);
  return list.length === 0 || list.some((p) => contains(p, day));
}

/** Semestre à montrer par défaut : celui en cours, sinon le prochain, sinon le dernier passé. */
export function currentSemester(periods: SchoolPeriod[], today: string): SchoolPeriod | null {
  const list = semesters(periods);
  return list.find((p) => contains(p, today)) ?? list.find((p) => p.startsOn > today) ?? list.at(-1) ?? null;
}

/** Prochaines vacances (ou celles en cours). */
export function nextHoliday(periods: SchoolPeriod[], today: string): SchoolPeriod | null {
  return holidays(periods).find((p) => p.endsOn >= today) ?? null;
}

export function validatePeriod(input: PeriodInput, others: SchoolPeriod[]): string | null {
  if (input.name.trim() === '') return 'Donne-lui un nom.';
  if (!isISODate(input.startsOn) || !isISODate(input.endsOn)) return 'Dates invalides.';
  if (input.endsOn < input.startsOn) return 'La fin doit venir après le début.';
  // Une note appartient à un seul semestre : ils ne se chevauchent pas.
  if (input.kind === 'semester') {
    const overlap = semesters(others).find((p) => input.startsOn <= p.endsOn && input.endsOn >= p.startsOn);
    if (overlap) return `Chevauche « ${overlap.name} ».`;
  }
  return null;
}

/**
 * Deux semestres pour l'année scolaire en cours (septembre-janvier, février-juin) : une proposition
 * en un clic, que l'on ajuste ensuite.
 */
export function suggestedSemesters(today: string): PeriodInput[] {
  const year = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 8 ? year : year - 1;
  return [
    { kind: 'semester', name: 'Semestre 1', startsOn: `${start}-09-01`, endsOn: `${start + 1}-01-31` },
    { kind: 'semester', name: 'Semestre 2', startsOn: `${start + 1}-02-01`, endsOn: `${start + 1}-06-30` },
  ];
}

const short = (day: string) => format(parseISO(day), 'd MMM', { locale: fr });

/** « du 1 sept. au 31 janv. » */
export function periodRange(period: Pick<SchoolPeriod, 'startsOn' | 'endsOn'>): string {
  return `du ${short(period.startsOn)} au ${short(period.endsOn)}`;
}

/**
 * Où l'on en est dans l'année, en une ligne : « En vacances jusqu'au 4 janv. », « Semestre 1, jusqu'au
 * 31 janv. », ou rien si aucun semestre n'est saisi.
 */
export function schoolStatus(periods: SchoolPeriod[], today: string): string | null {
  const holiday = holidayOn(periods, today);
  if (holiday) return `${holiday.name} : pas de cours jusqu’au ${short(holiday.endsOn)}`;
  const semester = semesterOn(periods, today);
  if (semester) {
    const next = nextHoliday(periods, today);
    const holidayText = next && next.startsOn <= semester.endsOn ? ` · ${next.name} le ${short(next.startsOn)}` : '';
    return `${semester.name}, jusqu’au ${short(semester.endsOn)}${holidayText}`;
  }
  const upcoming = semesters(periods).find((p) => p.startsOn > today);
  if (upcoming) return `${upcoming.name} : reprise le ${short(upcoming.startsOn)}`;
  return null;
}
