import { ChevronRight, FileText, Upload } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { NewPageMenu } from '../components/NewPageMenu';
import { PageRow, PageTree } from '../components/PageRows';
import { useNotionImport } from '../import/hooks';
import { usePages } from '../hooks';
import { buildTree } from '../model';

function Fold({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <section className="mt-10">
      <Button
        variant="ghost"
        icon={ChevronRight}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`-ml-3 [&>svg]:transition-transform ${open ? '[&>svg]:rotate-90' : ''}`}
      >
        {title}
        <span className="tnum ml-1 text-ink-3">{count}</span>
      </Button>
      {open && <div className="mt-1">{children}</div>}
    </section>
  );
}

/**
 * Pages (P19) : l'arborescence des pages, puis le journal (une page par jour) et les modèles. Les
 * pages sont communes aux deux modes ; les favorites sont aussi dans la barre latérale.
 */
export function PagesPage() {
  const { data: pages } = usePages();
  const importNotion = useNotionImport();
  if (!pages) return null;

  const tree = buildTree(pages);
  const journal = pages.filter((p) => p.journalDate !== null).sort((a, b) => b.journalDate!.localeCompare(a.journalDate!));
  const templates = pages.filter((p) => p.isTemplate);
  const count = pages.length - journal.length - templates.length;

  return (
    <Page
      title="Pages"
      subtitle={count > 0 ? `${count} page${count > 1 ? 's' : ''}` : undefined}
      actions={
        <>
          <Button variant="ghost" icon={Upload} onClick={() => importNotion.mutate()} disabled={importNotion.isPending}>
            {importNotion.isPending ? 'Import en cours…' : 'Importer de Notion…'}
          </Button>
          <NewPageMenu />
        </>
      }
    >
      {tree.length === 0 ? (
        <EmptyState icon={FileText} title="Aucune page pour l’instant">
          <p>Des notes, des fiches de cours, des comptes rendus : une page par sujet, des sous-pages au besoin.</p>
          <p className="mt-1">Tape « / » dans une page pour insérer un titre, une liste, des cases, une image…</p>
        </EmptyState>
      ) : (
        <PageTree nodes={tree} />
      )}

      <Fold title="Journal" count={journal.length}>
        <ul>
          {journal.map((page) => (
            <li key={page.id}>
              <PageRow page={page} />
            </li>
          ))}
        </ul>
      </Fold>

      <Fold title="Modèles" count={templates.length}>
        <p className="mb-2 text-meta text-ink-3">Ouvre un modèle pour le modifier ; « Nouvelle page » propose de partir de l’un d’eux.</p>
        <ul>
          {templates.map((page) => (
            <li key={page.id}>
              <PageRow page={page} />
            </li>
          ))}
        </ul>
      </Fold>
    </Page>
  );
}
