import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useCreateTask } from '../hooks';

type InlineAddTaskProps = {
  projectId?: string | null;
  scheduledDate?: string | null;
  label?: string;
};

/**
 * Ajout express : on tape le titre, Entrée, et on enchaîne la suivante.
 * Le contexte (projet, date du jour) est appliqué automatiquement.
 */
export function InlineAddTask({ projectId = null, scheduledDate = null, label = 'Ajouter une tâche' }: InlineAddTaskProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const createTask = useCreateTask();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createTask.mutate({ title: trimmed, projectId, scheduledDate, dueDate: null, priority: 1, estimateMin: null, notes: null });
    setTitle('');
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group -mx-2.5 flex min-h-11 w-[calc(100%+20px)] items-center gap-3.5 rounded-md px-2.5 text-ink-3 transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink-2"
      >
        <Plus className="size-[18px]" strokeWidth={1.75} />
        {label}
      </button>
    );
  }

  return (
    <div className="-mx-2.5 flex min-h-11 items-center gap-3.5 px-2.5">
      <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-line-strong" />
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            setTitle('');
            setEditing(false);
          }
        }}
        onBlur={() => {
          submit();
          setEditing(false);
        }}
        placeholder="Titre de la tâche, puis Entrée"
        aria-label="Titre de la nouvelle tâche"
        className="h-9 flex-1 bg-transparent outline-none placeholder:text-ink-3"
      />
    </div>
  );
}
