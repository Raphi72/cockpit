import { mergeAttributes, Node, type AnyExtension } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import StarterKit from '@tiptap/starter-kit';

/**
 * Le schéma des blocs d'une page, sans affichage : ce que lisent et écrivent l'éditeur, l'import
 * (Notion) et l'export en Markdown. L'éditeur y ajoute ses vues React (editor/extensions.ts).
 */

/** Lien vers une page : `pageId` la désigne, `title` garde son titre au moment du lien. En Markdown : [[Titre]]. */
export const PageMentionNode = Node.create({
  name: 'pageMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      pageId: { default: null, parseHTML: (el) => el.getAttribute('data-page-id'), renderHTML: (attrs) => ({ 'data-page-id': attrs.pageId }) },
      title: { default: '', parseHTML: (el) => el.textContent ?? '', renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-page-id]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'page-mention' }), String(node.attrs.title ?? '')];
  },

  renderText({ node }) {
    return `[[${String(node.attrs.title ?? '')}]]`;
  },

  renderMarkdown: (node) => `[[${String(node.attrs?.title ?? '')}]]`,
});

/** Une image de page : sa source est `attachment:<id>` (une pièce jointe) ou une adresse. */
export const PageImageNode = Image.configure({ inline: false, allowBase64: true });

/** Les blocs d'une page : titres, paragraphes, listes, cases, citations, séparateurs, code, tableaux, images, liens. */
export function schemaExtensions(nodes: { mention: AnyExtension; image: AnyExtension } = { mention: PageMentionNode, image: PageImageNode }): AnyExtension[] {
  return [
    StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    nodes.image,
    nodes.mention,
  ];
}
