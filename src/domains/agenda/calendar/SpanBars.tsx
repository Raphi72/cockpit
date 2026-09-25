import { Circle, Flag } from 'lucide-react';
import type { CSSProperties } from 'react';
import { agendaTooltip, isAgendaItemLate, type AgendaItem, type SpanSegment } from '../model';
import { AgendaMarker } from './AgendaChip';

/** Hauteur d'un couloir : une puce (22 px) et l'espace qui la sépare de la suivante. */
export const LANE_HEIGHT = 23;

/** Place à réserver en haut de chaque case pour `lanes` couloirs de barres. */
export function lanesSpacer(lanes: number): number {
  return lanes > 0 ? lanes * LANE_HEIGHT - 1 : 0;
}

function SpanBar({
  span,
  columns,
  today,
  onOpen,
}: {
  span: SpanSegment;
  columns: number;
  today: string;
  onOpen: (item: AgendaItem) => void;
}) {
  const { item } = span;
  const late = isAgendaItemLate(item, today);
  const isTask = item.source === 'task';
  // Une barre coupée par le bord de la rangée touche le bord : elle continue sur la rangée voisine.
  const inset = { left: span.continuesBefore ? 0 : 4, right: span.continuesAfter ? 0 : 4 };
  return (
    <button
      type="button"
      title={agendaTooltip(item)}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(item);
      }}
      style={{
        top: span.lane * LANE_HEIGHT,
        left: `calc(${(span.startCol / columns) * 100}% + ${inset.left}px)`,
        width: `calc(${((span.endCol - span.startCol + 1) / columns) * 100}% - ${inset.left + inset.right}px)`,
      }}
      className={
        'pointer-events-auto absolute flex h-[22px] min-w-0 items-center gap-1.5 bg-hover px-1.5 text-left text-meta ' +
        'transition-colors duration-[120ms] ease-soft hover:bg-active ' +
        (span.continuesBefore ? 'rounded-l-none ' : 'rounded-l-sm ') +
        (span.continuesAfter ? 'rounded-r-none' : 'rounded-r-sm')
      }
    >
      {/* Une tâche : un rond au début, le drapeau de la deadline au bout. */}
      {isTask ? (
        <Circle aria-hidden className="size-3 shrink-0 text-ink-3" strokeWidth={2} />
      ) : (
        <AgendaMarker item={item} late={false} />
      )}
      <span className={`truncate ${late ? 'text-danger' : ''}`}>{item.title}</span>
      {isTask && !span.continuesAfter && (
        <Flag aria-label="Deadline" className={`ml-auto size-3 shrink-0 ${late ? 'text-danger' : 'text-ink-3'}`} strokeWidth={2} />
      )}
    </button>
  );
}

/**
 * Barres continues d'une rangée de jours (semaine du mois, ligne « journée ») : un événement
 * sur plusieurs jours, ou une tâche du début à la deadline, en une seule barre.
 * Le conteneur couvre exactement les colonnes des jours ; les cases réservent la place (lanesSpacer).
 */
export function SpanBars(props: {
  spans: SpanSegment[];
  columns: number;
  today: string;
  onOpen: (item: AgendaItem) => void;
  className?: string;
  style?: CSSProperties;
}) {
  if (props.spans.length === 0) return null;
  return (
    <div className={`pointer-events-none absolute ${props.className ?? ''}`} style={props.style}>
      {props.spans.map((span) => (
        <SpanBar key={span.item.key} span={span} columns={props.columns} today={props.today} onOpen={props.onOpen} />
      ))}
    </div>
  );
}
