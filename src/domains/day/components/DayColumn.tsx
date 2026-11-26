import { useDroppable } from '@dnd-kit/core';
import { useEffect, useRef, type MouseEvent } from 'react';
import type { TaskItem } from '@/domains/tasks/model';
import { blockInterval, layoutIntervals, overlapsOf, snap, type BusyItem, type DayBlock } from '../model';
import { BlockCard } from './BlockCard';
import type { DayDropData } from './drag';

type Entry = { kind: 'busy'; item: BusyItem } | { kind: 'block'; block: DayBlock };

type DayColumnProps = {
  day: string;
  hours: { first: number; last: number };
  hourHeight: number;
  blocks: DayBlock[];
  /** Ce qui est déjà pris ce jour-là (cours, rendez-vous, examens) : dessiné sous les blocs. */
  busy: BusyItem[];
  tasksByBlock: Map<string, TaskItem[]>;
  /** Minutes depuis minuit si c'est aujourd'hui : la ligne « maintenant ». */
  now: number | null;
  currentBlockId: string | null;
  compact: boolean;
  /** Faire défiler jusqu'à la ligne « maintenant » à l'ouverture. */
  scrollToNow?: boolean;
  onOpenBlock: (block: DayBlock) => void;
  onCreateAt: (day: string, minutes: number) => void;
};

/**
 * Une journée, heure par heure. Les cours et les rendez-vous sont en pointillés, les blocs pleins ; ce
 * qui se chevauche se range côte à côte. Un clic dans un créneau libre pose un bloc à cette heure (au
 * quart d'heure).
 */
export function DayColumn(props: DayColumnProps) {
  const { day, hours, hourHeight } = props;
  const drop = useDroppable({
    id: `col:${day}`,
    data: { kind: 'column', day, firstHour: hours.first, hourHeight } satisfies DayDropData,
  });
  const nowRef = useRef<HTMLDivElement>(null);
  const hourCount = hours.last - hours.first;
  const minutesToY = (minutes: number) => ((minutes - hours.first * 60) / 60) * hourHeight;
  const showNow = props.now !== null && props.now >= hours.first * 60 && props.now < hours.last * 60;

  useEffect(() => {
    if (props.scrollToNow) nowRef.current?.scrollIntoView({ block: 'center' });
    // Seulement à l'ouverture de la page (ou d'un autre jour), pas à chaque minute.
  }, [props.scrollToNow, day]);

  const createAt = (event: MouseEvent<HTMLDivElement>) => {
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    props.onCreateAt(day, snap(hours.first * 60 + (y / hourHeight) * 60, 15));
  };

  // Cours, rendez-vous et blocs partagent les mêmes couloirs : ce qui se chevauche est côte à côte,
  // jamais l'un sur l'autre.
  const placed = layoutIntervals<Entry>(
    [...props.busy.map((item): Entry => ({ kind: 'busy', item })), ...props.blocks.map((block): Entry => ({ kind: 'block', block }))],
    (entry) => (entry.kind === 'busy' ? entry.item : blockInterval(entry.block)),
  );
  const busyPlaced = placed.flatMap(({ item, lane, lanes }) => (item.kind === 'busy' ? [{ item: item.item, lane, lanes }] : []));
  const blocksPlaced = placed.flatMap(({ item, lane, lanes }) => (item.kind === 'block' ? [{ item: item.block, lane, lanes }] : []));

  return (
    <div
      ref={drop.setNodeRef}
      data-day={day}
      onClick={createAt}
      title="Clic : poser un bloc à cette heure"
      className={`relative cursor-default border-l border-line transition-colors duration-[120ms] ease-soft ${drop.isOver ? 'bg-accent-soft/40' : ''}`}
      style={{ height: hourCount * hourHeight }}
    >
      {Array.from({ length: hourCount }, (_, index) => (
        <div key={index} className="border-t border-line" style={{ height: hourHeight }} />
      ))}

      {busyPlaced.map(({ item, lane, lanes }) => (
        <div
          key={item.key}
          aria-hidden
          className="pointer-events-none absolute z-[1] overflow-hidden rounded-md border border-dashed border-line-strong px-1.5 py-0.5 text-meta text-ink-3"
          style={{
            top: minutesToY(item.start) + 1,
            height: Math.max(minutesToY(item.end) - minutesToY(item.start) - 2, 16),
            left: `calc(${(lane / lanes) * 100}% + 2px)`,
            width: `calc(${100 / lanes}% - 4px)`,
          }}
        >
          <span className="block truncate">{item.title}</span>
        </div>
      ))}

      {blocksPlaced.map(({ item: block, lane, lanes }) => (
        <BlockCard
          key={block.id}
          block={block}
          tasks={props.tasksByBlock.get(block.id) ?? []}
          overlaps={overlapsOf(block, props.busy)}
          firstHour={hours.first}
          hourHeight={hourHeight}
          lane={lane}
          lanes={lanes}
          compact={props.compact}
          current={block.id === props.currentBlockId}
          onOpen={props.onOpenBlock}
        />
      ))}

      {showNow && (
        <div
          ref={nowRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-[3] border-t-2 border-accent"
          style={{ top: minutesToY(props.now!) - 1 }}
        >
          <span className="absolute -top-[5px] -left-[4px] size-2 rounded-full bg-accent" />
        </div>
      )}
    </div>
  );
}
