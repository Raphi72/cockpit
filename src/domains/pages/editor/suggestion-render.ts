import { ReactRenderer } from '@tiptap/react';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { SuggestionList, type SuggestionItem, type SuggestionListHandle, type SuggestionListProps } from './SuggestionList';

/**
 * Affichage d'une suggestion de l'éditeur : la liste suit le curseur (positionnée par le greffon),
 * se met à jour en tapant, se pilote au clavier et se ferme avec Échap.
 */
export function suggestionRender<I extends SuggestionItem>(empty: string): SuggestionOptions<I>['render'] {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle, SuggestionListProps> | null = null;
    let unmount: (() => void) | null = null;
    const propsOf = (props: SuggestionProps<I>): SuggestionListProps => ({
      items: props.items,
      empty,
      onSelect: (item) => props.command(item as I),
    });
    return {
      onStart: (props) => {
        renderer = new ReactRenderer(SuggestionList, { props: propsOf(props), editor: props.editor });
        unmount = props.mount(renderer.element as HTMLElement);
      },
      onUpdate: (props) => renderer?.updateProps(propsOf(props)),
      onKeyDown: ({ event }) => {
        if (event.key === 'Escape') {
          unmount?.();
          unmount = null;
          return true;
        }
        return renderer?.ref?.onKeyDown(event) ?? false;
      },
      onExit: () => {
        unmount?.();
        unmount = null;
        renderer?.destroy();
        renderer = null;
      },
    };
  };
}
