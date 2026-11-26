-- Cockpit — sport, habitudes et objectifs (V2, étape 6 ; voir docs/CONCEPTION.md §9.2 P20 et §9.3).
-- Une résolution est un objectif suivi par des habitudes. Une habitude se coche (une ligne par jour),
-- ou se coche toute seule quand un bloc de son module est fait : ce cas n'est pas recopié, il se
-- calcule. Les séries, les taux et la progression des objectifs sont calculés, jamais stockés.

CREATE TABLE goals (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  due_date     TEXT,              -- échéance facultative ('YYYY-MM-DD')
  notes        TEXT,
  achieved_at  TEXT,              -- « Objectif atteint », quand on le déclare
  sort_order   REAL NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE goal_steps (
  id          TEXT PRIMARY KEY,
  goal_id     TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  done_at     TEXT,
  sort_order  REAL NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_goal_steps ON goal_steps(goal_id, sort_order);

CREATE TABLE habits (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  icon            TEXT NOT NULL,     -- clé d'icône (les mêmes que les modules)
  color           TEXT NOT NULL,
  -- Chaque jour ; X fois par semaine ; certains jours de la semaine.
  frequency       TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'days')),
  times_per_week  INTEGER CHECK (times_per_week BETWEEN 1 AND 7),
  weekdays        TEXT,              -- jours choisis, '1,3,5' (1 = lundi … 7 = dimanche)
  reminder_time   TEXT,              -- 'HH:MM' : rappel si elle n'est pas encore faite
  module_id       TEXT REFERENCES block_templates(id) ON DELETE SET NULL,   -- un bloc fait de ce module la coche
  goal_id         TEXT REFERENCES goals(id) ON DELETE SET NULL,             -- l'objectif qu'elle sert
  archived_at     TEXT,
  sort_order      REAL NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK (frequency <> 'weekly' OR times_per_week IS NOT NULL),
  CHECK (frequency <> 'days' OR weekdays IS NOT NULL)
);

CREATE TABLE habit_logs (
  habit_id    TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,         -- 'YYYY-MM-DD'
  created_at  TEXT NOT NULL,
  PRIMARY KEY (habit_id, day)
);

-- ─── Carnet de séances ──────────────────────────────────────────────────────
CREATE TABLE exercises (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('strength', 'cardio')),   -- séries × répétitions × charge, ou durée et distance
  created_at  TEXT NOT NULL
);

CREATE TABLE workouts (
  id          TEXT PRIMARY KEY,
  block_id    TEXT REFERENCES day_blocks(id) ON DELETE SET NULL,      -- le bloc de sport d'où vient la séance
  date        TEXT NOT NULL,
  feeling     INTEGER CHECK (feeling BETWEEN 1 AND 5),                -- ressenti, de 1 (dur) à 5 (excellent)
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_workouts_date ON workouts(date);

CREATE TABLE workout_sets (
  id            TEXT PRIMARY KEY,
  workout_id    TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id   TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  reps          INTEGER CHECK (reps > 0),
  weight_kg     REAL CHECK (weight_kg >= 0),
  duration_min  REAL CHECK (duration_min > 0),
  distance_km   REAL CHECK (distance_km >= 0),
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_workout_sets ON workout_sets(workout_id, position);
CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id);
