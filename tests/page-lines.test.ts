import type { JSONContent } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';
import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { getEvent } from '@/domains/agenda/repository';
import { listProjectIdeas } from '@/domains/ideas/repository';
import {
  blockAt,
  duplicateBlock,
  firstTextPos,
  insertBlockAfter,
  isAlready,
  isEmptyParagraph,
  type HandleBlock,
} from '@/domains/pages/editor/block-handle';
import {
  deleteLine,
  findLine,
  lineAt,
  pageSchema,
  restoreLine,
  restoreLineInContent,
  type PageLine,
} from '@/domains/pages/editor/page-lines';
import { parseDoc, plainTextOf } from '@/domains/pages/model';
import { getPage } from '@/domains/pages/repository';
import { buildLineToIdeaBatch, undoCreationStatements } from '@/domains/pages/service';
import { searchEverything } from '@/domains/search/repository';
import { getTask } from '@/domains/tasks/repository';
import { createTestDb, readMigrations } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';

// ─── Des documents de page ──────────────────────────────────────────────────

const text = (value: string): JSONContent => ({ type: 'text', text: value });
const paragraph = (value?: string): JSONContent => ({ type: 'paragraph', ...(value ? { content: [text(value)] } : {}) });
const bullet = (value: string, ...children: JSONContent[]): JSONContent => ({
  type: 'listItem',
  content: [paragraph(value), ...(children.length ? [{ type: 'bulletList', content: children }] : [])],
});
const doc = (...content: JSONContent[]): PMNode => PMNode.fromJSON(pageSchema(), { type: 'doc', content });

/** La position du début du texte `value` dans le document. */
function posOf(node: PMNode, value: string): number {
  let found = -1;
  node.descendants((child, pos) => {
    if (found < 0 && child.isText && child.text?.includes(value)) found = pos + child.text.indexOf(value);
    return found < 0;
  });
  if (found < 0) throw new Error(`« ${value} » introuvable`);
  return found;
}

const lineOf = (node: PMNode, value: string): PageLine => {
  const line = lineAt(node, posOf(node, value) + 1);
  if (!line) throw new Error(`pas de ligne pour « ${value} »`);
  return line;
};

function removeLine(node: PMNode, line: PageLine) {
  const tr = new Transform(node);
  const removal = deleteLine(tr, line);
  return { tr, removal };
}

const texts = (node: PMNode) => plainTextOf(node.toJSON()).split('\n');

