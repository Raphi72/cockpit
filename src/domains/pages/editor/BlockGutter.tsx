import { useQueryClient } from '@tanstack/react-query';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { Copy, Forward, GripVertical, Plus, Repeat2, Trash2 } from 'lucide-react';
import { useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from 'react';
import { humanizeError } from '@/core/db/errors';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from '@/ui/overlays/Menu';
import { toast } from '@/ui/overlays/toast';
import { blockAt, duplicateBlock, firstTextPos, insertBlockAfter, isAlready, isEmptyParagraph, isListItem, type HandleBlock } from './block-handle';
import { restoreBlockInPage } from './line-actions';
import { LineChoiceItems, type LineChoice } from './LineMenu';
import { deleteLine, lineAt, restoreLine, type PageLine } from './page-lines';
import { LIST_TARGETS, TURN_INTO } from './slash-command';

/** Taille d'une poignée (px). */
const SIZE = 24;
/** La puce d'une liste est dessinée à gauche de l'élément : la poignée se range devant elle. */
const BULLET = 20;

type Hover = { block: HandleBlock; top: number; left: number };

/**
 * L'élément de bloc à cette hauteur : le plus petit qui la contient (une puce dans une puce gagne sur sa
 * parente), parmi les blocs du premier niveau et les éléments de liste.
 */
function blockElementAt(root: HTMLElement, y: number): HTMLElement | null {
  const candidates = [...Array.from(root.children), ...Array.from(root.querySelectorAll('li'))] as HTMLElement[];
  let best: HTMLElement | null = null;
  let bestHeight = Infinity;
  for (const element of candidates) {
    const box = element.getBoundingClientRect();
    if (y >= box.top && y <= box.bottom && box.height < bestHeight) {
      best = element;
      bestHeight = box.height;
    }
  }
  return best;
}

type BlockGutterProps = {
  editor: Editor | null;
  pageId: string;
  /** Le projet de la page, proposé en premier pour une idée. */
  pageProjectId: string | null;
  /** « En faire… » (absent pour un modèle de page). */
  onLineChoice?: (line: PageLine, choice: LineChoice) => void;
  children: ReactNode;
};

/**
 * Les poignées à gauche des blocs, au survol de la souris (comme dans Notion) : « + » ajoute un bloc
 * dessous et ouvre le menu « / » ; « ⠿ » se glisse pour déplacer le bloc, ou s'ouvre d'un clic :
 * transformer en…, en faire une tâche (ou autre), dupliquer, supprimer (avec « Annuler »).
 * Elles s'effacent dès qu'on tape.
 */
export function BlockGutter({ editor, pageId, pageProjectId, onLineChoice, children }: BlockGutterProps) {
  const queryClient = useQueryClient();
  const frame = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  /** Le bloc dont le menu ⠿ est ouvert (les poignées restent alors en place). */
  const [menuBlock, setMenuBlock] = useState<HandleBlock | null>(null);
  /** Un choix du menu ouvre une fenêtre : elle prend le focus, pas la page. */
  const dialogOpening = useRef(false);

  const live = editor && !editor.isDestroyed ? editor : null;

  const locate = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || menuBlock || !live || !frame.current) return;
    const view = live.view;
    const element = blockElementAt(view.dom, event.clientY);
    // Entre deux blocs : la poignée reste où elle était.
    if (!element) return;
    let pos: number;
    try {
      pos = view.posAtDOM(element, 0);
    } catch {
      return;
    }
    const block = blockAt(view.state.doc, pos);
    if (!block) return;
    const box = element.getBoundingClientRect();
    const origin = frame.current.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
    const firstLine = Math.min(box.height, Number.isFinite(lineHeight) ? lineHeight : SIZE);
    const bullet = block.node.type.name === 'listItem' ? BULLET : 0;
    setHover({ block, top: box.top - origin.top + (firstLine - SIZE) / 2, left: box.left - origin.left - bullet - 2 * SIZE - 6 });
  };

  /** « + » : un bloc vide dessous (ou la ligne vide elle-même), avec le menu « / » ouvert. */
  const add = () => {
    if (!live || !hover) return;
    const { block } = hover;
    live
      .chain()
      .focus()
      .command(({ tr }) => {
        const at = isEmptyParagraph(block.node) ? block.pos + 1 : insertBlockAfter(tr, block);
        tr.setSelection(TextSelection.create(tr.doc, at));
        return true;
      })
      .insertContent('/')
      .run();
    setHover(null);
  };

  /** Glisser « ⠿ » : le bloc devient la sélection, ProseMirror le déplace là où on le lâche. */
  const startDrag = (event: DragEvent<HTMLButtonElement>) => {
    if (!live || !hover) return;
    const view = live.view;
    const selection = NodeSelection.create(view.state.doc, hover.block.pos);
    view.dispatch(view.state.tr.setSelection(selection));
    const slice = selection.content();
    const { dom, text } = view.serializeForClipboard(slice);
    event.dataTransfer.clearData();
    event.dataTransfer.setData('text/html', dom.innerHTML);
    event.dataTransfer.setData('text/plain', text);
    event.dataTransfer.effectAllowed = 'copyMove';
    const element = view.nodeDOM(hover.block.pos);
    if (element instanceof HTMLElement) event.dataTransfer.setDragImage(element, 0, 0);
    view.dragging = { slice, move: true };
  };

  const turnInto = (block: HandleBlock, item: (typeof TURN_INTO)[number]) => {
    const textPos = firstTextPos(block);
    if (!live || textPos === null || isAlready(live.state.doc, block, item.key)) return;
    const chain = live.chain().focus().setTextSelection(textPos);
    // Une puce qui devient un titre (ou autre chose qu'une liste) sort d'abord de sa liste.
    if (isListItem(block.node) && !LIST_TARGETS.has(item.key)) chain.liftListItem(block.node.type.name);
    item.run(chain).run();
  };

  const duplicate = (block: HandleBlock) => {
    if (!live) return;
    const tr = live.state.tr;
    duplicateBlock(tr, block);
    live.view.dispatch(tr);
  };

  /** Supprimer : dans l'historique de la page (Ctrl+Z y marche), et « Annuler » dans le toast, même après l'avoir quittée. */
  const remove = (block: HandleBlock) => {
    if (!live) return;
    const current = live;
    const tr = current.state.tr;
    const removed = deleteLine(tr, { from: block.pos, to: block.pos + block.node.nodeSize, pos: block.pos, text: '' });
    current.view.dispatch(tr);
    const removal = { ...removed, after: current.state.doc };
    toast('Bloc supprimé.', {
      action: {
        label: 'Annuler',
        undo: true,
        onClick: () => {
          if (!current.isDestroyed) {
            const back = current.state.tr;
            restoreLine(back, removal, { unlessPresent: true });
            if (back.docChanged) current.view.dispatch(back);
            return;
          }
          void restoreBlockInPage(queryClient, { pageId, removal, options: { unlessPresent: true } }).catch((error: unknown) =>
            toast(humanizeError(error), { tone: 'danger' }),
          );
        },
      },
    });
  };

  const shown = hover;
  const menuLine = menuBlock && live ? (() => {
    const textPos = firstTextPos(menuBlock);
    return textPos === null ? null : lineAt(live.state.doc, textPos);
  })() : null;
  const canTurn = menuBlock !== null && (menuBlock.node.isTextblock || isListItem(menuBlock.node) || menuBlock.node.type.name === 'blockquote');

  return (
    <div
      ref={frame}
      className="relative -ml-16 pl-16"
      onPointerMove={locate}
      onPointerLeave={() => !menuBlock && setHover(null)}
      // On écrit : les poignées s'effacent, comme dans Notion.
      onKeyDown={() => !menuBlock && setHover(null)}
    >
      {children}
      {shown && (
        <div className="absolute z-10 flex items-center gap-0.5" style={{ top: shown.top, left: shown.left }}>
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={add}
            aria-label="Ajouter un bloc dessous"
            title="Ajouter un bloc dessous"
            className="grid size-6 place-items-center rounded-md text-ink-3 transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink"
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </button>
          <Menu
            open={menuBlock !== null}
            onOpenChange={(open) => {
              if (open) return;
              setMenuBlock(null);
              // Le bloc a pu bouger (supprimé, dupliqué, transformé) : la poignée attend le prochain survol.
              setHover(null);
              if (!dialogOpening.current) live?.commands.focus();
              dialogOpening.current = false;
            }}
          >
            <MenuTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                draggable
                onDragStart={startDrag}
                onDragEnd={() => {
                  if (live) live.view.dragging = null;
                }}
                // Radix ouvre au « pointerdown », ce qui empêcherait de glisser : on ouvre au clic.
                onPointerDown={(e) => e.preventDefault()}
                onKeyDown={(e) => e.preventDefault()}
                onClick={() => setMenuBlock(shown.block)}
                aria-label="Déplacer ou modifier le bloc"
                title="Glisser pour déplacer · clic pour les actions"
                className="grid h-6 w-[18px] cursor-grab place-items-center rounded-md text-ink-3 transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink active:cursor-grabbing"
              >
                <GripVertical className="size-4" strokeWidth={1.75} />
              </button>
            </MenuTrigger>
            <MenuContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
              {menuBlock && canTurn && (
                <MenuSub>
                  <MenuSubTrigger icon={Repeat2}>Transformer en</MenuSubTrigger>
                  <MenuSubContent>
                    {TURN_INTO.map((item) => (
                      <MenuItem key={item.key} icon={item.icon} onSelect={() => turnInto(menuBlock, item)}>
                        {item.label}
                      </MenuItem>
                    ))}
                  </MenuSubContent>
                </MenuSub>
              )}
              {menuBlock && menuLine && onLineChoice && (
                <MenuSub>
                  <MenuSubTrigger icon={Forward}>En faire</MenuSubTrigger>
                  <MenuSubContent>
                    <LineChoiceItems
                      pageProjectId={pageProjectId}
                      onChoose={(choice) => {
                        dialogOpening.current = choice.kind !== 'idea';
                        onLineChoice(menuLine, choice);
                      }}
                    />
                  </MenuSubContent>
                </MenuSub>
              )}
              {menuBlock && (
                <>
                  <MenuItem icon={Copy} onSelect={() => duplicate(menuBlock)}>
                    Dupliquer
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={Trash2} tone="danger" onSelect={() => remove(menuBlock)}>
                    Supprimer
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        </div>
      )}
    </div>
  );
}
