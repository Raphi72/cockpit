# Cockpit — Dossier de conception (étapes 1 à 6)

> **Cockpit** est un nom de travail.
> Ce document fixe le besoin, l'architecture, le modèle de données, l'arborescence, les pages et le design system **avant d'écrire du code**.
> Statut : **validé** (voir §8). Jalons 0 à 3 terminés le 24/09/2026 ; prochaine étape : jalon 4 (calendrier).
> Maquette du dashboard : [`maquette-dashboard.html`](maquette-dashboard.html).

---

## 0. En bref

- **Application desktop locale** : Tauri 2 (coquille native légère) + React + TypeScript, avec une base **SQLite** dans `%APPDATA%`. Pas de serveur, pas de compte, 100 % hors ligne.
- **Toute la logique métier est en TypeScript.** La partie Rust se limite à un pont SQLite d'environ 200 lignes, aux sauvegardes et aux notifications natives.
- **Chaque date est stockée à un seul endroit.** Les deadlines, débuts de projet et échéances de paiement ne sont jamais recopiés en « événements ». Le calendrier, le planning et le dashboard les *agrègent*.
- **Rien de calculable n'est stocké** : la progression, le montant reçu, le reste à recevoir, les retards et les soldes sont tous calculés.
- **L'argent a deux vues** : les *encaissements* (ce que tes clients te doivent) et les *transactions* (ce qui bouge réellement sur tes comptes). Les deux sont reliés quand un paiement est reçu.
- 12 propositions produit (§1.3), toutes retenues ; décisions prises au §8.

---

## 1. Analyse du besoin

### 1.1 L'usage réel

Une seule personne a plusieurs casquettes : freelance (clients, devis, paiements), missions ponctuelles, projets scolaires ou associatifs (BDE), projets perso. Le contexte change plusieurs fois par jour et le temps passé dans l'outil doit rester minimal.

Dès l'ouverture, l'app doit répondre en quelques secondes à cinq questions :

| # | Question | Où se trouve la réponse |
|---|---|---|
| 1 | Qu'est-ce que je dois faire aujourd'hui ? | Dashboard › Aujourd'hui |
| 2 | Qu'est-ce qui arrive dans les prochains jours ? | Dashboard › Prochains jours |
| 3 | Qu'est-ce qui dérape ? | Dashboard › À surveiller |
| 4 | Où en sont mes projets ? | Dashboard › Projets en cours, page Projets |
| 5 | Combien j'ai et combien on me doit ? | Bandeau de chiffres du dashboard, page Finances |

Tout le reste (saisie, détail, historique) est secondaire et doit rester à une ou deux actions.

### 1.2 Fonctionnalités et découpage

| Domaine | MVP | V1.1 | Plus tard, si l'usage le demande |
|---|---|---|---|
| Projets | CRUD, types personnalisables, statuts, filtres, page détail, progression automatique | Archivage, duplication | Modèles de projet |
| Tâches | Tâches de projet **et** tâches libres, liste + kanban, réorganisation, vues Aujourd'hui / Semaine / Retard / Prioritaires / Terminées | Saisie rapide sur plusieurs lignes | Sous-tâches, tâches récurrentes |
| Clients | Fiche simple (nom, contact, notes) et projets liés | Historique du CA par client | — |
| Finances | Comptes perso/pro, encaissements (échéancier), transactions, virements, ajustement de solde | Export CSV, catégories éditables | CA encaissé par mois/trimestre, estimation des cotisations |
| Calendrier | Mois / semaine / jour, événements, agrégation des dates des projets, tâches et paiements | Glisser pour replanifier | Événements récurrents |
| Planning | — | Timeline type Gantt avec bande de densité | — |
| Dashboard | Cockpit complet (§5.2) | Sections réglables | — |
| Recherche | Ctrl+K : recherche globale (FTS5) + commandes | — | — |
| Création rapide | Bouton « + Nouveau » et raccourcis | — | Raccourci Windows global (app en arrière-plan) |
| Notifications | — | Notifications Windows natives, désactivables | Zone de notification + lancement au démarrage |
| Données | Sauvegarde auto quotidienne, sauvegarde manuelle, restauration | Export JSON / CSV | — |

**Hors périmètre (confirmé)** : comptes utilisateurs, collaboration, cloud obligatoire, synchronisation bancaire, chat, abonnement.

### 1.3 Propositions produit à valider

**P1. Fusionner « paiements du projet » et « argent à recevoir » en une seule entité : l'encaissement.**
Les sections 8 et 9 du besoin décrivent la même chose (« acompte de 500 € prévu le 15/10 »). Une seule table `payments` contient le libellé, le montant, la date prévue, la date de réception, le statut et la référence de facture. La section « Argent à recevoir » affiche les encaissements non reçus, et le bloc finances d'un projet affiche ses propres encaissements. Aucune double saisie n'est possible.

**P2. Ne jamais saisir « montant reçu » ni « reste à recevoir ».**
Le formulaire projet ne demande que le budget. Le reçu, le restant et le pourcentage payé sont calculés à partir des encaissements. En plus, l'app calcule un montant « non planifié » (budget moins la somme des encaissements) pour repérer un budget qui n'a pas encore d'échéancier.

**P3. Créer l'échéancier en un clic à la création d'un projet.**
Si un budget est saisi, l'app propose : `Paiement unique à la deadline` · `Acompte 30 % + solde` · `50 / 50` · `Plus tard`. Les encaissements correspondants sont créés et restent modifiables.

**P4. Séparer la vue « activité » de la vue « banque ».**
Les *encaissements* représentent ce que tes clients te doivent : ils alimentent le montant à recevoir, les retards et le CA. Les *transactions* représentent les mouvements réels sur tes comptes : elles alimentent les soldes et les dépenses. Quand tu marques un encaissement comme reçu, l'app propose (option cochée par défaut) de créer la transaction de revenu correspondante sur le compte pro. Les deux restent liés et ne sont jamais comptés deux fois.

**P5. Le solde est la somme des transactions ; corriger le solde à la main crée un ajustement.**
Tu gardes la possibilité de taper ton solde directement. L'app enregistre alors un mouvement « Ajustement » égal à la différence. Les transactions suivantes font ensuite évoluer le solde automatiquement et l'historique reste cohérent. Les ajustements sont exclus des statistiques de revenus et de dépenses. Si tu ne saisis jamais de transaction, cela revient exactement à un solde manuel.

**P6. Ajouter le virement entre comptes.**
Se verser de l'argent du compte pro vers le compte perso est le mouvement le plus fréquent d'un freelance. Sans type « virement », il faudrait saisir une dépense pro et un revenu perso, ce qui fausserait les dépenses professionnelles.

