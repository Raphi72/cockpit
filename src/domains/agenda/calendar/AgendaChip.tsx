import { CalendarClock, Flag, HandCoins, Play, type LucideIcon } from 'lucide-react';
import { memo } from 'react';
import { formatMoney } from '@/core/money';
import { ColorDot } from '@/ui/data/ColorDot';
import { agendaTooltip, isAgendaItemLate, itemTime, type AgendaItem, type AgendaKind } from '../model';

/** Les dates dérivées portent une icône ; les événements, la pastille de leur projet. */
const ICONS: Partial<Record<AgendaKind, LucideIcon>> = {
  project_start: Play,
  project_deadline: Flag,
  task_due: Flag,
  task_scheduled: CalendarClock,
  payment_due: HandCoins,
};

export function AgendaMarker({ item, late }: { item: AgendaItem; late: boolean }) {
  const Icon = ICONS[item.kind];
  if (!Icon) {
    return (
      <span className="grid w-3 shrink-0 place-items-center">
        <ColorDot color={item.color ?? 'slate'} />
      </span>
    );
  }
  return <Icon aria-hidden className={`size-3 shrink-0 ${late ? 'text-danger' : 'text-ink-3'}`} strokeWidth={2} />;
}

type AgendaChipProps = {
  item: AgendaItem;
  today: string;
  onOpen: (item: AgendaItem) => void;
};

/** Une ligne d'une journée : repère, heure éventuelle, titre (rouge si en retard), montant attendu. */
export const AgendaChip = memo(function AgendaChip({ item, today, onOpen }: AgendaChipProps) {
  const late = isAgendaItemLate(item, today);
  const time = itemTime(item);
  return (
    <button
      type="button"
      title={agendaTooltip(item)}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(item);
      }}
      className="flex h-[22px] w-full min-w-0 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-left text-meta transition-colors duration-[120ms] ease-soft hover:bg-active"
    >
      <AgendaMarker item={item} late={late} />
      {time && <span className="tnum shrink-0 text-ink-3">{time}</span>}
      <span className={`truncate ${late ? 'text-danger' : ''} ${item.kind === 'project_deadline' ? 'font-medium' : ''}`}>
        {item.title}
      </span>
      {item.amountCents !== null && (
        <span className="tnum ml-auto shrink-0 pl-1 text-ink-3">{formatMoney(item.amountCents)}</span>
      )}
    </button>
  );
});

type DayItemsProps = Omit<AgendaChipProps, 'item'> & {
  items: AgendaItem[];
  /** Au-delà, « +N » ouvre la vue du jour. */
  limit: number;
  onShowDay: () => void;
};

/** Les éléments d'une case (mois, ou ligne « journée ») : `limit` au plus, puis « +N ». */
export function DayItems({ items, limit, today, onOpen, onShowDay }: DayItemsProps) {
  const visible = items.length > limit ? items.slice(0, limit) : items;
  const hidden = items.length - visible.length;
  return (
    <>
      {visible.map((item) => (
        <AgendaChip key={item.key} item={item} today={today} onOpen={onOpen} />
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
