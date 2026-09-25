-- Cockpit — sous-tâches (V1.1, voir docs/CONCEPTION.md §3.3 et §7.3).
-- Une tâche peut contenir des sous-tâches, sur un seul niveau : la tâche parente sert aussi de
-- catégorie (« Tâches admin »). Une sous-tâche est une tâche comme une autre (dates, priorité, case)
-- et appartient au même projet que sa parente. Supprimer la parente supprime ses sous-tâches.

ALTER TABLE tasks ADD COLUMN parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;
CREATE INDEX idx_tasks_parent ON tasks(parent_id, sort_order);

-- Progression d'un projet : une tâche qui a des sous-tâches ne compte pas elle-même,
-- ce sont ses sous-tâches qui comptent (une catégorie n'est pas une chose à faire de plus).
DROP VIEW project_progress;
CREATE VIEW project_progress AS
  SELECT t.project_id,
         COUNT(*)               AS tasks_total,
         SUM(t.status = 'done') AS tasks_done
  FROM tasks t
  WHERE t.project_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = t.id)
  GROUP BY t.project_id;
