-- Cockpit — schéma initial (voir docs/CONCEPTION.md §3).
-- Conventions : IDs TEXT générés par l'app, montants en centimes, dates 'YYYY-MM-DD',
-- dates-heures locales 'YYYY-MM-DDTHH:MM', horodatages techniques en UTC ISO.
-- Aucune valeur dérivée (progression, reçu, retard, solde…) n'est stockée.

-- ─── Référentiels ───────────────────────────────────────────────────────────
CREATE TABLE project_types (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL,
  sort_order  REAL NOT NULL
);

CREATE TABLE transaction_categories (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  kind  TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  UNIQUE (name, kind)
);

CREATE TABLE accounts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('personal', 'business')),
  sort_order  REAL NOT NULL,
  archived_at TEXT,
  created_at  TEXT NOT NULL
);

-- ─── Activité ───────────────────────────────────────────────────────────────
CREATE TABLE clients (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  notes       TEXT,
  archived_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE projects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  notes        TEXT,
  client_id    TEXT REFERENCES clients(id) ON DELETE SET NULL,
  type_id      TEXT NOT NULL REFERENCES project_types(id) ON DELETE RESTRICT,
  status       TEXT NOT NULL DEFAULT 'planned'
               CHECK (status IN ('proposal', 'planned', 'active', 'on_hold', 'done', 'cancelled')),
  priority     INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 3),
  start_date   TEXT,
  deadline     TEXT,
  budget_cents INTEGER CHECK (budget_cents >= 0),
  completed_at TEXT,
  archived_at  TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_projects_status ON projects(status, deadline);
CREATE INDEX idx_projects_client ON projects(client_id);
CREATE INDEX idx_projects_type   ON projects(type_id);

CREATE TABLE tasks (
  id             TEXT PRIMARY KEY,
  project_id     TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  priority       INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 3),
  scheduled_date TEXT,
  due_date       TEXT,
  estimate_min   INTEGER CHECK (estimate_min > 0),
  sort_order     REAL NOT NULL,
  completed_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_tasks_project   ON tasks(project_id, sort_order);
CREATE INDEX idx_tasks_scheduled ON tasks(scheduled_date) WHERE status <> 'done';
CREATE INDEX idx_tasks_due       ON tasks(due_date)       WHERE status <> 'done';
CREATE INDEX idx_tasks_completed ON tasks(completed_at)   WHERE status = 'done';

CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL
              CHECK (kind IN ('appointment', 'meeting', 'deadline', 'personal', 'other')),
  all_day     INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  starts_at   TEXT NOT NULL,
  ends_at     TEXT,
  location    TEXT,
  notes       TEXT,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_events_start   ON events(starts_at);
CREATE INDEX idx_events_project ON events(project_id);

-- ─── Argent ─────────────────────────────────────────────────────────────────
-- Encaissement : argent attendu d'un client (échéance), puis reçu.
CREATE TABLE payments (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  client_id     TEXT REFERENCES clients(id) ON DELETE SET NULL,
  label         TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  due_date      TEXT,
  status        TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'pending', 'received')),
  received_date TEXT,
  invoice_ref   TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CHECK (project_id IS NULL OR client_id IS NULL),
  CHECK ((status = 'received') = (received_date IS NOT NULL))
);
CREATE INDEX idx_payments_project  ON payments(project_id);
CREATE INDEX idx_payments_open     ON payments(due_date)      WHERE status <> 'received';
CREATE INDEX idx_payments_received ON payments(received_date) WHERE status = 'received';

-- Transaction : mouvement réel sur un compte. Montant signé : + entrée, − sortie.
CREATE TABLE transactions (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  kind           TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer', 'adjustment')),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents <> 0),
  date           TEXT NOT NULL,
  label          TEXT NOT NULL,
  category_id    TEXT REFERENCES transaction_categories(id) ON DELETE SET NULL,
  project_id     TEXT REFERENCES projects(id) ON DELETE SET NULL,
  payment_id     TEXT UNIQUE REFERENCES payments(id) ON DELETE SET NULL,
  transfer_group TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  CHECK (kind <> 'income'  OR amount_cents > 0),
  CHECK (kind <> 'expense' OR amount_cents < 0),
  CHECK ((kind = 'transfer') = (transfer_group IS NOT NULL))
);
CREATE INDEX idx_tx_account_date ON transactions(account_id, date);
CREATE INDEX idx_tx_date         ON transactions(date);
CREATE INDEX idx_tx_project      ON transactions(project_id);
CREATE INDEX idx_tx_transfer     ON transactions(transfer_group);

-- ─── Technique ──────────────────────────────────────────────────────────────
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE notification_log (
  key     TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL
);

-- ─── Vues de calcul ─────────────────────────────────────────────────────────
CREATE VIEW project_progress AS
  SELECT project_id,
         COUNT(*)             AS tasks_total,
         SUM(status = 'done') AS tasks_done
  FROM tasks
  WHERE project_id IS NOT NULL
  GROUP BY project_id;

CREATE VIEW project_money AS
  SELECT project_id,
         SUM(amount_cents)                                               AS scheduled_cents,
         SUM(CASE WHEN status = 'received' THEN amount_cents ELSE 0 END) AS received_cents
  FROM payments
  WHERE project_id IS NOT NULL
  GROUP BY project_id;

CREATE VIEW account_balances AS
  SELECT a.id AS account_id, COALESCE(SUM(t.amount_cents), 0) AS balance_cents
  FROM accounts a
  LEFT JOIN transactions t ON t.account_id = a.id
  GROUP BY a.id;

-- ─── Données initiales ──────────────────────────────────────────────────────
INSERT INTO project_types (id, name, color, sort_order) VALUES
  ('type-freelance',  'Freelance',  'blue',   1),
  ('type-mission',    'Mission',    'teal',   2),
  ('type-personnel',  'Personnel',  'green',  3),
  ('type-scolaire',   'Scolaire',   'amber',  4),
  ('type-associatif', 'Associatif', 'orange', 5),
  ('type-autre',      'Autre',      'slate',  6);

INSERT INTO accounts (id, name, kind, sort_order, created_at) VALUES
  ('account-personal', 'Compte personnel',     'personal', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('account-business', 'Compte professionnel', 'business', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

INSERT INTO transaction_categories (id, name, kind) VALUES
  ('cat-client-income', 'Revenus client',          'income'),
  ('cat-other-income',  'Autre revenu',            'income'),
  ('cat-software',      'Logiciels & abonnements', 'expense'),
  ('cat-hardware',      'Matériel',                'expense'),
  ('cat-travel',        'Déplacements',            'expense'),
  ('cat-training',      'Formation',               'expense'),
  ('cat-bank-fees',     'Frais bancaires',         'expense'),
  ('cat-other-expense', 'Autre dépense',           'expense');
