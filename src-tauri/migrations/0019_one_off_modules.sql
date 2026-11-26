-- Cockpit — Journée : des modules « à caser » pour une seule fois (retours du 26/11/2026).
-- Un module ordinaire reste dans la bibliothèque ; un module « pour une fois » (« Courses · 1 h ») attend
-- dans « À caser », les jours suivants aussi, jusqu'à ce qu'on le pose sur la journée (il devient alors un
-- bloc et disparaît) ou qu'on le jette à la corbeille. La table est déjà synchronisée (0014) : ses
-- déclencheurs ne portent que la clé, rien à refaire.

ALTER TABLE block_templates ADD COLUMN one_off INTEGER NOT NULL DEFAULT 0 CHECK (one_off IN (0, 1));
