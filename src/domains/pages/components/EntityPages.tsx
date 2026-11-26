import { usePages } from '../hooks';
import type { EntityType } from '../model';
import { NewPageMenu } from './NewPageMenu';
import { PageRow } from './PageRows';

/** Dans la fiche d'un projet, d'une matière… : les pages qui y sont rattachées (P19), et de quoi en ajouter. */
export function EntityPages({ entityType, entityId, title = 'Pages' }: { entityType: EntityType; entityId: string; title?: string }) {
  const { data: pages = [] } = usePages();
  const mine = pages.filter((p) => p.entityType === entityType && p.entityId === entityId && !p.isTemplate);
  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <h2 className="font-semibold">{title}</h2>
        <span className="ml-auto">
          <NewPageMenu label="Nouvelle page" variant="ghost" entityType={entityType} entityId={entityId} />
        </span>
      </div>
      {mine.length === 0 ? (
        <p className="py-2 text-ink-3">Aucune page rattachée.</p>
      ) : (
        <ul>
          {mine.map((page) => (
            <li key={page.id}>
              <PageRow page={page} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
