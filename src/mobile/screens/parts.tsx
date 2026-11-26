import type { ReactNode } from 'react';
import { TaskCheckbox } from '@/domains/tasks/components/TaskCheckbox';
import { useCompletingTasks } from '@/domains/tasks/completion-store';
import { useToggleTask } from '@/domains/tasks/hooks';
import type { TaskItem } from '@/domains/tasks/model';

/** En-tête d'un écran du téléphone : un titre, et ce qu'il faut dessous. */
export function ScreenHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 px-5 pt-6 pb-4">
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold tracking-tight first-letter:uppercase">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}

export function ScreenSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-5 pb-7">
      <h2 className="mb-2 text-meta font-medium text-ink-3">{title}</h2>
      {children}
    </section>
  );
}

/** Une tâche ou un devoir à cocher : une grande ligne, facile à toucher. */
export function TaskLine({ task, late }: { task: TaskItem; late?: boolean }) {
  const toggle = useToggleTask();
  const checking = useCompletingTasks((state) => state.ids.includes(task.id));
  const context = task.subjectName ?? task.projectName;
  return (
    <li className="flex min-h-12 items-center gap-3.5 border-b border-line/60 py-2 last:border-b-0">
      <TaskCheckbox status={task.status} checking={checking} onToggle={() => toggle(task)} />
      <span className="min-w-0 flex-1">
        <span className={`block ${checking ? 'text-ink-3 line-through' : ''}`}>{task.title}</span>
        {(context || late) && (
          <span className="block text-meta text-ink-3">
            {context}
            {late && <span className="text-danger">{context ? ' · ' : ''}en retard</span>}
          </span>
        )}
      </span>
    </li>
  );
}
