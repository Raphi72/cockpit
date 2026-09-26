import { Check } from 'lucide-react';
import type { TaskStatus } from '../model';

/** Coche dessinée d'un trait (même tracé que l'icône Check), le temps de terminer la tâche. */
function DrawnCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="size-3 text-white">
      <path d="M20 6 9 17l-5-5" pathLength={1} className="check-draw" />
    </svg>
  );
}

/**
 * Case ronde : vide (à faire), point central (en cours), pleine (terminée).
 * `checking` : la tâche est en train d'être terminée ; la case se remplit et la coche se dessine.
 */
export function TaskCheckbox({
  status,
  checking = false,
  onToggle,
}: {
  status: TaskStatus;
  checking?: boolean;
  onToggle: () => void;
}) {
  const done = status === 'done' || checking;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={checking ? 'Garder la tâche à faire' : done ? 'Rouvrir la tâche' : 'Terminer la tâche'}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={
        'grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-[120ms] ease-soft ' +
        (checking ? 'check-pop ' : '') +
        (done
          ? 'border-accent bg-accent'
          : status === 'in_progress'
            ? 'border-accent hover:bg-accent-soft'
            : 'border-line-strong hover:border-ink-3')
      }
    >
      {checking ? <DrawnCheck /> : done && <Check className="size-3 text-white" strokeWidth={3} />}
      {status === 'in_progress' && !done && <span className="size-2 rounded-full bg-accent" />}
    </button>
  );
}
