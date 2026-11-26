import { Link, useParams } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { usePage, usePages, useUpdatePage } from '@/domains/pages/hooks';
import type { Page } from '@/domains/pages/model';

// L'éditeur (TipTap) est lourd : il n'est chargé qu'à l'ouverture d'une page.
const PageEditor = lazy(() => import('@/domains/pages/editor/PageEditor').then((m) => ({ default: m.PageEditor })));

function TitleField({ page }: { page: Page }) {
  const update = useUpdatePage();
  const [draft, setDraft] = useState(page.title);
  useEffect(() => setDraft(page.title), [page.id, page.title]);
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))}
      onBlur={() => draft.trim() !== page.title && update.mutate({ id: page.id, patch: { title: draft.trim() } })}
      placeholder="Sans titre"
      rows={1}
      aria-label="Titre de la page"
      className="w-full resize-none bg-transparent text-[24px] font-semibold tracking-tight outline-none [field-sizing:content] placeholder:text-ink-3"
    />
  );
}

/** Une page, à lire et à retoucher (le même éditeur que sur le PC, enregistré tout seul). */
export function PageScreen() {
  const { pageId } = useParams({ strict: false }) as { pageId: string };
  const { data: page, isPending } = usePage(pageId);
  const { data: pages = [] } = usePages();
  return (
    <div className="px-5 pt-3 pb-28">
      <Link to="/pages" className="-ml-1.5 flex h-10 w-fit items-center gap-1 text-ink-2">
        <ChevronLeft className="size-5" strokeWidth={1.75} />
        Pages
      </Link>
      {!page ? (
        !isPending && <p className="mt-4 text-ink-3">Cette page n’existe plus.</p>
      ) : (
        <>
          <div className="mt-2 mb-3">
            <TitleField page={page} />
          </div>
          <Suspense fallback={null}>
            <PageEditor key={page.id} page={page} pages={pages} />
          </Suspense>
        </>
      )}
    </div>
  );
}
