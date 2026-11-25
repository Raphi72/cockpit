-- Cockpit — boîte de réception (V2, étape 1 ; voir docs/CONCEPTION.md §9.3 et §9.4).
-- Ce qui est capturé vite (une idée, une tâche, un rendez-vous, une note) atterrit ici, tel quel,
-- et se trie plus tard : la ligne devient alors une tâche, une idée de projet ou un événement,
-- et quitte la boîte.

CREATE TABLE inbox_items (
  id          TEXT PRIMARY KEY,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL,   -- moment de la capture
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_inbox_created ON inbox_items(created_at);

-- ─── Recherche globale (§3.6) ───────────────────────────────────────────────
CREATE TRIGGER inbox_items_search_ai AFTER INSERT ON inbox_items BEGIN
  INSERT INTO search_index (entity, entity_id, title, body) VALUES ('inbox', NEW.id, NEW.text, '');
END;
CREATE TRIGGER inbox_items_search_au AFTER UPDATE OF text ON inbox_items BEGIN
  DELETE FROM search_index WHERE entity = 'inbox' AND entity_id = OLD.id;
  INSERT INTO search_index (entity, entity_id, title, body) VALUES ('inbox', NEW.id, NEW.text, '');
END;
CREATE TRIGGER inbox_items_search_ad AFTER DELETE ON inbox_items BEGIN
  DELETE FROM search_index WHERE entity = 'inbox' AND entity_id = OLD.id;
END;
