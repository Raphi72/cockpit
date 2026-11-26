import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronRight, Copy, Download, Ellipsis, FileText, FolderInput, Layers, Link2, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDeleteShortcut } from '@/app/shortcuts';
import { toast } from '@/ui/overlays/toast';
import { PageContainer } from '@/ui/layout/Page';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Button } from '@/ui/primitives/Button';
import { NewPageMenu } from '../components/NewPageMenu';
import { AttachDialog, MoveDialog } from '../components/PageDialogs';
import { PageRow } from '../components/PageRows';
import { PageEditor } from '../editor/PageEditor';
import { exportPage } from '../export';
import { useBacklinks, useDeletePage, usePage, usePages, useSaveAsTemplate, useUpdatePage } from '../hooks';
import { useSyncPageCards } from '@/domains/school/flashcards/hooks';
import { ENTITY_LABELS, ancestorsOf, pageTitle, parseDoc, plainTextOf, type Page } from '../model';

/** Le titre de la page, modifiable sur place ; Entrée (ou flèche bas) passe au contenu. */
function TitleField({ page, inputRef, onEnter }: { page: Page; inputRef: React.RefObject<HTMLTextAreaElement | null>; onEnter: () => void }) {
  const update = useUpdatePage();
  const [draft, setDraft] = useState(page.title);
  useEffect(() => setDraft(page.title), [page.id, page.title]);
  const commit = () => {
    if (draft.trim() !== page.title) update.mutate({ id: page.id, patch: { title: draft.trim() } });
  };
  return (
    <textarea
      ref={inputRef}
      value={draft}
      rows={1}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ' '))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault();
          commit();
          onEnter();
        }
      }}
      placeholder="Sans titre"
      aria-label="Titre de la page"
      className="field-sizing-content w-full resize-none bg-transparent text-[28px] leading-tight font-semibold tracking-tight outline-none placeholder:text-ink-3"
    />
  );
}

function EntityChip({ page }: { page: Page }) {
  if (!page.entityType || !page.entityId || !page.entityName) return null;
  const label = `${ENTITY_LABELS[page.entityType]} · ${page.entityName}`;
  const className = 'inline-flex h-7 items-center gap-1.5 rounded-md bg-hover px-2.5 text-meta text-ink-2 hover:text-ink';
  if (page.entityType === 'project') {
    return (
      <Link to="/projects/$projectId" params={{ projectId: page.entityId }} className={className}>
        {label}
      </Link>
    );
  }
  if (page.entityType === 'subject') {
    return (
      <Link to="/subjects/$subjectId" params={{ subjectId: page.entityId }} className={className}>
        {label}
      </Link>
    );
  }
  return <span className={className}>{label}</span>;
}

/**
 * Une page (P19) : fil d'Ariane, titre, contenu (éditeur en blocs), puis ses sous-pages et les pages qui
 * renvoient vers elle. Favori, rattachement, déplacement, export Markdown et modèle sont dans l'en-tête.
 */
