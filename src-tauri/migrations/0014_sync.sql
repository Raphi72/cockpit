-- Cockpit — synchronisation entre appareils (V2, étape 9 ; voir docs/CONCEPTION.md §9.2 P22 et §9.5).
-- Chaque appareil garde sa base complète. Ce qui change dans les tables de données (celles de l'export)
-- est noté ici par des déclencheurs : la table, la clé de la ligne, l'heure du changement et un numéro
-- d'ordre local. Les lignes changées partent ensuite, chiffrées, dans le dossier caché de l'app sur Google
-- Drive ; celles des autres appareils sont appliquées (la plus récente l'emporte). Les réglages, le journal
-- des notifications, l'index de recherche et la copie de Google Agenda restent propres à chaque appareil.
-- Fichier généré à partir du schéma (une table de données ajoutée plus tard ajoute ses trois déclencheurs).

-- État de la synchronisation de cet appareil : son identifiant, le dernier numéro envoyé, ce qui a été lu
-- des autres, et le drapeau « applying » posé pendant qu'on applique des changements reçus (les
-- déclencheurs ne les notent alors pas comme des changements locaux).
CREATE TABLE sync_state (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

-- Dernier changement connu de chaque ligne : local (device NULL, seq > 0 tant qu'il n'est pas envoyé)
-- ou reçu d'un autre appareil (device, seq 0). Une ligne supprimée garde sa trace (deleted = 1).
CREATE TABLE sync_rows (
  tbl         TEXT NOT NULL,
  row_key     TEXT NOT NULL,                 -- clé primaire, en tableau JSON ('["id"]', '["habit", "2026-11-26"]')
  changed_at  TEXT NOT NULL,                 -- horodatage UTC du changement
  device      TEXT,                          -- appareil d'origine ; NULL : cet appareil
  seq         INTEGER NOT NULL,              -- ordre des changements locaux à envoyer ; 0 pour un changement reçu
  deleted     INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  PRIMARY KEY (tbl, row_key)
);
CREATE INDEX idx_sync_rows_seq ON sync_rows(seq);

-- Ce qui existe déjà part au premier envoi, parents avant enfants.
INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
SELECT tbl, row_key, changed_at, NULL, ROW_NUMBER() OVER (ORDER BY ord, changed_at, row_key), 0 FROM (
  SELECT 1 AS ord, 'project_types' AS tbl, json_array(id) AS row_key, '1970-01-01T00:00:00.000Z' AS changed_at FROM project_types
  UNION ALL
  SELECT 2 AS ord, 'transaction_categories' AS tbl, json_array(id) AS row_key, '1970-01-01T00:00:00.000Z' AS changed_at FROM transaction_categories
  UNION ALL
  SELECT 3 AS ord, 'accounts' AS tbl, json_array(id) AS row_key, created_at AS changed_at FROM accounts
  UNION ALL
  SELECT 4 AS ord, 'clients' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM clients
  UNION ALL
  SELECT 5 AS ord, 'projects' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM projects
  UNION ALL
  SELECT 6 AS ord, 'subjects' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM subjects
  UNION ALL
  SELECT 7 AS ord, 'block_templates' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM block_templates
  UNION ALL
  SELECT 8 AS ord, 'day_blocks' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM day_blocks
  UNION ALL
  SELECT 9 AS ord, 'tasks' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM tasks
  UNION ALL
  SELECT 10 AS ord, 'ideas' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM ideas
  UNION ALL
  SELECT 11 AS ord, 'events' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM events
  UNION ALL
  SELECT 12 AS ord, 'event_exceptions' AS tbl, json_array(id) AS row_key, created_at AS changed_at FROM event_exceptions
  UNION ALL
  SELECT 13 AS ord, 'payments' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM payments
  UNION ALL
  SELECT 14 AS ord, 'transactions' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM transactions
  UNION ALL
  SELECT 15 AS ord, 'inbox_items' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM inbox_items
  UNION ALL
  SELECT 16 AS ord, 'school_periods' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM school_periods
  UNION ALL
  SELECT 17 AS ord, 'timetable_slots' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM timetable_slots
  UNION ALL
  SELECT 18 AS ord, 'exams' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM exams
  UNION ALL
  SELECT 19 AS ord, 'grades' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM grades
  UNION ALL
  SELECT 20 AS ord, 'week_templates' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM week_templates
  UNION ALL
  SELECT 21 AS ord, 'week_template_blocks' AS tbl, json_array(id) AS row_key, created_at AS changed_at FROM week_template_blocks
  UNION ALL
  SELECT 22 AS ord, 'pages' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM pages
  UNION ALL
  SELECT 23 AS ord, 'page_links' AS tbl, json_array(from_page_id, to_page_id) AS row_key, '1970-01-01T00:00:00.000Z' AS changed_at FROM page_links
  UNION ALL
  SELECT 24 AS ord, 'attachments' AS tbl, json_array(id) AS row_key, created_at AS changed_at FROM attachments
  UNION ALL
  SELECT 25 AS ord, 'flashcards' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM flashcards
  UNION ALL
  SELECT 26 AS ord, 'flashcard_reviews' AS tbl, json_array(id) AS row_key, created_at AS changed_at FROM flashcard_reviews
  UNION ALL
  SELECT 27 AS ord, 'goals' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM goals
  UNION ALL
  SELECT 28 AS ord, 'goal_steps' AS tbl, json_array(id) AS row_key, created_at AS changed_at FROM goal_steps
  UNION ALL
  SELECT 29 AS ord, 'habits' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM habits
  UNION ALL
  SELECT 30 AS ord, 'habit_logs' AS tbl, json_array(habit_id, day) AS row_key, created_at AS changed_at FROM habit_logs
  UNION ALL
  SELECT 31 AS ord, 'exercises' AS tbl, json_array(id) AS row_key, created_at AS changed_at FROM exercises
  UNION ALL
  SELECT 32 AS ord, 'workouts' AS tbl, json_array(id) AS row_key, COALESCE(updated_at, created_at) AS changed_at FROM workouts
  UNION ALL
  SELECT 33 AS ord, 'workout_sets' AS tbl, json_array(id) AS row_key, created_at AS changed_at FROM workout_sets
);

-- project_types (id)
CREATE TRIGGER sync_project_types_ai AFTER INSERT ON project_types WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('project_types', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_project_types_au AFTER UPDATE ON project_types WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('project_types', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_project_types_ad AFTER DELETE ON project_types WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('project_types', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- transaction_categories (id)
CREATE TRIGGER sync_transaction_categories_ai AFTER INSERT ON transaction_categories WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('transaction_categories', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_transaction_categories_au AFTER UPDATE ON transaction_categories WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('transaction_categories', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_transaction_categories_ad AFTER DELETE ON transaction_categories WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('transaction_categories', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- accounts (id)
CREATE TRIGGER sync_accounts_ai AFTER INSERT ON accounts WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('accounts', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_accounts_au AFTER UPDATE ON accounts WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('accounts', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_accounts_ad AFTER DELETE ON accounts WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('accounts', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- clients (id)
CREATE TRIGGER sync_clients_ai AFTER INSERT ON clients WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('clients', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_clients_au AFTER UPDATE ON clients WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('clients', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_clients_ad AFTER DELETE ON clients WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('clients', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- projects (id)
CREATE TRIGGER sync_projects_ai AFTER INSERT ON projects WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('projects', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_projects_au AFTER UPDATE ON projects WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('projects', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_projects_ad AFTER DELETE ON projects WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('projects', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- subjects (id)
CREATE TRIGGER sync_subjects_ai AFTER INSERT ON subjects WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('subjects', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_subjects_au AFTER UPDATE ON subjects WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('subjects', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_subjects_ad AFTER DELETE ON subjects WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('subjects', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- block_templates (id)
CREATE TRIGGER sync_block_templates_ai AFTER INSERT ON block_templates WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('block_templates', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_block_templates_au AFTER UPDATE ON block_templates WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('block_templates', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_block_templates_ad AFTER DELETE ON block_templates WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('block_templates', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- day_blocks (id)
CREATE TRIGGER sync_day_blocks_ai AFTER INSERT ON day_blocks WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('day_blocks', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_day_blocks_au AFTER UPDATE ON day_blocks WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('day_blocks', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_day_blocks_ad AFTER DELETE ON day_blocks WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('day_blocks', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- tasks (id)
CREATE TRIGGER sync_tasks_ai AFTER INSERT ON tasks WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('tasks', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_tasks_au AFTER UPDATE ON tasks WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('tasks', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_tasks_ad AFTER DELETE ON tasks WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('tasks', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- ideas (id)
CREATE TRIGGER sync_ideas_ai AFTER INSERT ON ideas WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('ideas', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_ideas_au AFTER UPDATE ON ideas WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('ideas', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_ideas_ad AFTER DELETE ON ideas WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('ideas', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- events (id)
CREATE TRIGGER sync_events_ai AFTER INSERT ON events WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('events', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_events_au AFTER UPDATE ON events WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('events', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_events_ad AFTER DELETE ON events WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('events', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- event_exceptions (id)
CREATE TRIGGER sync_event_exceptions_ai AFTER INSERT ON event_exceptions WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('event_exceptions', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_event_exceptions_au AFTER UPDATE ON event_exceptions WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('event_exceptions', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_event_exceptions_ad AFTER DELETE ON event_exceptions WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('event_exceptions', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- payments (id)
CREATE TRIGGER sync_payments_ai AFTER INSERT ON payments WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('payments', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_payments_au AFTER UPDATE ON payments WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('payments', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_payments_ad AFTER DELETE ON payments WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('payments', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- transactions (id)
CREATE TRIGGER sync_transactions_ai AFTER INSERT ON transactions WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('transactions', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_transactions_au AFTER UPDATE ON transactions WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('transactions', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_transactions_ad AFTER DELETE ON transactions WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('transactions', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- inbox_items (id)
CREATE TRIGGER sync_inbox_items_ai AFTER INSERT ON inbox_items WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('inbox_items', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_inbox_items_au AFTER UPDATE ON inbox_items WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('inbox_items', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_inbox_items_ad AFTER DELETE ON inbox_items WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('inbox_items', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- school_periods (id)
CREATE TRIGGER sync_school_periods_ai AFTER INSERT ON school_periods WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('school_periods', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_school_periods_au AFTER UPDATE ON school_periods WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('school_periods', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_school_periods_ad AFTER DELETE ON school_periods WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('school_periods', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- timetable_slots (id)
CREATE TRIGGER sync_timetable_slots_ai AFTER INSERT ON timetable_slots WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('timetable_slots', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_timetable_slots_au AFTER UPDATE ON timetable_slots WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('timetable_slots', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_timetable_slots_ad AFTER DELETE ON timetable_slots WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('timetable_slots', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- exams (id)
CREATE TRIGGER sync_exams_ai AFTER INSERT ON exams WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('exams', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_exams_au AFTER UPDATE ON exams WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('exams', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_exams_ad AFTER DELETE ON exams WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('exams', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- grades (id)
CREATE TRIGGER sync_grades_ai AFTER INSERT ON grades WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('grades', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_grades_au AFTER UPDATE ON grades WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('grades', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_grades_ad AFTER DELETE ON grades WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('grades', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- week_templates (id)
CREATE TRIGGER sync_week_templates_ai AFTER INSERT ON week_templates WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('week_templates', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_week_templates_au AFTER UPDATE ON week_templates WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('week_templates', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_week_templates_ad AFTER DELETE ON week_templates WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('week_templates', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- week_template_blocks (id)
CREATE TRIGGER sync_week_template_blocks_ai AFTER INSERT ON week_template_blocks WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('week_template_blocks', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_week_template_blocks_au AFTER UPDATE ON week_template_blocks WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('week_template_blocks', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_week_template_blocks_ad AFTER DELETE ON week_template_blocks WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('week_template_blocks', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- pages (id)
CREATE TRIGGER sync_pages_ai AFTER INSERT ON pages WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('pages', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_pages_au AFTER UPDATE ON pages WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('pages', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_pages_ad AFTER DELETE ON pages WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('pages', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- page_links (from_page_id, to_page_id)
CREATE TRIGGER sync_page_links_ai AFTER INSERT ON page_links WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('page_links', json_array(NEW.from_page_id, NEW.to_page_id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_page_links_au AFTER UPDATE ON page_links WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('page_links', json_array(NEW.from_page_id, NEW.to_page_id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_page_links_ad AFTER DELETE ON page_links WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('page_links', json_array(OLD.from_page_id, OLD.to_page_id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- attachments (id)
CREATE TRIGGER sync_attachments_ai AFTER INSERT ON attachments WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('attachments', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_attachments_au AFTER UPDATE ON attachments WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('attachments', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_attachments_ad AFTER DELETE ON attachments WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('attachments', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- flashcards (id)
CREATE TRIGGER sync_flashcards_ai AFTER INSERT ON flashcards WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('flashcards', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_flashcards_au AFTER UPDATE ON flashcards WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('flashcards', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_flashcards_ad AFTER DELETE ON flashcards WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('flashcards', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- flashcard_reviews (id)
CREATE TRIGGER sync_flashcard_reviews_ai AFTER INSERT ON flashcard_reviews WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('flashcard_reviews', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_flashcard_reviews_au AFTER UPDATE ON flashcard_reviews WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('flashcard_reviews', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_flashcard_reviews_ad AFTER DELETE ON flashcard_reviews WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('flashcard_reviews', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- goals (id)
CREATE TRIGGER sync_goals_ai AFTER INSERT ON goals WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('goals', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_goals_au AFTER UPDATE ON goals WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('goals', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_goals_ad AFTER DELETE ON goals WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('goals', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- goal_steps (id)
CREATE TRIGGER sync_goal_steps_ai AFTER INSERT ON goal_steps WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('goal_steps', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_goal_steps_au AFTER UPDATE ON goal_steps WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('goal_steps', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_goal_steps_ad AFTER DELETE ON goal_steps WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('goal_steps', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- habits (id)
CREATE TRIGGER sync_habits_ai AFTER INSERT ON habits WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('habits', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_habits_au AFTER UPDATE ON habits WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('habits', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_habits_ad AFTER DELETE ON habits WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('habits', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- habit_logs (habit_id, day)
CREATE TRIGGER sync_habit_logs_ai AFTER INSERT ON habit_logs WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('habit_logs', json_array(NEW.habit_id, NEW.day), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_habit_logs_au AFTER UPDATE ON habit_logs WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('habit_logs', json_array(NEW.habit_id, NEW.day), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_habit_logs_ad AFTER DELETE ON habit_logs WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('habit_logs', json_array(OLD.habit_id, OLD.day), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- exercises (id)
CREATE TRIGGER sync_exercises_ai AFTER INSERT ON exercises WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('exercises', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_exercises_au AFTER UPDATE ON exercises WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('exercises', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_exercises_ad AFTER DELETE ON exercises WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('exercises', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- workouts (id)
CREATE TRIGGER sync_workouts_ai AFTER INSERT ON workouts WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('workouts', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_workouts_au AFTER UPDATE ON workouts WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('workouts', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_workouts_ad AFTER DELETE ON workouts WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('workouts', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;

-- workout_sets (id)
CREATE TRIGGER sync_workout_sets_ai AFTER INSERT ON workout_sets WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('workout_sets', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_workout_sets_au AFTER UPDATE ON workout_sets WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('workout_sets', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_workout_sets_ad AFTER DELETE ON workout_sets WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('workout_sets', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;
