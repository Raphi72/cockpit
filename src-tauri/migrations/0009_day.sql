-- Cockpit — organisateur de journée (V2, étape 3 ; voir docs/CONCEPTION.md §9.2 P16-P18 et §9.3).
-- Un module est un modèle réutilisable ; un bloc est un module posé sur un jour, à une heure : c'est
-- lui qui porte sa date (P8). Une tâche placée dans un bloc prend la date du bloc (P17). Une semaine
-- type s'applique à une semaine en créant des blocs ordinaires (P18).

-- ─── Modules ────────────────────────────────────────────────────────────────
CREATE TABLE block_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  icon          TEXT NOT NULL,      -- clé d'icône (liste fermée, day/model.ts)
  color         TEXT NOT NULL,      -- clé de la palette
  duration_min  INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 1440),
  mode          TEXT NOT NULL DEFAULT 'both' CHECK (mode IN ('work', 'school', 'both')),
  sort_order    REAL NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- ─── Blocs posés ────────────────────────────────────────────────────────────
-- Le bloc garde le nom, l'icône, la couleur et le mode de son module au moment où il a été posé :
-- modifier le module ne change pas les blocs déjà posés (P16).
CREATE TABLE day_blocks (
  id           TEXT PRIMARY KEY,
  template_id  TEXT REFERENCES block_templates(id) ON DELETE SET NULL,
  date         TEXT NOT NULL,      -- 'YYYY-MM-DD'
  starts_at    TEXT NOT NULL,      -- 'HH:MM'
  ends_at      TEXT NOT NULL,      -- 'HH:MM', jusqu'à '24:00'
  title        TEXT NOT NULL,
  icon         TEXT NOT NULL,
  color        TEXT NOT NULL,
  mode         TEXT NOT NULL DEFAULT 'both' CHECK (mode IN ('work', 'school', 'both')),
  status       TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'missed')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_day_blocks_date ON day_blocks(date, starts_at);

-- ─── Tâches dans les blocs (P17) ────────────────────────────────────────────
-- Sa date du jour vient du bloc, sans être recopiée : déplacer le bloc déplace ses tâches.
ALTER TABLE tasks ADD COLUMN block_id TEXT REFERENCES day_blocks(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_block ON tasks(block_id);

-- ─── Semaines types (P18) ───────────────────────────────────────────────────
CREATE TABLE week_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  REAL NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE week_template_blocks (
  id                TEXT PRIMARY KEY,
  week_template_id  TEXT NOT NULL REFERENCES week_templates(id) ON DELETE CASCADE,
  template_id       TEXT REFERENCES block_templates(id) ON DELETE SET NULL,
  weekday           INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),   -- 1 = lundi … 7 = dimanche
  starts_at         TEXT NOT NULL,
  ends_at           TEXT NOT NULL,
  title             TEXT NOT NULL,
  icon              TEXT NOT NULL,
  color             TEXT NOT NULL,
  mode              TEXT NOT NULL DEFAULT 'both' CHECK (mode IN ('work', 'school', 'both')),
  created_at        TEXT NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_week_template_blocks ON week_template_blocks(week_template_id, weekday);

-- ─── Modules proposés au départ (à modifier ou supprimer) ───────────────────
INSERT INTO block_templates (id, name, icon, color, duration_min, mode, sort_order, created_at, updated_at) VALUES
  ('module-sport',    'Sport',     'dumbbell', 'green',  180, 'both',   1, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('module-devoirs',  'Devoirs',   'notebook', 'blue',    90, 'school', 2, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('module-deepwork', 'Deep work', 'brain',    'violet', 120, 'work',   3, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z'),
  ('module-revision', 'Révision',  'book',     'amber',   60, 'school', 4, '2026-11-26T00:00:00.000Z', '2026-11-26T00:00:00.000Z');
