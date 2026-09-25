-- Cockpit — idées de projet (V1.1, voir docs/CONCEPTION.md §3.3 et §7.3).
-- Une idée n'est pas une tâche : on la note pour plus tard, sans date ni statut.
-- Le moment venu, elle devient une tâche du projet et quitte la liste des idées.

CREATE TABLE ideas (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_ideas_project ON ideas(project_id, created_at);

-- ─── Recherche globale (§3.6) ───────────────────────────────────────────────
CREATE TRIGGER ideas_search_ai AFTER INSERT ON ideas BEGIN
  INSERT INTO search_index (entity, entity_id, title, body) VALUES ('idea', NEW.id, NEW.title, '');
END;
CREATE TRIGGER ideas_search_au AFTER UPDATE OF title ON ideas BEGIN
  DELETE FROM search_index WHERE entity = 'idea' AND entity_id = OLD.id;
  INSERT INTO search_index (entity, entity_id, title, body) VALUES ('idea', NEW.id, NEW.title, '');
END;
CREATE TRIGGER ideas_search_ad AFTER DELETE ON ideas BEGIN
  DELETE FROM search_index WHERE entity = 'idea' AND entity_id = OLD.id;
END;
