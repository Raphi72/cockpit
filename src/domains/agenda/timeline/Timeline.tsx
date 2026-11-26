import { Link, useNavigate } from '@tanstack/react-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Flag } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatShortDate } from '@/core/dates';
import { deadlineStatus } from '@/core/deadline';
import { useDeadlineHorizon } from '@/core/deadline-horizon';
import { formatMoney } from '@/core/money';
import { formatMinutes } from '@/domains/day/model';
import { usePaymentEditor } from '@/domains/finance/payments/editor-store';
import { projectProgress } from '@/domains/projects/model';
import { ColorDot } from '@/ui/data/ColorDot';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { dayOffset, monthMarks, type PlanningPayment, type PlanningRow, type PlanningPeriod } from './model';
import { displayMinutes, isWeekShort, weekShortage, type WeekWorkload } from './workload';

const HEADER_HEIGHT = 52;
/** Deux lignes : « À faire » puis « Posé dans la Journée ». */
const BAND_HEIGHT = 64;
/** En zoom mois, la ligne d'un projet garde la place de ses heures par semaine, sous la barre. */
const ROW_HEIGHT = { detailed: 60, compact: 44 } as const;

/** « 6 h », « 1 h 30 », arrondi au quart d'heure ; un tiret sans rien. */
const hours = (minutes: number) => (displayMinutes(minutes) === 0 ? '–' : formatMinutes(displayMinutes(minutes)));

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);
const pct = (fraction: number) => `${fraction * 100}%`;

/** Portion [from, to[ de la période, en pourcentages CSS (bornée aux bords). */
function span(from: number, to: number): CSSProperties {
  return { left: pct(clamp(from)), width: pct(clamp(to) - clamp(from)) };
}

/** Mois en haut, puis le premier jour de chaque semaine (sa date en zoom mois, son numéro de jour en trimestre). */
function Header({ period, today, detailed }: { period: PlanningPeriod; today: string; detailed: boolean }) {
  const todayOffset = dayOffset(period, today);
  return (
    <div className="relative border-b border-line" style={{ height: HEADER_HEIGHT }}>
      {monthMarks(period).map((mark) => (
        <span key={mark.day} className="absolute top-0 pl-1.5 text-meta font-medium text-ink-2" style={{ left: pct(mark.offset) }}>
          {mark.label}
        </span>
      ))}
      {period.weeks.map((week) => (
        <span
          key={week}
          className="tnum absolute bottom-1.5 pl-1.5 text-meta text-ink-3"
          style={{ left: pct(dayOffset(period, week)) }}
        >
          {format(parseISO(week), detailed ? 'd MMM' : 'd', { locale: fr })}
        </span>
      ))}
      {todayOffset >= 0 && todayOffset < 1 && (
        <span
          className="absolute bottom-0 size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-accent"
          style={{ left: pct(todayOffset + 0.5 / period.days) }}
          title="Aujourd’hui"
        />
      )}
    </div>
  );
}

/**
 * Intensité de la case « À faire » selon les heures de la semaine : une seule couleur, plus soutenue à
 * mesure qu'elles s'empilent. L'ambre est gardé pour le temps qui manque (isWeekShort).
 */
function todoClass(week: WeekWorkload, today: string): string {
  if (isWeekShort(week, today)) return 'bg-warning/15 font-medium text-warning';
  const h = week.todoMin / 60;
  if (week.todoMin === 0) return 'text-ink-3';
  if (h < 5) return 'bg-accent/8 text-ink-2';
  if (h < 10) return 'bg-accent/15 text-ink-2';
  if (h < 20) return 'bg-accent/25 text-ink';
  if (h < 30) return 'bg-accent/35 text-ink';
  return 'bg-accent/50 font-medium text-ink';
}

