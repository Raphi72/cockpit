import { CalendarClock, Flag, HandCoins, Play, type LucideIcon } from 'lucide-react';
import { memo } from 'react';
import { deadlineStatus, type DeadlineTone } from '@/core/deadline';
import { formatMoney } from '@/core/money';
import { ColorDot } from '@/ui/data/ColorDot';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { agendaTooltip, deadlineDay, isAgendaItemLate, isDeadlineItem, itemTime, type AgendaItem, type AgendaKind } from '../model';
import { useAgendaDrag } from './drag';

/** Les dates dérivées et les échéances portent une icône ; les autres événements, la pastille de leur projet. */
const ICONS: Partial<Record<AgendaKind, LucideIcon>> = {
  project_start: Play,
  project_deadline: Flag,
  task_due: Flag,
  deadline: Flag,
  task_scheduled: CalendarClock,
  payment_due: HandCoins,
};

/**
 * Urgence d'une deadline dans le calendrier, comme partout ailleurs (core/deadline.ts) :
 * rouge en retard ou aujourd'hui, ambre à 3 jours, bleu dans la semaine. `null` pour le reste.
 */
export function agendaDeadlineTone(item: AgendaItem, today: string): DeadlineTone | null {
  return isDeadlineItem(item) ? deadlineStatus(deadlineDay(item), today).tone : null;
}

/** Fond teinté des deadlines urgentes (en retard, aujourd'hui, à 3 jours) : on les voit de loin. */
export const URGENT_TINT: Partial<Record<DeadlineTone, string>> = {
  late: 'bg-danger/10 hover:bg-danger/15',
  today: 'bg-danger/10 hover:bg-danger/15',
  soon: 'bg-warning/10 hover:bg-warning/15',
};

/**
 * Repère d'un élément. Avec `today`, une deadline prend la couleur de son urgence et un
 * encaissement en retard passe en rouge ; sans (dashboard), il reste gris.
 */
export function AgendaMarker({ item, today }: { item: AgendaItem; today?: string }) {
  const Icon = ICONS[item.kind];
  if (!Icon) {
    return (
      <span className="grid w-3 shrink-0 place-items-center">
        <ColorDot color={item.color ?? 'slate'} />
      </span>
    );
  }
  const tone = today ? agendaDeadlineTone(item, today) : null;
  const color = tone ? DEADLINE_TONE_CLASS[tone] : today && isAgendaItemLate(item, today) ? 'text-danger' : 'text-ink-3';
  return <Icon aria-hidden className={`size-3 shrink-0 ${color}`} strokeWidth={2} />;
}

type AgendaChipProps = {
  item: AgendaItem;
  today: string;
  onOpen: (item: AgendaItem) => void;
  /** Identifiant de glisser-déposer, unique à l'écran (l'élément et sa case). */
  dragId: string;
};

/**
 * Une ligne d'une journée : repère, heure éventuelle, titre, montant attendu.
 * Les deadlines sont en gras, avec un drapeau de la couleur de leur urgence ; celles qui pressent
 * (en retard, aujourd'hui, à 3 jours) ont un fond teinté.
 */
export const AgendaChip = memo(function AgendaChip({ item, today, onOpen, dragId }: AgendaChipProps) {
  const drag = useAgendaDrag(item, dragId);
  const late = isAgendaItemLate(item, today);
  const tone = agendaDeadlineTone(item, today);
  const time = itemTime(item);
  const tint = tone ? URGENT_TINT[tone] : undefined;
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
      className={
        'flex h-[22px] w-full min-w-0 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-left text-meta transition-colors duration-[120ms] ease-soft ' +
        (tint ?? 'hover:bg-active') +
        (drag.isDragging ? ' opacity-40' : '')
      }
    >
      <AgendaMarker item={item} today={today} />
      {time && <span className="tnum shrink-0 text-ink-3">{time}</span>}
      <span className={`truncate ${late || tone === 'today' ? 'text-danger' : ''} ${tone ? 'font-medium' : ''}`}>
        {item.title}
      </span>
      {item.amountCents !== null && (
        <span className="tnum ml-auto shrink-0 pl-1 text-ink-3">{formatMoney(item.amountCents)}</span>
      )}
    </button>
  );
});

type DayItemsProps = Omit<AgendaChipProps, 'item' | 'dragId'> & {
  /** La case : chaque élément y a son identifiant de glisser-déposer. */
  day: string;
  items: AgendaItem[];
  /** Au-delà, « +N » ouvre la vue du jour. */
  limit: number;
  onShowDay: () => void;
};

/** Les éléments d'une case (mois, ou ligne « journée ») : `limit` au plus, puis « +N ». */
export function DayItems({ day, items, limit, today, onOpen, onShowDay }: DayItemsProps) {
  const visible = items.length > limit ? items.slice(0, limit) : items;
  const hidden = items.length - visible.length;
  return (
    <>
      {visible.map((item) => (
        <AgendaChip key={item.key} item={item} today={today} onOpen={onOpen} dragId={`${item.key}@${day}`} />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onShowDay();
          }}
          className="h-5 shrink-0 self-start rounded-sm px-1.5 text-meta text-ink-3 transition-colors hover:bg-active hover:text-ink"
        >
          +{hidden}
        </button>
      )}
    </>
  );
}