**P7. Calculer « En retard » et « À venir » au lieu de les stocker.**
Un statut « En retard » saisi à la main devient faux dès le lendemain. Les statuts stockés d'un encaissement sont donc `Prévu`, `En attente` (facture envoyée) et `Reçu`. « En retard » signifie « non reçu et date prévue dépassée ». Le même principe s'applique aux projets.

**P8. Le calendrier agrège les dates, il ne les duplique pas.**
Les débuts de projet, deadlines de projet, deadlines de tâche et échéances de paiement existent déjà dans leurs tables : le calendrier et le planning les affichent directement. Si tu décales une deadline, elle bouge partout. Seuls les vrais événements (rendez-vous, réunions, événements perso, échéances libres comme « dossier de bourse avant le 30/10 ») sont créés dans la table `events`.

**P9. Donner deux dates aux tâches et permettre les tâches sans projet.**
La date « prévue le » indique quand tu comptes faire la tâche et alimente la vue Aujourd'hui. La « deadline » indique quand elle doit être finie. Une tâche prévue hier et non faite reste dans Aujourd'hui, comme un report.
Une tâche peut aussi n'appartenir à aucun projet (« Appeler la banque ») : sans cela, la vue Aujourd'hui serait incomplète.
*Simplification associée* : pour les tâches, « description » et « notes » sont fusionnées en un seul champ **Notes**.

**P10. Rendre les types de projet personnalisables et le vocabulaire neutre.**
Les types de départ sont Freelance, Mission, Personnel, Scolaire, Associatif et Autre ; ils sont renommables et ont une couleur. Le champ client s'appelle « Client / organisation » : cela peut être un client, le BDE, l'école ou toi-même.
Un statut **Proposition** (devis envoyé, pas encore signé) permet de suivre les projets en négociation sans créer de nouvelle entité.

**P11. Définir le bloc « À surveiller » par des règles explicites.**
À la place d'un vague « projets nécessitant mon attention », le bloc applique ces règles :

- deadline dépassée ;
- deadline dans 3 jours ou moins ;
- encaissement en retard ;
- projet en cours sans aucune tâche ouverte (pas de prochaine action) ;
- projet qui commence dans moins de 7 jours et n'a aucune tâche ;
- projet sans activité depuis 14 jours ;
- budget non planifié.

Chaque ligne propose une action directe (ouvrir, marquer reçu, créer la tâche).

**P12. Mettre les sauvegardes automatiques dans le MVP.**
Toutes les données sont sur un seul disque, donc la sécurité ne peut pas dépendre de ta mémoire. L'app fait une copie automatique chaque jour (les 14 dernières sont conservées) et une copie avant chaque mise à jour du schéma. Le dossier de sauvegarde peut être un dossier OneDrive : tu obtiens une copie hors de la machine sans que l'app dépende du cloud. La base active reste hors de OneDrive pour éviter les conflits de synchronisation.

---

## 2. Architecture technique

### 2.1 Choix de la stack

| Critère (ordres de grandeur) | Tauri 2 | Electron |
|---|---|---|
| Taille de l'installeur | ~5 à 10 Mo | ~80 à 100 Mo |
| RAM au repos | ~50 à 100 Mo | ~150 à 300 Mo |
| Démarrage | Très rapide (WebView2 est fourni par Windows) | Correct |
| SQLite | `rusqlite`, FTS5 inclus | `better-sqlite3` (module natif) |
| Notifications natives | Plugin officiel | API intégrée |
| Prérequis de développement | Rust + Build Tools C++ de Visual Studio, à installer une fois | Node uniquement |

**Recommandation : Tauri 2.** Tu as mis en avant la légèreté et la rapidité au démarrage, qui sont précisément ses points forts. WebView2 est déjà présent sur ta machine (v153).

**État de ta machine** : Node 24 et Git sont installés. Rust et les Build Tools C++ ne le sont pas. Il faudra les installer une fois (rustup et la charge de travail « Développement Desktop en C++ »), ce qui représente quelques Go.
Si tu préfères ne rien installer, Electron reste viable. Grâce au découpage ci-dessous, seul le pont SQLite (environ 200 lignes) changerait.

### 2.2 Vue d'ensemble

```
┌──────────────────────────── Fenêtre (WebView2) ─────────────────────────────┐
│  UI (React)              pages · composants · design system                 │
│     │ hooks                                                                  │
│  Données (TanStack Query)   cache par clé, invalidation ciblée               │
│     │                                                                        │
│  Domaines (TypeScript)                                                       │
│    model.ts       règles pures : progression, retards, soldes, À surveiller  │
│    service.ts     cas d'usage multi-tables (ex. marquer reçu + transaction)  │
│    repository.ts  SQL uniquement                                             │
│     │ interface Db                                                           │
└─────┼────────────────────────────────────────────────────────────────────────┘
      │ invoke (IPC Tauri)
┌─────▼──────────────── Processus natif (Rust, volontairement fin) ───────────┐
│  db_query · db_execute · db_batch (transaction)  →  rusqlite → cockpit.db   │
│  migrations au démarrage · sauvegarde / restauration                        │
│  plugins : notification · dialog · opener                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Pourquoi un pont SQLite maison plutôt que `tauri-plugin-sql`

Le plugin officiel s'appuie sur un pool de connexions. Une transaction `BEGIN … COMMIT` envoyée en plusieurs appels peut donc s'exécuter sur des connexions différentes, ce qui la rend peu fiable. Or plusieurs opérations doivent être atomiques : marquer un encaissement reçu en créant sa transaction, enregistrer un virement (deux lignes), réordonner des tâches.

Le pont maison apporte :

- **une connexion unique** (mode WAL, `foreign_keys = ON`) ;
- **`db_batch`**, qui exécute une liste d'instructions dans une seule transaction ;
- **des IDs générés côté app** (UUID), si bien qu'une instruction d'un lot n'a jamais besoin de l'ID inséré par la précédente ;
- **une sauvegarde à chaud cohérente** (`VACUUM INTO`) et une restauration contrôlée.

Côté TypeScript, tout passe par une interface :

```ts
export interface Db {
  query<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  execute(sql: string, params?: SqlValue[]): Promise<{ rowsAffected: number }>;
  batch(statements: Statement[]): Promise<void>; // atomique
}
```

Les tests implémentent cette interface avec `node:sqlite` (intégré à Node 24) sur une base en mémoire. Les repositories sont ainsi testés sur leur vrai SQL, sans lancer l'app.

### 2.4 Règles de découpage

- `ui/` ne connaît aucun domaine : ce sont des composants purs, réutilisables.
- Chaque domaine suit le même découpage : `model` → `repository` → `service` → `hooks` → `components` → `pages`.
- **Seuls les fichiers `repository.ts` contiennent du SQL.** Les composants passent uniquement par les hooks.
- Un domaine en utilise un autre via son `index.ts` public. Par exemple, le dashboard lit les domaines projets, tâches, finances et agenda.
- Les règles de calcul sont des fonctions pures dans `model.ts`, testées unitairement.
- La date du jour est toujours passée en paramètre, jamais obtenue par `date('now')` en SQL. Les règles restent ainsi testables et cohérentes partout.

### 2.5 Flux de données

- **Lecture** : chaque vue déclare ses requêtes (`useProjects(filters)`) et TanStack Query les met en cache par clé. Rien n'est chargé tant qu'aucune vue ne le demande.
- **Écriture** : une mutation appelle `db.batch`, puis invalide uniquement les clés touchées. Par exemple, cocher une tâche invalide `tasks`, `project:<id>` et `dashboard`. Les actions fréquentes (cocher, réordonner) utilisent une mise à jour optimiste.
- **Agrégats** : les sommes et comptages sont faits en SQL (`SUM`, `COUNT`, `GROUP BY`), jamais en rechargeant des listes complètes côté JS.

### 2.6 Performance

- La fenêtre ne s'affiche qu'après le premier rendu, ce qui évite le flash blanc. Objectif : une fenêtre utilisable en moins d'une seconde.
- Les pages secondaires (calendrier, planning, finances) sont chargées à la demande.
- Le dashboard repose sur quelques requêtes agrégées et indexées. Toutes les colonnes de filtre et de tri ont un index (§3.3).
- Au-delà d'une centaine de lignes, les listes sont virtualisées et leurs lignes mémoïsées. L'état d'interface est dans Zustand, lu par sélecteurs : ouvrir la palette ne re-rend pas la page.
- Il n'y a pas de bibliothèque lourde de graphiques ni de calendrier tiers. Le calendrier et la timeline sont faits maison, légers et stylés comme le reste.

### 2.7 Données, sauvegarde, sécurité

- La base se trouve dans `%APPDATA%\<identifiant de l'app>\cockpit.db`. Un bouton « Ouvrir le dossier des données » y donne accès.
- Les migrations SQL sont versionnées (`PRAGMA user_version`) et appliquées au démarrage, toujours précédées d'une sauvegarde.
- **Sauvegardes** :
  - automatique, une fois par jour, avec conservation des 14 dernières ;
  - manuelle, via Paramètres › Données › « Sauvegarder mes données… », qui produit un fichier `.db` complet ;
  - restauration, avec vérification d'intégrité et sauvegarde de sécurité de la base actuelle avant remplacement.
