import { addMinutes, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { daysBetween, formatLongDate, timeToMinutes, toISODate } from '@/core/dates';
import { formatMoney } from '@/core/money';
import type { AgendaItem } from '@/domains/agenda';
import { dashboardSummary } from '@/domains/dashboard/model';
import type { SettingDef } from '@/domains/settings/model';

// ─── Règles et réglage ──────────────────────────────────────────────────────

export type NotificationRule = 'events' | 'deadlines' | 'priorityTasks' | 'payments' | 'projectStarts' | 'morningSummary';

/** Les règles, dans l'ordre de Paramètres › Notifications. */
export const NOTIFICATION_RULES: { rule: NotificationRule; label: string; hint: string }[] = [
  { rule: 'events', label: 'Rendez-vous', hint: '15 minutes avant un événement à heure fixe' },
  { rule: 'deadlines', label: 'Deadlines', hint: 'projets et échéances, 3 jours avant puis le jour même' },
  { rule: 'priorityTasks', label: 'Tâches prioritaires', hint: 'la veille de leur deadline' },
  { rule: 'payments', label: 'Encaissements', hint: 'la veille de la date prévue, puis s’ils sont en retard' },
  { rule: 'projectStarts', label: 'Débuts de projet', hint: 'le jour même' },
  { rule: 'morningSummary', label: 'Résumé du matin', hint: 'à 8 h, les tâches du jour et le prochain rendez-vous' },
];

export type NotificationRules = Record<NotificationRule, boolean>;

/**
 * Règles activées, gardées ensemble dans la table `settings`. Seules celles qu'on a changées y
 * sont forcément : une règle absente est activée (une règle ajoutée plus tard le sera aussi).
 */
export const RULES_SETTING: SettingDef<Partial<NotificationRules>> = { key: 'notifications.rules', fallback: {} };

export function resolveRules(stored: Partial<NotificationRules> | null | undefined): NotificationRules {
  const rules = {} as NotificationRules;
  for (const { rule } of NOTIFICATION_RULES) rules[rule] = stored?.[rule] ?? true;
  return rules;
}

// ─── Moments ────────────────────────────────────────────────────────────────

/** Heure locale : les dates-heures des événements sont locales ('YYYY-MM-DDTHH:MM'). */
export type Moment = { today: string; time: string };

export function momentOf(date: Date): Moment {
  return { today: toISODate(date), time: format(date, 'HH:mm') };
}

/** 'YYYY-MM-DDTHH:MM', le format des événements à heure fixe : les comparaisons de texte suffisent. */
export function stampOf(moment: Moment): string {
  return `${moment.today}T${moment.time}`;
}

export function addMinutesToStamp(stamp: string, minutes: number): string {
  return format(addMinutes(parseISO(stamp), minutes), "yyyy-MM-dd'T'HH:mm");
}

/** Un rendez-vous est annoncé 15 minutes avant. */
export const EVENT_LEAD_MIN = 15;

/** Les rappels du jour partent à 8 h si Cockpit est resté ouvert (pas en pleine nuit, au changement de jour). */
export const MORNING_TIME = '08:00';

/** Passé midi, le résumé du matin n'est plus envoyé (ordinateur sorti de veille l'après-midi…). */
export const MORNING_SUMMARY_UNTIL = '12:00';

/**
 * Tournée des rappels du jour (deadlines, tâches, encaissements, débuts de projet) : à l'ouverture de
 * Cockpit, puis chaque matin à 8 h s'il reste ouvert. Entre deux tournées, seuls les rendez-vous
 * sont annoncés : un élément qu'on vient de saisir ne déclenche pas de notification sur-le-champ.
 * Le résumé du matin n'est que de la tournée de 8 h : à l'ouverture, le dashboard est déjà à l'écran.
 */
export type Round = 'launch' | 'morning' | null;

export function roundFor(moment: Moment, lastRoundDay: string | null, atLaunch: boolean): Round {
  if (atLaunch) return 'launch';
  return moment.time >= MORNING_TIME && lastRoundDay !== moment.today ? 'morning' : null;
}

/**
 * Jour de la dernière tournée après celle-ci. Une ouverture après 8 h vaut la tournée du matin :
 * pas de seconde tournée ce jour-là.
 */
export function nextRoundDay(moment: Moment, lastRoundDay: string | null, round: Round): string | null {
  if (round === 'morning' || (round === 'launch' && moment.time >= MORNING_TIME)) return moment.today;
  return lastRoundDay;
}

// ─── Ce qu'on lit en base ───────────────────────────────────────────────────

export type TimedEvent = { id: string; title: string; startsAt: string; location: string | null };
export type DeadlineSource = { source: 'project' | 'event'; id: string; title: string; date: string };
export type PriorityTask = { id: string; title: string; priority: number; dueDate: string; projectName: string | null };
export type ExpectedPayment = { id: string; label: string; name: string | null; dueDate: string; amountCents: number };
export type ProjectStart = { id: string; name: string; startDate: string; savedStatus: string };
export type DaySummary = { todayCount: number; overdueCount: number; nextEvent: AgendaItem | null };

/** Une notification à envoyer. La clé, gardée dans `notification_log`, garantit qu'elle ne part qu'une fois. */
export type Notice = { key: string; title: string; body: string };

// ─── Textes ─────────────────────────────────────────────────────────────────

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/** « aujourd'hui », « demain », « dans 3 jours » */
function inDays(days: number): string {
  if (days === 0) return 'aujourd’hui';
  if (days === 1) return 'demain';
  return `dans ${days} jours`;
}

/** « jeudi 1 octobre » */
function longDay(day: string): string {
  return format(parseISO(day), 'EEEE d MMMM', { locale: fr });
}

// ─── Règles ─────────────────────────────────────────────────────────────────

/** Rendez-vous : 15 minutes avant (moins si Cockpit vient d'être ouvert), une fois par horaire. */
export function eventNotices(events: TimedEvent[], moment: Moment): Notice[] {
  const now = timeToMinutes(moment.time);
  return events.map((event) => {
    const time = event.startsAt.slice(11, 16);
    const sameDay = event.startsAt.slice(0, 10) === moment.today;
    const left = sameDay ? timeToMinutes(time) - now : timeToMinutes(time) + 24 * 60 - now;
    const when = left <= 0 ? `Maintenant, à ${time}` : `Dans ${plural(left, 'minute')}, à ${time}`;
    return {
      key: `event:${event.id}:${event.startsAt}`,
      title: event.title,
      body: event.location ? `${when} · ${event.location}` : when,
    };
  });
}

/**
 * Deadlines de projets et échéances saisies : une fois dans les 3 jours qui précèdent (« dans 3 jours »,
 * ou moins si Cockpit n'était pas ouvert ce jour-là), puis le jour même. Décaler la deadline relance les rappels.
 */
export function deadlineNotices(deadlines: DeadlineSource[], today: string): Notice[] {
  const notices: Notice[] = [];
  for (const deadline of deadlines) {
    const days = daysBetween(today, deadline.date);
    if (days < 0 || days > 3) continue;
    const word = deadline.source === 'project' ? 'Deadline' : 'Échéance';
    notices.push({
      key: `${deadline.source}-deadline:${deadline.id}:${deadline.date}:${days === 0 ? 'J' : 'J-3'}`,
      title: deadline.title,
      body: days <= 1 ? `${word} ${inDays(days)}` : `${word} ${inDays(days)} · ${longDay(deadline.date)}`,
    });
  }
  return notices;
}

/** Tâche Haute ou Urgente dont la deadline est demain. */
export function priorityTaskNotices(tasks: PriorityTask[], today: string): Notice[] {
  return tasks
    .filter((task) => task.priority >= 2 && daysBetween(today, task.dueDate) === 1)
    .map((task) => {
      const what = `Tâche ${task.priority >= 3 ? 'urgente' : 'prioritaire'}, deadline demain`;
      return {
        key: `task-due:${task.id}:${task.dueDate}`,
        title: task.title,
        body: task.projectName ? `${what} · ${task.projectName}` : what,
      };
    });
}

/**
 * Encaissement attendu : la veille de la date prévue, puis une fois s'il passe en retard.
 * « Site vitrine » / « En retard de 3 jours : Acompte · 600 € ».
 * Sans `showAmounts` (Paramètres › Tableau de bord), aucun montant : une notification se voit à l'écran.
 */
export function paymentNotices(payments: ExpectedPayment[], today: string, showAmounts: boolean): Notice[] {
  const notices: Notice[] = [];
  for (const payment of payments) {
    const days = daysBetween(today, payment.dueDate);
    if (days !== 1 && days >= 0) continue;
    const when = days === 1 ? 'Prévu demain' : `En retard de ${plural(-days, 'jour')}`;
    const what = `${when} : ${payment.label}`;
    notices.push({
      key: `payment-${days === 1 ? 'due' : 'late'}:${payment.id}:${payment.dueDate}`,
      title: payment.name ?? 'Encaissement',
      body: showAmounts ? `${what} · ${formatMoney(payment.amountCents)}` : what,
    });
  }
  return notices;
}

/** Projet qui commence aujourd'hui ; s'il était À venir, il passe En cours (le statut du jour est calculé). */
export function projectStartNotices(projects: ProjectStart[], today: string): Notice[] {
  return projects
    .filter((project) => project.startDate === today)
    .map((project) => ({
      key: `project-start:${project.id}:${project.startDate}`,
      title: project.name,
      body: project.savedStatus === 'planned' ? 'Commence aujourd’hui : il passe En cours' : 'Commence aujourd’hui',
    }));
}

/**
 * Résumé du matin : la phrase de synthèse du dashboard (« 5 tâches aujourd'hui, dont 1 en retard ·
 * rendez-vous à 14:00 »). Rien s'il n'y a rien de prévu.
 */
export function summaryNotice(summary: DaySummary, today: string): Notice | null {
  if (summary.todayCount === 0 && !summary.nextEvent) return null;
  return { key: `morning-summary:${today}`, title: formatLongDate(parseISO(today)), body: dashboardSummary(summary) };
}

// ─── Envoi ──────────────────────────────────────────────────────────────────

/** Au-delà, les notifications d'une même vérification sont regroupées (ouverture après quelques jours…). */
export const MAX_AT_ONCE = 3;

/** Ce qui s'affiche : jusqu'à 3 notifications, sinon les 2 premières et une qui regroupe les autres. */
export function bundleNotices(notices: Notice[]): { title: string; body: string }[] {
  const shown = notices.map(({ title, body }) => ({ title, body }));
  if (shown.length <= MAX_AT_ONCE) return shown;
  const rest = shown.slice(MAX_AT_ONCE - 1);
  return [
    ...shown.slice(0, MAX_AT_ONCE - 1),
    { title: `${rest.length} autres rappels`, body: rest.map((notice) => notice.title).join(' · ') },
  ];
}
