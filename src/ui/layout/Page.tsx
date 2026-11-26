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

/**
 * Largeur du contenu : 1120 px au plus, comme toujours sur un écran courant (1080p à 125 % : environ
 * 1536 px de fenêtre). Sur un grand écran, il s'élargit par paliers pour ne pas laisser de grands vides
 * sur les côtés : 1440 px dès 1700 px de fenêtre, 1760 px dès 2100. La barre du haut suit la même largeur.
 */
export const CONTENT_WIDTH = 'max-w-[1120px] min-[1700px]:max-w-[1440px] min-[2100px]:max-w-[1760px]';

/** Contenu centré (voir CONTENT_WIDTH) avec des marges généreuses. */
export function PageContainer({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  return <div className={`mx-auto ${CONTENT_WIDTH} px-12 pt-12 ${fill ? 'pb-6' : 'pb-24'}`}>{children}</div>;
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
