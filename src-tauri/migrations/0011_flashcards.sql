-- Cockpit — révisions (V2, étape 5 ; voir docs/CONCEPTION.md §9.3 « Cours » et §9.4).
-- Une flashcard a un recto et un verso, et appartient à une matière. Elle peut venir d'une page (une
-- ligne « question :: réponse »). Seules les révisions sont stockées : l'échéance d'une carte est
-- recalculée à partir d'elles (répétition espacée, school/flashcards/model.ts), jamais recopiée.

CREATE TABLE flashcards (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  page_id     TEXT REFERENCES pages(id) ON DELETE SET NULL,   -- la page d'où vient la carte, s'il y en a une
  front       TEXT NOT NULL,
  back        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_flashcards_subject ON flashcards(subject_id);
CREATE INDEX idx_flashcards_page ON flashcards(page_id);

CREATE TABLE flashcard_reviews (
  id           TEXT PRIMARY KEY,
  card_id      TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  reviewed_on  TEXT NOT NULL,                                   -- 'YYYY-MM-DD'
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4), -- 1 à revoir, 2 difficile, 3 bien, 4 facile
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_flashcard_reviews_card ON flashcard_reviews(card_id, created_at);
