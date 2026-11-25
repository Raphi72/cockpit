-- Cockpit — événements récurrents (V2, étape 1 ; voir docs/CONCEPTION.md §9.2, P15).
-- La règle de répétition est stockée une fois, sur l'événement : ses occurrences sont calculées,
-- jamais recopiées (P8). Seules les exceptions sont stockées : une occurrence annulée, ou déplacée.

-- Règle au format RRULE (RFC 5545), par exemple « FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20270630 ».
-- NULL : l'événement ne se répète pas. `starts_at` est alors, comme avant, sa seule date ;
-- pour un événement qui se répète, c'est sa première occurrence.
ALTER TABLE events ADD COLUMN recurrence TEXT;

CREATE TABLE event_exceptions (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence  TEXT NOT NULL,   -- jour prévu par la règle ('YYYY-MM-DD') : il désigne l'occurrence
  kind        TEXT NOT NULL CHECK (kind IN ('cancelled', 'moved')),
  starts_at   TEXT,            -- déplacée : son nouveau moment, au même format que events.starts_at
  ends_at     TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (event_id, occurrence),
  CHECK ((kind = 'moved') = (starts_at IS NOT NULL)),
  CHECK (kind = 'moved' OR ends_at IS NULL)
);
