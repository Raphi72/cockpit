-- Cockpit — devoirs reliés à un cours précis de Google Agenda (retours d'usage du 26/11/2026, suite).
-- Un devoir est à rendre pour un cours : une occurrence de l'agenda des cours ('agenda|événement', comme
-- l'identifiant d'un élément Google de l'agenda). Son jour reste dans due_date (le cours peut sortir de la
-- copie locale, qui ne garde qu'un mois en arrière) et suit le cours s'il change de jour.
-- Les déclencheurs de synchronisation ne notent que la clé des lignes : rien à refaire pour tasks.

ALTER TABLE tasks ADD COLUMN course_event TEXT;
CREATE INDEX idx_tasks_course_event ON tasks(course_event) WHERE course_event IS NOT NULL;

-- Ce que l'intitulé d'un cours dit en plus de sa matière (« Matière | Type | Prof ») : copie locale, relue.
ALTER TABLE google_events ADD COLUMN course_kind TEXT;
ALTER TABLE google_events ADD COLUMN teacher TEXT;
