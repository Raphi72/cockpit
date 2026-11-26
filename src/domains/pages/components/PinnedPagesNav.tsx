import { Link } from '@tanstack/react-router';
import { FileText } from 'lucide-react';
import { usePages } from '../hooks';
import { pageTitle } from '../model';

/** Les pages favorites, dans la barre latérale des deux modes (rien s'il n'y en a pas). */
export function PinnedPagesNav() {
  const { data: pages = [] } = usePages();
  const pinned = pages.filter((p) => p.pinned).sort((a, b) => pageTitle(a).localeCompare(pageTitle(b), 'fr'));
  if (pinned.length === 0) return null;
  return (
    <div className="mt-6 flex min-h-0 flex-col">
      <div className="px-[9px] pb-2 text-meta font-medium text-ink-3">Favoris</div>
      <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {pinned.map((page) => (
          <Link
            key={page.id}
            to="/pages/$pageId"
            params={{ pageId: page.id }}
            className="flex h-[34px] shrink-0 items-center gap-3 rounded-md px-[9px] text-ink-2 transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink"
            activeProps={{ className: 'bg-active !text-ink font-medium' }}
          >
            <FileText className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{pageTitle(page)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
