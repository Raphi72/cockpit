import { Extension } from '@tiptap/core';

export type CheckboxToTaskOptions = {
  /** Crée la vraie tâche ; renvoie de quoi l'annoncer. */
  createTask: (title: string) => Promise<void>;
};

/**
 * Ctrl+Entrée dans une case à cocher : elle devient une vraie tâche (P19), rattachée au projet ou à
 * la matière de la page, et quitte la page. Ctrl+Z dans la page la remet.
 */
export const CheckboxToTask = Extension.create<CheckboxToTaskOptions>({
  name: 'checkboxToTask',

  addOptions() {
    return { createTask: async () => undefined };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': ({ editor }) => {
        const { $from } = editor.state.selection;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          const node = $from.node(depth);
          if (node.type.name !== 'taskItem') continue;
          const title = node.textContent.trim();
          if (!title) return true;
          const from = $from.before(depth);
          void this.options.createTask(title).then(() => {
            editor.chain().focus().deleteRange({ from, to: from + node.nodeSize }).run();
          });
          return true;
        }
        return false;
      },
    };
  },
});
