import { Link } from '@tanstack/react-router';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Flag } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatShortDate } from '@/core/dates';
import { deadlineStatus } from '@/core/deadline';
import { formatMoney } from '@/core/money';
import { usePaymentEditor } from '@/domains/finance/payments/editor-store';
import { projectProgress } from '@/domains/projects/model';
import { ColorDot } from '@/ui/data/ColorDot';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { dayOffset, monthMarks, type PlanningPayment, type PlanningRow, type PlanningPeriod, type WeekLoad } from './model';

const HEADER_HEIGHT = 52;
const BAND_HEIGHT = 40;
const ROW_HEIGHT = 44;

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
 * Intensité d'une semaine selon le nombre de projets menés en même temps : une seule couleur, plus
 * soutenue à mesure qu'ils s'empilent. Pas d'alerte : ce qui est « trop » dépend de chacun.
 */
function loadClass(count: number): string {
  if (count === 0) return 'text-ink-3';
  if (count === 1) return 'bg-accent/8 text-ink-2';
  if (count === 2) return 'bg-accent/15 text-ink-2';
  if (count === 3) return 'bg-accent/25 text-ink';
  if (count === 4) return 'bg-accent/35 text-ink';
  return 'bg-accent/50 font-medium text-ink';
}

/** Bande de densité : combien de projets se chevauchent chaque semaine (le détail au survol). */
function DensityBand({ load, period }: { load: WeekLoad[]; period: PlanningPeriod }) {
  return (
    <div className="relative border-b border-line" style={{ height: BAND_HEIGHT }}>
      {load.map(({ week, projects }) => {
        const count = projects.length;
        const title =
          count === 0
            ? `Semaine du ${formatShortDate(week, week)} : aucun projet`
            : `Semaine du ${formatShortDate(week, week)} : ${count} projet${count > 1 ? 's' : ''} · ${projects.map((p) => p.name).join(', ')}`;
        return (
          <div key={week} className="absolute inset-y-0 p-1" style={span(dayOffset(period, week), dayOffset(period, week) + 7 / period.days)}>
            <div title={title} className={`tnum grid h-full place-items-center rounded-md text-meta ${loadClass(count)}`}>
              {count > 0 ? count : '–'}
            </div>
          </div>
        );
      })}
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
function barTitle(row: PlanningRow, today: string): string {
  const { project } = row;
  const dates = row.from && row.to
    ? `du ${formatShortDate(row.from, today)} au ${formatShortDate(row.to, today)}`
    : row.from
      ? `depuis le ${formatShortDate(row.from, today)}, sans deadline`
      : `jusqu’au ${formatShortDate(row.to!, today)}, sans date de début`;
  const progress = projectProgress(project);
  const parts = [project.name, dates];
  if (progress !== null) parts.push(`${progress} % des tâches faites`);
  if (row.lateUntil && row.to) parts.push(deadlineStatus(row.to, today).text);
  return parts.join(' · ');
}

/**
 * Ligne d'un projet : sa barre du début à la deadline (estompée si le début ou la fin manque), la part
 * des tâches faites, la deadline (drapeau de la couleur de son urgence), le retard en rouge jusqu'à
 * aujourd'hui, et ses encaissements en losanges.
 */
function Track({ row, period, today }: { row: PlanningRow; period: PlanningPeriod; today: string }) {
  const { project } = row;
  const dayWidth = 1 / period.days;
  const from = row.from ? dayOffset(period, row.from) : -1;
  const to = row.to ? dayOffset(period, row.to) + dayWidth : 2;
  const planned = project.status === 'planned';
  const tone = row.to ? deadlineStatus(row.to, today).tone : null;
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
    <div className="relative" style={{ height: ROW_HEIGHT }}>
      {visible && (
        <Link
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          title={barTitle(row, today)}
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
  );
}

/** Nom du projet, à gauche de sa ligne ; un projet à venir est en gris. */
function RowLabel({ row }: { row: PlanningRow }) {
  const { project } = row;
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="-ml-2.5 flex min-w-0 items-center gap-2.5 rounded-md px-2.5 transition-colors duration-[120ms] ease-soft hover:bg-hover"
      style={{ height: ROW_HEIGHT }}
    >
      <ColorDot color={project.typeColor} />
      <span className={`truncate ${project.status === 'planned' ? 'text-ink-2' : ''}`}>{project.name}</span>
      {project.status === 'planned' && <span className="shrink-0 text-meta text-ink-3">à venir</span>}
    </Link>
  );
}

/**
 * Timeline des projets : à gauche leurs noms, à droite la période, avec une ligne par semaine,
 * la bande de densité en haut et la ligne « aujourd'hui ».
 */
export function Timeline(props: {
  rows: PlanningRow[];
  load: WeekLoad[];
  period: PlanningPeriod;
  today: string;
  /** Zoom mois : les semaines portent leur date complète. */
  detailed: boolean;
}) {
  const { rows, period, today } = props;
  const todayOffset = dayOffset(period, today);
  return (
    <div className="relative grid grid-cols-[200px_minmax(0,1fr)] gap-x-4">
      <div style={{ height: HEADER_HEIGHT }} className="border-b border-line" />
      <Header period={period} today={today} detailed={props.detailed} />

      <div className="flex items-center border-b border-line text-meta text-ink-3" style={{ height: BAND_HEIGHT }}>
        En parallèle
      </div>
      <DensityBand load={props.load} period={period} />

      {rows.map((row) => (
        <div key={row.project.id} className="contents">
          <RowLabel row={row} />
          <Track row={row} period={period} today={today} />
        </div>
      ))}

      {/* Semaines et « aujourd'hui », sur toute la hauteur de la colonne de droite. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ gridColumn: 2, gridRow: `1 / span ${rows.length + 2}` }}
      >
        {period.weeks.slice(1).map((week) => (
          <span key={week} className="absolute inset-y-0 border-l border-line" style={{ left: pct(dayOffset(period, week)) }} />
        ))}
        {todayOffset >= 0 && todayOffset < 1 && (
          <span
            className="absolute inset-y-0 z-[3] border-l-2 border-accent"
            style={{ left: `calc(${pct(todayOffset + 0.5 / period.days)} - 1px)` }}
          />
        )}
      </div>
    </div>
  );
}
