import { useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical, Plus } from 'lucide-react';
import { useState } from 'react';
import type { AppMode } from '@/core/app-mode';
import type { TaskItem } from '@/domains/tasks/model';
import { useTaskSheet } from '@/domains/tasks/sheet-store';
import { ColorDot } from '@/ui/data/ColorDot';
import { moduleIcon } from '../icons';
import { formatMinutes, modulesOfMode, taskMinutes, type Module } from '../model';
import type { DayDragData, DayDropData } from './drag';
import { ModuleDialog } from './ModuleDialog';

function ModuleRow({ module, onEdit }: { module: Module; onEdit: () => void }) {
  const drag = useDraggable({ id: `module:${module.id}`, data: { type: 'module', module } satisfies DayDragData });
  const Icon = moduleIcon(module.icon);
  return (
    <li
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      onClick={onEdit}
      title="Glisser sur la journée pour le poser ; clic pour le modifier"
      className={`group -mx-2 flex h-10 cursor-grab items-center gap-2.5 rounded-md px-2 transition-colors duration-[120ms] ease-soft hover:bg-hover active:cursor-grabbing ${drag.isDragging ? 'opacity-40' : ''}`}
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ backgroundColor: `color-mix(in srgb, var(--p-${module.color}) 16%, transparent)` }}>
        <Icon className="size-3.5" style={{ color: `var(--p-${module.color})` }} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate">{module.name}</span>
      <span className="tnum text-meta text-ink-3">{formatMinutes(module.durationMin)}</span>
      <GripVertical className="size-3.5 shrink-0 text-ink-3 opacity-0 group-hover:opacity-100" strokeWidth={1.75} />
    </li>
  );
}

function ToPlaceRow({ task }: { task: TaskItem }) {
  const drag = useDraggable({ id: `task:${task.id}@side`, data: { type: 'task', task } satisfies DayDragData });
  const openTask = useTaskSheet((state) => state.openTask);
  const context = task.projectName ?? task.subjectName;
  const color = task.projectColor ?? task.subjectColor;
  return (
    <li
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      onClick={() => openTask(task.id)}
      title="Glisser dans un bloc"
      className={`-mx-2 flex min-h-9 cursor-grab items-center gap-2 rounded-md px-2 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover active:cursor-grabbing ${drag.isDragging ? 'opacity-40' : ''}`}
    >
      {color ? <ColorDot color={color} /> : <span className="size-2 shrink-0 rounded-full border border-line-strong" />}
      <span className="min-w-0 flex-1 truncate" title={context ?? undefined}>
        {task.title}
      </span>
      <span className="tnum text-meta text-ink-3">{formatMinutes(taskMinutes(task))}</span>
    </li>
  );
}

/**
 * À droite de la journée : la bibliothèque de modules (on les glisse sur la journée) et, en vue jour,
 * les tâches et devoirs du jour pas encore dans un bloc (on les glisse dans un bloc ; on les y reprend
 * en les déposant ici).
 */
export function SidePanel({ modules, mode, toPlace }: { modules: Module[]; mode: AppMode; toPlace: TaskItem[] | null }) {
  const [editing, setEditing] = useState<{ module?: Module } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const drop = useDroppable({ id: 'to-place', data: { kind: 'to-place' } satisfies DayDropData });
  const shown = showAll ? modules : modulesOfMode(modules, mode);
  const hidden = modules.length - shown.length;

  return (
    <aside className="sticky top-6 flex flex-col gap-10 self-start">
      <section>
        <div className="mb-1.5 flex items-baseline gap-2">
          <h2 className="font-semibold">Modules</h2>
          <button
            type="button"
            onClick={() => setEditing({})}
            className="ml-auto flex items-center gap-1 text-meta text-ink-3 transition-colors hover:text-ink"
          >
            <Plus className="size-3.5" strokeWidth={2} />
            Nouveau
          </button>
        </div>
        <ul>
          {shown.map((module) => (
            <ModuleRow key={module.id} module={module} onEdit={() => setEditing({ module })} />
          ))}
        </ul>
        {shown.length === 0 && <p className="py-2 text-meta text-ink-3">Aucun module pour ce mode.</p>}
        {(hidden > 0 || showAll) && (
          <button type="button" onClick={() => setShowAll(!showAll)} className="mt-1 text-meta text-ink-3 hover:text-ink">
            {showAll ? 'Seulement ceux du mode' : `${hidden} de l’autre mode`}
          </button>
        )}
        <p className="mt-2 text-meta text-ink-3">Glisse un module sur la journée pour le poser.</p>
      </section>

      {toPlace && (
        <section
          ref={drop.setNodeRef}
          className={`-m-2 rounded-lg p-2 transition-colors duration-[120ms] ease-soft ${drop.isOver ? 'bg-accent-soft/40' : ''}`}
        >
          <h2 className="mb-1.5 font-semibold">À caser</h2>
          {toPlace.length === 0 ? (
            <p className="text-meta text-ink-3">Tout ce qui est prévu ce jour-là est dans un bloc.</p>
          ) : (
            <ul>
              {toPlace.map((task) => (
                <ToPlaceRow key={task.id} task={task} />
              ))}
            </ul>
          )}
          <p className="mt-2 text-meta text-ink-3">Glisse une tâche dans un bloc ; dépose-la ici pour l’en sortir.</p>
        </section>
      )}

      <ModuleDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} module={editing?.module} defaultMode={mode} />
    </aside>
  );
}
