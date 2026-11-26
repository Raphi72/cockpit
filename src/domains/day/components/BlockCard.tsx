import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check, TriangleAlert } from 'lucide-react';
import { memo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useCompletingTasks } from '@/domains/tasks/completion-store';
import { TaskCheckbox } from '@/domains/tasks/components/TaskCheckbox';
import { useToggleTask } from '@/domains/tasks/hooks';
import type { TaskItem } from '@/domains/tasks/model';
import { useTaskSheet } from '@/domains/tasks/sheet-store';
import { useUpdateBlock } from '../hooks';
import { moduleIcon } from '../icons';
import { blockDuration, blockLoad, formatMinutes, resizedEnd, toMinutes, type BusyItem, type DayBlock } from '../model';
import type { DayDragData, DayDropData } from './drag';
import { colorVar } from '@/ui/data/ColorDot';

/** Une tâche dans un bloc : sa case, son titre (un clic l'ouvre) ; on peut la glisser ailleurs. */
function BlockTask({ task }: { task: TaskItem }) {
  const drag = useDraggable({ id: `task:${task.id}@block`, data: { type: 'task', task } satisfies DayDragData });
  const toggle = useToggleTask();
  const openTask = useTaskSheet((state) => state.openTask);
  const checking = useCompletingTasks((state) => state.ids.includes(task.id));
  return (
    <li
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      className={`flex min-w-0 items-center gap-1.5 ${drag.isDragging ? 'opacity-40' : ''}`}
      onClick={(event) => event.stopPropagation()}
    >
      <TaskCheckbox status={task.status} checking={checking} onToggle={() => toggle(task)} />
      <button type="button" onClick={() => openTask(task.id)} className="truncate text-left hover:underline">
        {task.title}
      </button>
    </li>
  );
}

type BlockCardProps = {
  block: DayBlock;
  tasks: TaskItem[];
  overlaps: BusyItem[];
  firstHour: number;
  hourHeight: number;
  lane: number;
  lanes: number;
  /** Semaine : étroit, sans les tâches. */
  compact: boolean;
  current: boolean;
  onOpen: (block: DayBlock) => void;
};

/**
 * Un bloc posé : on le glisse pour le déplacer (au quart d'heure, sur un autre jour en semaine), on
 * l'étire par le bas pour changer sa durée, on y dépose des tâches. Un chevauchement avec un cours ou
 * un rendez-vous est signalé, sans être interdit.
 */
export const BlockCard = memo(function BlockCard(props: BlockCardProps) {
  const { block, tasks, firstHour, hourHeight } = props;
  const drag = useDraggable({ id: `block:${block.id}`, data: { type: 'block', block } satisfies DayDragData });
  const drop = useDroppable({ id: `block:${block.id}`, data: { kind: 'block', block } satisfies DayDropData });
  const update = useUpdateBlock();
  const Icon = moduleIcon(block.icon);
  // Étirement en cours : la fin affichée suit le pointeur, enregistrée au relâchement.
  const [stretchEnd, setStretchEnd] = useState<string | null>(null);
  const stretch = useRef<{ y: number; end: number } | null>(null);

  const endsAt = stretchEnd ?? block.endsAt;
  const start = toMinutes(block.startsAt);
  const top = ((start - firstHour * 60) / 60) * hourHeight;
  const height = Math.max(((toMinutes(endsAt) - start) / 60) * hourHeight - 2, 20);
  const load = blockLoad({ startsAt: block.startsAt, endsAt }, tasks);
  const compact = props.compact || height < 44;
  const done = block.status === 'done';
  const missed = block.status === 'missed';

  const onStretchStart = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    stretch.current = { y: event.clientY, end: toMinutes(block.endsAt) };
  };
  const onStretchMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!stretch.current) return;
    const minutes = stretch.current.end + ((event.clientY - stretch.current.y) / hourHeight) * 60;
    setStretchEnd(resizedEnd(block, minutes));
  };
  const onStretchEnd = () => {
    const end = stretchEnd;
    stretch.current = null;
    setStretchEnd(null);
    if (!end || end === block.endsAt) return;
    update.mutate({ block, patch: { endsAt: end }, undoable: `« ${block.title} » jusqu’à ${end}.` });
  };

  const style: CSSProperties = {
    top,
    height,
    left: `calc(${(props.lane / props.lanes) * 100}% + 3px)`,
    width: `calc(${100 / props.lanes}% - 6px)`,
    borderLeftColor: colorVar(block.color),
    backgroundColor: `color-mix(in srgb, ${colorVar(block.color)} ${done || missed ? 6 : 13}%, var(--bg-elevated))`,
  };

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.listeners}
      {...drag.attributes}
      data-block-id={block.id}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        props.onOpen(block);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') props.onOpen(block);
      }}
      title={`${block.title} · ${block.startsAt} – ${endsAt}${props.overlaps.length ? ` · chevauche ${props.overlaps.map((o) => o.title).join(', ')}` : ''}`}
      style={style}
      className={
        'group absolute z-[2] flex cursor-grab flex-col overflow-hidden rounded-md border-l-[3px] px-2 text-meta leading-snug outline-none ' +
        'transition-[box-shadow,opacity] duration-[120ms] ease-soft focus-visible:ring-2 focus-visible:ring-accent-soft active:cursor-grabbing ' +
        (compact ? 'justify-center py-0.5 ' : 'py-1.5 ') +
        (drop.isOver ? 'ring-2 ring-accent ' : '') +
        (props.current ? 'shadow-[0_0_0_1.5px_var(--accent)] ' : '') +
        (drag.isDragging ? 'opacity-30' : missed ? 'opacity-60' : '')
      }
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon className="size-3.5 shrink-0" style={{ color: colorVar(block.color) }} strokeWidth={2} />
        <span className={`truncate font-medium ${missed ? 'line-through' : ''}`}>{block.title}</span>
        {done && <Check className="size-3.5 shrink-0 text-success" strokeWidth={2.25} aria-label="Fait" />}
        {props.overlaps.length > 0 && <TriangleAlert className="size-3.5 shrink-0 text-warning" strokeWidth={2} aria-label="Chevauchement" />}
        {!compact && (
          <span className="tnum ml-auto shrink-0 text-ink-3">
            {block.startsAt} – {endsAt}
          </span>
        )}
      </span>
      {!compact && tasks.length > 0 && (
        <ul className="mt-1 flex min-h-0 flex-col gap-0.5 overflow-hidden text-ink-2">
          {tasks.map((task) => (
            <BlockTask key={task.id} task={task} />
          ))}
        </ul>
      )}
      {!compact && (
        <span className={`tnum mt-auto pt-0.5 ${load.free < 0 ? 'text-warning' : 'text-ink-3'}`}>
          {tasks.length === 0
            ? formatMinutes(blockDuration({ startsAt: block.startsAt, endsAt }))
            : load.free >= 0
              ? `${formatMinutes(load.free)} libres`
              : `déborde de ${formatMinutes(-load.free)}`}
        </span>
      )}
      {/* Poignée du bas : étirer le bloc. */}
      <div
        onPointerDown={onStretchStart}
        onPointerMove={onStretchMove}
        onPointerUp={onStretchEnd}
        onPointerCancel={onStretchEnd}
        onClick={(event) => event.stopPropagation()}
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
      >
        <span className="mx-auto mt-[3px] block h-[3px] w-6 rounded-full bg-ink-3/50" />
      </div>
    </div>
  );
});
