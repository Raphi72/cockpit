# Cockpit — Dossier de conception (étapes 1 à 6)

> **Cockpit** est un nom de travail.
> Ce document fixe le besoin, l'architecture, le modèle de données, l'arborescence, les pages et le design system **avant d'écrire du code**.
> Statut : **validé** (voir §8). Jalons 0 à 6 terminés le 25/09/2026 : c'est le **MVP**. V1.1 en cours, par étapes (§7.2) : étapes 1 à 4 faites.
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
| 3 | Qu'est-ce qui dérape ? | Dashboard › Deadlines (V1.1) et À surveiller |
| 4 | Où en sont mes projets ? | Dashboard › Projets en cours, page Projets |
| 5 | Combien j'ai et combien on me doit ? | Bandeau de chiffres du dashboard, page Finances |

Tout le reste (saisie, détail, historique) est secondaire et doit rester à une ou deux actions.

### 1.2 Fonctionnalités et découpage

| Domaine | MVP | V1.1 | Plus tard, si l'usage le demande |
|---|---|---|---|
| Projets | CRUD, types personnalisables, statuts, filtres, page détail, progression automatique | Idées (notées pour plus tard, transformables en tâche), archivage, duplication | Modèles de projet |
| Tâches | Tâches de projet **et** tâches libres, liste + kanban, réorganisation, vues Aujourd'hui / Semaine / Retard / Prioritaires / Terminées | Saisie rapide sur plusieurs lignes | Sous-tâches, tâches récurrentes |
| Clients | Fiche simple (nom, contact, notes) et projets liés | Historique du CA par client | — |
| Finances | Comptes perso/pro, encaissements (échéancier), transactions, virements, ajustement de solde | Export CSV, catégories éditables | CA encaissé par mois/trimestre, estimation des cotisations |
| Calendrier | Mois / semaine / jour, événements, agrégation des dates des projets, tâches et paiements | Glisser pour replanifier | Événements récurrents, Google Agenda en lecture seule (V2) |
| Planning | — | Timeline type Gantt avec bande de densité | — |
| Dashboard | Cockpit complet (§5.2) | Tâches de jour en jour (flèches), tâches dans Prochains jours, sections réglables | — |
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
La date « prévue le » (affichée « Début » depuis la V1.1) indique quand tu comptes faire la tâche et alimente la vue Aujourd'hui. La « deadline » indique quand elle doit être finie. Une tâche prévue hier et non faite reste dans Aujourd'hui, comme un report. Une deadline seule ne fait pas entrer la tâche dans Aujourd'hui avant le jour même : elle est « À prévoir » (V1.1).
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
*V1.1, étape 3* : les deux règles de deadline ont désormais leur propre bloc, « Deadlines » (§5.2). La règle « sans activité depuis 14 jours » n'est pas encore écrite.

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
  - restauration, avec vérification d'intégrité et sauvegarde de sécurité de la base actuelle avant remplacement ;
  - le dossier des sauvegardes peut être choisi (OneDrive…) ; s'il devient injoignable, les sauvegardes retombent dans le dossier par défaut et Paramètres le signale.
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
- **Limite** : quand l'app est fermée, aucune notification n'arrive. La V2 propose deux options pour y remédier : « rester dans la zone de notification » et « lancer au démarrage de Windows ».

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
| Glisser-déposer | dnd-kit (`@dnd-kit/core`) | Arbre des tâches et idées de la fiche projet, kanban, calendrier |
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
   │               ├─1:N─ tasks          (project_id NULL = tâche libre ; parent_id : sous-tâche, V1.1)
   │               ├─1:N─ ideas          (V1.1 : idées pour plus tard)
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

