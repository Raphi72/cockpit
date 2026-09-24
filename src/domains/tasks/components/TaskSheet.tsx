import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Trash2, X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import { formatShortDate, toISODate } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { ProjectMenu } from '@/domains/projects/components/ProjectMenu';
import { PropertyRow } from '@/ui/layout/PropertyRow';
import { Button } from '@/ui/primitives/Button';
import { InlineDate, InlineText, InlineTextarea } from '@/ui/primitives/InlineFields';
import { useDeleteTask, useTask, useUpdateTask } from '../hooks';
import type { TaskItem, TaskPatch } from '../model';
import { useTaskSheet } from '../sheet-store';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskEstimateMenu, TaskPriorityMenu, TaskStatusMenu } from './TaskFields';

function TaskSheetContent({ task, onClose }: { task: TaskItem; onClose: () => void }) {
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const today = useToday();
  const save = (patch: TaskPatch) => update.mutate({ id: task.id, patch });
  const done = task.status === 'done';

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        {task.projectId && task.projectName ? (
          <Link
            to="/projects/$projectId"
            params={{ projectId: task.projectId }}
            onClick={onClose}
            className="-ml-2 flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-meta text-ink-2 hover:bg-hover hover:text-ink"
          >
            <span className="truncate">{task.projectName}</span>
            <ArrowUpRight className="size-3.5 shrink-0" strokeWidth={1.75} />
          </Link>
        ) : (
          <span className="text-meta text-ink-3">Tâche libre</span>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            icon={Trash2}
            aria-label="Supprimer la tâche"
            title="Supprimer"
            onClick={() => {
              onClose();
              remove.mutate(task);
            }}
          />
          <RadixDialog.Close asChild>
            <Button variant="ghost" icon={X} aria-label="Fermer" title="Fermer · Échap" />
          </RadixDialog.Close>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-3">
        <span className="pt-2.5">
          <TaskCheckbox status={task.status} onToggle={() => save({ status: done ? 'todo' : 'done' })} />
        </span>
        <RadixDialog.Title asChild>
          <div className="min-w-0 flex-1">
            <InlineText
              value={task.title}
              onSave={(title) => save({ title })}
              required
              className={`h-10 text-[17px] font-semibold tracking-tight ${done ? 'text-ink-3 line-through' : ''}`}
              aria-label="Titre de la tâche"
            />
          </div>
        </RadixDialog.Title>
      </div>
      <RadixDialog.Description className="sr-only">Modifier la tâche {task.title}</RadixDialog.Description>

      <div className="mt-6">
        <PropertyRow label="Statut">
          <TaskStatusMenu value={task.status} onChange={(status) => save({ status })} />
        </PropertyRow>
        <PropertyRow label="Projet">
          <ProjectMenu value={task.projectId} currentName={task.projectName} onChange={(projectId) => save({ projectId })} />
        </PropertyRow>
        <PropertyRow label="Priorité">
          <TaskPriorityMenu value={task.priority} onChange={(priority) => save({ priority })} />
        </PropertyRow>
        <PropertyRow label="Prévue le">
          <InlineDate value={task.scheduledDate} onSave={(scheduledDate) => save({ scheduledDate })} aria-label="Prévue le" />
        </PropertyRow>
        <PropertyRow label="Deadline">
          <InlineDate value={task.dueDate} onSave={(dueDate) => save({ dueDate })} aria-label="Deadline" />
        </PropertyRow>
        <PropertyRow label="Estimation">
          <TaskEstimateMenu value={task.estimateMin} onChange={(estimateMin) => save({ estimateMin })} />
        </PropertyRow>
      </div>

      <h3 className="mt-8 mb-1.5 text-meta font-medium text-ink-2">Notes</h3>
      <InlineTextarea
        value={task.notes}
        onSave={(notes) => save({ notes })}
        placeholder="Détails, liens, étapes…"
        className="min-h-28"
        aria-label="Notes"
      />

      <p className="mt-8 text-meta text-ink-3">
        Créée le {formatShortDate(toISODate(new Date(task.createdAt)), today)}
        {task.completedAt && ` · terminée le ${formatShortDate(toISODate(new Date(task.completedAt)), today)}`}
      </p>
    </>
  );
}

/** Panneau latéral d'une tâche : s'ouvre au clic sur une ligne, sans quitter la liste. */
export function TaskSheet() {
  const taskId = useTaskSheet((state) => state.taskId);
  const close = useTaskSheet((state) => state.close);
  const { data: task } = useTask(taskId);

  return (
    <RadixDialog.Root open={taskId !== null} onOpenChange={(open) => !open && close()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade bg-backdrop" />
        <RadixDialog.Content
          className="fixed inset-y-0 right-0 z-50 w-[min(460px,100vw)] overflow-y-auto border-l border-line bg-elevated px-7 py-5 shadow-overlay animate-slide-in focus:outline-none"
        >
          {task ? (
            <TaskSheetContent task={task} onClose={close} />
          ) : (
            <RadixDialog.Title className="sr-only">Tâche</RadixDialog.Title>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
