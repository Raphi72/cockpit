-- Cockpit — retrait des flashcards (26/11/2026, à la demande de l'utilisateur : elles ne lui servent pas).
-- Les tables de la migration 0011 partent, leurs déclencheurs de synchronisation (0014) avec elles ; leurs
-- traces de synchronisation aussi. Les révisions à rebours des examens (blocs « Révision ») restent.

DROP TABLE IF EXISTS flashcard_reviews;
DROP TABLE IF EXISTS flashcards;
DELETE FROM sync_rows WHERE tbl IN ('flashcards', 'flashcard_reviews');