export function PageDetailPage() {
  const { pageId } = useParams({ from: '/pages/$pageId' });
  const { data: page, isPending } = usePage(pageId);
  const { data: pages = [] } = usePages();
  const { data: backlinks = [] } = useBacklinks(pageId);
  const update = useUpdatePage();
  const remove = useDeletePage();
  const saveAsTemplate = useSaveAsTemplate();
  const syncCards = useSyncPageCards();
  const navigate = useNavigate();
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const editorFocus = useRef<() => void>(() => undefined);
  const [attaching, setAttaching] = useState(false);
  const [moving, setMoving] = useState(false);

  const deletePage = () => {
    if (!page) return;
    remove.mutate(page.id, { onSuccess: () => void navigate(page.parentId ? { to: '/pages/$pageId', params: { pageId: page.parentId } } : { to: '/pages' }) });
  };
  useDeleteShortcut(deletePage);

  if (isPending) return null;
  if (!page) {
    return (
      <PageContainer>
        <p className="text-ink-2">Cette page n’existe plus.</p>
        <Link to="/pages" className="mt-3 inline-block text-accent">
          Retour aux pages
        </Link>
      </PageContainer>
    );
  }

  const trail = ancestorsOf(pages, page.id);
  const children = pages.filter((p) => p.parentId === page.id).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <PageContainer>
      <div className="-mt-4 mb-8 flex items-center justify-between gap-4">
        <nav className="flex min-w-0 items-center text-meta text-ink-2" aria-label="Fil d’Ariane">
          <Link to="/pages" className="-ml-2 flex h-8 items-center rounded-md px-2 hover:bg-hover hover:text-ink">
            Pages
          </Link>
          {trail.map((parent) => (
            <span key={parent.id} className="flex min-w-0 items-center">
              <ChevronRight className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
              <Link to="/pages/$pageId" params={{ pageId: parent.id }} className="flex h-8 min-w-0 items-center rounded-md px-2 hover:bg-hover hover:text-ink">
                <span className="truncate">{pageTitle(parent)}</span>
              </Link>
            </span>
          ))}
        </nav>
        <span className="flex shrink-0 items-center gap-1">
          {page.isTemplate && <span className="mr-2 text-meta text-ink-3">Modèle</span>}
          <Button
            variant="ghost"
            icon={Star}
            aria-label={page.pinned ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            title={page.pinned ? 'Retirer des favoris' : 'Ajouter aux favoris (barre latérale)'}
            className={page.pinned ? '[&>svg]:fill-current [&>svg]:text-warning' : ''}
            onClick={() => update.mutate({ id: page.id, patch: { pinned: !page.pinned } })}
          />
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" icon={Ellipsis} aria-label="Actions de la page" />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem icon={Link2} onSelect={() => setAttaching(true)}>
                Rattacher à un projet, un client, une matière…
              </MenuItem>
              <MenuItem icon={FolderInput} onSelect={() => setMoving(true)}>
                Déplacer dans une autre page…
              </MenuItem>
              <MenuItem
                icon={Download}
                onSelect={() =>
                  void exportPage(page).then((name) => name && toast(`Page exportée : ${name}`), (error: unknown) => toast(String(error), { tone: 'danger' }))
                }
              >
                Exporter en Markdown…
              </MenuItem>
              {page.entityType === 'subject' && page.entityId && (
                <MenuItem
                  icon={Layers}
                  onSelect={() => syncCards.mutate({ pageId: page.id, subjectId: page.entityId!, text: plainTextOf(parseDoc(page.content)) })}
                >
                  Créer les flashcards (lignes « question :: réponse »)
                </MenuItem>
              )}
              {!page.isTemplate && (
                <MenuItem icon={Copy} onSelect={() => saveAsTemplate.mutate({ title: pageTitle(page), content: page.content })}>
                  Enregistrer comme modèle
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem icon={Trash2} tone="danger" shortcut="Suppr" onSelect={deletePage}>
                Supprimer la page
              </MenuItem>
            </MenuContent>
          </Menu>
        </span>
      </div>

      <div className="mx-auto max-w-[760px]">
        <TitleField page={page} inputRef={titleRef} onEnter={() => editorFocus.current()} />
        <div className="mt-2 mb-6 flex min-h-7 items-center gap-2">
          <EntityChip page={page} />
        </div>
        <PageEditorWithFocus page={page} pages={pages} onFocusTitle={() => titleRef.current?.focus()} focusRef={editorFocus} />

        {(children.length > 0 || !page.isTemplate) && (
          <section className="mt-14">
            <div className="mb-1.5 flex items-baseline gap-2.5">
              <h2 className="text-meta font-medium text-ink-2">Sous-pages</h2>
              {!page.isTemplate && (
                <span className="ml-auto">
                  <NewPageMenu label="Nouvelle sous-page" variant="ghost" parentId={page.id} />
                </span>
              )}
            </div>
            {children.length === 0 ? (
              <p className="text-meta text-ink-3">Aucune.</p>
            ) : (
              <ul>
                {children.map((child) => (
                  <li key={child.id}>
                    <PageRow page={child} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {backlinks.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-1.5 flex items-center gap-1.5 text-meta font-medium text-ink-2">
              <FileText className="size-3.5" strokeWidth={1.75} />
              Pages qui renvoient ici
            </h2>
            <ul>
              {backlinks.map((link) => (
                <li key={link.id}>
                  <PageRow page={link} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <AttachDialog page={page} open={attaching} onOpenChange={setAttaching} />
      <MoveDialog page={page} open={moving} onOpenChange={setMoving} />
    </PageContainer>
  );
}

/** L'éditeur, avec de quoi y placer le curseur depuis le titre. */
function PageEditorWithFocus(props: { page: Page; pages: ReturnType<typeof usePages>['data'] & object; onFocusTitle: () => void; focusRef: React.MutableRefObject<() => void> }) {
  const wrapper = useRef<HTMLDivElement>(null);
  props.focusRef.current = () => wrapper.current?.querySelector<HTMLElement>('.ProseMirror')?.focus();
  return (
    <div ref={wrapper}>
      <PageEditor page={props.page} pages={props.pages} onFocusTitle={props.onFocusTitle} />
    </div>
  );
}
