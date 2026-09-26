-- Cockpit — programme du jour (V1.1.2, « Je veux travailler… », voir docs/CONCEPTION.md §7.3).
-- Le jour où « Je veux travailler… » a mis une tâche au programme. Ses dates ne changent pas : elle
-- est dans Aujourd'hui ce jour-là seulement. Le lendemain, si elle n'est pas faite, elle est de
-- nouveau à sa place (sa date d'avant), sans que rien ne soit réécrit.

ALTER TABLE tasks ADD COLUMN planned_on TEXT;
CREATE INDEX idx_tasks_planned ON tasks(planned_on) WHERE planned_on IS NOT NULL;
