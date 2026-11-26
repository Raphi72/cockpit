import { describe, expect, it } from 'vitest';
import { searchEverything } from '@/domains/search/repository';
import { markdownManager } from '@/domains/pages/editor/markdown';
import { cleanName, convertPageLinks, parentPathOf, planPages, resolvePath, rewriteImages } from '@/domains/pages/import/notion';
import {
  ancestorsOf,
  attachmentIdsOf,
  buildTree,
  excerpt,
  journalTitle,
  linksOf,
  pageTitle,
  parseDoc,
  plainTextOf,
  slugify,
  subtreeIds,
  type PageItem,
} from '@/domains/pages/model';
import {
  deletePageStatement,
  getPage,
  insertPageStatement,
  listBacklinks,
  listPages,
  readPageSnapshot,
  saveContentStatements,
} from '@/domains/pages/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';

const item = (id: string, parentId: string | null, patch: Partial<PageItem> = {}): PageItem => ({
  id,
  parentId,
  title: id,
  entityType: null,
  entityId: null,
  entityName: null,
  pinned: false,
  isTemplate: false,
  journalDate: null,
  sortOrder: 1,
  updatedAt: NOW,
  ...patch,
});

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Révolution' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Voir ' }, { type: 'pageMention', attrs: { pageId: 'p2', title: 'Dates' } }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Relire' }] }] }] },
    { type: 'image', attrs: { src: 'attachment:img1' } },
  ],
};