/** Le détail d'une semaine, au survol : à faire (par projet, retard, estimations), posé, ce qui manque. */
function weekTitle(week: WeekWorkload, today: string): string {
  const head = `Semaine du ${formatShortDate(week.week, today)}`;
  if (week.todoMin === 0 && week.plannedMin === 0) {
    return `${head} : rien à finir avant une deadline, rien de posé.\nClic : ouvrir la semaine dans la Journée`;
  }
  const lines = [head];
  if (week.todoMin > 0) {
    const shares = week.byProject.map((s) => `${s.name ?? 'Sans projet'} ${hours(s.minutes)}`).join(', ');
    lines.push(`À faire : ${hours(week.todoMin)} (${shares})`);
    if (week.lateMin > 0) lines.push(`dont ${hours(week.lateMin)} en retard`);
    if (week.unestimated > 0) {
      const many = week.unestimated > 1;
      lines.push(`${week.unestimated} tâche${many ? 's' : ''} sans durée, comptée${many ? 's' : ''} 30 min`);
    }
  }
  lines.push(`Posé dans la Journée : ${week.plannedMin > 0 ? hours(week.plannedMin) : 'rien'}`);
  const short = weekShortage(week);
  if (short > 0) lines.push(`Il manque ${formatMinutes(short)}`);
  else if (week.todoMin > 0) lines.push('Le temps posé suffit');
  lines.push('Clic : ouvrir la semaine dans la Journée');
  return lines.join('\n');
}

/**
 * Bande de charge : pour chaque semaine, en haut le travail à finir avant les deadlines, en bas le
 * temps posé dans la Journée. Un clic ouvre la semaine dans la Journée, pour y poser des blocs.
 */
