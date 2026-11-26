import type { JSONContent } from '@tiptap/core';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Pages (V2, étape 4, P19) : des documents libres en blocs, qui remplacent Notion. Une page vit seule
 * ou dans une autre (sous-page), et peut être rattachée à un projet, un client, une matière ou un
 * événement. Le contenu est le JSON de l'éditeur (TipTap) ; le texte brut et les liens en sont tirés.
 */

export type EntityType = 'project' | 'client' | 'subject' | 'event';

export const ENTITY_LABELS: Record<EntityType, string> = {
  project: 'Projet',
  client: 'Client',
  subject: 'Matière',
  event: 'Événement',
};

/** Une page dans les listes (sans son contenu). */
export type PageItem = {
  id: string;
  parentId: string | null;
  title: string;
  entityType: EntityType | null;
  entityId: string | null;
  /** Nom de l'entité rattachée (calculé), `null` si elle n'existe plus. */
  entityName: string | null;
  pinned: boolean;
  isTemplate: boolean;
  journalDate: string | null;
  sortOrder: number;
  updatedAt: string;
};

export type Page = PageItem & { content: string };

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

/** Titre affiché : « Sans titre » pour une page qu'on n'a pas encore nommée. */
export function pageTitle(page: Pick<PageItem, 'title'>): string {
  return page.title.trim() || 'Sans titre';
}

export function parseDoc(content: string): JSONContent {
  try {
    const doc = JSON.parse(content) as JSONContent;
    return doc && doc.type === 'doc' ? doc : EMPTY_DOC;
  } catch {
    return EMPTY_DOC;
  }
}

// ─── Arborescence ───────────────────────────────────────────────────────────

export type PageNode = { page: PageItem; children: PageNode[] };

const byOrder = (a: PageItem, b: PageItem) => a.sortOrder - b.sortOrder || pageTitle(a).localeCompare(pageTitle(b), 'fr');

/**
 * L'arbre des pages ordinaires (ni modèles, ni journal), dans l'ordre choisi. Une page dont la parente
 * n'est pas dans la liste remonte au premier niveau.
 */
export function buildTree(pages: PageItem[]): PageNode[] {
  const kept = pages.filter((p) => !p.isTemplate && p.journalDate === null);
  const ids = new Set(kept.map((p) => p.id));
  const childrenOf = (id: string | null): PageNode[] =>
    kept
      .filter((p) => (id === null ? p.parentId === null || !ids.has(p.parentId) : p.parentId === id))
      .sort(byOrder)
      .map((page) => ({ page, children: childrenOf(page.id) }));
  return childrenOf(null);
}

/** Les parentes d'une page, de la plus haute à la plus proche (fil d'Ariane). */
export function ancestorsOf(pages: PageItem[], id: string): PageItem[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const chain: PageItem[] = [];
  let current = byId.get(id)?.parentId ?? null;
  while (current && !chain.some((p) => p.id === current)) {
    const parent = byId.get(current);
    if (!parent) break;
    chain.unshift(parent);
    current = parent.parentId;
  }
  return chain;
}

/** La page et toutes ses sous-pages : on ne range pas une page dans l'une d'elles. */
export function subtreeIds(pages: PageItem[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const page of pages) {
      if (page.parentId && ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id);
        grew = true;
      }
    }
  }
  return ids;
}

// ─── Ce que contient une page ───────────────────────────────────────────────

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote', 'codeBlock', 'tableCell', 'tableHeader']);

/** Le texte brut d'une page (recherche, aperçu) : les blocs séparés par des retours à la ligne. */
export function plainTextOf(doc: JSONContent): string {
  const lines: string[] = [];
  let line = '';
  const walk = (node: JSONContent) => {
    if (node.type === 'text') line += node.text ?? '';
    else if (node.type === 'pageMention') line += String(node.attrs?.title ?? '');
    else if (node.type === 'hardBreak') line += ' ';
    for (const child of node.content ?? []) walk(child);
    if (node.type && BLOCK_TYPES.has(node.type) && line.trim() !== '') {
      lines.push(line.trim());
      line = '';
    }
  };
  walk(doc);
  if (line.trim()) lines.push(line.trim());
  return lines.join('\n');
}

/** Les pages vers lesquelles celle-ci renvoie (liens [[…]]). */
export function linksOf(doc: JSONContent): string[] {
  const ids = new Set<string>();
  const walk = (node: JSONContent) => {
    if (node.type === 'pageMention' && typeof node.attrs?.pageId === 'string') ids.add(node.attrs.pageId);
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return [...ids];
}

/** Une image d'une page pointe vers sa pièce jointe : 'attachment:<id>'. */
export const ATTACHMENT_PREFIX = 'attachment:';

export function attachmentSrc(id: string): string {
  return `${ATTACHMENT_PREFIX}${id}`;
}

export function attachmentIdOf(src: unknown): string | null {
  return typeof src === 'string' && src.startsWith(ATTACHMENT_PREFIX) ? src.slice(ATTACHMENT_PREFIX.length) : null;
}

/** Les images (pièces jointes) d'une page. */
export function attachmentIdsOf(doc: JSONContent): string[] {
  const ids = new Set<string>();
  const walk = (node: JSONContent) => {
    const id = node.type === 'image' ? attachmentIdOf(node.attrs?.src) : null;
    if (id) ids.add(id);
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return [...ids];
}

/** Un aperçu d'une ligne : le début du texte. */
export function excerpt(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// ─── Journal du jour ────────────────────────────────────────────────────────

/** « Journal du jeudi 26 novembre » */
export function journalTitle(day: string): string {
  return `Journal du ${format(parseISO(day), 'EEEE d MMMM', { locale: fr })}`;
}

// ─── Export ─────────────────────────────────────────────────────────────────

/** « Fiche de cours » → « fiche-de-cours » (nom du fichier exporté). */
export function slugify(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'page'
  );
}
