-- Cockpit — pages (V2, étape 4 ; voir docs/CONCEPTION.md §9.2 P19, §9.3 et §9.5).
-- Une page est un document libre en blocs (éditeur TipTap, contenu en JSON). Elle vit seule ou dans une
-- autre page (sous-page), et peut être rattachée à un projet, un client, une matière ou un événement.
-- Les pages sont communes aux deux modes.

CREATE TABLE pages (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT REFERENCES pages(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',   -- JSON de l'éditeur
  -- Copie en texte brut du contenu, pour la recherche (comme l'index FTS, recalculée à chaque enregistrement).
  plain_text    TEXT NOT NULL DEFAULT '',
  -- Rattachement facultatif (P19) : l'entité n'a pas de clé étrangère ; si elle disparaît, la page reste.
  entity_type   TEXT CHECK (entity_type IN ('project', 'client', 'subject', 'event')),
  entity_id     TEXT,
  pinned        INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),       -- favori (barre latérale)
  is_template   INTEGER NOT NULL DEFAULT 0 CHECK (is_template IN (0, 1)),  -- modèle de page
  journal_date  TEXT UNIQUE,                                               -- journal du jour ('YYYY-MM-DD')
  sort_order    REAL NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CHECK ((entity_type IS NULL) = (entity_id IS NULL))
);
CREATE INDEX idx_pages_parent ON pages(parent_id, sort_order);
CREATE INDEX idx_pages_entity ON pages(entity_type, entity_id);

-- Liens entre pages ([[…]]) : un index recalculé à chaque enregistrement d'une page, pour montrer
-- « les pages qui renvoient ici ». Le lien lui-même est dans le contenu.
CREATE TABLE page_links (
  from_page_id  TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  to_page_id    TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  PRIMARY KEY (from_page_id, to_page_id)
);
CREATE INDEX idx_page_links_to ON page_links(to_page_id);

-- Images des pages : réduites à leur arrivée (1600 px au plus), gardées dans la base en data URL.
-- Une sauvegarde contient donc tout, images comprises.
CREATE TABLE attachments (
  id          TEXT PRIMARY KEY,
  page_id     TEXT REFERENCES pages(id) ON DELETE CASCADE,
  mime        TEXT NOT NULL,
  data        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_attachments_page ON attachments(page_id);

-- ─── Recherche globale (§3.6) ───────────────────────────────────────────────
CREATE TRIGGER pages_search_ai AFTER INSERT ON pages BEGIN
  INSERT INTO search_index (entity, entity_id, title, body) VALUES ('page', NEW.id, NEW.title, NEW.plain_text);
END;
CREATE TRIGGER pages_search_au AFTER UPDATE OF title, plain_text ON pages BEGIN
  DELETE FROM search_index WHERE entity = 'page' AND entity_id = OLD.id;
  INSERT INTO search_index (entity, entity_id, title, body) VALUES ('page', NEW.id, NEW.title, NEW.plain_text);
END;
CREATE TRIGGER pages_search_ad AFTER DELETE ON pages BEGIN
  DELETE FROM search_index WHERE entity = 'page' AND entity_id = OLD.id;
END;

-- ─── Modèles proposés (à modifier, ou à supprimer) ──────────────────────────
INSERT INTO pages (id, title, content, plain_text, is_template, sort_order, created_at, updated_at) VALUES
  ('template-course', 'Fiche de cours',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"À retenir"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph"}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Définitions"}]},{"type":"paragraph"},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Exemples"}]},{"type":"paragraph"},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Questions à revoir"}]},{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph"}]}]}]}',
   'À retenir Définitions Exemples Questions à revoir', 1, 1, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('template-meeting', 'Compte rendu client',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Présents"}]},{"type":"paragraph"},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Ce qui a été dit"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph"}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Décisions"}]},{"type":"paragraph"},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"À faire"}]},{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph"}]}]}]}',
   'Présents Ce qui a été dit Décisions À faire', 1, 2, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('template-brief', 'Brief de projet',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Objectif"}]},{"type":"paragraph"},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Public visé"}]},{"type":"paragraph"},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Livrables"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph"}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Contraintes et délais"}]},{"type":"paragraph"},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Contacts"}]},{"type":"paragraph"}]}',
   'Objectif Public visé Livrables Contraintes et délais Contacts', 1, 3, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z');
