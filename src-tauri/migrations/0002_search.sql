-- Cockpit — recherche globale (voir docs/CONCEPTION.md §3.6).
-- Un index plein texte unique pour la palette Ctrl+K, tenu à jour par des triggers :
-- l'app n'écrit jamais dedans. Recherche par préfixe, sans tenir compte des accents.

CREATE VIRTUAL TABLE search_index USING fts5(
  entity    UNINDEXED,        -- 'project' | 'task' | 'client' | 'event' | 'payment' | 'transaction'
  entity_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- ─── Projets ────────────────────────────────────────────────────────────────
CREATE TRIGGER projects_search_ai AFTER INSERT ON projects BEGIN
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('project', NEW.id, NEW.name, COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER projects_search_au AFTER UPDATE OF name, description, notes ON projects BEGIN
  DELETE FROM search_index WHERE entity = 'project' AND entity_id = OLD.id;
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('project', NEW.id, NEW.name, COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER projects_search_ad AFTER DELETE ON projects BEGIN
  DELETE FROM search_index WHERE entity = 'project' AND entity_id = OLD.id;
END;

-- ─── Tâches ─────────────────────────────────────────────────────────────────
CREATE TRIGGER tasks_search_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('task', NEW.id, NEW.title, COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER tasks_search_au AFTER UPDATE OF title, notes ON tasks BEGIN
  DELETE FROM search_index WHERE entity = 'task' AND entity_id = OLD.id;
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('task', NEW.id, NEW.title, COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER tasks_search_ad AFTER DELETE ON tasks BEGIN
  DELETE FROM search_index WHERE entity = 'task' AND entity_id = OLD.id;
END;

-- ─── Clients ────────────────────────────────────────────────────────────────
CREATE TRIGGER clients_search_ai AFTER INSERT ON clients BEGIN
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('client', NEW.id, NEW.name,
          COALESCE(NEW.email, '') || ' ' || COALESCE(NEW.phone, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER clients_search_au AFTER UPDATE OF name, email, phone, notes ON clients BEGIN
  DELETE FROM search_index WHERE entity = 'client' AND entity_id = OLD.id;
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('client', NEW.id, NEW.name,
          COALESCE(NEW.email, '') || ' ' || COALESCE(NEW.phone, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER clients_search_ad AFTER DELETE ON clients BEGIN
  DELETE FROM search_index WHERE entity = 'client' AND entity_id = OLD.id;
END;

-- ─── Événements ─────────────────────────────────────────────────────────────
CREATE TRIGGER events_search_ai AFTER INSERT ON events BEGIN
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('event', NEW.id, NEW.title, COALESCE(NEW.location, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER events_search_au AFTER UPDATE OF title, location, notes ON events BEGIN
  DELETE FROM search_index WHERE entity = 'event' AND entity_id = OLD.id;
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('event', NEW.id, NEW.title, COALESCE(NEW.location, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER events_search_ad AFTER DELETE ON events BEGIN
  DELETE FROM search_index WHERE entity = 'event' AND entity_id = OLD.id;
END;

-- ─── Encaissements ──────────────────────────────────────────────────────────
CREATE TRIGGER payments_search_ai AFTER INSERT ON payments BEGIN
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('payment', NEW.id, NEW.label, COALESCE(NEW.invoice_ref, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER payments_search_au AFTER UPDATE OF label, invoice_ref, notes ON payments BEGIN
  DELETE FROM search_index WHERE entity = 'payment' AND entity_id = OLD.id;
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('payment', NEW.id, NEW.label, COALESCE(NEW.invoice_ref, '') || ' ' || COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER payments_search_ad AFTER DELETE ON payments BEGIN
  DELETE FROM search_index WHERE entity = 'payment' AND entity_id = OLD.id;
END;

-- ─── Transactions ───────────────────────────────────────────────────────────
-- Un virement a deux lignes : seule la sortie est indexée, il apparaît donc une seule fois.
CREATE TRIGGER transactions_search_ai AFTER INSERT ON transactions
WHEN NEW.kind <> 'transfer' OR NEW.amount_cents < 0 BEGIN
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('transaction', NEW.id, NEW.label, COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER transactions_search_au AFTER UPDATE OF label, notes ON transactions
WHEN NEW.kind <> 'transfer' OR NEW.amount_cents < 0 BEGIN
  DELETE FROM search_index WHERE entity = 'transaction' AND entity_id = OLD.id;
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('transaction', NEW.id, NEW.label, COALESCE(NEW.notes, ''));
END;
CREATE TRIGGER transactions_search_ad AFTER DELETE ON transactions BEGIN
  DELETE FROM search_index WHERE entity = 'transaction' AND entity_id = OLD.id;
END;

-- ─── Données déjà saisies ───────────────────────────────────────────────────
INSERT INTO search_index (entity, entity_id, title, body)
  SELECT 'project', id, name, COALESCE(description, '') || ' ' || COALESCE(notes, '') FROM projects;
INSERT INTO search_index (entity, entity_id, title, body)
  SELECT 'task', id, title, COALESCE(notes, '') FROM tasks;
INSERT INTO search_index (entity, entity_id, title, body)
  SELECT 'client', id, name, COALESCE(email, '') || ' ' || COALESCE(phone, '') || ' ' || COALESCE(notes, '')
  FROM clients;
INSERT INTO search_index (entity, entity_id, title, body)
  SELECT 'event', id, title, COALESCE(location, '') || ' ' || COALESCE(notes, '') FROM events;
INSERT INTO search_index (entity, entity_id, title, body)
  SELECT 'payment', id, label, COALESCE(invoice_ref, '') || ' ' || COALESCE(notes, '') FROM payments;
INSERT INTO search_index (entity, entity_id, title, body)
  SELECT 'transaction', id, label, COALESCE(notes, '') FROM transactions
  WHERE kind <> 'transfer' OR amount_cents < 0;
