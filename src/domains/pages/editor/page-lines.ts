import { getSchema, type JSONContent } from '@tiptap/core';
import { Node as PMNode, Slice, type Schema } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';
import { schemaExtensions } from './nodes';

/**
 * Les lignes d'une page qu'on transforme (clic droit) en tâche, devoir, événement, idée ou projet : ce
 * que faisait la boîte de réception, dans n'importe quelle page. Sans affichage : testable sans navigateur.
 */

/** Une ligne : ce qui quitte la page (`from`…`to`), son texte, et une position dans son texte. */
export type PageLine = {
  from: number;
  to: number;
  /** Une position dans la ligne elle-même, pour la retrouver. */
  pos: number;
  text: string;
};

const LIST_ITEMS = new Set(['listItem', 'taskItem']);
/** Pas de lignes à transformer dans le code ni dans les tableaux. */
const NO_LINES = new Set(['codeBlock', 'tableCell', 'tableHeader']);

/** Le texte d'une ligne sur une seule ligne ; un lien [[…]] compte pour le titre de sa page. */
export function lineText(block: PMNode): string {
  return block
    .textBetween(0, block.content.size, ' ', (leaf) => (leaf.type.name === 'pageMention' ? String(leaf.attrs.title ?? '') : ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * La ligne à cette position : un paragraphe, un titre, ou une puce (ou une case) entière. Une puce qui a
 * des sous-puces ne garde que celles-ci : seul son texte part. Rien sur une ligne vide, dans le code ou
 * dans un tableau.
 */
export function lineAt(doc: PMNode, pos: number): PageLine | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  const block = $pos.parent;
  if (!block.isTextblock) return null;
  for (let depth = $pos.depth; depth > 0; depth -= 1) if (NO_LINES.has($pos.node(depth).type.name)) return null;
  const text = lineText(block);
  if (!text) return null;

  const depth = $pos.depth;
  const at = { pos: $pos.pos, text };
  if (depth > 1 && LIST_ITEMS.has($pos.node(depth - 1).type.name) && $pos.index(depth - 1) === 0) {
    const item = $pos.node(depth - 1);
    return item.childCount === 1
      ? { ...at, from: $pos.before(depth - 1), to: $pos.after(depth - 1) }
      : { ...at, from: $pos.start(depth), to: $pos.end(depth) };
  }
  return { ...at, from: $pos.before(depth), to: $pos.after(depth) };
}

/** La même ligne dans une page qui a pu bouger : à sa place si elle y est encore, sinon la première au même texte. */
export function findLine(doc: PMNode, line: PageLine): PageLine | null {
  const here = line.pos <= doc.content.size ? lineAt(doc, line.pos) : null;
  if (here?.text === line.text) return here;
  let found: PageLine | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    const candidate = lineText(node) === line.text ? lineAt(doc, pos + 1) : null;
    if (candidate?.text === line.text) found = candidate;
    return false;
  });
  return found;
}

/** De quoi remettre une ligne retirée : la page avant et après, et ce qui est parti. */
export type LineRemoval = { before: PMNode; after: PMNode; slice: Slice };

/** Retire la ligne (dans la transformation donnée) ; une liste qui n'avait qu'elle part aussi. */
export function deleteLine(tr: Transform, line: PageLine): LineRemoval {
  const before = tr.doc;
  const slice = before.slice(line.from, line.to);
  tr.deleteRange(line.from, line.to);
  return { before, after: tr.doc, slice };
}

/** Remet la ligne : à l'identique si la page n'a pas changé depuis, sinon à la fin de la page. */
export function restoreLine(tr: Transform, removal: LineRemoval): void {
  if (tr.doc.eq(removal.after)) tr.replaceWith(0, tr.doc.content.size, removal.before.content);
  else tr.replace(tr.doc.content.size, tr.doc.content.size, removal.slice);
}

let schema: Schema | null = null;

/** Le schéma des pages, sans éditeur (le même que celui de l'éditeur). */
export function pageSchema(): Schema {
  schema ??= getSchema(schemaExtensions());
  return schema;
}

/**
 * Remet une ligne dans le contenu enregistré d'une page, quand son éditeur n'est plus ouvert : à
 * l'identique si la page n'a pas changé depuis, sinon à la fin.
 */
export function restoreLineInContent(current: JSONContent, removal: LineRemoval): JSONContent {
  if (JSON.stringify(current) === JSON.stringify(removal.after.toJSON())) return removal.before.toJSON();
  const tr = new Transform(PMNode.fromJSON(pageSchema(), current));
  tr.replace(tr.doc.content.size, tr.doc.content.size, Slice.fromJSON(pageSchema(), removal.slice.toJSON()));
  return tr.doc.toJSON();
}
