import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useCreateTask } from '../hooks';

type InlineAddTaskProps = {
  projectId?: string | null;
  /** Sous-tâche de cette tâche (elle prend son projet). */
  parentId?: string | null;
  scheduledDate?: string | null;
  label?: string;
  /** Ouvert d'emblée (« Ajouter une sous-tâche » au survol d'une ligne), et `onClose` en sortant. */
  autoEdit?: boolean;
  onClose?: () => void;
  /** En retrait, sous une tâche parente. */
  indent?: boolean;
};

/**
 * Ajout express : on tape le titre, Entrée, et on enchaîne la suivante.
 * Le contexte (projet, tâche parente, date du jour) est appliqué automatiquement.
 */
export function InlineAddTask({
  projectId = null,
  parentId = null,
  scheduledDate = null,
  label = 'Ajouter une tâche',
  autoEdit = false,
  onClose,
  indent = false,
}: InlineAddTaskProps) {
  const [editing, setEditing] = useState(autoEdit);
  const [title, setTitle] = useState('');
  // Échap abandonne : la perte du focus qui suit ne doit rien créer.
  const cancelled = useRef(false);
  const createTask = useCreateTask();
  const pad = indent ? 'pl-[38px]' : 'pl-2.5';

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || cancelled.current) return;
    createTask.mutate({
      title: trimmed,
      projectId,
      parentId,
      scheduledDate,
      dueDate: null,
      priority: 1,
      estimateMin: null,
      notes: null,
    });
    setTitle('');
  };

  const close = () => {
    setEditing(false);
    onClose?.();
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          cancelled.current = false;
          setEditing(true);
        }}
        className={`group -mx-2.5 flex min-h-11 w-[calc(100%+20px)] items-center gap-3.5 rounded-md ${pad} pr-2.5 text-ink-3 transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink-2`}
      >
        <Plus className="size-[18px]" strokeWidth={1.75} />
        {label}
      </button>
    );
  }

  return (
    <div className={`-mx-2.5 flex min-h-11 items-center gap-3.5 ${pad} pr-2.5`}>
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
            cancelled.current = true;
            setTitle('');
            close();
          }
        }}
        onBlur={() => {
          submit();
          close();
        }}
        placeholder={parentId ? 'Titre de la sous-tâche, puis Entrée' : 'Titre de la tâche, puis Entrée'}
        aria-label={parentId ? 'Titre de la nouvelle sous-tâche' : 'Titre de la nouvelle tâche'}
        className="h-9 flex-1 bg-transparent outline-none placeholder:text-ink-3"
      />
    </div>
  );
}
