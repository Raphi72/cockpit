-- Cockpit — Google Agenda en lecture seule (V2, étape 8 ; voir docs/CONCEPTION.md §9.3 et §9.5).
-- Une copie locale des agendas Google et de leurs événements, relue régulièrement par la connexion
-- Google (côté Rust) : elle sert à les montrer hors ligne et à les mêler au calendrier, à la Journée et
-- à Aujourd'hui. Rien n'est jamais modifié chez Google. Cette copie n'est pas exportée : elle se relit.

CREATE TABLE google_calendars (
  id            TEXT PRIMARY KEY,                  -- identifiant de l'agenda chez Google
  name          TEXT NOT NULL,
  google_color  TEXT,                              -- sa couleur dans Google ('#rrggbb')
  color         TEXT NOT NULL,                     -- clé de la palette, la plus proche au départ, réglable
  is_primary    INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  shown         INTEGER NOT NULL DEFAULT 1 CHECK (shown IN (0, 1)),
  sort_order    REAL NOT NULL,
  synced_at     TEXT,                              -- dernière relecture de ses événements
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE google_events (
  calendar_id  TEXT NOT NULL REFERENCES google_calendars(id) ON DELETE CASCADE,
  id           TEXT NOT NULL,                      -- identifiant chez Google (une occurrence d'une série a le sien)
  title        TEXT NOT NULL,
  location     TEXT,
  starts_at    TEXT NOT NULL,                      -- 'YYYY-MM-DD' (journée entière) ou 'YYYY-MM-DDTHH:MM' (heure locale)
  ends_at      TEXT,                               -- même forme ; pour des journées, le dernier jour compris (NULL : un seul jour)
  all_day      INTEGER NOT NULL CHECK (all_day IN (0, 1)),
  html_link    TEXT,                               -- l'événement dans Google Agenda
  PRIMARY KEY (calendar_id, id)
);
CREATE INDEX idx_google_events_start ON google_events(starts_at);
