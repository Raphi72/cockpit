-- Cockpit — espace Cours (V2, étape 2 ; voir docs/CONCEPTION.md §9.2 P13-P15, §9.3 et §9.4).
-- Matières, devoirs (des tâches rattachées à une matière), calendrier scolaire (semestres et
-- vacances), emploi du temps (une semaine type), examens et notes. Les moyennes, les cours d'un jour
-- et les semestres d'une note sont calculés : rien n'est recopié (P8).

-- ─── Matières ───────────────────────────────────────────────────────────────
CREATE TABLE subjects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL,                 -- clé de la palette (blue, violet…), comme les types de projet
  teacher      TEXT,
  room         TEXT,                          -- salle habituelle ; un cours peut en avoir une autre
  coefficient  REAL NOT NULL DEFAULT 1 CHECK (coefficient > 0),
  sort_order   REAL NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- ─── Devoirs (P14) ──────────────────────────────────────────────────────────
-- Un devoir est une tâche rattachée à une matière (jamais aussi à un projet) : dates, priorité,
-- sous-tâches, recherche et « Annuler » sont ceux des tâches. Supprimer une matière emporte ses devoirs.
ALTER TABLE tasks ADD COLUMN subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE;
CREATE INDEX idx_tasks_subject ON tasks(subject_id);

-- ─── Calendrier scolaire ────────────────────────────────────────────────────
-- Semestres : leurs dates rangent les notes (moyenne par semestre, puis de l'année) et bornent
-- l'emploi du temps. Vacances : des périodes sans cours. Dates incluses.
CREATE TABLE school_periods (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('semester', 'holiday')),
  name        TEXT NOT NULL,
  starts_on   TEXT NOT NULL,   -- 'YYYY-MM-DD'
  ends_on     TEXT NOT NULL,   -- 'YYYY-MM-DD', inclus
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  CHECK (ends_on >= starts_on)
);
CREATE INDEX idx_school_periods ON school_periods(kind, starts_on);

-- ─── Emploi du temps (P15) ──────────────────────────────────────────────────
-- La semaine type : un créneau par cours. Les cours d'un jour sont calculés à partir de ces
-- créneaux, pendant les semestres et hors vacances ; rien n'est recopié jour par jour.
CREATE TABLE timetable_slots (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),   -- 1 = lundi … 7 = dimanche
  starts_at   TEXT NOT NULL,   -- 'HH:MM'
  ends_at     TEXT NOT NULL,   -- 'HH:MM'
  label       TEXT,            -- « TD », « TP », « Amphi »… (facultatif)
  room        TEXT,            -- NULL : la salle de la matière
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_timetable_subject ON timetable_slots(subject_id);

-- ─── Examens et contrôles ───────────────────────────────────────────────────
CREATE TABLE exams (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,   -- « Contrôle chapitre 3 », « Partiel »
  date        TEXT NOT NULL,   -- 'YYYY-MM-DD'
  starts_at   TEXT,            -- 'HH:MM' (facultatif)
  ends_at     TEXT,            -- 'HH:MM' (facultatif, avec un début)
  room        TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  CHECK (ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at > starts_at))
);
CREATE INDEX idx_exams_date ON exams(date);
CREATE INDEX idx_exams_subject ON exams(subject_id);

-- ─── Notes ──────────────────────────────────────────────────────────────────
-- Une note compte pour le semestre qui contient sa date. Elle peut venir d'un examen (exam_id),
-- mais garde sa propre date. Les moyennes sont calculées (school/grades/model.ts), jamais stockées.
CREATE TABLE grades (
  id           TEXT PRIMARY KEY,
  subject_id   TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  exam_id      TEXT REFERENCES exams(id) ON DELETE SET NULL,
  title        TEXT,           -- « DS 2 », « Oral » ; à défaut, le titre de l'examen
  score        REAL NOT NULL CHECK (score >= 0),
  out_of       REAL NOT NULL DEFAULT 20 CHECK (out_of > 0),
  coefficient  REAL NOT NULL DEFAULT 1 CHECK (coefficient > 0),
  date         TEXT NOT NULL,  -- 'YYYY-MM-DD'
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  CHECK (score <= out_of)
);
CREATE INDEX idx_grades_subject ON grades(subject_id, date);
CREATE INDEX idx_grades_exam ON grades(exam_id);

-- ─── Recherche globale (§3.6) ───────────────────────────────────────────────
CREATE TRIGGER subjects_search_ai AFTER INSERT ON subjects BEGIN
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('subject', NEW.id, NEW.name, COALESCE(NEW.teacher, '') || ' ' || COALESCE(NEW.room, ''));
END;
CREATE TRIGGER subjects_search_au AFTER UPDATE OF name, teacher, room ON subjects BEGIN
  DELETE FROM search_index WHERE entity = 'subject' AND entity_id = OLD.id;
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('subject', NEW.id, NEW.name, COALESCE(NEW.teacher, '') || ' ' || COALESCE(NEW.room, ''));
END;
CREATE TRIGGER subjects_search_ad AFTER DELETE ON subjects BEGIN
  DELETE FROM search_index WHERE entity = 'subject' AND entity_id = OLD.id;
END;

CREATE TRIGGER exams_search_ai AFTER INSERT ON exams BEGIN
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('exam', NEW.id, NEW.title, COALESCE(NEW.room, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER exams_search_au AFTER UPDATE OF title, room, notes ON exams BEGIN
  DELETE FROM search_index WHERE entity = 'exam' AND entity_id = OLD.id;
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('exam', NEW.id, NEW.title, COALESCE(NEW.room, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER exams_search_ad AFTER DELETE ON exams BEGIN
  DELETE FROM search_index WHERE entity = 'exam' AND entity_id = OLD.id;
END;