describe('lignes d’une page', () => {
  it('trouve la ligne visée : un paragraphe, un titre, une puce, une case', () => {
    const page = doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Courses')] },
      paragraph('Rappeler Marc'),
      { type: 'bulletList', content: [bullet('Acheter du pain')] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [paragraph('Réviser les maths')] }] },
    );
    expect(lineOf(page, 'Courses').text).toBe('Courses');
    expect(lineOf(page, 'Rappeler').text).toBe('Rappeler Marc');
    // Une puce part en entier (la puce, pas seulement son texte).
    const item = lineOf(page, 'Acheter');
    expect(page.nodeAt(item.from)?.type.name).toBe('listItem');
    expect(lineOf(page, 'Réviser').text).toBe('Réviser les maths');
    expect(page.nodeAt(lineOf(page, 'Réviser').from)?.type.name).toBe('taskItem');
  });

  it('ne propose rien sur une ligne vide, dans le code ou dans un tableau', () => {
    const page = doc(
      paragraph(),
      { type: 'codeBlock', content: [text('npm test')] },
      {
        type: 'table',
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('Case du tableau')] }] }],
      },
      paragraph('Fin'),
    );
    expect(lineAt(page, 1)).toBeNull();
    expect(lineAt(page, posOf(page, 'npm') + 1)).toBeNull();
    expect(lineAt(page, posOf(page, 'Case') + 1)).toBeNull();
    expect(lineAt(page, posOf(page, 'Fin') + 1)?.text).toBe('Fin');
  });

  it('lit un lien vers une page comme le titre de la page', () => {
    const page = doc({
      type: 'paragraph',
      content: [text('Relire '), { type: 'pageMention', attrs: { pageId: 'p1', title: 'Fiche de cours' } }, text('  ce soir')],
    });
    expect(lineAt(page, 2)?.text).toBe('Relire Fiche de cours ce soir');
  });

  it('retire une puce, et la liste avec elle si c’était la seule', () => {
    const page = doc(paragraph('Avant'), { type: 'bulletList', content: [bullet('Seule puce')] }, paragraph('Après'));
    const { tr } = removeLine(page, lineOf(page, 'Seule'));
    expect(texts(tr.doc)).toEqual(['Avant', 'Après']);
    expect(tr.doc.childCount).toBe(2);
    tr.doc.check();
  });

  it('garde les sous-puces d’une puce transformée : seul son texte part', () => {
    const page = doc({ type: 'bulletList', content: [bullet('Parent', bullet('Enfant'))] });
    const line = lineOf(page, 'Parent');
    expect(line.text).toBe('Parent');
    const { tr } = removeLine(page, line);
    expect(texts(tr.doc)).toEqual(['Enfant']);
    tr.doc.check();
  });

  it('remet la ligne à l’identique si la page n’a pas changé, sinon à la fin', () => {
    const page = doc(paragraph('Un'), { type: 'bulletList', content: [bullet('Deux'), bullet('Trois')] }, paragraph('Quatre'));
    const { tr, removal } = removeLine(page, lineOf(page, 'Deux'));
    expect(texts(tr.doc)).toEqual(['Un', 'Trois', 'Quatre']);

    const back = new Transform(tr.doc);
    restoreLine(back, removal);
    expect(back.doc.eq(page)).toBe(true);

    // La page a bougé entre-temps : la ligne revient à la fin, sans rien écraser.
    const edited = new Transform(tr.doc).insert(posOf(tr.doc, 'Un') + 2, pageSchema().text(' et demi'));
    const late = new Transform(edited.doc);
    restoreLine(late, removal);
    expect(texts(late.doc)).toEqual(['Un et demi', 'Trois', 'Quatre', 'Deux']);
    late.doc.check();
  });

  it('remet la ligne dans le contenu enregistré quand l’éditeur est fermé', () => {
    const page = doc(paragraph('Garder'), paragraph('Transformer'));
    const { tr, removal } = removeLine(page, lineOf(page, 'Transformer'));
    expect(restoreLineInContent(tr.doc.toJSON(), removal)).toEqual(page.toJSON());
    const changed = { type: 'doc', content: [paragraph('Tout autre chose')] };
    expect(plainTextOf(restoreLineInContent(changed, removal)).split('\n')).toEqual(['Tout autre chose', 'Transformer']);
  });

  it('retrouve une ligne qui a bougé, par son texte', () => {
    const page = doc(paragraph('Un'), paragraph('Deux'));
    const line = lineOf(page, 'Deux');
    const moved = doc(paragraph('Nouveau'), paragraph('Un'), paragraph('Deux'));
    expect(findLine(moved, line)?.text).toBe('Deux');
    expect(findLine(moved, line)?.from).toBe(lineOf(moved, 'Deux').from);
    expect(findLine(doc(paragraph('Un')), line)).toBeNull();
  });
});

// ─── Ce qu'une ligne devient, et « Annuler » ────────────────────────────────

// ─── Poignées des blocs (« + » et « ⠿ ») ─────────────────────────────────────

const blockOf = (node: PMNode, value: string): HandleBlock => {
  const block = blockAt(node, posOf(node, value));
  if (!block) throw new Error(`pas de bloc pour « ${value} »`);
  return block;
};

