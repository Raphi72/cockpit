import { Circle, Flag } from 'lucide-react';
import type { CSSProperties } from 'react';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { agendaTooltip, isAgendaItemLate, type AgendaItem, type SpanSegment } from '../model';
import { AgendaMarker, URGENT_TINT, agendaDeadlineTone } from './AgendaChip';
import { useAgendaDrag } from './drag';

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
  rowKey,
}: {
  span: SpanSegment;
  columns: number;
  today: string;
  onOpen: (item: AgendaItem) => void;
  rowKey: string;
}) {
  const { item } = span;
  // Une barre coupée par les semaines apparaît dans plusieurs rangées : un identifiant par rangée.
  const drag = useAgendaDrag(item, `${item.key}@${rowKey}`);
  const late = isAgendaItemLate(item, today);
  const isTask = item.source === 'task';
  // Une tâche du début à la deadline : le drapeau du bout prend la couleur de l'urgence (core/deadline.ts).
  const tone = agendaDeadlineTone(item, today);
  const tint = tone ? URGENT_TINT[tone] : undefined;
  // Une barre coupée par le bord de la rangée touche le bord : elle continue sur la rangée voisine.
  const inset = { left: span.continuesBefore ? 0 : 4, right: span.continuesAfter ? 0 : 4 };
  return (
    <button
      ref={drag.setNodeRef}
      {...drag.listeners}
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
        'pointer-events-auto absolute flex h-[22px] min-w-0 items-center gap-1.5 px-1.5 text-left text-meta ' +
        'transition-colors duration-[120ms] ease-soft ' +
        (tint ?? 'bg-hover hover:bg-active') +
        (span.continuesBefore ? ' rounded-l-none' : ' rounded-l-sm') +
        (span.continuesAfter ? ' rounded-r-none' : ' rounded-r-sm') +
        (drag.isDragging ? ' opacity-40' : '')
      }
    >
      {/* Une tâche : un rond au début, le drapeau de la deadline au bout. */}
      {isTask ? (
        <Circle aria-hidden className="size-3 shrink-0 text-ink-3" strokeWidth={2} />
      ) : (
        <AgendaMarker item={item} today={today} />
      )}
      <span className={`truncate ${late || tone === 'today' ? 'text-danger' : ''} ${tone ? 'font-medium' : ''}`}>{item.title}</span>
      {isTask && !span.continuesAfter && (
        <Flag
          aria-label="Deadline"
          className={`ml-auto size-3 shrink-0 ${tone ? DEADLINE_TONE_CLASS[tone] : 'text-ink-3'}`}
          strokeWidth={2}
        />
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
  /** Premier jour de la rangée : sert à distinguer les morceaux d'une même barre. */
  rowKey: string;
  className?: string;
  style?: CSSProperties;
}) {
  if (props.spans.length === 0) return null;
  return (
    <div className={`pointer-events-none absolute ${props.className ?? ''}`} style={props.style}>
      {props.spans.map((span) => (
        <SpanBar
          key={span.item.key}
          span={span}
          columns={props.columns}
          today={props.today}
          onOpen={props.onOpen}
          rowKey={props.rowKey}
        />
      ))}
    </div>
  );
}
