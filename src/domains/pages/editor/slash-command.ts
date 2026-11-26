import { Extension, type ChainedCommands } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import {
  Code,
  FilePlus,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Pilcrow,
  Quote,
  Table,
} from 'lucide-react';
import { matchesAllTerms } from '@/domains/search/model';
import type { SuggestionItem } from './SuggestionList';
import { suggestionRender } from './suggestion-render';

type SlashItem = SuggestionItem & {
  keywords: string;
  run?: (chain: ChainedCommands) => ChainedCommands;
  action?: 'image' | 'link' | 'subpage';
};

/** Les blocs qu'insère « / » ; le raccourci Markdown qui fait la même chose est rappelé à droite. */
const ITEMS: SlashItem[] = [
  { key: 'text', label: 'Texte', icon: Pilcrow, keywords: 'paragraphe', run: (c) => c.setParagraph() },
  { key: 'h1', label: 'Titre 1', hint: '#', icon: Heading1, keywords: 'titre grand', run: (c) => c.setHeading({ level: 1 }) },
  { key: 'h2', label: 'Titre 2', hint: '##', icon: Heading2, keywords: 'titre moyen', run: (c) => c.setHeading({ level: 2 }) },
  { key: 'h3', label: 'Titre 3', hint: '###', icon: Heading3, keywords: 'titre petit', run: (c) => c.setHeading({ level: 3 }) },
  { key: 'bullet', label: 'Liste à puces', hint: '-', icon: List, keywords: 'liste puces', run: (c) => c.toggleBulletList() },
  { key: 'ordered', label: 'Liste numérotée', hint: '1.', icon: ListOrdered, keywords: 'liste numéros', run: (c) => c.toggleOrderedList() },
  { key: 'todo', label: 'Cases à cocher', hint: '[ ]', icon: ListTodo, keywords: 'tâches todo case', run: (c) => c.toggleTaskList() },
  { key: 'quote', label: 'Citation', hint: '>', icon: Quote, keywords: 'citation', run: (c) => c.toggleBlockquote() },
  { key: 'code', label: 'Code', hint: '```', icon: Code, keywords: 'code', run: (c) => c.toggleCodeBlock() },
  { key: 'divider', label: 'Séparateur', hint: '---', icon: Minus, keywords: 'ligne trait', run: (c) => c.setHorizontalRule() },
  { key: 'table', label: 'Tableau', icon: Table, keywords: 'tableau grille', run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  { key: 'image', label: 'Image', icon: ImageIcon, keywords: 'image photo', action: 'image' },
  { key: 'link', label: 'Lien vers une page', hint: '[[', icon: FileText, keywords: 'lien page', action: 'link' },
  { key: 'subpage', label: 'Sous-page', icon: FilePlus, keywords: 'page enfant', action: 'subpage' },
];

/** Ce qu'un bloc peut devenir (« Transformer en », poignée ⠿) : les blocs de texte du menu « / ». */
export const TURN_INTO = ITEMS.filter(
  (item): item is SlashItem & { run: NonNullable<SlashItem['run']> } => item.run !== undefined && item.key !== 'divider' && item.key !== 'table',
);

/** Les transformations qui gardent une puce dans une liste ; les autres la sortent d'abord de sa liste. */
export const LIST_TARGETS = new Set(['bullet', 'ordered', 'todo']);

export type SlashCommandOptions = {
  /** Ouvre le choix d'une image (elle sera insérée à la position du curseur). */
  pickImage: () => void;
  /** Crée une sous-page de la page ouverte ; renvoie de quoi la citer. */
  createSubpage: () => Promise<{ id: string; title: string }>;
};

/** « / » en début de bloc (ou après une espace) : la liste des blocs à insérer, filtrée en tapant. */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { pickImage: () => undefined, createSubpage: async () => ({ id: '', title: '' }) };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<SlashItem>({
        pluginKey: new PluginKey('slashCommand'),
        editor: this.editor,
        char: '/',
        items: ({ query }) => ITEMS.filter((item) => matchesAllTerms(`${item.label} ${item.keywords}`, query)),
        command: ({ editor, range, props }) => {
          const chain = editor.chain().focus().deleteRange(range);
          if (props.run) {
            props.run(chain).run();
            return;
          }
          chain.run();
          if (props.action === 'image') options.pickImage();
          if (props.action === 'link') editor.chain().focus().insertContent('[[').run();
          if (props.action === 'subpage') {
            void options.createSubpage().then(({ id, title }) =>
              editor.chain().focus().insertContent([{ type: 'pageMention', attrs: { pageId: id, title } }, { type: 'text', text: ' ' }]).run(),
            );
          }
        },
        render: suggestionRender<SlashItem>('Aucun bloc ne correspond.'),
      }),
    ];
  },
});
