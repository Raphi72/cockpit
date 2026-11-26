import { Link } from '@tanstack/react-router';
import { ChevronRight, FileText, Star } from 'lucide-react';
import { useState } from 'react';
import { relativeDateLabel, toISODate } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { pageTitle, type PageItem, type PageNode } from '../model';

/** Une page dans une liste : son titre, quand elle a changé ; un clic l'ouvre. */
export function PageRow({ page, depth = 0, toggle }: { page: PageItem; depth?: number; toggle?: { open: boolean; onToggle: () => void } }) {
  const today = useToday();
  return (
    <div className="group -mx-2.5 flex min-h-10 items-center rounded-md pr-2.5 transition-colors duration-[120ms] ease-soft hover:bg-hover" style={{ paddingLeft: 10 + depth * 20 }}>
      {toggle ? (
        <button
          type="button"
          onClick={toggle.onToggle}
          aria-label={toggle.open ? 'Replier' : 'Déplier'}
          aria-expanded={toggle.open}
          className="mr-1 grid size-6 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-active hover:text-ink"
        >
          <ChevronRight className={`size-3.5 transition-transform duration-[120ms] ${toggle.open ? 'rotate-90' : ''}`} strokeWidth={2} />
        </button>
      ) : (
        <span className="mr-1 size-6 shrink-0" />
      )}
      <Link to="/pages/$pageId" params={{ pageId: page.id }} className="flex min-w-0 flex-1 items-center gap-2.5 py-2">
        <FileText className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
        <span className={`truncate ${page.title.trim() ? '' : 'text-ink-3'}`}>{pageTitle(page)}</span>
        {page.pinned && <Star className="size-3.5 shrink-0 fill-current text-warning" strokeWidth={1.75} aria-label="Favori" />}
        {page.entityName && <span className="truncate text-meta text-ink-3">{page.entityName}</span>}
      </Link>
      <span className="tnum shrink-0 pl-3 text-meta text-ink-3">{relativeDateLabel(toISODate(new Date(page.updatedAt)), today)}</span>
    </div>
  );
}

/** L'arbre des pages : chaque page avec ses sous-pages, repliables. */
export function PageTree({ nodes, depth = 0 }: { nodes: PageNode[]; depth?: number }) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  return (
    <ul>
      {nodes.map(({ page, children }) => {
        const open = !closed.has(page.id);
        return (
          <li key={page.id}>
            <PageRow
              page={page}
              depth={depth}
              toggle={
                children.length > 0
                  ? {
                      open,
                      onToggle: () =>
                        setClosed((prev) => {
                          const next = new Set(prev);
                          if (open) next.add(page.id);
                          else next.delete(page.id);
                          return next;
                        }),
                    }
                  : undefined
              }
            />
            {open && children.length > 0 && <PageTree nodes={children} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}
