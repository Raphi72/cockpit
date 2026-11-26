-- Cockpit — cours venant de Google Agenda, et couleurs au choix (26/11/2026, retours d'usage).
--
-- Cours : l'emploi du temps de l'intranet est relié par iCal à un agenda Google. Marqué « agenda des
-- cours » dans Paramètres, ses événements deviennent des cours ; chaque intitulé (sans « TD », « CM »…)
-- est relié une fois à une matière, créée toute seule au besoin (`course_links`). Un lien sans matière
-- veut dire « pas un cours » : l'intitulé est ignoré et n'est pas recréé.
--
-- Couleurs : un client et un projet peuvent avoir leur propre couleur (celle du type de projet sinon).
-- Une couleur est une clé de la palette ('blue'…) ou une couleur libre ('#rrggbb').

ALTER TABLE google_calendars ADD COLUMN is_school INTEGER NOT NULL DEFAULT 0;
ALTER TABLE google_events ADD COLUMN course TEXT;            -- intitulé ramené au cours, pour un agenda des cours
CREATE INDEX idx_google_events_course ON google_events(course, starts_at);

CREATE TABLE course_links (
  course      TEXT PRIMARY KEY,                                   -- intitulé du cours (« Maths »)
  subject_id  TEXT REFERENCES subjects(id) ON DELETE SET NULL,    -- NULL : pas un cours, ignoré
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_course_links_subject ON course_links(subject_id);

ALTER TABLE clients ADD COLUMN color TEXT;
ALTER TABLE projects ADD COLUMN color TEXT;

-- Synchronisation (voir 0014) : les liens des cours sont des données, ils suivent d'un appareil à l'autre.
CREATE TRIGGER sync_course_links_ai AFTER INSERT ON course_links WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('course_links', json_array(NEW.course), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_course_links_au AFTER UPDATE ON course_links WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('course_links', json_array(NEW.course), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_course_links_ad AFTER DELETE ON course_links WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('course_links', json_array(OLD.course), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;