describe('pages : règles', () => {
  it('range les pages en arbre, sans les modèles ni le journal', () => {
    const pages = [item('a', null), item('b', 'a'), item('c', 'b'), item('t', null, { isTemplate: true }), item('j', null, { journalDate: '2026-11-26' }), item('orphan', 'gone')];
    const tree = buildTree(pages);
    expect(tree.map((n) => n.page.id)).toEqual(['a', 'orphan']);
    expect(tree[0]!.children[0]!.children[0]!.page.id).toBe('c');
    expect(ancestorsOf(pages, 'c').map((p) => p.id)).toEqual(['a', 'b']);
    expect([...subtreeIds(pages, 'a')].sort()).toEqual(['a', 'b', 'c']);
  });

  it('tire du contenu le texte brut, les liens et les images', () => {
    expect(plainTextOf(doc)).toBe('Révolution\nVoir Dates\nRelire');
    expect(linksOf(doc)).toEqual(['p2']);
    expect(attachmentIdsOf(doc)).toEqual(['img1']);
    expect(parseDoc('pas du json')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(excerpt('a '.repeat(100), 10)).toBe('a a a a a…');
  });

  it('nomme les pages', () => {
    expect(pageTitle({ title: '  ' })).toBe('Sans titre');
    expect(journalTitle('2026-11-26')).toBe('Journal du jeudi 26 novembre');
    expect(slugify('Fiche de cours : Révolution !')).toBe('fiche-de-cours-revolution');
  });
});

describe('pages : Markdown', () => {
  it('écrit une page en Markdown, liens entre pages et cases compris', () => {
    const markdown = markdownManager().serialize(doc);
    expect(markdown).toContain('# Révolution');
    expect(markdown).toContain('[[Dates]]');
    expect(markdown).toContain('- [ ] Relire');
    expect(markdown).toContain('![](attachment:img1)');
  });

  it('lit du Markdown : titres, listes, cases, tableaux, citations', () => {
    const parsed = markdownManager().parse('## Plan\n\n- un\n- deux\n\n- [x] fait\n\n> citation\n\n| a | b |\n| - | - |\n| 1 | 2 |\n');
    const types = (parsed.content ?? []).map((node) => node.type);
    expect(types).toEqual(['heading', 'bulletList', 'taskList', 'blockquote', 'table']);
  });
});

describe('pages : import Notion', () => {
  it('lit les noms et les chemins de Notion', () => {
    expect(cleanName('Cours de maths 0123456789abcdef0123456789abcdef.md')).toBe('Cours de maths');
    expect(parentPathOf('Cours 1/Maths 2.md')).toBe('Cours 1.md');
    expect(parentPathOf('Cours 1.md')).toBeNull();
    expect(resolvePath('Cours 1/Maths 2.md', 'Sch%C3%A9ma.png')).toBe('Cours 1/Schéma.png');
    expect(resolvePath('Cours 1/Maths 2.md', '../Autre%203.md')).toBe('Autre 3.md');
    expect(resolvePath('a.md', 'https://notion.so')).toBeNull();
  });

  it('prévoit les pages, parentes d’abord, avec leur titre', () => {
    const planned = planPages([
      { path: 'Cours 1/Maths 2.md', text: '# Maths\n\nLe cours', data: null, mime: null },
      { path: 'Cours 1.md', text: '# Cours\nIntro', data: null, mime: null },
      { path: 'Orphelin/Sous 3.md', text: 'Sans titre en tête', data: null, mime: null },
      { path: 'Cours 1/image.png', text: null, data: 'AQID', mime: 'image/png' },
    ]);
    expect(planned.map((p) => [p.key, p.parentKey, p.title, p.markdown])).toEqual([
      ['Cours 1.md', null, 'Cours', 'Intro'],
      ['Cours 1/Maths 2.md', 'Cours 1.md', 'Maths', 'Le cours'],
      ['Orphelin/Sous 3.md', null, 'Sous 3', 'Sans titre en tête'],
    ]);
  });

  it('relie les images et les liens entre pages', () => {
    const { markdown, used } = rewriteImages('![schéma](Maths%202/sch%C3%A9ma.png) et ![web](https://x.y/z.png)', 'Cours 1/Maths 2.md', new Map([['Cours 1/Maths 2/schéma.png', 'img9']]));
    expect(markdown).toBe('![schéma](attachment:img9) et ![web](https://x.y/z.png)');
    expect(used).toEqual(['img9']);
    const parsed = markdownManager().parse('Voir [la suite](Suite%204.md).');
    const converted = convertPageLinks(parsed, 'Cours 1/Maths 2.md', new Map([['Cours 1/Suite 4.md', { id: 'p4', title: 'Suite' }]]));
    expect(linksOf(converted)).toEqual(['p4']);
  });
});

describe('pages : base', () => {
  const page = (id: string, parentId: string | null, title: string) =>
    insertPageStatement(id, { parentId, title, content: JSON.stringify(doc), plainText: plainTextOf(doc), entityType: null, entityId: null }, NOW);

  it('propose trois modèles au départ', async () => {
    const { db } = createTestDb();
    expect((await listPages(db)).filter((p) => p.isTemplate).map((p) => p.title)).toEqual(['Fiche de cours', 'Compte rendu client', 'Brief de projet']);
  });

  it('garde les liens entrants, et supprime une page avec ses sous-pages', async () => {
    const { db } = createTestDb();
    await db.batch([page('p1', null, 'Histoire'), page('p2', 'p1', 'Dates'), page('p3', 'p2', 'Détails'), ...saveContentStatements('p1', JSON.stringify(doc), plainTextOf(doc), ['p2'], NOW)]);
    expect((await listBacklinks(db, 'p2')).map((p) => p.id)).toEqual(['p1']);
    expect(await getPage(db, 'p2')).toMatchObject({ parentId: 'p1', title: 'Dates', pinned: false });

    const snapshot = await readPageSnapshot(db, 'p2');
    expect(snapshot?.pages.map((p) => p.id)).toEqual(['p2', 'p3']);
    await db.batch([deletePageStatement('p2')]);
    expect((await listPages(db)).filter((p) => !p.isTemplate).map((p) => p.id)).toEqual(['p1']);
    expect(await listBacklinks(db, 'p2')).toEqual([]);
  });

  it('se retrouve dans la recherche, par son titre et par son texte', async () => {
    const { db } = createTestDb();
    await db.batch([page('p1', null, 'Histoire')]);
    expect((await searchEverything(db, 'histoire', '2026-11-26')).find((r) => r.entity === 'page')).toMatchObject({ id: 'p1', title: 'Histoire' });
    expect((await searchEverything(db, 'relire', '2026-11-26')).find((r) => r.entity === 'page')?.id).toBe('p1');
  });
});
