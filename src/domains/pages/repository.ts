import type { Db, Statement } from '@/core/db';
import type { EntityType, Page, PageItem } from './model';

type PageRow = Omit<PageItem, 'pinned' | 'isTemplate'> & { pinned: number; isTemplate: number };

const ITEM_COLUMNS = `pg.id, pg.parent_id, pg.title, pg.entity_type, pg.entity_id, pg.pinned, pg.is_template, pg.journal_date,
  pg.sort_order, pg.updated_at,
  CASE pg.entity_type
    WHEN 'project' THEN (SELECT name FROM projects WHERE id = pg.entity_id)
    WHEN 'client' THEN (SELECT name FROM clients WHERE id = pg.entity_id)
    WHEN 'subject' THEN (SELECT name FROM subjects WHERE id = pg.entity_id)
    WHEN 'event' THEN (SELECT title FROM events WHERE id = pg.entity_id)
  END AS entity_name`;

const toItem = <T extends PageRow>(row: T) => ({ ...row, pinned: row.pinned === 1, isTemplate: row.isTemplate === 1 });

/** Toutes les pages, sans leur contenu (arborescence, favoris, choix d'un lien). */
export async function listPages(db: Db): Promise<PageItem[]> {
  const rows = await db.query<PageRow>(`SELECT ${ITEM_COLUMNS} FROM pages pg ORDER BY pg.sort_order, pg.title`);
  return rows.map(toItem);
}

export async function getPage(db: Db, id: string): Promise<Page | undefined> {
  const row = await db.queryOne<PageRow & { content: string }>(`SELECT ${ITEM_COLUMNS}, pg.content FROM pages pg WHERE pg.id = ?`, [id]);
  return row && toItem(row);
}

/** Les pages qui renvoient vers celle-ci. */
export async function listBacklinks(db: Db, id: string): Promise<PageItem[]> {
  const rows = await db.query<PageRow>(
    `SELECT ${ITEM_COLUMNS} FROM page_links l JOIN pages pg ON pg.id = l.from_page_id WHERE l.to_page_id = ? ORDER BY pg.title`,
    [id],
  );
  return rows.map(toItem);
}

export function getJournalPageId(db: Db, day: string): Promise<{ id: string } | undefined> {
  return db.queryOne<{ id: string }>('SELECT id FROM pages WHERE journal_date = ?', [day]);
}

export type NewPage = {
  parentId: string | null;
  title: string;
  content: string;
  plainText: string;
  entityType: EntityType | null;
  entityId: string | null;
  isTemplate?: boolean;
  journalDate?: string | null;
};

/** Nouvelle page, en fin de liste de sa parente. */
export function insertPageStatement(id: string, page: NewPage, now: string): Statement {
  return {
    sql: `INSERT INTO pages (id, parent_id, title, content, plain_text, entity_type, entity_id, is_template, journal_date, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) FROM pages WHERE parent_id IS ?), 0) + 1, ?, ?)`,
    params: [
      id,
      page.parentId,
      page.title.trim(),
      page.content,
      page.plainText,
      page.entityType,
      page.entityId,
      page.isTemplate ? 1 : 0,
      page.journalDate ?? null,
      page.parentId,
      now,
      now,
    ],
  };
}

/** Le contenu et ce qui en est tiré (texte brut, liens), dans le même lot. */
export function saveContentStatements(id: string, content: string, plainText: string, links: string[], now: string): Statement[] {
  return [
    { sql: 'UPDATE pages SET content = ?, plain_text = ?, updated_at = ? WHERE id = ?', params: [content, plainText, now, id] },
    { sql: 'DELETE FROM page_links WHERE from_page_id = ?', params: [id] },
    ...links.map((to) => ({
      sql: 'INSERT OR IGNORE INTO page_links (from_page_id, to_page_id) SELECT ?, id FROM pages WHERE id = ? AND id <> ?',
      params: [id, to, id],
    })),
  ];
}

export type PagePatch = Partial<{
  title: string;
  parentId: string | null;
  pinned: boolean;
  entityType: EntityType | null;
  entityId: string | null;
}>;

const PATCH_COLUMNS: Record<keyof PagePatch, string> = {
  title: 'title',
  parentId: 'parent_id',
  pinned: 'pinned',
  entityType: 'entity_type',
  entityId: 'entity_id',
};

export function updatePageStatement(id: string, patch: PagePatch, now: string): Statement {
  const keys = Object.keys(patch) as (keyof PagePatch)[];
  const value = (key: keyof PagePatch) => {
    const v = patch[key];
    return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
  };
  return {
    sql: `UPDATE pages SET ${keys.map((k) => `${PATCH_COLUMNS[k]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    params: [...keys.map(value), now, id],
  };
}

/** Une page rangée dans une autre (ou au premier niveau) : en fin de liste de sa nouvelle parente. */
export function movePageStatement(id: string, parentId: string | null, now: string): Statement {
  return {
    sql: `UPDATE pages SET parent_id = ?, sort_order = COALESCE((SELECT MAX(sort_order) FROM pages WHERE parent_id IS ? AND id <> ?), 0) + 1,
            updated_at = ? WHERE id = ?`,
    params: [parentId, parentId, id, now, id],
  };
}

export function deletePageStatement(id: string): Statement {
  return { sql: 'DELETE FROM pages WHERE id = ?', params: [id] };
}

/**
 * Tout ce que la suppression d'une page emporte (ses sous-pages, leurs liens et leurs images), lu tel
 * quel avant de supprimer : de quoi tout remettre avec « Annuler ». Les parentes avant leurs sous-pages.
 */
export async function readPageSnapshot(db: Db, id: string) {
  const pages = await db.query<Record<string, unknown>>(
    `WITH RECURSIVE tree(id, depth) AS (SELECT id, 0 FROM pages WHERE id = ? UNION ALL SELECT p.id, tree.depth + 1 FROM pages p JOIN tree ON p.parent_id = tree.id)
     SELECT pages.* FROM pages JOIN tree ON tree.id = pages.id ORDER BY tree.depth`,
    [id],
  );
  const ids = pages.map((p) => p.id as string);
  if (ids.length === 0) return null;
  const marks = ids.map(() => '?').join(', ');
  const [links, attachments] = await Promise.all([
    db.query<Record<string, unknown>>(`SELECT * FROM page_links WHERE from_page_id IN (${marks}) OR to_page_id IN (${marks})`, [...ids, ...ids]),
    db.query<Record<string, unknown>>(`SELECT * FROM attachments WHERE page_id IN (${marks})`, ids),
  ]);
  return { pages, links, attachments };
}

// ─── Images ─────────────────────────────────────────────────────────────────

export function insertAttachmentStatement(id: string, pageId: string | null, mime: string, data: string, now: string): Statement {
  return {
    sql: 'INSERT INTO attachments (id, page_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)',
    params: [id, pageId, mime, data, now],
  };
}

export async function getAttachmentData(db: Db, id: string): Promise<string | null> {
  return (await db.queryOne<{ data: string }>('SELECT data FROM attachments WHERE id = ?', [id]))?.data ?? null;
}

/** Les images de plusieurs pages, pour l'export (data URL par identifiant). */
export async function listAttachmentData(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.query<{ id: string; data: string }>(
    `SELECT id, data FROM attachments WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  );
  return new Map(rows.map((row) => [row.id, row.data]));
}
