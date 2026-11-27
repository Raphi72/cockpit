-- Cockpit — Google Agenda en écriture (après la 2.7.0 ; voir docs/JOURNAL.md).
-- Les événements Google se modifient, se créent et se suppriment depuis Cockpit, aussi hors connexion.
-- Chaque modification est notée dans google_edits (synchronisée entre les appareils) et s'applique tout de
-- suite à la copie locale (google_events), donc partout où Cockpit montre les événements. Elle part chez
-- Google dès qu'un appareil autorisé a du réseau (`pending` → `done`), puis la relecture suivante la rend
-- inutile. L'agenda de l'intranet (iCal) ne se modifie pas chez Google : ses retouches restent dans Cockpit
-- (`local`), ré-appliquées après chaque relecture.

-- Un agenda où l'on peut écrire (propriétaire ou droit de modification) ; sinon, retouches locales.
ALTER TABLE google_calendars ADD COLUMN writable INTEGER NOT NULL DEFAULT 0 CHECK (writable IN (0, 1));

ALTER TABLE google_events ADD COLUMN notes TEXT;                 -- la description de l'événement
ALTER TABLE google_events ADD COLUMN series_id TEXT;             -- l'événement répété dont c'est une occurrence
ALTER TABLE google_events ADD COLUMN project_id TEXT;            -- rattachement (champ privé de l'événement, ou retouche)
ALTER TABLE google_events ADD COLUMN subject_id TEXT;
ALTER TABLE google_events ADD COLUMN edited INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)); -- retouché dans Cockpit
CREATE INDEX idx_google_events_series ON google_events(calendar_id, series_id);

CREATE TABLE google_edits (
  id           TEXT PRIMARY KEY,
  calendar_id  TEXT NOT NULL,
  event_id     TEXT NOT NULL,                  -- l'événement (ou l'occurrence) ; pour une création, l'identifiant choisi par Cockpit
  series_id    TEXT,                           -- avec scope 'all' : l'événement répété entier
  op           TEXT NOT NULL CHECK (op IN ('insert', 'patch', 'delete')),
  scope        TEXT NOT NULL DEFAULT 'this' CHECK (scope IN ('this', 'all')),
  fields       TEXT NOT NULL DEFAULT '[]',     -- champs changés par un 'patch' (JSON) : 'title', 'location', 'notes', 'time', 'link'
  title        TEXT,
  location     TEXT,
  notes        TEXT,
  starts_at    TEXT,                           -- forme de google_events : 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:MM'
  ends_at      TEXT,
  all_day      INTEGER CHECK (all_day IN (0, 1)),
  project_id   TEXT,
  subject_id   TEXT,
  recurrence   TEXT,                           -- une création qui se répète : sa règle (RRULE, comme events.recurrence)
  status       TEXT NOT NULL CHECK (status IN ('pending', 'local', 'done')),
  error        TEXT,                           -- le dernier refus de Google, s'il y en a eu un
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_google_edits_calendar ON google_edits(calendar_id, created_at);

-- google_edits (id) : synchronisée comme les autres tables de données (voir 0014).
CREATE TRIGGER sync_google_edits_ai AFTER INSERT ON google_edits WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('google_edits', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_google_edits_au AFTER UPDATE ON google_edits WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('google_edits', json_array(NEW.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 0)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 0;
END;
CREATE TRIGGER sync_google_edits_ad AFTER DELETE ON google_edits WHEN NOT EXISTS (SELECT 1 FROM sync_state WHERE key = 'applying')
BEGIN
  INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted)
  VALUES ('google_edits', json_array(OLD.id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL, (SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_rows), 1)
  ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = NULL, seq = excluded.seq, deleted = 1;
END;