- **Exports** : JSON (toutes les données, lisible) et CSV pour les finances (séparateur `;` et BOM UTF-8, pour une ouverture directe dans Excel en français).
- **Sécurité** : aucun contenu distant, une politique CSP stricte et des permissions Tauri minimales.

### 2.8 Notifications (V1.1)

- **Règles**, désactivables une par une :
  - deadline de projet à J-3 et le jour J ;
  - tâche prioritaire due le lendemain ;
  - encaissement prévu le lendemain, ou passé en retard ;
  - début de projet ;
  - événement, 15 minutes avant ;
  - résumé du matin (optionnel).
- **Planification** : les règles sont évaluées au lancement, puis toutes les 5 minutes tant que l'app tourne. La table `notification_log` garantit qu'une même notification n'est jamais envoyée deux fois.
- **Limite** : quand l'app est fermée, aucune notification n'arrive. La V1.2 propose deux options pour y remédier : « rester dans la zone de notification » et « lancer au démarrage de Windows ».

### 2.9 Bibliothèques retenues

| Besoin | Choix | Raison |
|---|---|---|
| Coquille desktop | Tauri 2 | Légère, native, installeur Windows (NSIS) avec raccourcis |
| UI | React 19 + TypeScript strict | — |
| Build | Vite | Rechargement instantané en développement |
| Styles | Tailwind CSS v4 + variables CSS | Tokens centralisés, aucun coût à l'exécution |
| Primitives accessibles | Radix UI (Dialog, Popover, Menu, Tooltip, Select) | Clavier et accessibilité gérés, aucun style imposé |
| Palette Ctrl+K, sélecteurs avec recherche | cmdk | Déjà utilisé pour choisir ou créer un client |
| Routage | TanStack Router | Paramètres de recherche typés (filtres dans l'URL interne) |
| Données | TanStack Query | Cache, invalidation ciblée, mises à jour optimistes |
| État d'interface | Zustand | Sélecteurs fins, pas de re-render global |
| Formulaires | État local + validation pure dans `model.ts` | Formulaires courts : pas besoin de bibliothèque pour l'instant (React Hook Form si l'un d'eux se complexifie) |
| Dates | date-fns + locale `fr` | Modulaire |
| Glisser-déposer | dnd-kit | Réorganisation des tâches, kanban |
| Longues listes | TanStack Virtual | — |
| Icônes | Lucide | Cohérentes et légères |
| SQLite | rusqlite (`bundled`) | FTS5 inclus, une connexion maîtrisée |
| Tests | Vitest (+ `node:sqlite`) | — |

---

## 3. Modèle de données SQLite

### 3.1 Conventions

- **IDs** : `TEXT`, avec un UUID généré par l'app. Cela permet les lots atomiques, simplifie l'import et la fusion, et laisse la porte ouverte à une synchronisation un jour sans refonte.
- **Montants** : en **centimes** (`INTEGER`), donc sans aucune erreur d'arrondi. La devise est l'euro, paramétrable à l'affichage.
- **Dates** : `'YYYY-MM-DD'`. Les dates-heures sont locales (`'YYYY-MM-DDTHH:MM'`) : l'app n'utilise qu'un fuseau horaire et le tri alphabétique correspond au tri chronologique. Les horodatages techniques (`created_at`, `updated_at`) sont en UTC ISO.
- **Priorité** : entier de 0 à 3 (Basse, Normale, Haute, Urgente), ce qui permet de trier directement.
- **Ordre manuel** : `sort_order REAL`. Insérer un élément entre deux autres revient à prendre la moyenne de leurs valeurs ; une renumérotation est faite de temps en temps.
- **Suppression** : un projet se termine ou s'archive. Sa suppression est bloquée tant qu'il a des encaissements, pour ne jamais perdre d'historique financier.

### 3.2 Relations

```
clients ──1:N── projects ──N:1── project_types
   │               │
   │               ├─1:N─ tasks          (project_id NULL = tâche libre)
   │               ├─1:N─ payments ─1:0..1─ transactions  (via payment_id)
   │               ├─1:N─ events         (lien facultatif)
   │               └─1:N─ transactions   (facultatif : dépenses liées au projet)
   └──1:N── payments                      (encaissement sans projet)

accounts ──1:N── transactions ──N:0..1── transaction_categories

Techniques : settings · notification_log · search_index (FTS5)
```

Les « notes » de ta liste sont des champs `notes` sur les projets, tâches, clients et événements. Un journal daté par projet (table `notes`) pourra venir plus tard si le besoin apparaît.

### 3.3 Schéma (future migration `0001_init.sql`)

```sql
-- ─── Référentiels ───────────────────────────────────────────────────────────
CREATE TABLE project_types (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL,                 -- clé de palette : 'blue', 'violet'…
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
-- Une table plutôt que 2 colonnes : un livret ou un 2e compte pro s'ajoute sans migration.

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
               CHECK (status IN ('proposal','planned','active','on_hold','done','cancelled')),
  priority     INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 3),
  start_date   TEXT,
  deadline     TEXT,
  budget_cents INTEGER CHECK (budget_cents >= 0),   -- NULL = pas de budget
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
  project_id     TEXT REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = tâche libre
  title          TEXT NOT NULL,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'todo'
                 CHECK (status IN ('todo','in_progress','done')),
  priority       INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 3),
  scheduled_date TEXT,                         -- « prévue le »
  due_date       TEXT,                         -- deadline
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
              CHECK (kind IN ('appointment','meeting','deadline','personal','other')),
  all_day     INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  starts_at   TEXT NOT NULL,     -- 'YYYY-MM-DD' si all_day, sinon 'YYYY-MM-DDTHH:MM'
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
-- Encaissement : argent attendu (échéance), puis reçu.
CREATE TABLE payments (
  id            TEXT PRIMARY KEY,
  project_id    TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  client_id     TEXT REFERENCES clients(id)  ON DELETE SET NULL,  -- seulement sans projet
  label         TEXT NOT NULL,                  -- « Acompte », « Solde »…
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  due_date      TEXT,                           -- date prévue
  status        TEXT NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned','pending','received')),
  received_date TEXT,
  invoice_ref   TEXT,                           -- n° de facture, facultatif
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CHECK (project_id IS NULL OR client_id IS NULL),              -- le client se déduit du projet
  CHECK ((status = 'received') = (received_date IS NOT NULL))
);
CREATE INDEX idx_payments_project  ON payments(project_id);
CREATE INDEX idx_payments_open     ON payments(due_date)      WHERE status <> 'received';
CREATE INDEX idx_payments_received ON payments(received_date) WHERE status = 'received';

-- Transaction : mouvement réel sur un compte. Montant signé : + entrée, − sortie.
CREATE TABLE transactions (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  kind           TEXT NOT NULL
                 CHECK (kind IN ('income','expense','transfer','adjustment')),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents <> 0),
  date           TEXT NOT NULL,
  label          TEXT NOT NULL,
  category_id    TEXT REFERENCES transaction_categories(id) ON DELETE SET NULL,
  project_id     TEXT REFERENCES projects(id) ON DELETE SET NULL,
  payment_id     TEXT UNIQUE REFERENCES payments(id) ON DELETE SET NULL,
  transfer_group TEXT,            -- partagé par les 2 lignes d'un virement
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
  value TEXT NOT NULL                -- JSON
);

CREATE TABLE notification_log (
  key     TEXT PRIMARY KEY,          -- ex. 'project-deadline:<id>:J-3'
  sent_at TEXT NOT NULL
);

-- ─── Vues de calcul : aucune valeur dérivée n'est stockée ───────────────────
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
```

**Données initiales** :

- Types de projet : Freelance, Mission, Personnel, Scolaire, Associatif, Autre.
- Comptes : Compte personnel, Compte professionnel.
- Catégories de revenus : Revenus client, Autre revenu.
- Catégories de dépenses : Logiciels & abonnements, Matériel, Déplacements, Formation, Frais bancaires, Autre.

Au premier lancement, une seule question est posée : « Quel est le solde actuel de tes comptes ? ». La réponse crée une transaction d'ajustement « Solde initial ».

### 3.4 Valeurs calculées (jamais stockées)

| Valeur | Calcul |
|---|---|
| Progression d'un projet | Tâches terminées ÷ tâches totales (100 % si le projet est terminé ; « — » s'il n'a aucune tâche) |
| Reçu (projet) | Σ encaissements reçus |
| Reste à recevoir (projet) | Budget − reçu |
| % payé | Reçu ÷ budget |
| Non planifié | Budget − Σ de tous les encaissements |
| Encaissement en retard | Non reçu et date prévue < aujourd'hui |
| Projet en retard | Deadline < aujourd'hui et statut ∉ {terminé, annulé} |
| Solde d'un compte | Σ transactions du compte (ajustements inclus) |
| CA encaissé (période) | Σ encaissements reçus dont la date de réception tombe dans la période |
| CA prévu (période) | Σ encaissements non reçus dont la date prévue tombe dans la période |
| Dépenses pro | Σ transactions `expense` des comptes pro (hors virements et ajustements) |
| Tâches d'aujourd'hui | Non terminées et (prévue ≤ aujourd'hui ou deadline ≤ aujourd'hui) |

### 3.5 L'agenda : une seule source pour le calendrier, le planning et le dashboard

```ts
type AgendaItem = {
  key: string;                       // `${source}:${id}:${kind}`
  source: 'event' | 'project' | 'task' | 'payment';
  kind:
    | 'appointment' | 'meeting' | 'deadline' | 'personal' | 'other'   // événements saisis
    | 'project_start' | 'project_deadline'                            // dérivés des projets
    | 'task_due' | 'task_scheduled'                                   // dérivés des tâches
    | 'payment_due';                                                  // dérivé des encaissements
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  projectId?: string;
  color: PaletteKey;
  state?: 'late' | 'soon' | 'done';
  amountCents?: number;
};
```

Une seule requête `UNION ALL` sur une plage de dates renvoie tous les éléments en un aller-retour. Le calendrier, les « Prochains jours » du dashboard, le planning et les notifications consomment tous ce même flux.

### 3.6 Recherche globale (FTS5)

```sql
CREATE VIRTUAL TABLE search_index USING fts5(
  entity    UNINDEXED,        -- 'project' | 'task' | 'client' | 'event' | 'payment' | 'transaction'
  entity_id UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Maintenu par des triggers (exemple pour les projets ; même principe ailleurs)
CREATE TRIGGER projects_ai AFTER INSERT ON projects BEGIN
  INSERT INTO search_index (entity, entity_id, title, body)
  VALUES ('project', NEW.id, NEW.name,
          COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.notes, ''));
END;
```

- La recherche par préfixe fonctionne (« marc » trouve « Marchal ») et ignore les accents (« echeance » trouve « échéance »).
- Les résultats sont groupés par type. Quand un client ou un projet correspond, ses éléments liés (tâches, encaissements, événements) remontent aussi grâce à une seconde requête par jointure.
- La palette Ctrl+K combine cette recherche et des commandes (« Nouvelle tâche », « Aller au calendrier », « Marquer reçu… »).

---

## 4. Arborescence du projet

```
gestion_projets/
├─ src-tauri/                         # Coquille native (Rust, volontairement fine)
│  ├─ src/
│  │  ├─ main.rs                      # point d'entrée
│  │  ├─ lib.rs                       # enregistrement des plugins et commandes
│  │  ├─ db/
│  │  │  ├─ mod.rs                    # connexion unique, PRAGMAs, commandes query/execute/batch
│  │  │  ├─ migrations.rs             # application des migrations (PRAGMA user_version)
│  │  │  └─ convert.rs                # conversion valeurs SQLite <-> JSON
│  │  └─ backup.rs                    # VACUUM INTO, rotation, restauration
│  ├─ migrations/
│  │  └─ 0001_init.sql
│  ├─ capabilities/default.json       # permissions Tauri minimales
│  ├─ icons/
│  ├─ Cargo.toml
│  └─ tauri.conf.json
│
├─ src/
│  ├─ main.tsx
│  ├─ app/
│  │  ├─ App.tsx                      # providers : QueryClient, Router, thème
│  │  ├─ router.tsx                   # routes, chargées à la demande
│  │  ├─ shortcuts.ts                 # registre des raccourcis clavier
│  │  └─ shell/                       # AppShell, Sidebar, Topbar, QuickAddMenu
│  │
│  ├─ core/                           # socle technique, sans métier
│  │  ├─ db/
│  │  │  ├─ client.ts                 # interface Db + implémentation Tauri (invoke)
│  │  │  └─ sql.ts                    # helpers (placeholders, lots, mapping des lignes)
│  │  ├─ money.ts                     # centimes <-> affichage fr-FR
│  │  ├─ dates.ts                     # aujourd'hui, dates relatives, semaines (date-fns/fr)
│  │  ├─ ids.ts                       # génération des UUID
│  │  └─ query-keys.ts                # clés TanStack Query centralisées
│  │
│  ├─ domains/                        # 1 dossier = 1 domaine métier
│  │  ├─ projects/
│  │  │  ├─ index.ts                  # API publique du domaine
│  │  │  ├─ model.ts                  # types, schémas Zod, règles pures
│  │  │  ├─ repository.ts             # SQL uniquement
│  │  │  ├─ service.ts                # cas d'usage (création avec échéancier…)
│  │  │  ├─ hooks.ts                  # useProjects, useProject, useCreateProject…
│  │  │  ├─ components/               # ProjectRow, ProjectForm, ProjectProperties…
│  │  │  └─ pages/                    # ProjectsPage, ProjectDetailPage
│  │  ├─ tasks/                       # même découpage + TaskList, TaskBoard, TaskSheet
│  │  ├─ clients/
│  │  ├─ finance/
│  │  │  ├─ accounts/                 # soldes, ajustements, virements
│  │  │  ├─ payments/                 # encaissements, échéanciers
│  │  │  ├─ transactions/
│  │  │  └─ pages/FinancesPage.tsx
│  │  ├─ agenda/                      # AgendaItem (agrégation) + événements
│  │  │  ├─ calendar/                 # MonthView, WeekView, DayView
│  │  │  └─ timeline/                 # PlanningPage (Gantt simplifié)
│  │  ├─ dashboard/                   # requêtes agrégées + sections du cockpit
│  │  ├─ search/                      # FTS5 + CommandPalette
│  │  ├─ notifications/               # règles, planificateur, envoi natif
│  │  ├─ data/                        # sauvegarde, restauration, exports JSON/CSV
│  │  └─ settings/
│  │
│  ├─ ui/                             # design system, aucune logique métier
│  │  ├─ primitives/                  # Button, IconButton, Input, Textarea, Select, Checkbox, Kbd, Tooltip
│  │  ├─ overlays/                    # Dialog, Sheet, Popover, Menu, Toast
│  │  ├─ data/                        # ListRow, VirtualList, ProgressBar, StatusDot, PriorityIcon, Amount, RelativeDate
│  │  ├─ pickers/                     # DatePicker, AmountInput, Combobox
│  │  └─ layout/                      # PageHeader, Section, EmptyState, SplitView
│  │
│  └─ styles/
│     ├─ tokens.css                   # variables : couleurs, typo, espacements, rayons, ombres
│     ├─ fonts/                       # Inter (embarquée, pas de réseau)
│     └─ global.css
│
├─ tests/                             # Vitest : règles métier + repositories sur SQLite en mémoire
├─ docs/
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

---

## 5. Pages et composants

### 5.1 Navigation

**Sidebar** (232 px, réductible à 56 px avec Ctrl+B) :

- Aujourd'hui (dashboard), Projets, Tâches, Calendrier, Planning, Finances ;
- une section « Projets en cours » pour accéder directement à chaque projet (pastille couleur du type) ;
- en bas, Clients et Paramètres.

La « Vue globale » de ta liste devient **Planning** (la timeline), puisque le dashboard joue déjà le rôle de vue globale. La sidebar utilise des icônes Lucide plutôt que des emojis, pour un rendu plus net et plus sobre.

**Raccourcis clavier** :

| Raccourci | Action |
|---|---|
| `Ctrl K` | Rechercher ou lancer une commande |
| `C` | Menu Créer, puis `T` tâche · `P` projet · `L` client · `R` encaissement · `D` transaction (plus tard `E` événement) |
| `N` (ou `Ctrl N`) | Nouvelle tâche (l'action la plus fréquente) ; dans une fiche projet, elle est rattachée au projet |
| `Ctrl 1` … `Ctrl 6` | Aller aux pages principales |
| `Ctrl B` | Réduire / déplier la sidebar |
| `↑ ↓` · `Entrée` · `Espace` | Parcourir une liste · ouvrir · cocher la tâche |
| `Suppr` | Supprimer, avec « Annuler » dans le toast (`Ctrl Z`) |
| `?` | Afficher tous les raccourcis |

### 5.2 Pages

**Dashboard « Aujourd'hui »** (voir la maquette, version aérée) :

- **En-tête** : la date et une phrase de synthèse courte (« 5 tâches aujourd'hui, dont 1 en retard · rendez-vous à 14:00 »).
- **4 chiffres clés**, sans cartes ; les chiffres secondaires sont en sous-titre :
  - compte pro (avec les dépenses pro du mois) ;
  - compte perso (avec la variation du mois) ;
  - à recevoir (avec le montant en retard) ;
  - encaissé ce mois (avec le prévu sur 30 jours).
- **4 blocs**, lus dans l'ordre des questions du §1.1 :
  1. **Aujourd'hui** : les tâches à cocher sur place, celles en retard en tête. Chaque ligne affiche seulement le titre, le projet et une date quand elle compte (retard, deadline proche). Les tâches terminées sont repliées.
  2. **À surveiller** : 3 points au maximum, les plus graves d'abord (règles de P11), puis un lien « N autres points ». L'action directe apparaît au survol.
  3. **Prochains jours** : l'agenda des 7 prochains jours (rendez-vous, deadlines, encaissements attendus, débuts de projet), groupé par jour.
  4. **Projets en cours** : nom, barre de progression, deadline.
- Il n'y a pas de liste « À recevoir » séparée : le total est dans les chiffres clés, les prochains paiements sont dans l'agenda, et le détail est sur la page Finances.

**Projets** :

- Liste dense, sans cartes. Chaque ligne affiche la pastille du type, le nom, le client, le statut, une barre de progression, la deadline relative et le rapport reçu / budget.
- Filtres en pastilles : Tous · chaque type · Propositions · À venir · Terminés.
- Tri, regroupement par statut, création directement dans la liste.

**Projet (détail)**, en deux colonnes comme une fiche :

- **Colonne principale** : titre et description éditables, tâches (bascule Liste / Kanban, ajout sur place, glisser-déposer), notes.
- **Panneau de propriétés**, toutes éditables sur place :
  - statut, type, client, priorité, dates, progression ;
  - **Finances** : budget, reçu, restant, % payé, non planifié, liste des encaissements (« Marquer reçu » en un clic), dépenses liées ;
  - prochains événements.

**Tâches** :

- Vues Aujourd'hui · 7 prochains jours · En retard · Prioritaires · Toutes · Terminées.
- Regroupement par projet ou par date, filtre par type de projet.
- Un clic ouvre un panneau latéral d'édition (TaskSheet) sans quitter la liste. Le kanban est aussi disponible.

**Calendrier** :

- Vues Mois / Semaine / Jour, éléments colorés selon leur source.
- Filtres : événements, deadlines, tâches, encaissements.
- Un clic sur un créneau vide crée un événement pré-rempli. La navigation (← →, `T` pour aujourd'hui) se fait au clavier.

**Planning** (V1.1) :

- Une ligne par projet en cours ou à venir, avec une barre du début à la deadline, une ligne « aujourd'hui » et des losanges pour les encaissements.
- En haut, une **bande de densité** montre le nombre de projets simultanés par semaine : les chevauchements se voient d'un coup d'œil.
- Zoom par mois ou par trimestre.

**Finances** :

- **En-tête** : les soldes (un clic permet de corriger le solde, ce qui crée un ajustement), le montant à recevoir, les retards, l'encaissé du mois et les dépenses pro du mois.
- **Onglets** :
  - Encaissements : À recevoir · Reçus · En retard ;
  - Transactions : filtres par compte, type, catégorie et mois, export CSV.

**Clients** : une liste et une fiche avec les coordonnées, les projets, le total encaissé et le montant à recevoir.

**Paramètres** :

- Général : devise, premier jour de la semaine, thème.
- Notifications.
- Types de projet & catégories.
- Données : sauvegarder, restaurer, exporter, choisir le dossier des sauvegardes, ouvrir le dossier des données.
- Raccourcis.

### 5.3 Éléments globaux (superposés à toutes les pages)

- **CommandPalette** (Ctrl+K) : recherche et commandes dans la même liste.
- **QuickAdd** (« + Nouveau » ou `C`) : un seul dialogue avec les onglets Tâche · Projet · Événement · Encaissement · Transaction.
  - Les champs essentiels viennent d'abord, les autres sont derrière « Plus d'options ».
  - Le contexte courant pré-remplit le formulaire : depuis une page projet, le projet est déjà sélectionné.
- **TaskSheet** : panneau latéral d'édition d'une tâche.
- **Toasts** avec « Annuler » après une suppression ou un changement de statut.

### 5.4 Composants transverses (`ui/`)

| Catégorie | Composants |
|---|---|
| Actions et saisie | `Button` (primaire / secondaire / discret / danger), `IconButton`, `Input`, `Textarea`, `Select`, `Checkbox` (rond, pour les tâches), `Kbd` |
| Données | `ListRow`, `VirtualList`, `ProgressBar` (4 px), `StatusDot`, `PriorityIcon`, `Amount` (formatage et signe), `RelativeDate` |
| Sélecteurs | `DatePicker` (raccourcis « auj. », « demain », « +3j »), `AmountInput`, `Combobox` (client, projet) |
| Superpositions | `Dialog`, `Sheet`, `Popover`, `Menu`, `Tooltip` (avec raccourci), `Toast` |
| Mise en page | `PageHeader`, `Section`, `EmptyState`, `SplitView` |

---

## 6. Design system

### 6.1 Principes

1. **Des listes plutôt que des cartes.** Les sections sont séparées par de l'espace et des filets fins. Les ombres sont réservées à ce qui flotte : menus, dialogues, palette.
2. **La couleur porte un sens et ne sert pas de décoration.** L'interface est en niveaux de gris. Le rouge signale un retard, l'ambre ce qui arrive bientôt, le vert ce qui est reçu ou terminé. Les types de projet ont une pastille de 8 px, jamais de grands aplats.
3. **Peu d'informations à la fois, beaucoup d'espace.** Chaque écran montre peu de blocs, et chaque ligne n'affiche que l'essentiel ; le détail est à un clic ou au survol. Une même information n'apparaît pas deux fois sur un écran. Le texte courant fait 14 px, les lignes 44 px, et les blocs sont séparés par 56 à 64 px. Les seuls grands chiffres sont les montants clés du dashboard.
4. **Tout est éditable sur place.** Un clic sur un statut ouvre un menu ; il n'y a pas de formulaire « Modifier » en plein écran.
5. **Le clavier fonctionne partout.** Chaque action a un raccourci, affiché dans les infobulles et les menus.
6. **Le mouvement reste minimal.** Seuls les éléments qui apparaissent sont animés (120 à 160 ms), et il n'y a aucune transition de page.

### 6.2 Tokens

**Couleurs**

| Token | Clair | Sombre | Usage |
|---|---|---|---|
| `--bg` | `#FAFAF9` | `#121214` | Fond de l'app |
| `--bg-sidebar` | `#F3F3F1` | `#0D0D0F` | Sidebar |
| `--bg-elevated` | `#FFFFFF` | `#1A1A1E` | Champs, menus, dialogues |
| `--bg-hover` | `#EFEFEC` | `#1D1D21` | Survol |
| `--bg-active` | `#E7E7E3` | `#26262B` | Sélection |
| `--border` | `#E7E6E3` | `#232328` | Filets |
| `--border-strong` | `#D3D2CE` | `#34343A` | Contours de champs, cases à cocher |
| `--text` | `#1C1C1A` | `#ECECEE` | Texte principal ; aussi le fond du bouton principal (monochrome) |
| `--text-2` | `#62615C` | `#A3A3AB` | Texte secondaire |
| `--text-3` | `#9A9892` | `#6E6E77` | Métadonnées, placeholders |
| `--accent` | `#3E63DD` | `#7C9CFF` | Focus, sélection, « aujourd'hui », tâche cochée |
| `--danger` | `#D13B3B` | `#F0716B` | En retard |
| `--warning` | `#B7791F` | `#E5AC45` | Bientôt (≤ 3 jours) |
| `--success` | `#2F9E62` | `#52C48A` | Reçu, terminé |

**Palette des types de projet** (pastilles uniquement) : slate `#8B8D98`, blue `#3E7BFA`, violet `#8A63D2`, pink `#D6589A`, red `#DC5050`, orange `#E07B39`, amber `#D4A018`, green `#3AA56B`, teal `#2A9D9A`.

**Typographie** : Inter Variable, embarquée localement (aucun appel réseau), avec Segoe UI Variable en police de repli. Les montants et les dates utilisent des chiffres tabulaires (`font-variant-numeric: tabular-nums`) pour qu'ils restent alignés.

| Rôle | Taille / graisse |
|---|---|
| Métadonnées, raccourcis | 12,5 px / 400 |
| Texte courant, lignes de liste | 14 px / 400 (500 pour l'emphase) |
| Titres de section | 14 px / 600 |
| Titre de page | 20 px / 600 |
| Chiffres clés du dashboard | 22 px / 500, chiffres tabulaires |

**Espacements** : grille de 4 px (4 · 8 · 12 · 16 · 24 · 32 · 48 · 64). Lignes de liste : 44 px. Espace entre blocs : 56 à 64 px.

**Rayons** : 4 px pour les pastilles et touches, 6 px pour les boutons, champs et lignes, 8 px pour les menus, 12 px pour les dialogues et la palette.

**Ombres** : réservées aux superpositions, `0 0 0 1px var(--border), 0 16px 40px -12px rgb(0 0 0 / .25)`.

**Mouvement** : 120 ms au survol et au clic, 150 ms à l'apparition (opacité + décalage de 4 px), 100 ms à la disparition, courbe `cubic-bezier(.2,.8,.2,1)`. Le réglage `prefers-reduced-motion` est respecté.

**Mise en page** : sidebar de 232 px (56 px réduite), barre supérieure de 56 px. Le contenu est centré avec une largeur maximale de 1120 px et des marges de 48 px. Le dashboard est en deux colonnes (`1.5fr / 1fr`) et passe en une seule sous 1180 px.

### 6.3 Règles d'écriture et de format

- **Montants** : `1 500 €`, `4 280,50 €` (centimes affichés seulement s'ils existent). Les mouvements ont un signe explicite : `+2 000 €`, `−35 €`.
- **Dates** : relatives quand elles sont proches (« aujourd'hui », « demain », « dans 4 j », « il y a 2 j »), absolues au-delà (« 10 oct. »). La date complète s'affiche au survol.
- **Ton** : français, phrases courtes, boutons qui commencent par un verbe (« Créer le projet »), pas de points d'exclamation.
- **États vides** : une phrase et une action, avec son raccourci (« Aucune tâche aujourd'hui. Ajouter une tâche `Ctrl N` »).

---

## 7. Plan de développement (étape 7)

Chaque jalon aboutit à une version utilisable, développée sur sa branche Git (`jalon-N-…`), puis fusionnée dans `main` et publiée. Les règles métier de chaque jalon sont couvertes par des tests.

### 7.1 Vue d'ensemble

| Jalon | Statut | Contenu | Terminé quand… |
|---|---|---|---|
| **0. Socle** | ✓ Fait | Tauri + React + TS, design system, AppShell, pont SQLite, migration 0001, sauvegarde auto, base de dev séparée | L'app s'ouvre depuis un raccourci Windows, la base est dans AppData |
| **1. Projets & clients** | ✓ Fait | Création avec échéancier (P3), liste filtrable, fiche éditable sur place, types personnalisables, clients créés à la volée, « À surveiller » | Je peux saisir, filtrer et modifier mes vrais projets |
| **2. Tâches** | ✓ Fait | Tâches de projet et libres, 6 vues, liste réordonnable + kanban, panneau latéral, ajout express, touche N, bloc Aujourd'hui du dashboard | « Aujourd'hui » reflète exactement ce que j'ai à faire |
| **3. Finances** | ✓ Fait | Comptes et soldes, encaissements complets, transactions, virements, lien « reçu → transaction », page Finances | Soldes, à recevoir et retards justes sans aucune double saisie |
| **4. Calendrier** | À faire | Événements, agrégation des dates (P8), vues mois / semaine / jour | Toutes mes dates au même endroit, sans doublon |
| **5. Dashboard final** | À faire | Chiffres clés, « Prochains jours », finitions | Les 5 questions du §1.1 ont leur réponse en quelques secondes |
| **6. Vitesse & données** | À faire | Palette Ctrl+K (FTS5), Paramètres › Données (sauvegarder, restaurer), aide des raccourcis | Toute action courante en moins de 3 secondes ; données restaurables → **MVP** |
| **V1.1** | Plus tard | Planning (timeline), notifications Windows, exports JSON / CSV, paramètres complets | |
| **V1.2 et après** | Si besoin | Zone de notification et démarrage auto, raccourci global, événements récurrents, CA par mois / trimestre (URSSAF), sous-tâches | Selon l'usage réel |

### 7.2 Détail des jalons restants

#### Jalon 4 — Calendrier

**Déjà en place** : table `events` (migration 0001). Les listes d'encaissements (`finance/payments/repository.ts`) donnent déjà projet, client et couleur de chaque échéance.

**À construire** :
- **Événements** : titre, type (rendez-vous, réunion, échéance libre, perso, autre), journée entière ou heures de début et de fin, lieu, notes, projet facultatif. Création, édition sur place et suppression avec « Annuler ».
- **Agrégation (P8, §3.5)** : `src/domains/agenda/` fournit le type `AgendaItem` et `listAgenda(db, from, to)`.
  - Une seule requête `UNION ALL` réunit les événements, les débuts et deadlines de projets, les tâches (deadline, ou date prévue si prioritaire) et les échéances d'encaissement non reçues.
  - Aucune date n'est recopiée : décaler une deadline la fait bouger partout.
- **Vues** :
  - **Mois** : grille de 6 × 7, 3 éléments au plus par jour puis « +N » ;
  - **Semaine** : colonnes jours, créneaux horaires, éléments « journée » en haut ;
  - **Jour**.
- **Navigation** : ← → et `T` pour revenir à aujourd'hui. Des filtres par source (événements, deadlines, tâches, encaissements) sont disponibles.
- **Interactions** :
  - un clic sur un jour vide crée un événement pré-rempli ;
  - un clic sur un élément ouvre sa source : fiche projet, panneau de tâche, encaissement ou événement.
- **Menu Nouveau** : `E` pour un événement.

**Tests attendus** : agrégation sur une plage de dates, sans doublon, avec les tâches terminées et les encaissements reçus exclus.

#### Jalon 5 — Dashboard final

**Déjà en place** :
- date et synthèse ;
- Aujourd'hui (tâches) ;
- À surveiller (règles P11, 3 points au plus) ;
- Projets en cours / À venir.

**À construire** :
- **4 chiffres clés**, comme sur la maquette. Les données existent : `getFinanceSummary` (`finance/repository.ts`) et l'en-tête `FinanceFigures` de la page Finances, à réutiliser :
  - compte pro, avec les dépenses pro du mois ;
  - compte perso, avec la variation du mois ;
  - à recevoir, avec le montant en retard ;
  - encaissé ce mois, avec le prévu sur 30 jours.
- **À surveiller** : ajouter l'action directe « Marquer reçu » au survol d'un encaissement en retard (le dialogue global `useReceiveDialog` existe).
- **Prochains jours** : l'agenda des 7 prochains jours (données du jalon 4), groupé par jour, entre « Aujourd'hui » et « Projets ».
- **Vérification** : les 5 questions du §1.1 ont leur réponse sans défilement sur un écran 1080p à 125 %. Toujours viser **peu d'informations, beaucoup d'espace** (§6.1, principe 3).

#### Jalon 6 — Vitesse & données (→ MVP)

- **Palette Ctrl+K** (cmdk, déjà installé) :
  - recherche globale via FTS5, avec une **migration 0002** qui crée `search_index` et ses triggers (§3.6) ;
  - commandes : aller à une page, créer, marquer reçu…
  - Attention : en mode navigateur, sql.js n'inclut peut-être pas FTS5. Il faudra le vérifier et prévoir un repli `LIKE` dans ce mode.
- **Paramètres › Données** :
  - « Sauvegarder maintenant » : nouvelle commande Rust `backup_create` vers un fichier choisi (plugin `dialog`) ;
  - « Restaurer » : vérification `PRAGMA integrity_check` et `user_version`, sauvegarde de sécurité de la base actuelle, remplacement puis redémarrage ;
  - choix du dossier des sauvegardes (un dossier OneDrive est possible, P12) ;
  - « Ouvrir le dossier des données » (plugin `opener`).
- **Raccourcis** : `?` affiche l'aide des raccourcis. « Annuler » est généralisé aux suppressions.
- **Livraison du MVP** : installeur à jour, publié en Release GitHub si souhaité.

#### V1.1

- **Planning** : une ligne par projet en cours ou à venir, une barre du début à la deadline, une ligne « aujourd'hui », des losanges pour les encaissements, une bande de densité (projets simultanés par semaine) et un zoom mois / trimestre.
- **Notifications Windows** : plugin `notification`, règles du §2.8, dédoublonnage par `notification_log`, chacune désactivable.
- **Exports** : JSON (toutes les données) et CSV pour les finances (séparateur `;`, BOM UTF-8). Les fichiers sont nommés `cockpit-export-…` : ce motif est ignoré par Git.
- **Paramètres complets** :
  - thème forcé clair ou sombre (`data-theme`, déjà prévu dans `tokens.css`) ;
  - premier jour de la semaine ;
  - mémorisation de la taille et de la position de la fenêtre (plugin `window-state`).

### 7.3 Points à reprendre, issus des jalons terminés

- **Sélecteur de date natif** : un clic au milieu du champ commence la saisie par le mois. À remplacer par un `DatePicker` maison avec raccourcis (« auj. », « demain », « +3j »).
- **Ctrl+N** : non vérifié dans la fenêtre WebView2. La touche `N` seule fonctionne partout.
- **Réordonnancement au clavier** : les tâches ne se réordonnent pas au clavier (piste : Alt+↑ / Alt+↓).
- **Clients** : pas encore d'archivage.
- **Erreurs dans les fenêtres globales** : une erreur dans une fenêtre globale (création, panneau de tâche) remplace toute l'app par l'écran d'erreur. Il faudrait des « error boundaries » locales.
- **Comptes** : seuls les deux comptes de départ existent. Ni création, ni renommage, ni archivage dans l'interface (la table le permet déjà).
- **Clients** : la fiche n'affiche pas encore le total encaissé ni le montant à recevoir (§5.2).
- **Export CSV des transactions** : prévu avec les exports (V1.1).

**Choix faits au jalon 3**, à confirmer à l'usage :
- La question « Quel est le solde actuel de tes comptes ? » est posée en haut de la page Finances (pas au démarrage), tant qu'aucun ajustement n'existe ; « Plus tard » la masque jusqu'à la prochaine visite. Le réglage `finance.initialBalancesAsked` retient qu'on y a répondu.
- L'écart d'un ajustement est calculé par SQLite au moment de l'écriture, jamais à partir du solde affiché. Un solde négatif (découvert) est accepté.
- Le revenu créé à la réception reprend le libellé de l'encaissement (suivi du client s'il n'a pas de projet) et la catégorie « Revenus client ». Modifier le montant ou la date de réception d'un encaissement reçu met à jour cette transaction. Modifier la transaction seule reste possible (frais bancaires) : les deux montants peuvent alors différer.
- Supprimer un encaissement supprime sa transaction liée, et « Annuler » remet les deux. Annuler une réception ramène l'encaissement à « En attente » s'il a un n° de facture, sinon à « Prévu ».
- Un virement modifié est réécrit (ses deux lignes sont remplacées dans le même lot). Sans filtre de compte, la liste ne le montre qu'une fois.
- Une catégorie utilisée par des transactions ne se supprime pas, comme un type de projet utilisé.

---

## 8. Décisions prises (24 septembre 2026)

1. **Stack** : Tauri 2. Rust et les Build Tools C++ sont installés sur la machine de développement.
2. **Propositions P1 à P12** : retenues (aucune objection).
3. **Thème par défaut** : celui du système.
4. **Nom** : Cockpit.
5. **Densité** : la première maquette montrait trop d'informations d'un coup. Le dashboard passe à 4 chiffres clés et 4 blocs, avec des lignes allégées et plus d'espace (§5.2 et §6).
