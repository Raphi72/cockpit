import { Link, useNavigate } from '@tanstack/react-router';
import { BookText, FileText, Star } from 'lucide-react';
import { useToday } from '@/core/use-today';
import { useOpenJournal, usePages } from '@/domains/pages/hooks';
import { pageTitle, type PageItem } from '@/domains/pages/model';
import { Button } from '@/ui/primitives/Button';
import { ScreenHeader, ScreenSection } from './parts';

function PageLink({ page }: { page: PageItem }) {
  return (
    <li>
      <Link to="/pages/$pageId" params={{ pageId: page.id }} className="flex min-h-12 items-center gap-3 border-b border-line/60 py-2">
        {page.pinned ? <Star className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} /> : <FileText className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />}
        <span className="min-w-0 flex-1 truncate">{pageTitle(page)}</span>
        {page.entityName && <span className="shrink-0 text-meta text-ink-3">{page.entityName}</span>}
      </Link>
    </li>
  );
}

/** Les pages : favorites d'abord, puis les plus récentes ; le journal du jour à un geste. */
export function PagesScreen() {
  const today = useToday();
  const navigate = useNavigate();
  const { data: pages } = usePages();
  const journal = useOpenJournal();
  if (!pages) return null;
  const visible = pages.filter((p) => !p.isTemplate);
  const pinned = visible.filter((p) => p.pinned);
  const recent = [...visible].filter((p) => !p.pinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
  return (
    <>
      <ScreenHeader
        title="Pages"
        actions={
          <Button
            variant="secondary"
            icon={BookText}
            onClick={() => journal.mutate(today, { onSuccess: (id) => void navigate({ to: '/pages/$pageId', params: { pageId: id } }) })}
          >
            Journal
          </Button>
        }
      />
      {visible.length === 0 && <p className="px-5 text-ink-3">Aucune page pour l’instant.</p>}
      {pinned.length > 0 && (
        <ScreenSection title="Favorites">
          <ul>
            {pinned.map((page) => (
              <PageLink key={page.id} page={page} />
            ))}
          </ul>
        </ScreenSection>
      )}
      {recent.length > 0 && (
        <ScreenSection title="Récentes">
          <ul>
            {recent.map((page) => (
              <PageLink key={page.id} page={page} />
            ))}
          </ul>
        </ScreenSection>
      )}
    </>
  );
}
