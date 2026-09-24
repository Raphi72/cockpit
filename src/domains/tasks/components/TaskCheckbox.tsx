import { Check } from 'lucide-react';
import type { TaskStatus } from '../model';

/** Case ronde : vide (à faire), point central (en cours), pleine (terminée). */
export function TaskCheckbox({ status, onToggle }: { status: TaskStatus; onToggle: () => void }) {
  const done = status === 'done';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? 'Rouvrir la tâche' : 'Terminer la tâche'}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={
        'grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-[120ms] ease-soft ' +
        (done
          ? 'border-accent bg-accent'
          : status === 'in_progress'
            ? 'border-accent hover:bg-accent-soft'
            : 'border-line-strong hover:border-ink-3')
      }
    >
      {done && <Check className="size-3 text-white" strokeWidth={3} />}
      {status === 'in_progress' && <span className="size-2 rounded-full bg-accent" />}
    </button>
  );
}
