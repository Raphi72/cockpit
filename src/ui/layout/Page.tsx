import type { ReactNode } from 'react';

type PageProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Actions alignées à droite du titre. */
  actions?: ReactNode;
  children?: ReactNode;
};

/** Contenu centré (1120 px max) avec des marges généreuses. */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1120px] px-12 pt-12 pb-24">{children}</div>;
}

/** Gabarit commun : titre sobre, sous-titre, actions. */
export function Page({ title, subtitle, actions, children }: PageProps) {
  return (
    <PageContainer>
      <header className="mb-10 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-title font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-ink-2">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </PageContainer>
  );
}
