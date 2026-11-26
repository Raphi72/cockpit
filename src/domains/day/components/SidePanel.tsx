import { useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical, Plus } from 'lucide-react';
import { useState } from 'react';
import type { AppMode } from '@/core/app-mode';
import { formatShortDate } from '@/core/dates';
import { useToday } from '@/core/use-today';
import type { TaskItem } from '@/domains/tasks/model';
import { useTaskSheet } from '@/domains/tasks/sheet-store';
import { ColorDot, colorVar } from '@/ui/data/ColorDot';
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
      <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ backgroundColor: `color-mix(in srgb, ${colorVar(module.color)} 16%, transparent)` }}>
        <Icon className="size-3.5" style={{ color: colorVar(module.color) }} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate">{module.name}</span>
      <span className="tnum text-meta text-ink-3">{formatMinutes(module.durationMin)}</span>
      <GripVertical className="size-3.5 shrink-0 text-ink-3 opacity-0 group-hover:opacity-100" strokeWidth={1.75} />
    </li>
  );
}

function ToPlaceRow({ task, due }: { task: TaskItem; due?: string }) {
  const drag = useDraggable({ id: `task:${task.id}@side`, data: { type: 'task', task } satisfies DayDragData });
  const openTask = useTaskSheet((state) => state.openTask);
  const today = useToday();
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
      {/* L'échéance passe sous le titre : sur une ligne, elle le coupait dans ce panneau étroit. */}
      <span className={`min-w-0 flex-1 ${due ? 'py-1' : ''}`} title={context ?? undefined}>
        <span className="block truncate">{task.title}</span>
        {due && (
          <span className="block truncate text-meta text-ink-3">
            pour {formatShortDate(due, today)}
            {context && ` · ${context}`}
          </span>
        )}
      </span>
      <span className="tnum text-meta text-ink-3">{formatMinutes(taskMinutes(task))}</span>
    </li>
  );
}

/**
 * À droite de la journée : la bibliothèque de modules (on les glisse sur la journée) et, en vue jour,
 * « À caser » : les modules « pour une fois » (glissés sur la journée, ils deviennent un bloc et
 * disparaissent), puis les tâches et devoirs du jour pas encore dans un bloc (on les glisse dans un
 * bloc ; on les y reprend en les déposant ici).
 */
export function SidePanel({
  modules,
  oneOffs,
  mode,
  toPlace,
  deadlines = [],
}: {
  modules: Module[];
  oneOffs: Module[];
  mode: AppMode;
  toPlace: TaskItem[] | null;
  /** Ce qui a une échéance dans les deux semaines, pas encore placé : à caser avant la date. */
  deadlines?: TaskItem[];
}) {
  const [editing, setEditing] = useState<{ module?: Module; oneOff?: boolean } | null>(null);
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
          <div className="mb-1.5 flex items-baseline gap-2">
            <h2 className="font-semibold">À caser</h2>
            <button
              type="button"
              onClick={() => setEditing({ oneOff: true })}
              title="Un module pour une fois (« Courses · 1 h ») : il attend ici jusqu’à ce que tu le poses"
              className="ml-auto flex items-center gap-1 text-meta text-ink-3 transition-colors hover:text-ink"
            >
              <Plus className="size-3.5" strokeWidth={2} />
              Ajouter
            </button>
          </div>
          {oneOffs.length > 0 && (
            <ul className="mb-1">
              {oneOffs.map((module) => (
                <ModuleRow key={module.id} module={module} onEdit={() => setEditing({ module })} />
              ))}
            </ul>
          )}
          {toPlace.length === 0 && oneOffs.length === 0 && deadlines.length === 0 ? (
            <p className="text-meta text-ink-3">Tout ce qui est prévu ce jour-là est dans un bloc.</p>
          ) : (
            <ul>
              {toPlace.map((task) => (
                <ToPlaceRow key={task.id} task={task} />
              ))}
            </ul>
          )}
          {deadlines.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-meta text-ink-3">Avant leur échéance</p>
              <ul>
                {deadlines.map((task) => (
                  <ToPlaceRow key={task.id} task={task} due={task.dueDate ?? undefined} />
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-meta text-ink-3">Glisse une tâche dans un bloc ; dépose-la ici pour l’en sortir. Un bloc lâché ici revient à caser.</p>
        </section>
      )}

      <ModuleDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        module={editing?.module}
        oneOff={editing?.oneOff ?? editing?.module?.oneOff ?? false}
        defaultMode={mode}
      />
    </aside>
  );
}
