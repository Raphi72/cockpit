import type { ReactNode } from 'react';

/** En-tête d'un écran propre au téléphone : un titre, et ce qu'il faut dessous. */
export function ScreenHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold tracking-tight first-letter:uppercase">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2 first-letter:uppercase">{subtitle}</p>}
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
