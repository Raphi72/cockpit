import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { useNavigate } from '@tanstack/react-router';
import { FileText, Plus } from 'lucide-react';
import { matchesAllTerms } from '@/domains/search/model';
import { usePages } from '../hooks';
import { pageTitle, type PageItem } from '../model';
import type { SuggestionItem } from './SuggestionList';
import { PageMentionNode } from './nodes';
import { suggestionRender } from './suggestion-render';

/** Un lien vers une page : son titre à jour (la page peut avoir été renommée), un clic l'ouvre. */
function PageMentionView({ node }: ReactNodeViewProps) {
  const navigate = useNavigate();
  const { data: pages } = usePages();
  const pageId = String(node.attrs.pageId ?? '');
  const page = pages?.find((p) => p.id === pageId);
  const missing = pages !== undefined && !page;
  return (
    <NodeViewWrapper
      as="span"
      className={`page-mention ${missing ? 'page-mention-missing' : ''}`}
      title={missing ? 'Cette page n’existe plus' : 'Ouvrir la page'}
      onClick={() => page && void navigate({ to: '/pages/$pageId', params: { pageId } })}
    >
      <FileText className="mr-0.5 inline size-3.5 align-[-2px]" strokeWidth={1.75} />
      {page ? pageTitle(page) : String(node.attrs.title || 'Page')}
    </NodeViewWrapper>
  );
}

type MentionItem = SuggestionItem & { pageId: string | null; title: string };

export type PageMentionOptions = {
  /** Les pages qu'on peut citer (lues au moment où l'on tape). */
  getPages: () => PageItem[];
  /** « Nouvelle page « … » » : la crée et renvoie son identifiant. */
  createPage: (title: string) => Promise<string>;
  /** La page en cours d'édition (on ne se cite pas soi-même). */
  currentPageId: string | null;
};

/**
 * Lien vers une page, à taper « [[ » puis quelques lettres (P19) : la page choisie apparaît par son
 * titre ; on peut aussi créer une page du même nom. En Markdown : [[Titre]].
 */
export const PageMention = PageMentionNode.extend<PageMentionOptions>({
  addOptions() {
    return { getPages: () => [], createPage: async () => '', currentPageId: null };
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageMentionView);
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<MentionItem>({
        pluginKey: new PluginKey('pageMention'),
        editor: this.editor,
        char: '[[',
        allowSpaces: true,
        items: ({ query }) => {
          const pages = options
            .getPages()
            .filter((p) => !p.isTemplate && p.id !== options.currentPageId && matchesAllTerms(pageTitle(p), query))
            .slice(0, 8)
            .map((p): MentionItem => ({ key: p.id, label: pageTitle(p), icon: FileText, pageId: p.id, title: pageTitle(p) }));
          const title = query.trim();
          if (title) pages.push({ key: 'new', label: `Nouvelle page « ${title} »`, icon: Plus, pageId: null, title });
          return pages;
        },
        command: ({ editor, range, props }) => {
          const insert = (pageId: string, title: string) =>
            editor
              .chain()
              .focus()
              .insertContentAt(range, [{ type: 'pageMention', attrs: { pageId, title } }, { type: 'text', text: ' ' }])
              .run();
          if (props.pageId) insert(props.pageId, props.title);
          else void options.createPage(props.title).then((id) => insert(id, props.title));
        },
        render: suggestionRender<MentionItem>('Aucune page ne correspond.'),
      }),
    ];
  },
});
