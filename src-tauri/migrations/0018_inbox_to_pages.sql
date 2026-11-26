-- Cockpit — la boîte de réception rejoint les Pages (26/11/2026, à la demande de l'utilisateur :
-- « c'est vraiment le principe de Page »). Une ligne de n'importe quelle page devient désormais une
-- tâche, un devoir, un événement, une idée ou un projet (clic droit) ; la capture rapide (raccourci
-- global) est retirée.
--
-- Les captures qui attendaient sont reprises dans une page « Captures », mise en favori : une puce par
-- capture, de la plus ancienne à la plus récente, sous une ligne qui dit quoi en faire. Identifiant
-- fixe : deux appareils synchronisés qui passent cette migration écrivent la même page.
-- Les déclencheurs de la page (recherche, synchronisation) l'indexent et la notent comme à envoyer.

INSERT INTO pages (id, parent_id, title, content, plain_text, pinned, sort_order, created_at, updated_at)
SELECT
  'page-captures',
  NULL,
  'Captures',
  json_object('type', 'doc', 'content', json_array(
    json_object('type', 'paragraph', 'content', json_array(json_object('type', 'text', 'text',
      'Ce qui attendait dans la boîte de réception. Clic droit sur une ligne pour en faire une tâche, un devoir, un événement, une idée ou un projet.'))),
    json_object('type', 'bulletList', 'content', json((
      SELECT json_group_array(json(item)) FROM (
        SELECT json_object('type', 'listItem', 'content', json_array(
                 json_object('type', 'paragraph', 'content', json_array(json_object('type', 'text', 'text', text))))) AS item
        FROM inbox_items ORDER BY created_at, rowid
      )
    )))
  )),
  'Ce qui attendait dans la boîte de réception. Clic droit sur une ligne pour en faire une tâche, un devoir, un événement, une idée ou un projet.'
    || char(10) || (SELECT group_concat(text, char(10)) FROM (SELECT text FROM inbox_items ORDER BY created_at, rowid)),
  1,
  COALESCE((SELECT MAX(sort_order) FROM pages WHERE parent_id IS NULL), 0) + 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM inbox_items);

-- La table part avec ses déclencheurs (recherche 0006, synchronisation 0014) ; ses traces de
-- synchronisation et son index de recherche aussi.
DROP TABLE inbox_items;
DELETE FROM sync_rows WHERE tbl = 'inbox_items';
DELETE FROM search_index WHERE entity = 'inbox';

-- Le réglage du raccourci de capture rapide ne sert plus.
DELETE FROM settings WHERE key = 'capture.shortcut';