describe('poignées des blocs', () => {
  const page = () =>
    doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Courses')] },
      { type: 'bulletList', content: [bullet('Pain', bullet('Complet'))] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [paragraph('Réviser')] }] },
      { type: 'horizontalRule' },
      paragraph(),
    );

  it('désigne la puce la plus proche, sinon le bloc du premier niveau', () => {
    const p = page();
    expect(blockOf(p, 'Courses').node.type.name).toBe('heading');
    // Une sous-puce a sa propre poignée ; sa parente aussi.
    expect(blockOf(p, 'Complet').node.textContent).toBe('Complet');
    expect(blockOf(p, 'Pain').node.textContent).toBe('PainComplet');
    expect(blockOf(p, 'Réviser').node.type.name).toBe('taskItem');
    // Entre deux blocs du premier niveau : le séparateur qui suit.
    const rule = blockOf(p, 'Réviser');
    const between = rule.pos + rule.node.nodeSize + 1; // après la liste de cases
    expect(blockAt(p, between)?.node.type.name).toBe('horizontalRule');
    expect(firstTextPos(blockAt(p, between)!)).toBeNull();
  });

  it('« + » ajoute dessous un bloc du même genre : une puce sous une puce, une case (non cochée) sous une case', () => {
    const p = page();
    for (const [value, type] of [
      ['Courses', 'paragraph'],
      ['Complet', 'listItem'],
      ['Réviser', 'taskItem'],
    ] as const) {
      const block = blockOf(p, value);
      const tr = new Transform(p);
      const at = insertBlockAfter(tr, block);
      tr.doc.check();
      const added = tr.doc.resolve(at);
      expect(added.parent.type.name).toBe('paragraph');
      expect(added.parent.content.size).toBe(0);
      if (type !== 'paragraph') expect(added.node(added.depth - 1).type.name).toBe(type);
      if (type === 'taskItem') expect(added.node(added.depth - 1).attrs.checked).toBe(false);
      // Juste après le bloc, au même niveau.
      const parentDepth = added.depth - (type === 'paragraph' ? 1 : 2);
      expect(added.index(parentDepth)).toBe(tr.doc.resolve(block.pos).index() + 1);
    }
    expect(isEmptyParagraph(p.lastChild!)).toBe(true);
  });

  it('« Dupliquer » met une copie juste dessous', () => {
    const p = page();
    const tr = new Transform(p);
    duplicateBlock(tr, blockOf(p, 'Courses'));
    expect(texts(tr.doc).slice(0, 2)).toEqual(['Courses', 'Courses']);
    tr.doc.check();
  });

  it('ne « transforme » pas un bloc en ce qu’il est déjà', () => {
    const p = page();
    expect(isAlready(p, blockOf(p, 'Courses'), 'h2')).toBe(true);
    expect(isAlready(p, blockOf(p, 'Courses'), 'h1')).toBe(false);
    expect(isAlready(p, blockOf(p, 'Pain'), 'bullet')).toBe(true);
    expect(isAlready(p, blockOf(p, 'Pain'), 'ordered')).toBe(false);
    expect(isAlready(p, blockOf(p, 'Réviser'), 'todo')).toBe(true);
    expect(isAlready(p, blockOf(p, 'Réviser'), 'text')).toBe(false);
  });

  it('« Annuler » une suppression ne remet pas un bloc déjà revenu par Ctrl+Z', () => {
    const p = page();
    const block = blockOf(p, 'Courses');
    const tr = new Transform(p);
    const removal = deleteLine(tr, { from: block.pos, to: block.pos + block.node.nodeSize, pos: block.pos, text: '' });
    // Ctrl+Z dans la page l'a remis, puis on a tapé ailleurs : « Annuler » ne le double pas.
    const typed = new Transform(p).insert(p.content.size - 1, pageSchema().text('suite'));
    const back = new Transform(typed.doc);
    restoreLine(back, removal, { unlessPresent: true });
    expect(back.docChanged).toBe(false);
    expect(restoreLineInContent(typed.doc.toJSON(), removal, { unlessPresent: true })).toEqual(typed.doc.toJSON());
    // Sans Ctrl+Z, il revient à sa place.
    const undo = new Transform(tr.doc);
    restoreLine(undo, removal, { unlessPresent: true });
    expect(undo.doc.eq(p)).toBe(true);
  });
});

describe('ce qu’une ligne devient', () => {
  it('crée une idée du projet choisi, et « Annuler » la retire', async () => {
    const { db } = createTestDb();
    await db.batch([
      sql`INSERT INTO projects (id, name, type_id, status, created_at, updated_at)
          VALUES ('p1', 'Site vitrine', 'type-freelance', 'active', ${NOW}, ${NOW})`,
    ]);
    const { ideaId, statements } = buildLineToIdeaBatch('Page tarifs avec un simulateur', 'p1', {
      now: NOW,
      today: '2026-11-26',
      newId: () => 'i1',
    });
    expect(ideaId).toBe('i1');
    await db.batch(statements);
    expect((await listProjectIdeas(db, 'p1')).map((idea) => idea.title)).toEqual(['Page tarifs avec un simulateur']);

    await db.batch(undoCreationStatements({ kind: 'idea', id: 'i1' }));
    expect(await listProjectIdeas(db, 'p1')).toEqual([]);
  });

  it('« Annuler » retire la tâche, l’événement ou le projet créés', async () => {
    const { db } = createTestDb();
    await db.batch([
      sql`INSERT INTO projects (id, name, type_id, status, created_at, updated_at)
          VALUES ('p1', 'Site vitrine', 'type-freelance', 'active', ${NOW}, ${NOW})`,
      sql`INSERT INTO tasks (id, project_id, title, status, sort_order, created_at, updated_at)
          VALUES ('t1', NULL, 'Rappeler Marc', 'todo', 1, ${NOW}, ${NOW})`,
      sql`INSERT INTO events (id, title, kind, all_day, starts_at, created_at, updated_at)
          VALUES ('e1', 'Dentiste', 'appointment', 1, '2026-12-12', ${NOW}, ${NOW})`,
    ]);
    await db.batch([
      ...undoCreationStatements({ kind: 'task', id: 't1' }),
      ...undoCreationStatements({ kind: 'event', id: 'e1' }),
      ...undoCreationStatements({ kind: 'project', id: 'p1' }),
    ]);
    expect(await getTask(db, 't1')).toBeUndefined();
    expect(await getEvent(db, 'e1')).toBeUndefined();
    expect(await db.queryOne('SELECT id FROM projects WHERE id = ?', ['p1'])).toBeUndefined();
  });
});