function WorkloadBand({ load, period, today }: { load: WeekWorkload[]; period: PlanningPeriod; today: string }) {
  const navigate = useNavigate();
  const open = (week: string) => void navigate({ to: '/day', search: { day: week <= today ? undefined : week, view: 'week' } });
  return (
    <div className="relative border-b border-line" style={{ height: BAND_HEIGHT }}>
      {load.map((week) => (
        <div
          key={week.week}
          className="absolute inset-y-0 p-1"
          style={span(dayOffset(period, week.week), dayOffset(period, week.week) + 7 / period.days)}
        >
          {!week.past && (
            <button
              type="button"
              onClick={() => open(week.week)}
              title={weekTitle(week, today)}
              aria-label={`Semaine du ${formatShortDate(week.week, today)} : à faire ${hours(week.todoMin)}, posé ${hours(week.plannedMin)}. Ouvrir dans la Journée`}
              className="tnum grid size-full grid-rows-2 gap-0.5 rounded-md text-meta outline-none transition-colors duration-[120ms] ease-soft hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-soft"
            >
              <span className={`grid place-items-center rounded-md ${todoClass(week, today)}`}>{hours(week.todoMin)}</span>
              <span className={`grid place-items-center ${isWeekShort(week, today) ? 'text-warning' : 'text-ink-3'}`}>
                {hours(week.plannedMin)}
              </span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Losange d'un encaissement : plein s'il est reçu, rouge s'il est en retard ; un clic l'ouvre. */
function PaymentMark({ payment, period, today }: { payment: PlanningPayment; period: PlanningPeriod; today: string }) {
  const openPayment = usePaymentEditor((state) => state.openPayment);
  const offset = dayOffset(period, payment.day) + 0.5 / period.days;
  if (offset < 0 || offset > 1) return null;
  const when = payment.received
    ? `reçu le ${formatShortDate(payment.day, today)}`
    : `${payment.late ? 'en retard, prévu' : 'prévu'} le ${formatShortDate(payment.day, today)}`;
  return (
    <button
      type="button"
      onClick={() => openPayment(payment.id)}
      title={`${payment.label} · ${formatMoney(payment.amountCents)} · ${when}`}
      aria-label={`Encaissement ${payment.label}, ${when}`}
      className={
        'absolute top-1/2 z-[2] size-[11px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 transition-transform duration-[120ms] ease-soft hover:scale-125 ' +
        (payment.received ? 'border-success bg-success' : payment.late ? 'border-danger bg-elevated' : 'border-ink-2 bg-elevated')
      }
      style={{ left: pct(offset) }}
    />
  );
}

/** Texte au survol d'une barre : les dates, la progression, le retard. */
function barTitle(row: PlanningRow, today: string, remaining?: { minutes: number; unestimated: number }): string {
  const { project } = row;
  const dates = row.from && row.to
    ? `du ${formatShortDate(row.from, today)} au ${formatShortDate(row.to, today)}`
    : row.from
      ? `depuis le ${formatShortDate(row.from, today)}, sans deadline`
      : `jusqu’au ${formatShortDate(row.to!, today)}, sans date de début`;
  const progress = projectProgress(project);
  const parts = [project.name, dates];
  if (progress !== null) parts.push(`${progress} % des tâches faites`);
  if (remaining && remaining.minutes > 0) {
    const many = remaining.unestimated > 1;
    const guess =
      remaining.unestimated > 0
        ? ` (dont ${remaining.unestimated} tâche${many ? 's' : ''} sans durée, comptée${many ? 's' : ''} 30 min)`
        : '';
    parts.push(`${hours(remaining.minutes)} de travail restant${guess}`);
  }
  if (row.lateUntil && row.to) parts.push(deadlineStatus(row.to, today).text);
  return parts.join(' · ');
}

/**
 * Ligne d'un projet : sa barre du début à la deadline (estompée si le début ou la fin manque), la part
 * des tâches faites, la deadline (drapeau de la couleur de son urgence), le retard en rouge jusqu'à
 * aujourd'hui, ses encaissements en losanges, et en zoom mois, sous la barre, ses heures de chaque semaine.
 */
function Track({
  row,
  period,
  today,
  height,
  weekly,
  remaining,
}: {
  row: PlanningRow;
  period: PlanningPeriod;
  today: string;
  height: number;
  weekly: { week: string; minutes: number }[] | null;
  remaining?: { minutes: number; unestimated: number };
}) {
  const { project } = row;
  const horizon = useDeadlineHorizon();
  const dayWidth = 1 / period.days;
  const from = row.from ? dayOffset(period, row.from) : -1;
  const to = row.to ? dayOffset(period, row.to) + dayWidth : 2;
  const planned = project.status === 'planned';
  const tone = row.to ? deadlineStatus(row.to, today, { horizon }).tone : null;
  const progress = projectProgress(project);
  const visible = row.bar && to > 0 && from < 1;
  // La part faite, à l'échelle de toute la barre (même coupée par les bords).
  const done = row.from && row.to && progress !== null && !planned ? from + ((to - from) * progress) / 100 : null;
  const fade = !row.from
    ? '[mask-image:linear-gradient(to_right,transparent,black_48px)]'
    : !row.to
      ? '[mask-image:linear-gradient(to_left,transparent,black_48px)]'
      : '';

  return (
    <div className="relative" style={{ height }}>
      {/* La barre et ses marques, sur la hauteur d'une ligne ordinaire ; les heures viennent dessous. */}
      <div className="absolute inset-x-0 top-0" style={{ height: ROW_HEIGHT.compact }}>
        {visible && (
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            title={barTitle(row, today, remaining)}
            className={
              'absolute top-1/2 h-[22px] -translate-y-1/2 overflow-hidden outline-none transition-colors duration-[120ms] ease-soft ' +
              'focus-visible:ring-2 focus-visible:ring-accent-soft ' +
              (from >= 0 ? 'rounded-l-md ' : '') +
              (to <= 1 ? 'rounded-r-md ' : '') +
              (planned ? 'border border-dashed border-line-strong bg-hover hover:bg-active ' : 'bg-active hover:bg-line-strong ') +
              fade
            }
            style={span(from, to)}
          >
            {done !== null && done > Math.max(from, 0) && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-ink-3/25"
                style={{ width: pct((clamp(done) - clamp(from)) / (clamp(to) - clamp(from))) }}
              />
            )}
          </Link>
        )}
        {row.lateUntil && row.to && (
          <span
            aria-hidden
            className="absolute top-1/2 h-[22px] -translate-y-1/2 rounded-r-md border border-l-0 border-dashed border-danger/60 bg-danger/10"
            style={span(to, dayOffset(period, row.lateUntil) + dayWidth)}
          />
        )}
        {/* Le drapeau juste après la barre : un encaissement le jour de la deadline reste visible. */}
        {row.to && to - dayWidth >= 0 && to <= 1 && (
          <Flag
            aria-label={`Deadline : ${formatShortDate(row.to, today)}`}
            className={`absolute top-1/2 z-[1] size-3.5 -translate-y-1/2 ${row.bar ? 'translate-x-1' : '-translate-x-1/2'} ${tone ? DEADLINE_TONE_CLASS[tone] : 'text-ink-3'}`}
            style={{ left: pct(row.bar ? to : to - dayWidth / 2) }}
            strokeWidth={2}
          />
        )}
        {row.payments.map((payment) => (
          <PaymentMark key={payment.id} payment={payment} period={period} today={today} />
        ))}
      </div>
      {weekly?.map(
        ({ week, minutes }) =>
          displayMinutes(minutes) > 0 && (
            <span
              key={week}
              title={`${hours(minutes)} à faire sur ce projet la semaine du ${formatShortDate(week, today)}`}
              className="tnum absolute bottom-1 pl-1.5 text-meta leading-4 text-ink-3"
              style={{ left: pct(dayOffset(period, week)) }}
            >
              {hours(minutes)}
            </span>
          ),
      )}
    </div>
  );
}

/** Nom du projet, à gauche de sa ligne ; un projet à venir est en gris. */
function RowLabel({ row, height }: { row: PlanningRow; height: number }) {
  const { project } = row;
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="-ml-2.5 flex min-w-0 items-start rounded-md px-2.5 transition-colors duration-[120ms] ease-soft hover:bg-hover"
      style={{ height }}
    >
      {/* Aligné sur la barre (les heures de la semaine sont dessous, en zoom mois). */}
      <span className="flex min-w-0 items-center gap-2.5" style={{ height: ROW_HEIGHT.compact }}>
        <ColorDot color={project.typeColor} />
        <span className={`truncate ${project.status === 'planned' ? 'text-ink-2' : ''}`}>{project.name}</span>
        {project.status === 'planned' && <span className="shrink-0 text-meta text-ink-3">à venir</span>}
      </span>
    </Link>
  );
}

/**
 * Timeline des projets : à gauche leurs noms, à droite la période, avec une ligne par semaine,
 * la bande de charge en haut et la ligne « aujourd'hui ».
 */
export function Timeline(props: {
  rows: PlanningRow[];
  load: WeekWorkload[];
  period: PlanningPeriod;
  today: string;
  /** Zoom mois : les semaines portent leur date complète, et chaque projet ses heures par semaine. */
  detailed: boolean;
  /** Les heures de chaque projet, semaine par semaine (zoom mois). */
  weeklyOf: (projectId: string) => { week: string; minutes: number }[];
  remaining: Map<string, { minutes: number; unestimated: number }>;
}) {
  const { rows, period, today, detailed } = props;
  const todayOffset = dayOffset(period, today);
  const rowHeight = detailed ? ROW_HEIGHT.detailed : ROW_HEIGHT.compact;
  return (
    <div className="relative grid grid-cols-[200px_minmax(0,1fr)] gap-x-4">
      <div style={{ height: HEADER_HEIGHT }} className="border-b border-line" />
      <Header period={period} today={today} detailed={props.detailed} />

      <div className="grid grid-rows-2 gap-0.5 border-b border-line py-1 text-meta text-ink-3" style={{ height: BAND_HEIGHT }}>
        <span className="flex items-center" title="Le travail des tâches à finir, réparti jusqu’à leur deadline (ou celle du projet)">
          À faire
        </span>
        <span className="flex items-center" title="Les blocs Travail (et « Les deux ») posés dans la Journée, à partir d’aujourd’hui">
          Posé dans la Journée
        </span>
      </div>
      <WorkloadBand load={props.load} period={period} today={today} />

      {rows.map((row) => (
        <div key={row.project.id} className="contents">
          <RowLabel row={row} height={rowHeight} />
          <Track
            row={row}
            period={period}
            today={today}
            height={rowHeight}
            weekly={detailed ? props.weeklyOf(row.project.id) : null}
            remaining={props.remaining.get(row.project.id)}
          />
        </div>
      ))}

      {/* Semaines et « aujourd'hui », sur toute la hauteur de la colonne de droite. « Aujourd'hui » saute
          la bande de charge : ses cases valent pour la semaine entière, et la ligne cacherait leurs heures. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ gridColumn: 2, gridRow: `1 / span ${rows.length + 2}` }}
      >
        {period.weeks.slice(1).map((week) => (
          <span key={week} className="absolute inset-y-0 border-l border-line" style={{ left: pct(dayOffset(period, week)) }} />
        ))}
        {todayOffset >= 0 && todayOffset < 1 && (
          <>
            <span
              className="absolute top-0 z-[3] border-l-2 border-accent"
              style={{ left: `calc(${pct(todayOffset + 0.5 / period.days)} - 1px)`, height: HEADER_HEIGHT }}
            />
            <span
              className="absolute bottom-0 z-[3] border-l-2 border-accent"
              style={{ left: `calc(${pct(todayOffset + 0.5 / period.days)} - 1px)`, top: HEADER_HEIGHT + BAND_HEIGHT }}
            />
          </>
        )}
      </div>
    </div>
  );
}
