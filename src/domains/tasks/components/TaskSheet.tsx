import { Link } from '@tanstack/react-router';
import { ArrowUpRight, ChevronRight, Trash2, X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import { formatCompletedAt, formatShortDate, toISODate } from '@/core/dates';
import { deadlineStatus } from '@/core/deadline';
import { useToday } from '@/core/use-today';
import { ProjectMenu } from '@/domains/projects/components/ProjectMenu';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { handlePanelDeleteKey } from '@/ui/data/row-keys';
import { PropertyRow } from '@/ui/layout/PropertyRow';
import { WindowErrorBoundary } from '@/ui/overlays/WindowErrorBoundary';
import { Button } from '@/ui/primitives/Button';
import { InlineDate, InlineText, InlineTextarea } from '@/ui/primitives/InlineFields';
import { useDeleteTask, useSubtasks, useTask, useUpdateTask } from '../hooks';
import type { TaskItem, TaskPatch } from '../model';
import { useTaskSheet } from '../sheet-store';
import { InlineAddTask } from './InlineAddTask';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskEstimateMenu, TaskParentMenu, TaskPriorityMenu, TaskStatusMenu } from './TaskFields';
import { TaskRow } from './TaskRow';

/**
 * Sous la deadline : « Dans 6 jours », « En retard de 2 jours », « Terminée »…
 * Rien au-delà d'une semaine : ce serait la date, déjà affichée au-dessus.
 */
function DeadlineHint({ task, today }: { task: TaskItem; today: string }) {
  if (!task.dueDate) return null;
  const { text, tone } = deadlineStatus(task.dueDate, today, { done: task.status === 'done' });
  return tone === 'later' ? null : <span className={DEADLINE_TONE_CLASS[tone]}>{text}</span>;
}

/** Sous-tâches d'une tâche principale : un clic ouvre la sous-tâche dans ce panneau. */
function Subtasks({ task, today }: { task: TaskItem; today: string }) {
  const { data: subtasks = [] } = useSubtasks(task.id);
  return (
    <section className="mt-8">
      <h3 className="mb-1 flex items-baseline gap-2 text-meta font-medium text-ink-2">
        Sous-tâches
        {task.subtasksTotal > 0 && (
          <span className="tnum font-normal text-ink-3">
            {task.subtasksDone}/{task.subtasksTotal}
          </span>
        )}
      </h3>
      {subtasks.map((subtask) => (
        <TaskRow key={subtask.id} task={subtask} today={today} showProject={false} showParent={false} />
      ))}
      <InlineAddTask parentId={task.id} projectId={task.projectId} label="Ajouter une sous-tâche" />
    </section>
  );
}

function TaskSheetContent({ task, onClose, remove }: { task: TaskItem; onClose: () => void; remove: () => void }) {
  const openTask = useTaskSheet((state) => state.openTask);
  const update = useUpdateTask();
  const today = useToday();
  const save = (patch: TaskPatch) => update.mutate({ id: task.id, patch });
  const done = task.status === 'done';

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center">
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
          {task.parentId && task.parentTitle && (
            <>
              <ChevronRight className="mx-0.5 size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
              <button
                type="button"
                onClick={() => openTask(task.parentId!)}
                title="Ouvrir la tâche parente"
                className="flex h-8 min-w-0 items-center rounded-md px-2 text-meta text-ink-2 hover:bg-hover hover:text-ink"
              >
                <span className="truncate">{task.parentTitle}</span>
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="lg"
            icon={Trash2}
            aria-label="Supprimer la tâche"
            title="Supprimer · Suppr"
            onClick={remove}
          />
          <RadixDialog.Close asChild>
            <Button variant="ghost" size="lg" icon={X} aria-label="Fermer" title="Fermer · Échap" />
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
        {/* Terminée : quand. Rouvrir la tâche efface cette date. */}
        <PropertyRow
          label="Statut"
          hint={done && task.completedAt && <span className="text-ink-3">Terminée {formatCompletedAt(task.completedAt, today)}</span>}
        >
          <TaskStatusMenu value={task.status} onChange={(status) => save({ status })} />
        </PropertyRow>
        <PropertyRow label="Projet">
          <ProjectMenu value={task.projectId} currentName={task.projectName} onChange={(projectId) => save({ projectId })} />
        </PropertyRow>
        {/* Une tâche qui a des sous-tâches reste au premier niveau (un seul niveau de sous-tâches). */}
        {task.subtasksTotal === 0 && (
          <PropertyRow label="Sous-tâche de">
            <TaskParentMenu task={task} onChange={(parentId) => save({ parentId })} />
          </PropertyRow>
        )}
        <PropertyRow label="Priorité">
          <TaskPriorityMenu value={task.priority} onChange={(priority) => save({ priority })} />
        </PropertyRow>
        <PropertyRow label="Début">
          <InlineDate value={task.scheduledDate} onSave={(scheduledDate) => save({ scheduledDate })} aria-label="Début" />
        </PropertyRow>
        <PropertyRow label="Deadline" hint={<DeadlineHint task={task} today={today} />}>
          <InlineDate value={task.dueDate} onSave={(dueDate) => save({ dueDate })} aria-label="Deadline" />
        </PropertyRow>
        <PropertyRow label="Estimation">
          <TaskEstimateMenu value={task.estimateMin} onChange={(estimateMin) => save({ estimateMin })} />
        </PropertyRow>
      </div>

      {task.parentId === null && <Subtasks task={task} today={today} />}

      <h3 className="mt-8 mb-1.5 text-meta font-medium text-ink-2">Notes</h3>
      <InlineTextarea
        value={task.notes}
        onSave={(notes) => save({ notes })}
        placeholder="Détails, liens, étapes…"
        className="min-h-28"
        aria-label="Notes"
      />

      <p className="mt-8 text-meta text-ink-3">Créée le {formatShortDate(toISODate(new Date(task.createdAt)), today)}</p>
    </>
  );
}

/** Panneau latéral d'une tâche : s'ouvre au clic sur une ligne, sans quitter la liste. */
export function TaskSheet() {
  const taskId = useTaskSheet((state) => state.taskId);
  const close = useTaskSheet((state) => state.close);
  const { data: task } = useTask(taskId);
  const deleteTask = useDeleteTask();
  // « Annuler » est dans le toast : pas de confirmation.
  const remove = () => {
    if (!task) return;
    close();
    deleteTask.mutate(task);
  };

  return (
    <RadixDialog.Root open={taskId !== null} onOpenChange={(open) => !open && close()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade bg-backdrop" />
        <RadixDialog.Content
          onKeyDown={(event) => handlePanelDeleteKey(event, remove)}
          className="fixed inset-y-0 right-0 z-50 w-[min(460px,100vw)] overflow-y-auto border-l border-line bg-elevated px-7 py-5 shadow-overlay animate-slide-in focus:outline-none"
        >
          <WindowErrorBoundary onClose={close}>
            {task ? (
              <TaskSheetContent task={task} onClose={close} remove={remove} />
            ) : (
              <RadixDialog.Title className="sr-only">Tâche</RadixDialog.Title>
            )}
          </WindowErrorBoundary>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