**Ajouts après le MVP** (une migration par ajout, jamais de modification d'une migration publiée) :

```sql
-- 0003_ideas.sql (V1.1) : une idée n'est pas une tâche ; elle en devient une le moment venu.
CREATE TABLE ideas (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
-- + index (project_id, created_at) et triggers de recherche (entité 'idea').

-- 0004_subtasks.sql (V1.1) : sous-tâches sur un seul niveau, la parente sert de catégorie.
ALTER TABLE tasks ADD COLUMN parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;
-- + index (parent_id, sort_order) ; project_progress recréée : une tâche qui a des
--   sous-tâches ne compte pas elle-même, ce sont ses sous-tâches qui comptent.
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
| Progression d'un projet | Tâches terminées ÷ tâches totales, sans compter une tâche qui a des sous-tâches (ses sous-tâches comptent à sa place) ; 100 % si le projet est terminé ; « — » s'il n'a aucune tâche |
| Reçu (projet) | Σ encaissements reçus |
| Reste à recevoir (projet) | Budget − reçu |
| % payé | Reçu ÷ budget |
| Non planifié | Budget − Σ de tous les encaissements |
| Encaissement attendu | Non reçu, et pas lié à un projet en Proposition (un devis non signé n'est pas de l'argent dû) |
| Encaissement en retard | Attendu et date prévue < aujourd'hui |
| Projet en retard | Deadline < aujourd'hui et statut ∉ {terminé, annulé} |
| Solde d'un compte | Σ transactions du compte (ajustements inclus) |
| CA encaissé (période) | Σ encaissements reçus dont la date de réception tombe dans la période |
| CA prévu (période) | Σ encaissements non reçus dont la date prévue tombe dans la période |
| Dépenses pro | Σ transactions `expense` des comptes pro (hors virements et ajustements) |
| Tâches d'aujourd'hui | Non terminées et (début ≤ aujourd'hui ou deadline ≤ aujourd'hui) |
| Statut du jour d'un projet | « À venir » et date de début ≤ le jour regardé → « En cours » ; sinon le statut choisi (`statusOn`, et `STATUS_ON` en SQL) |
| Deadlines du dashboard | Deadlines de projets (en retard comprises), de tâches et événements « Échéance » d'aujourd'hui à J+7 (`selectDeadlines`) |
| À prévoir | Non terminées, sans début, deadline dans les 7 prochains jours (pas aujourd'hui) |
| Texte d'une deadline | « En retard de 3 jours », « Aujourd'hui » (rouge), « Demain », « Dans 3 jours » (ambre), « Dans 6 jours » (bleu, jusqu'à 7), puis la date, « Terminée » (vert) : `core/deadline.ts` |

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
- L'index est rempli par la migration `0002_search.sql` et tenu à jour par des triggers : l'app n'y écrit jamais. Une nouvelle table cherchable doit y ajouter ses triggers (dans une nouvelle migration).
- Un virement n'est indexé qu'une fois (sa ligne de sortie).
- En mode navigateur de développement, sql.js n'a pas FTS5 : l'index y est une table ordinaire et la recherche passe par `LIKE` (sans ignorer les accents). Voir `core/db/fts-fallback.ts`.

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
│  │  ├─ backup.rs                    # VACUUM INTO, rotation, vérification et restauration
│  │  └─ data.rs                      # commandes de Paramètres › Données (fenêtres de fichier natives)
│  ├─ migrations/
│  │  ├─ 0001_init.sql
│  │  └─ 0002_search.sql              # index FTS5 et ses triggers
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
| `C` | Menu Créer, puis `T` tâche · `E` événement · `P` projet · `L` client · `R` encaissement · `D` transaction |
| `N` (ou `Ctrl N`) | Nouvelle tâche (l'action la plus fréquente) ; dans une fiche projet, elle est rattachée au projet |
| `Ctrl 1` … `Ctrl 6` | Aller aux pages principales |
| `Ctrl B` | Réduire / déplier la sidebar |
| `↑ ↓` · `Entrée` · `Espace` | Parcourir une liste · ouvrir · cocher la tâche |
| `← →` · `T` · `M` `S` `J` | Calendrier : période précédente ou suivante, aujourd'hui, vue mois, semaine ou jour |
| `← →` · `T` | Dashboard : tâches du jour précédent ou suivant, retour à aujourd'hui |
| `Suppr` | Supprimer, avec « Annuler » dans le toast (`Ctrl Z`) |
| `Ctrl clic` · `Maj clic` | Sélectionner plusieurs tâches (puis `Échap` pour vider, `Suppr` pour les supprimer) |
| `?` | Afficher tous les raccourcis |

### 5.2 Pages

**Dashboard « Aujourd'hui »** (voir la maquette, version aérée) :

- **En-tête** : la date, entre deux flèches pour voir les tâches d'un autre jour (V1.1), le calendrier pour aller à un jour précis (`D`, V1.1), et une phrase de synthèse courte (« 5 tâches aujourd'hui, dont 1 en retard · rendez-vous à 14:00 »).
- **4 chiffres clés**, sans cartes ; les chiffres secondaires sont en sous-titre :
  - compte pro (avec les dépenses pro du mois) ;
  - compte perso (avec la variation du mois) ;
  - à recevoir (avec le montant en retard) ;
  - encaissé ce mois (avec le prévu sur 30 jours).
- **5 blocs**, lus dans l'ordre des questions du §1.1 :
  1. **Aujourd'hui** : les tâches à cocher sur place, celles en retard en tête. Chaque ligne affiche seulement le titre, le projet et une date quand elle compte (retard, deadline proche). Les tâches terminées sont repliées.
  2. **Deadlines** (V1.1) : tout ce qui doit être fini d'ici 7 jours (projets, tâches, échéances), avec un compte à rebours coloré ; « Prévoir… » pour une tâche qui n'a pas encore de début.
  3. **À surveiller** : 3 points au maximum, les plus graves d'abord (règles de P11, sans les deadlines depuis la V1.1), puis un lien « N autres points ». L'action directe apparaît au survol.
  4. **Prochains jours** : l'agenda des 7 prochains jours (rendez-vous, encaissements attendus, débuts de projet) et, à partir de demain, les tâches prévues (V1.1), groupé par jour.
  5. **Projets en cours** : nom, barre de progression, deadline ; puis les projets à venir. Ils suivent le jour affiché (V1.1). Les Propositions n'apparaissent nulle part sur le dashboard (V1.1).
- Il n'y a pas de liste « À recevoir » séparée : le total est dans les chiffres clés, les prochains paiements sont dans l'agenda, et le détail est sur la page Finances.

**Projets** :

- Liste dense, sans cartes. Chaque ligne affiche la pastille du type, le nom, le client, le statut, une barre de progression, la deadline relative et le rapport reçu / budget.
- Filtres en pastilles : Tous · chaque type · Propositions · À venir · Terminés.
- Tri, regroupement par statut, création directement dans la liste.

**Projet (détail)**, en deux colonnes comme une fiche :

- **Colonne principale** : titre et description éditables, tâches (bascule Liste / Kanban, ajout sur place, glisser-déposer : avant, après, dans une tâche pour en faire une sous-tâche, ou dans les idées), idées (V1.1, qu'on glisse dans les tâches), notes.
- **Panneau de propriétés**, toutes éditables sur place :
  - statut (avec « Terminé le … » ou « Depuis le …, sa date de début »), type, client, priorité, dates, progression ;
  - **Finances** : budget, reçu, restant, % payé, non planifié, liste des encaissements (« Marquer reçu » en un clic), dépenses liées ;
  - prochains événements.

**Tâches** :

- Vues Aujourd'hui · 7 prochains jours · En retard · Prioritaires · Toutes · Terminées.
- Regroupement par projet ou par date, filtre par type de projet.
- Un clic ouvre un panneau latéral d'édition (TaskSheet) sans quitter la liste. Le kanban est aussi disponible.

**Calendrier** :

- Vues Mois / Semaine / Jour, éléments colorés selon leur source. Ce qui dure plusieurs jours (événement, tâche du début à la deadline) est une barre continue (V1.1).
- Filtres : événements, deadlines, tâches, encaissements ; en option, les tâches sans deadline (V1.1).
- Un clic sur un créneau vide crée un événement pré-rempli. La navigation (← →, `T` pour aujourd'hui) se fait au clavier.
- Glisser un élément sur un autre jour change sa date (V1.1) ; dans la grille horaire, un rendez-vous prend aussi l'heure du créneau.

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
| **4. Calendrier** | ✓ Fait | Événements, agrégation des dates (P8), vues mois / semaine / jour | Toutes mes dates au même endroit, sans doublon |
| **5. Dashboard final** | ✓ Fait | Chiffres clés, « Prochains jours », actions directes d'« À surveiller », synthèse avec le prochain rendez-vous | Les 5 questions du §1.1 ont leur réponse en quelques secondes |
| **6. Vitesse & données** | ✓ Fait | Palette Ctrl+K (FTS5), Paramètres › Données (sauvegarder, restaurer), aide des raccourcis, « Annuler » généralisé | Toute action courante en moins de 3 secondes ; données restaurables → **MVP** |
| **V1.1** | En cours | Retours d'usage, dates et deadlines, glisser-déposer, planning (timeline), notifications Windows, exports JSON / CSV, paramètres complets, petits défauts | Détail par étape au §7.2 |
| **V2** | Si besoin | Google Agenda dans le calendrier (lecture seule, adresse iCal secrète), zone de notification et démarrage auto, raccourci global, événements récurrents, CA par mois / trimestre (URSSAF) | Selon l'usage réel |

### 7.2 Détail des jalons restants

#### V1.1

Découpée en étapes, validées une à une (branches `v1.1-…`) :

1. **Retours d'usage** (✓ fait, branche `v1.1-retours`) :
   - les Propositions sortent du dashboard (« À venir », À surveiller) et du calendrier (dates et encaissements ; leurs tâches restent) ;
   - **idées** dans la fiche projet, transformables en tâche ;
   - **flèches autour de la date** du dashboard pour voir les tâches d'hier, de demain ou de n'importe quel jour ;
   - **tâches des prochains jours** dans le bloc Prochains jours.
2. **Retours d'usage, suite** (✓ fait, branche `v1.1-taches`) : corbeille et croix du panneau de tâche plus grandes, sélection de plusieurs tâches (date, deadline, priorité en une fois), catégories et sous-tâches, échéances (texte calculé « Dans 3 jours », deadlines proches sur le dashboard, barre début → deadline dans le calendrier).
3. **Dates et deadlines** (✓ fait, branche `v1.1-dates`) :
   - bloc **Deadlines** sur le dashboard : tout ce qui doit être fini d'ici 7 jours, projets et tâches (avec ou sans début) ;
   - deadlines colorées selon leur urgence dans le calendrier ;
   - un projet **À venir passe En cours** à sa date de début, aussi quand on change de jour sur le dashboard ;
   - **sélecteur de date maison** partout (« auj. », « demain », « +3j », « lundi », « 25/10 »…), et une icône calendrier à côté de la date du dashboard (`D`) ;
   - **date de fin** d'une tâche et d'un projet terminés, effacée quand on les rouvre ;
   - calendrier : option « Tâches sans deadline » (désactivée par défaut).
4. **Glisser-déposer** (✓ fait, branche `v1.1-glisser`) :
   - calendrier : prendre une tâche, un encaissement, un début ou une deadline de projet, un événement, et le déposer sur un autre jour pour changer sa date ;
   - fiche projet : glisser une tâche dans les idées et une idée dans les tâches ; déposer une tâche sur une autre pour en faire une sous-tâche (et l'en sortir) ;
   - réordonner les tâches au clavier (Alt+↑ / Alt+↓).
5. **Planning**.
6. **Notifications Windows**.
7. **Exports et paramètres complets**.
8. **Petits défauts** du §7.3.

Détail des étapes 5 à 7 :

- **Planning** : une ligne par projet en cours ou à venir, une barre du début à la deadline, une ligne « aujourd'hui », des losanges pour les encaissements, une bande de densité (projets simultanés par semaine) et un zoom mois / trimestre.
- **Notifications Windows** : plugin `notification`, règles du §2.8, dédoublonnage par `notification_log`, chacune désactivable.
- **Exports** : JSON (toutes les données) et CSV pour les finances (séparateur `;`, BOM UTF-8). Les fichiers sont nommés `cockpit-export-…` : ce motif est ignoré par Git.
- **Paramètres complets** :
  - thème forcé clair ou sombre (`data-theme`, déjà prévu dans `tokens.css`) ;
  - premier jour de la semaine ;
  - mémorisation de la taille et de la position de la fenêtre (plugin `window-state`).

### 7.3 Points à reprendre, issus des jalons terminés

- **Ctrl+N** : non vérifié dans la fenêtre WebView2. La touche `N` seule fonctionne partout.
- **Clients** : pas encore d'archivage.
- **Erreurs dans les fenêtres globales** : une erreur dans une fenêtre globale (création, panneau de tâche) remplace toute l'app par l'écran d'erreur. Il faudrait des « error boundaries » locales.
- **Comptes** : seuls les deux comptes de départ existent. Ni création, ni renommage, ni archivage dans l'interface (la table le permet déjà).
- **Clients** : la fiche n'affiche pas encore le total encaissé ni le montant à recevoir (§5.2).
- **Export CSV des transactions** : prévu avec les exports (V1.1).
- **Fiche projet** : les « prochains événements » du panneau de propriétés (§5.2) ne sont pas encore affichés.
- **Vue mois** : sur un écran 1080p à 125 %, un mois chargé peut dépasser de quelques pixels en bas.
- **Sauvegarde et restauration** : couvertes par des tests Rust et vérifiées dans le navigateur (réponses natives simulées), mais pas encore dans la vraie fenêtre : les fenêtres de fichier natives sont à essayer à la main.
- **Ctrl+K et ?** : vérifiés dans le navigateur de test ; à confirmer dans la fenêtre WebView2.
- **Suppr** : fonctionne sur les lignes de liste, pas encore dans les panneaux latéraux (tâche, événement) ni sur la fiche projet.
- **Dossier des sauvegardes** : en changer ne déplace pas les sauvegardes déjà faites.

**Choix faits en V1.1, étape 4 (glisser-déposer)**, à confirmer à l'usage :
- **Calendrier** (`agenda/calendar/CalendarDnd.tsx`) : tout ce qui s'y affiche se prend et se dépose sur un autre jour, en vue mois comme dans la ligne « journée » de la semaine et du jour. La date change là où elle est stockée (P8) : une tâche décale son début et sa deadline d'autant (une barre garde sa durée), un projet son début ou sa deadline, un encaissement sa date prévue, un événement ses jours (heures gardées). L'élément se décale du nombre de jours entre la case où on l'a pris et celle où on le dépose : on peut prendre une barre par le milieu. Dans la grille horaire, un événement à heure fixe prend l'heure du haut du bloc, au quart d'heure, et garde sa durée ; les autres éléments n'y changent que de jour. La case visée est surlignée et l'élément glissé montre sa destination (« lun. 28 sept. · 15:30 »). Toast « Déplacé au lundi 28 septembre. » avec « Annuler » (Ctrl+Z). Refus, avec un message, d'un début de projet après sa deadline ou l'inverse. Un encaissement reçu ne bouge jamais (il n'est pas dans le calendrier). Un clic reste un clic (seuil de 6 px) ; la page ne défile qu'à 8 % du bord.
- **Fiche projet** (`projects/components/ProjectPlan.tsx`, règles `placeInTree` et `dropOnRow`) : tâches et idées partagent un seul glisser-déposer, sans liste qui se réorganise pendant qu'on glisse. Sur une ligne de tâche, le haut du pointeur place avant (un trait), le bas après, le milieu range dedans (la ligne s'encadre : sous-tâche). Un seul niveau reste la règle : rien ne se range dans une sous-tâche (le milieu place alors avant ou après), une tâche qui a des sous-tâches ne descend pas. Déposée entre deux sous-tâches, une tâche devient leur sœur ; une sous-tâche déposée au premier niveau quitte sa parente. Sous l'ajout express : la fin de la liste. L'élément glissé dit ce qui va se passer (« Sous-tâche de « Tâches admin » », « En faire une idée », « En faire une tâche »).
- **Tâche ↔ idée** : pendant qu'on glisse une tâche, la section Idées est entourée de pointillés (« Déposer ici pour en faire une idée »). La tâche devient une idée à son titre seul ; « Annuler » la remet à l'identique (dates, notes, priorité, place). Une tâche qui a des sous-tâches ne peut pas devenir une idée (message). Une idée déposée dans les tâches y devient une tâche à cette place, ou une sous-tâche ; toujours avec « Annuler ».
- **Au clavier** (fiche projet) : Alt + ↑ ↓ changent la tâche de place parmi ses sœurs, Alt + → la range dans la tâche du dessus, Alt + ← la sort de sa parente (juste après elle). Le focus reste sur la tâche.
- **Accessibilité** : les annonces du glisser-déposer pour les lecteurs d'écran sont en français (`ui/data/dnd-accessibility.ts`), kanban compris.
- Le tri par glisser de l'ancienne liste (`@dnd-kit/sortable`) est remplacé : les dépendances `@dnd-kit/sortable` et `@dnd-kit/utilities` sont retirées.

**Choix faits en V1.1, étape 3 (dates et deadlines)**, à confirmer à l'usage :
- **Bloc « Deadlines »** (`dashboard/components/Deadlines.tsx`, règle `selectDeadlines`) : en haut de la colonne de droite, avant À surveiller. Il réunit les deadlines de projets, de tâches (qu'elles aient un début ou non) et les événements « Échéance », d'aujourd'hui à J+7 : une deadline y entre 7 jours avant. Un projet en retard y reste en tête (rouge) ; les tâches en retard n'y sont pas, elles sont déjà en tête d'Aujourd'hui. Compte à rebours coloré (règle de `core/deadline.ts`), 4 lignes d'emblée puis « N autres deadlines ». Une ligne sur deux niveaux : le titre en entier, puis le projet. Un clic ouvre la source.
- **« À prévoir » fusionné dans Deadlines** sur le dashboard : une tâche sans début y est marquée « pas encore prévue », avec « Prévoir… » au survol (le sélecteur de date, qui lui donne un début). La page Tâches garde son groupe « À prévoir ».
- **Plus de deadlines ailleurs sur le dashboard** : À surveiller n'a plus « Deadline dépassée » ni « Deadline dans 3 jours » ; Prochains jours n'a plus les deadlines de projet ni les échéances. Un projet dont la deadline est dépassée ou à 3 jours ou moins ne reçoit toujours pas de rappel secondaire (budget, prochaine action) dans À surveiller.
- **Disposition revue** : à droite, Deadlines, À surveiller, puis Prochains jours. En 1080p à 125 %, Prochains jours demande désormais un court défilement : les deadlines passent avant.
- **Calendrier** : revient sur le choix du jalon 4 (« seul le retard est coloré »). Une deadline (projet, tâche, échéance) est en gras, avec un drapeau de la couleur de son urgence ; en retard, aujourd'hui ou à 3 jours, elle a en plus un fond teinté (rouge ou ambre). Même chose pour le drapeau au bout d'une barre début → deadline.
- **Projet « À venir » → « En cours »** : rien n'est écrit en base (pas de valeur dérivée stockée). Le statut du jour est calculé à la lecture (`STATUS_ON` dans `projects/repository.ts`, `statusOn` dans `model.ts`) et tous les filtres l'utilisent : liste des projets, barre latérale, dashboard. Le statut choisi reste lisible (`savedStatus`). Sur le dashboard, les projets suivent le jour affiché : le jour du début, le projet est « En cours » ; en revenant avant, il redevient « À venir ». Seul « À venir » bascule : Proposition, En pause, Terminé et Annulé ne bougent jamais. La fiche indique « Depuis le 24 sept., sa date de début », et sous la date de début d'un projet à venir « Passera En cours ce jour-là ». Choisir « À venir » quand la date de début est passée affiche pourquoi il reste En cours.
- **Sélecteur de date maison** (`ui/primitives/DatePicker.tsx`, lecture de la saisie dans `core/date-input.ts`) : tous les champs date de l'app (fiches, fenêtres, barre de sélection). Un champ de saisie en tête (« auj. », « demain », « après-demain », « +3j », « 2 sem », « +1m », « dans 5 jours », « lundi », « 25 », « 25/10 », « 25 oct. », « 1er novembre 2027 »), avec la date comprise en aperçu et surlignée dans la grille ; Entrée la valide. Un jour de la semaine est toujours à venir ; sans année (ou sans mois), c'est la date la plus proche d'aujourd'hui. Puis quatre raccourcis, et le mois (flèches, Page préc. / suiv.). « Retirer la date » pour les champs facultatifs. Les champs affichent « ven. 25 sept. ».
- **Calendrier du dashboard** : icône à droite des flèches, ou `D`. Un point rouge sous les jours qui ont une deadline, gris sous ceux qui ont des tâches prévues.
- **Date de fin** : dans le panneau d'une tâche terminée, sous le statut (« Terminée aujourd'hui à 14:32 ») ; dans la fiche d'un projet terminé, sous le statut ; dans les tâches terminées repliées de la fiche projet (« hier », l’heure au survol) et dans l'onglet Terminés des projets (« Terminé le 12 sept. »). Rouvrir efface la date (c'était déjà le cas en base).
- **Tâches sans deadline dans le calendrier** : option du menu Filtrer, désactivée par défaut et mémorisée ; les tâches ordinaires y sont à leur date de début.

**Choix faits en V1.1, étape 2 (tâches et échéances)**, à confirmer à l'usage :
- **Texte des deadlines** : une seule règle (`core/deadline.ts`) pour les lignes et cartes de tâches, le panneau de tâche (sous la deadline), les lignes de projet (version courte : « Dans 6 j », « 3 j de retard ») et la fiche projet. Rouge pour un retard ou aujourd'hui, ambre de 1 à 3 jours, bleu de 4 à 7, neutre au-delà (la date), vert « Terminée ». Sous une deadline lointaine, rien : la date est déjà affichée. Les textes d'À surveiller suivent (« Deadline dans 3 jours », « En retard de 2 jours »).
- **« Début »** remplace « Prévue le » à l'écran (la colonne reste `scheduled_date`). Une tâche qui a un début et une deadline occupe la période entre les deux : une barre dans le calendrier, rond au début, drapeau au bout.
- **« À prévoir »** (sous Aujourd'hui, au dashboard et dans la page Tâches) : tâches sans début dont la deadline tombe dans les 7 jours, la plus proche d'abord ; elles entrent dans Aujourd'hui le jour de la deadline. Prochains jours ne montre plus que les tâches qui commencent ce jour-là, pour ne rien afficher deux fois.
- **Sous-tâches** (migration 0004) : un seul niveau ; la parente sert de catégorie et affiche « 1/3 ». Une sous-tâche garde ses dates, sa priorité et sa case, et suit le projet de sa parente (elle s'en détache si on la change de projet). Terminer la dernière sous-tâche termine la parente, en rouvrir une la rouvre, terminer la parente termine ses sous-tâches : écrit en SQL dans le même lot (`updateTaskStatements`). Fiche projet : liste en arbre, glisser-déposer à chaque niveau, « Ajouter une sous-tâche » au survol. Vues globales : « Parente › » devant le titre. Panneau : lien vers la parente, « Sous-tâche de » pour ranger une tâche, section Sous-tâches. Supprimer une parente emporte ses sous-tâches, « Annuler » les ramène.
- **Sélection multiple** : Ctrl+clic et Maj+clic sur les lignes de tâches (pas les cartes du kanban). Une barre en bas de l'écran applique le même début, la même deadline (aujourd'hui, demain, lundi prochain, dans une semaine, une date au choix, ou retirer), la même priorité, termine ou supprime. Échap vide la sélection, changer de page aussi ; Suppr supprime la sélection. « Annuler » remet chaque tâche touchée, parentes et sous-tâches comprises.
- **Supprimer et Fermer** des panneaux de tâche et d'événement : boutons de 40 px, icônes de 20 px.
- **Barres continues** : semaine par semaine (`layoutRow`), rangées en couloirs, la plus ancienne puis la plus longue en haut ; une barre coupée par le bord de la semaine touche le bord. Dans une case, 3 éléments au plus barres comprises, puis « +N ».

**Choix faits en V1.1, étape 1 (retours d'usage)**, à confirmer à l'usage :
- **Propositions hors du dashboard et du calendrier** : un devis non signé n'a pas lieu d'y être. Le dashboard ne lit que les projets En cours, À venir et En pause (`CONFIRMED_STATUSES`) : ni « À venir », ni À surveiller. Le calendrier (et donc Prochains jours) ne montre ni leur début, ni leur deadline, ni leurs encaissements (règle `EXPECTED_PAYMENT`). Leurs tâches et les événements qui leur sont liés restent : ce sont de vraies choses à faire. Tout réapparaît dès que le projet passe en Prévu ou En cours.
- **Idées** : table `ideas` (migration 0003), une ligne par idée, sans date ni statut. Section « Idées » sous les tâches de la fiche projet : « Noter une idée » (Entrée pour enchaîner), un clic pour la reformuler, au survol « En faire une tâche » (tâche sans date, en fin de liste ; l'idée disparaît) et la corbeille ; Suppr supprime. Les deux actions ont « Annuler ». Les idées ne comptent pas dans la progression et partent avec le projet (et reviennent avec « Annuler »). Elles sont dans la recherche Ctrl+K (groupe Idées) : le résultat ouvre le projet.
- **Tâches de jour en jour** : flèches autour de la date du dashboard (← → au clavier, `T` ou le bouton « Aujourd'hui » pour revenir). Le jour est dans l'URL interne (`?day=`). Seul le bloc de tâches suit le jour choisi ; les chiffres, À surveiller et Prochains jours restent ceux d'aujourd'hui. Un jour à venir montre les tâches situées ce jour-là (début, sinon la deadline) et l'ajout express pour ce jour. Un jour passé montre ce qui a été terminé ce jour-là, puis ce qui y était prévu et n'est pas fait (« reportées à aujourd'hui »).
- **Tâches dans Prochains jours** : à partir de demain, les tâches prévues chaque jour (un rond, le projet en gris, un drapeau si c'est la deadline), 3 au plus par jour, puis « +N tâches » qui ouvre ce jour dans le bloc de tâches. Celles du jour affiché dans le bloc de tâches n'y sont pas répétées. Ce bloc vit désormais dans `domains/dashboard/components/UpcomingDays.tsx`.

**Choix faits après le MVP**, à confirmer à l'usage :
- **Propositions** : leurs encaissements ne comptent ni dans « À recevoir » (chiffre, retards, prévu sur 30 jours), ni dans les listes À recevoir / En retard, ni dans À surveiller, ni dans le « à recevoir » des clients. Ils restent visibles dans la fiche du projet, et comptent dès que le projet passe en Prévu ou En cours. (Revu en V1.1 : ils ne sont plus dans le calendrier, voir plus haut.) La règle SQL est unique : `EXPECTED_PAYMENT` (`finance/payments/repository.ts`).
- **Paramètres › Tableau de bord** : « Afficher les montants » (réglage `dashboard.showAmounts`, activé par défaut). Désactivé, le dashboard ne montre plus aucun montant, pour pouvoir rester à l'écran sans dévoiler l'argent : ni les chiffres clés, ni les montants dans À surveiller (« Paiement en retard de 5 j », « Une partie du budget sans échéance ») et Prochains jours, info-bulles comprises. Les éléments eux-mêmes restent.
- **Page Finances** : les chiffres clés sont toujours affichés. Tant que les soldes de départ n'ont pas été saisis, la question « Quel est le solde actuel de tes comptes ? » s'ajoute en dessous au lieu de les remplacer.

**Choix faits au jalon 6**, à confirmer à l'usage :
- **Palette Ctrl+K** : sans saisie, trois créations, « Marquer un encaissement reçu… » et les pages. En tapant : jusqu'à 5 commandes, puis les résultats groupés par type (5 au plus par type), le groupe de la meilleure correspondance en tête. Un projet ou un client trouvé fait remonter ses éléments liés, après les correspondances directes et ce qui est encore ouvert d'abord.
- **« Marquer reçu… »** dans la palette liste les encaissements non reçus, filtrables ; Retour arrière dans le champ vide revient aux commandes.
- **Résultats** : chacun s'ouvre comme ailleurs dans l'app (fiche projet, panneau de tâche ou d'événement, fenêtre d'encaissement). Clients et transactions ont désormais une fenêtre ouvrable par identifiant.
- **« Annuler » généralisé** : supprimer un projet, un client, un type ou une catégorie ne demande plus de confirmation ; le toast propose « Annuler » pendant 6 s. Ctrl+Z déclenche l'annulation encore affichée (suppression, réception, ajustement de solde), sauf pendant la saisie de texte. Un projet qui a déjà reçu de l'argent reste non supprimable.
- **Listes** : ↑ ↓ passent d'une ligne à l'autre dans l'ordre de la page (tâches, cartes kanban, encaissements, transactions) ; Suppr supprime et le focus passe à la ligne suivante.
- **Sauvegarder maintenant** : fenêtre « Enregistrer sous » ouverte sur le dossier des sauvegardes, avec un nom daté (`cockpit_…_manuelle.db`) : Entrée suffit. Ces copies ne sont jamais effacées automatiquement et comptent pour « Dernière sauvegarde ».
- **Restaurer** : en deux temps. Le fichier choisi est copié à côté de la base et vérifié (intégrité, base Cockpit, schéma pas plus récent) ; la confirmation annonce son contenu. Les données actuelles sont alors copiées (`…_restauration.db`, 5 conservées) puis remplacées sans redémarrer l'app ; l'interface se recharge. Une sauvegarde plus ancienne est mise au schéma actuel.
- **Dossier des sauvegardes** : réglage `data.backupDir` (table `settings`), lu au démarrage ; une première sauvegarde y est faite dès qu'on le choisit. Restaurer une vieille sauvegarde remet aussi le réglage qu'elle contient.
- **Sécurité** : les fenêtres de fichier sont ouvertes par Rust ; l'interface ne passe jamais de chemin aux commandes natives.

**Choix faits au jalon 3**, à confirmer à l'usage :
- La question « Quel est le solde actuel de tes comptes ? » est posée sur la page Finances, sous les chiffres (pas au démarrage), tant qu'aucun ajustement n'existe ; « Plus tard » la masque jusqu'à la prochaine visite. Le réglage `finance.initialBalancesAsked` retient qu'on y a répondu.
- L'écart d'un ajustement est calculé par SQLite au moment de l'écriture, jamais à partir du solde affiché. Un solde négatif (découvert) est accepté.
- Le revenu créé à la réception reprend le libellé de l'encaissement (suivi du client s'il n'a pas de projet) et la catégorie « Revenus client ». Modifier le montant ou la date de réception d'un encaissement reçu met à jour cette transaction. Modifier la transaction seule reste possible (frais bancaires) : les deux montants peuvent alors différer.
- Supprimer un encaissement supprime sa transaction liée, et « Annuler » remet les deux. Annuler une réception ramène l'encaissement à « En attente » s'il a un n° de facture, sinon à « Prévu ».
- Un virement modifié est réécrit (ses deux lignes sont remplacées dans le même lot). Sans filtre de compte, la liste ne le montre qu'une fois.
- Une catégorie utilisée par des transactions ne se supprime pas, comme un type de projet utilisé.

**Choix faits au jalon 5**, à confirmer à l'usage :
- **Disposition** (revue en V1.1, étape 3 : Deadlines en haut à droite) : deux colonnes indépendantes. À gauche, Aujourd'hui puis Projets en cours ; à droite, À surveiller puis Prochains jours. C'est un écart avec la maquette, où Prochains jours est sous Aujourd'hui : À surveiller est limité à 3 points, donc Prochains jours reste visible sans défilement quel que soit le nombre de tâches du jour. Les projets en cours sont aussi dans la sidebar.
- **Vérification 1080p à 125 %** (fenêtre par défaut 1280 × 780 et plein écran 1536 × 785), sur une journée chargée (5 tâches et 1 terminée, 3 points à surveiller) : les chiffres, les tâches du jour, les points à surveiller et le début de Prochains jours (aujourd'hui, demain en plein écran) sont visibles sans défiler ; la suite de la semaine et la liste des projets demandent un court défilement. Sur une journée plus légère, tout tient.
- **Prochains jours** : 7 jours, aujourd'hui compris ; seuls les jours qui ont quelque chose sont montrés. Les tâches n'y figurent pas (revu en V1.1 : elles y sont à partir de demain, voir plus haut), ni les retards (ils sont dans À surveiller). Un événement sur plusieurs jours n'apparaît qu'une fois, avec « jusqu'à … ». Un clic ouvre la source, comme dans le calendrier.
- **Synthèse sous la date** : les tâches du jour (dont en retard) et le prochain rendez-vous à heure fixe pas encore commencé ; elle suit l'heure. Le nombre de projets en cours et de paiements en retard n'y figure plus : ils sont déjà dans les blocs et les chiffres clés.
- **Chiffres clés** : le même composant que l'en-tête de la page Finances ; les soldes s'y corrigent aussi sur place.
- **À surveiller** : l'action directe apparaît au survol (ou au clavier) à droite de la ligne, sans décaler le texte : « Marquer reçu… » pour un encaissement en retard, « Ajouter une tâche » pour un projet sans aucune tâche (qui démarre bientôt ou déjà en cours). « Toutes les tâches sont faites : terminer le projet ? » ouvre simplement la fiche.

**Choix faits au jalon 4**, à confirmer à l'usage :
- Les filtres sont Événements · Projets (débuts et deadlines) · Tâches · Encaissements. Les deadlines de tâches sont sous « Tâches ».
- Une tâche apparaît une seule fois : à sa deadline, sinon à sa date prévue si elle est Haute ou Urgente. Les tâches ordinaires sans deadline n'y figurent pas. (V1.1 : avec un début et une deadline, en barre de l'un à l'autre.)
- Les projets terminés, annulés ou archivés sortent du calendrier ; leurs encaissements non reçus restent.
- Un encaissement y porte le nom du projet (ou du client), son libellé au survol, et son montant.
- Seul le retard est coloré (rouge) : une deadline ou un encaissement passé. Pas d'ambre « bientôt » dans le calendrier. (Revu en V1.1, étape 3 : les deadlines prennent la couleur de leur urgence.)
- Un nouvel événement est à heure fixe, pour 1 h : 9 h, ou l'heure pleine suivante s'il est pour aujourd'hui. Un clic sur un créneau prend sa demi-heure ; un clic dans la ligne « Journée » crée un événement sur la journée ; le type « Échéance » coche « Journée entière ».
- Plusieurs jours : seulement en journée entière (« Jusqu'au »). À heure fixe, la fin est le même jour et facultative. Changer l'heure de début déplace la fin (la durée est conservée).
- La vue et les filtres sont mémorisés d'une visite à l'autre ; le jour affiché est dans l'URL interne, si bien qu'on revient au même endroit après avoir ouvert une fiche.
- Semaine et jour montrent 8 h – 20 h, élargis si un événement déborde, avec une ligne « maintenant ». Un clic sur un encaissement ouvre sa fenêtre (pas directement « Marquer reçu »).

---

## 8. Décisions prises (24 septembre 2026)

1. **Stack** : Tauri 2. Rust et les Build Tools C++ sont installés sur la machine de développement.
2. **Propositions P1 à P12** : retenues (aucune objection).
3. **Thème par défaut** : celui du système.
4. **Nom** : Cockpit.
5. **Densité** : la première maquette montrait trop d'informations d'un coup. Le dashboard passe à 4 chiffres clés et 4 blocs, avec des lignes allégées et plus d'espace (§5.2 et §6).