// ─── La boîte de réception passe dans les Pages (migration 0018) ────────────

/** Une base au schéma 17, avec des captures (notées dans le désordre) et le réglage du raccourci. */
function baseWithInbox(options: { fts?: boolean; captures?: boolean } = {}) {
  const migrations = readMigrations();
  const index = migrations.findIndex((m) => m.includes('la boîte de réception rejoint les Pages'));
  const { db, raw } = createTestDb({ migrations: index, fts: options.fts });
  if (options.captures !== false) {
    raw.exec(`
      INSERT INTO inbox_items (id, text, created_at, updated_at) VALUES
        ('n2', 'Page tarifs avec un "simulateur"', '2026-11-25T09:00:00.000Z', '2026-11-25T09:00:00.000Z'),
        ('n1', 'Rappeler Marc pour le devis', '2026-11-25T08:00:00.000Z', '2026-11-25T08:00:00.000Z'),
        ('n3', 'Dentiste le 12 à 14 h — l''après-midi', '2026-11-25T10:00:00.000Z', '2026-11-25T10:00:00.000Z');
    `);
  }
  raw.exec(`INSERT INTO settings (key, value) VALUES ('capture.shortcut', '"Alt+Shift+C"')`);
  const migrate = () => raw.exec(migrations[index]!);
  return { db, raw, migrate };
}

describe('migration de la boîte de réception', () => {
  it('reprend chaque capture dans la page « Captures », de la plus ancienne à la plus récente', async () => {
    const { db, migrate } = baseWithInbox();
    migrate();

    const page = await getPage(db, 'page-captures');
    expect(page).toMatchObject({ title: 'Captures', pinned: true, parentId: null, isTemplate: false, journalDate: null });
    const content = parseDoc(page!.content);
    // Le contenu se lit avec le schéma de l'éditeur.
    PMNode.fromJSON(pageSchema(), content).check();
    const [intro, list] = content.content ?? [];
    expect(intro?.type).toBe('paragraph');
    expect(list?.type).toBe('bulletList');
    expect(plainTextOf(content).split('\n').slice(1)).toEqual([
      'Rappeler Marc pour le devis',
      'Page tarifs avec un "simulateur"',
      "Dentiste le 12 à 14 h — l'après-midi",
    ]);
    // Le texte brut enregistré est celui que l'éditeur aurait calculé.
    const stored = await db.queryOne<{ plainText: string }>('SELECT plain_text FROM pages WHERE id = ?', ['page-captures']);
    expect(stored?.plainText).toBe(plainTextOf(content));
  });

  it('retire la table, ses traces de synchronisation, son index et le réglage du raccourci', async () => {
    const { db, migrate } = baseWithInbox();
    const before = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM sync_rows WHERE tbl = 'inbox_items'");
    expect(before[0]?.n).toBe(3);
    migrate();

    expect(await db.query("SELECT name FROM sqlite_master WHERE name LIKE '%inbox%'")).toEqual([]);
    expect(await db.query("SELECT tbl FROM sync_rows WHERE tbl = 'inbox_items'")).toEqual([]);
    expect(await db.query("SELECT entity_id FROM search_index WHERE entity = 'inbox'")).toEqual([]);
    expect(await db.query("SELECT key FROM settings WHERE key = 'capture.shortcut'")).toEqual([]);
    // La page, elle, partira au prochain envoi.
    expect(await db.query(`SELECT row_key FROM sync_rows WHERE tbl = 'pages' AND row_key = '["page-captures"]'`)).toHaveLength(1);
  });

  it('rend les captures trouvables par la recherche, dans la page', async () => {
    for (const fts of [true, false]) {
      const { db, migrate } = baseWithInbox({ fts });
      migrate();
      const results = await searchEverything(db, 'devis', '2026-11-26');
      expect(results.map((r) => [r.entity, r.id])).toEqual([['page', 'page-captures']]);
    }
  });

  it('ne crée pas de page quand la boîte était vide', async () => {
    const { db, migrate } = baseWithInbox({ captures: false });
    migrate();
    expect(await getPage(db, 'page-captures')).toBeUndefined();
  });
});
