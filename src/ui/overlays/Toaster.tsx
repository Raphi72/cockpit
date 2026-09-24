import { X } from 'lucide-react';
import { useToastStore } from './toast';

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div aria-live="polite" className="pointer-events-none fixed right-5 bottom-5 z-[60] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            'pointer-events-auto flex max-w-[440px] items-center gap-3 rounded-lg bg-elevated py-2 pr-2 pl-4 shadow-overlay animate-pop ' +
            (t.tone === 'danger' ? 'text-danger' : 'text-ink')
          }
        >
          <span className="py-0.5">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
              className="rounded-md px-2 py-1 font-medium text-accent hover:bg-hover"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Fermer"
            className="rounded-md p-1 text-ink-3 hover:bg-hover hover:text-ink"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}
