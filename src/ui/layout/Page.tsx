import type { ReactNode } from 'react';

type PageProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Actions alignées à droite du titre. */
  actions?: ReactNode;
  /** Le contenu remplit la hauteur de la fenêtre (vue mois) : petite marge en bas, pas de défilement. */
  fill?: boolean;
  children?: ReactNode;
};

/** Marge du bas d'une page qui remplit la fenêtre (`fill`), en pixels : `pb-6`. */
export const FILL_BOTTOM_GAP = 24;

/** Contenu centré (1120 px max) avec des marges généreuses. */
export function PageContainer({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  return <div className={`mx-auto max-w-[1120px] px-12 pt-12 ${fill ? 'pb-6' : 'pb-24'}`}>{children}</div>;
}

/** Gabarit commun : titre sobre, sous-titre, actions. */
export function Page({ title, subtitle, actions, fill, children }: PageProps) {
  return (
    <PageContainer fill={fill}>
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
