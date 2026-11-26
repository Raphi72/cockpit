import type { Node as PMNode } from '@tiptap/pm/model';
import type { Transform } from '@tiptap/pm/transform';

/**
 * Les poignées à gauche des blocs (comme dans Notion) : « + » ajoute un bloc dessous, « ⠿ » le déplace
 * (glisser) ou ouvre ses actions. Sans affichage : testable sans navigateur.
 */

/** Le bloc qu'une poignée désigne : une puce ou une case (l'élément de liste), sinon un bloc du premier niveau. */
export type HandleBlock = { pos: number; node: PMNode };

const LIST_ITEMS = new Set(['listItem', 'taskItem']);

export function isListItem(node: PMNode): boolean {
  return LIST_ITEMS.has(node.type.name);
}

/** Le bloc à cette position : l'élément de liste le plus proche, sinon le bloc du premier niveau. */
export function blockAt(doc: PMNode, pos: number): HandleBlock | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (isListItem(node)) return { pos: $pos.before(depth), node };
  }
  if ($pos.depth >= 1) return { pos: $pos.before(1), node: $pos.node(1) };
  // Entre deux blocs du premier niveau (une image, un séparateur) : celui qui suit, sinon celui d'avant.
  if ($pos.nodeAfter) return { pos: $pos.pos, node: $pos.nodeAfter };
  if ($pos.nodeBefore) return { pos: $pos.pos - $pos.nodeBefore.nodeSize, node: $pos.nodeBefore };
  return null;
}

/** La position dans le premier texte du bloc (là où « transformer en… » s'applique), `null` s'il n'en a pas. */
export function firstTextPos(block: HandleBlock): number | null {
  if (block.node.isTextblock) return block.pos + 1;
  let found: number | null = null;
  block.node.descendants((child, offset) => {
    if (found !== null) return false;
    if (child.isTextblock) {
      found = block.pos + 1 + offset + 1;
      return false;
    }
    return true;
  });
  return found;
}

/** Un bloc vide où écrire tout de suite (un paragraphe sans texte) : « + » s'y place au lieu d'en ajouter un. */
export function isEmptyParagraph(node: PMNode): boolean {
  return node.type.name === 'paragraph' && node.content.size === 0;
}

/**
 * « + » : un bloc vide juste sous celui-ci (une puce sous une puce, une case sous une case, sinon un
 * paragraphe). Renvoie la position où écrire dans le nouveau bloc.
 */
export function insertBlockAfter(tr: Transform, block: HandleBlock): number {
  const { schema } = tr.doc.type;
  const at = block.pos + block.node.nodeSize;
  const paragraph = schema.nodes.paragraph!.create();
  if (isListItem(block.node)) {
    const attrs = block.node.type.name === 'taskItem' ? { checked: false } : null;
    tr.insert(at, block.node.type.create(attrs, paragraph));
    return at + 2;
  }
  tr.insert(at, paragraph);
  return at + 1;
}

/** « Dupliquer » : une copie juste dessous. */
export function duplicateBlock(tr: Transform, block: HandleBlock): void {
  tr.insert(block.pos + block.node.nodeSize, block.node);
}

const LIST_OF: Record<string, string> = { bullet: 'bulletList', ordered: 'orderedList', todo: 'taskList' };

/**
 * « Transformer en » ce qu'il est déjà : rien à faire (les bascules de liste, de citation et de code
 * le défairaient au lieu de le garder).
 */
export function isAlready(doc: PMNode, block: HandleBlock, key: string): boolean {
  if (isListItem(block.node)) return LIST_OF[key] === doc.resolve(block.pos).parent.type.name;
  const { name } = block.node.type;
  if (key === 'text') return name === 'paragraph';
  if (key === 'quote') return name === 'blockquote';
  if (key === 'code') return name === 'codeBlock';
  const heading = /^h([1-3])$/.exec(key);
  return heading !== null && name === 'heading' && block.node.attrs.level === Number(heading[1]);
}
