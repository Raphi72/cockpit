# Cockpit — Dossier de conception (V1.1)

> **Cockpit** est un nom de travail.
> Ce document fixe le besoin, l'architecture, le modèle de données, l'arborescence, les pages et le design system **avant d'écrire du code**.
> Statut : **validé** (voir §8). Jalons 0 à 6 terminés le 25/09/2026 : c'est le **MVP**. V1.1 terminée le 26/09/2026 (8 étapes, §7.2), puis V1.1.2 le même jour (4 étapes, §7.2). La **V2** (§9) est en cours : son étape 1, « Toujours là », est faite (25/11/2026).
> Maquette du dashboard : [`maquette-dashboard.html`](maquette-dashboard.html).

---

## 0. En bref

- **Application desktop locale** : Tauri 2 (coquille native légère) + React + TypeScript, avec une base **SQLite** dans `%APPDATA%`. Pas de serveur, pas de compte, 100 % hors ligne.
- **Toute la logique métier est en TypeScript.** La partie Rust se limite à un pont SQLite d'environ 200 lignes, aux sauvegardes, aux fenêtres de fichier (sauvegarde, restauration, exports) et aux notifications natives.
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
*V2 (§9)* : une synchronisation entre le PC et le téléphone arrive, **facultative**, par le Google Drive de l'utilisateur. Cockpit reste utilisable sans compte et hors ligne.

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
- Les animations (V2) ne pèsent pas sur le démarrage : le moteur de Motion est un morceau à part, chargé après le premier rendu. La petite fenêtre de capture rapide est créée cachée, une seconde et demie après le lancement.

### 2.7 Données, sauvegarde, sécurité

- La base se trouve dans `%APPDATA%\<identifiant de l'app>\cockpit.db`. Un bouton « Ouvrir le dossier des données » y donne accès.
- Les migrations SQL sont versionnées (`PRAGMA user_version`) et appliquées au démarrage, toujours précédées d'une sauvegarde.
- **Sauvegardes** :
  - automatique, une fois par jour, avec conservation des 14 dernières ;
  - manuelle, via Paramètres › Données › « Sauvegarder mes données… », qui produit un fichier `.db` complet ;
  - restauration, avec vérification d'intégrité et sauvegarde de sécurité de la base actuelle avant remplacement ;
  - le dossier des sauvegardes peut être choisi (OneDrive…) ; s'il devient injoignable, les sauvegardes retombent dans le dossier par défaut et Paramètres le signale.
- **Exports** (Paramètres › Exports) : JSON (toutes les données, lisible) et CSV pour les finances, transactions et encaissements (séparateur `;` et BOM UTF-8, pour une ouverture directe dans Excel en français). Détail au §7.3 (V1.1, étape 7).
- **Sécurité** : aucun contenu distant, une politique CSP stricte et des permissions Tauri minimales.

### 2.8 Notifications (V1.1)

- **Règles**, désactivables une par une :
  - deadline de projet à J-3 et le jour J ;
  - tâche prioritaire due le lendemain ;
  - encaissement prévu le lendemain, ou passé en retard ;
  - début de projet ;
  - événement, 15 minutes avant ;
  - résumé du matin (optionnel).
- **Planification** : une vérification à l'ouverture, puis chaque minute tant que l'app tourne (réduite, ou fenêtre fermée depuis la V2). Le rythme d'une minute vient du côté natif (`presence.rs`) : les minuteries de l'interface ralentissent quand la fenêtre est cachée. Les rendez-vous sont regardés à chaque vérification ; les autres règles, seulement lors d'une « tournée » : à l'ouverture, puis chaque matin à 8 h. Le résumé du matin n'est envoyé qu'à la tournée de 8 h. La table `notification_log` garantit qu'une même notification n'est jamais envoyée deux fois. Détail des choix au §7.3 (V1.1, étape 6).
- **Événements récurrents** (V2) : chaque occurrence d'un rendez-vous est annoncée une fois ; une échéance qui se répète est rappelée à chaque fois.
- **Toujours là** (V2, étape 1) : Cockpit reste dans la zone de notification quand on ferme sa fenêtre et se lance avec Windows, donc les notifications arrivent toujours. Lancé caché, il fait la tournée du matin (résumé compris) au lieu de celle d'ouverture. Quitté pour de bon (menu de l'icône), il n'envoie plus rien.

### 2.9 Bibliothèques retenues

| Besoin | Choix | Raison |
|---|---|---|
| Coquille desktop | Tauri 2 (2.12 depuis la V2) | Légère, native, installeur Windows (NSIS) avec raccourcis |
| Toujours là (V2) | Plugins Tauri `autostart`, `single-instance`, `global-shortcut`, icône `tray` | Démarrage avec Windows, une seule instance, capture rapide, zone de notification |
| Animations (V2) | Motion (`LazyMotion`) | Transitions et ressorts ; le moteur est chargé après le premier rendu |
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

-- 0005_work_plan.sql (V1.1.2) : le jour où « Je veux travailler… » a mis la tâche au programme.
-- Ses dates ne changent pas : elle est dans Aujourd'hui ce jour-là seulement, puis retrouve sa place.
ALTER TABLE tasks ADD COLUMN planned_on TEXT;
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
| Tâches d'aujourd'hui | Non terminées et (début ≤ aujourd'hui ou deadline ≤ aujourd'hui, ou au programme d'aujourd'hui : `planned_on` = aujourd'hui) |
| Statut du jour d'un projet | « À venir » et date de début ≤ le jour regardé → « En cours » ; sinon le statut choisi (`statusOn`, et `STATUS_ON` en SQL) |
| Deadlines du dashboard | Deadlines de projets (en retard comprises), de tâches et événements « Échéance » du jour affiché à J+N, N réglable (7 par défaut) (`selectDeadlines`) |
| À prévoir | Non terminées, sans début, deadline dans les 7 prochains jours (pas aujourd'hui) |
| Texte d'une deadline | « En retard de 3 jours », « Aujourd'hui » (rouge), « Demain », « Dans 3 jours » (ambre), « Dans 6 jours » (bleu, jusqu'à 7), puis la date, « Terminée » (vert) : `core/deadline.ts`. Les seuils se recalent sur l'horizon des deadlines réglé dans Paramètres (`deadlineThresholds`), partout |

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
  occurrence?: string;               // V2 : jour prévu par la règle, pour un événement qui se répète
};
```

Depuis la V2 (P15), un événement qui se répète donne une ligne par occurrence de la plage : `start` et `end` sont ceux de l'occurrence, `occurrence` la désigne (même déplacée) et sa clé devient `${source}:${id}:${kind}:${occurrence}`. Les occurrences sont calculées à partir de la règle et des exceptions (`agenda/recurrence.ts`), jamais stockées.

Une seule requête `UNION ALL` sur une plage de dates renvoie tous les éléments en un aller-retour. Le calendrier, les « Prochains jours » du dashboard et les notifications consomment ce même flux. Le planning lit directement les projets et leurs encaissements (il lui faut la période entière de chaque projet et sa progression) : les dates restent celles des tables, rien n'est recopié.

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
- Depuis, les idées de projet (`idea`, migration `0003`) et les captures de la boîte de réception (`inbox`, migration `0006`) y sont aussi, avec leurs triggers. Un événement qui se répète y est sans date.
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
│  │  ├─ data.rs                      # commandes de Paramètres › Données (fenêtres de fichier natives)
│  │  ├─ notify.rs                    # envoi des notifications Windows
│  │  ├─ presence.rs                  # V2 : zone de notification, fermeture, démarrage avec Windows, battement
│  │  └─ capture.rs                   # V2 : raccourci global et petite fenêtre de capture rapide
│  ├─ migrations/
│  │  ├─ 0001_init.sql
│  │  ├─ 0002_search.sql              # index FTS5 et ses triggers
│  │  ├─ 0003 … 0005                  # idées, sous-tâches, programme du jour
│  │  ├─ 0006_inbox.sql               # V2 : boîte de réception
│  │  └─ 0007_recurrence.sql          # V2 : événements récurrents et leurs exceptions
│  ├─ capabilities/                   # permissions Tauri minimales (fenêtre principale, capture)
│  ├─ icons/
│  ├─ Cargo.toml
│  └─ tauri.conf.json
│
├─ src/
│  ├─ main.tsx
│  ├─ capture.tsx                     # V2 : entrée de la petite fenêtre de capture (capture.html)
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
│  │  │  ├─ recurrence.ts             # V2 : règle RRULE, occurrences, exceptions (règles pures)
│  │  │  ├─ calendar/                 # MonthView, WeekView, DayView
│  │  │  └─ timeline/                 # PlanningPage (Gantt simplifié)
│  │  ├─ inbox/                       # V2 : boîte de réception, capture rapide et son réglage
│  │  ├─ presence/                    # V2 : « Toujours là » côté interface (réglages, première explication)
│  │  ├─ dashboard/                   # requêtes agrégées + sections du cockpit
│  │  ├─ search/                      # FTS5 + CommandPalette
│  │  ├─ notifications/               # règles, planificateur, envoi natif
│  │  ├─ data/                        # sauvegarde, restauration, exports JSON/CSV
│  │  └─ settings/
│  │
│  ├─ ui/                             # design system, aucune logique métier
│  │  ├─ primitives/                  # Button, IconButton, Input, Textarea, Select, Checkbox, Kbd, Tooltip
│  │  ├─ overlays/                    # Dialog, Sheet, Popover, Menu, Toast, ChoiceDialog
│  │  ├─ motion/                      # V2 : animations (chargement différé, durées, lignes et pages animées)
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
├─ capture.html                       # V2 : seconde page, pour la fenêtre de capture rapide
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

---

## 5. Pages et composants

### 5.1 Navigation

**Sidebar** (232 px, réductible à 56 px avec Ctrl+B). Depuis la V2 (étape 2), elle dépend du mode, choisi en haut à gauche par un sélecteur à deux icônes (Travail, Cours ; `Ctrl M`) :

- **dans les deux modes**, sous Aujourd'hui : **Journée** (V2, étape 3), l'organisateur de journée en blocs, puis, sous la boîte de réception, **Pages** (V2, étape 4) et **Habitudes** (V2, étape 6 : habitudes, objectifs, séances, revue de la semaine) ; les pages favorites sont listées sous la navigation ;
- **mode Travail** : Aujourd'hui (dashboard), Boîte de réception (V2, avec le nombre de captures à trier), Projets, Tâches, Calendrier, Planning, Finances ; une section « Projets en cours » pour accéder directement à chaque projet (pastille couleur du type) ; en bas, Clients et Paramètres ;
- **mode Cours** : Aujourd'hui, Boîte de réception, Matières, Devoirs, Calendrier, Emploi du temps, Examens, Révisions (V2, étape 5), Notes ; en bas, Paramètres.

La « Vue globale » de ta liste devient **Planning** (la timeline), puisque le dashboard joue déjà le rôle de vue globale. La sidebar utilise des icônes Lucide plutôt que des emojis, pour un rendu plus net et plus sobre.

**Raccourcis clavier** :

| Raccourci | Action |
|---|---|
| `Ctrl K` | Rechercher ou lancer une commande |
| `C` | Menu Créer, puis `T` tâche · `E` événement · `P` projet · `L` client · `R` encaissement · `D` transaction ; en mode Cours : `D` devoir · `X` examen · `N` note · `E` événement · `M` matière · `C` cours |
| `N` (ou `Ctrl N`) | Nouvelle tâche (l'action la plus fréquente) ; dans une fiche projet, elle est rattachée au projet. En mode Cours : nouveau devoir (rattaché à la matière de la fiche ouverte) |
| `Ctrl 1` … `Ctrl 6` | Aller aux pages principales du mode (`Ctrl 4` : le calendrier dans les deux) |
| `Ctrl M` | V2 : passer du mode Travail au mode Cours, et inversement |
| `Ctrl Maj Espace` | V2 : capture rapide, depuis n'importe quelle application (réglable) |
| `T` · `I` · `E` · `D` | V2, boîte de réception : faire de la capture une tâche, une idée de projet, un événement ou un devoir |
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
- Réalisé en V1.1, étape 5 : voir les choix au §7.3.

**Finances** :

- **En-tête** : les soldes (un clic permet de corriger le solde, ce qui crée un ajustement), le montant à recevoir, les retards, l'encaissé du mois et les dépenses pro du mois.
- **Onglets** :
  - Encaissements : À recevoir · Reçus · En retard ;
  - Transactions : filtres par compte, type, catégorie et mois (export CSV dans Paramètres › Exports).

**Clients** : une liste et une fiche avec les coordonnées, les projets, le total encaissé et le montant à recevoir ; un client qu'on ne suit plus s'archive.

**Paramètres** :

- Apparence : thème (comme Windows, clair ou sombre) et premier jour de la semaine.
- Notifications.
- Types de projet, comptes et catégories.
- Exports : JSON et CSV.
- Données : sauvegarder, restaurer, choisir le dossier des sauvegardes, ouvrir le dossier des données.
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
6. **Le mouvement accompagne, il ne fait pas attendre.** Jusqu'à la V1.1.2, seuls les éléments qui apparaissaient étaient animés (120 à 160 ms), sans transition de page. La V2 (§9.3) rend l'app plus fluide : la page qui arrive apparaît en fondu, les lignes d'une liste s'ouvrent et se replient, les messages se posent. Tout reste court (0,2 s au plus), rien ne se déplace sous le pointeur, et « Réduire les animations » de Windows coupe tout.

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
| **V1.1** | ✓ Fait | Retours d'usage, dates et deadlines, glisser-déposer, planning (timeline), notifications Windows, exports JSON / CSV, paramètres complets, petits défauts | Détail par étape au §7.2 |
| **V1.1.2** | ✓ Fait | Terminer une tâche en douceur, titres complets dans les panneaux, bloc Deadlines qui suit le jour affiché (horizon réglable), « Je veux travailler… » | Détail par étape au §7.2 |
| **V2** | En cours : étapes 1 à 9 sur 10 faites | Modes Travail et Cours, espace Cours, organisateur de journée en blocs, pages (à la place de Notion), révisions, habitudes et sport, compagnon, toujours lancé, Google Agenda, synchronisation par Google Drive, application Android | Détail au §9, étapes au §9.7 |

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
5. **Planning** (✓ fait, branche `v1.1-planning`).
6. **Notifications Windows** (✓ fait, branche `v1.1-notifications`).
7. **Exports et paramètres complets** (✓ fait, branche `v1.1-exports`).
8. **Petits défauts** du §7.3 (✓ fait, branche `v1.1-defauts`).

Détail des étapes 5 à 7 :

- **Planning** : une ligne par projet en cours ou à venir, une barre du début à la deadline, une ligne « aujourd'hui », des losanges pour les encaissements, une bande de densité (projets simultanés par semaine) et un zoom mois / trimestre.
- **Notifications Windows** : plugin `notification`, règles du §2.8, dédoublonnage par `notification_log`, chacune désactivable.
- **Exports** : JSON (toutes les données) et CSV pour les finances (séparateur `;`, BOM UTF-8). Les fichiers sont nommés `cockpit-export-…` : ce motif est ignoré par Git.
- **Paramètres complets** :
  - thème forcé clair ou sombre (`data-theme`, déjà prévu dans `tokens.css`) ;
  - premier jour de la semaine ;
  - mémorisation de la taille et de la position de la fenêtre (plugin `window-state`).

#### V1.1.2

Retours d'usage après la V1.1, en 4 étapes (branche `v1.1.2`, un commit par étape) :

1. **Terminer une tâche en douceur** (✓ fait) : la case se remplit, le titre se barre, puis la ligne s'efface ; toast « Tâche terminée : … » avec « Annuler ».
2. **Titre complet** des tâches et des événements dans leur panneau : il passe à la ligne au lieu d'être coupé (✓ fait).
3. **Deadlines du dashboard** (✓ fait) : le bloc suit le jour affiché ; un réglage fixe combien de jours avant sa deadline un élément y entre (7 par défaut), et les couleurs de l'urgence se recalent sur ce nombre.
4. **« Je veux travailler… »** (✓ fait) : l'app compose le programme du jour, pour une durée (sans jamais la dépasser) ou un nombre de tâches ; ce qui n'est pas fait revient à sa place le lendemain.

### 7.3 Points à reprendre, issus des jalons terminés

- **Sauvegarde et restauration** : couvertes par des tests Rust et vérifiées dans le navigateur (réponses natives simulées), mais pas encore dans la vraie fenêtre : les fenêtres de fichier natives sont à essayer à la main. (La fenêtre « Enregistrer sous » des exports, construite de la même façon, a été vérifiée dans la vraie fenêtre.)
- **Dossier des sauvegardes** : en changer ne déplace pas les sauvegardes déjà faites.
- **Notifications** : vérifiées dans la fenêtre de développement (notification Windows réelle). À confirmer dans l'app installée (nom et icône « Cockpit »). Depuis la V2, le rythme d'une minute vient du côté natif : il ne dépend plus des minuteries de WebView2, qui ralentissent quand la fenêtre est cachée.
- **V2, étape 1, dans la fenêtre de développement** (essais à la main, sans automatisation de la saisie) : fermer avec la croix (la fenêtre se cache, l'icône reste, une notification l'explique la première fois), clic et menu de l'icône, « Quitter », capture rapide (taper, Entrée, Ctrl+Entrée, Échap, brouillon gardé), changement de raccourci dans Paramètres. Déjà vérifié par un lancement réel de l'app de dev : fenêtre visible en moins d'une seconde, démarrage caché avec `--autostart` (fenêtre cachée, clavier laissé à l'application en cours), raccourci global (la petite fenêtre s'ouvre au premier quart de l'écran avec le clavier, se referme au second appui).
- **V2, étape 1, dans l'app installée seulement** : démarrage avec Windows (activé d'office au premier lancement, Cockpit démarre caché), instance unique (relancer Cockpit ramène sa fenêtre), temps de démarrage réel (objectif : moins d'une seconde, 0,7 s mesuré en développement). Installer cette version met la vraie base au schéma 7, avec la sauvegarde automatique d'avant migration.
- **« Réduire les animations »** (Windows › Accessibilité › Effets visuels) : la règle est testée, son effet réel reste à voir à l'écran.
- **Événements récurrents** : changer la date d'une occurrence « pour toute la série » depuis le sélecteur de date du panneau est couvert par les tests, pas encore essayé à l'écran.
- **V2, étape 9, entre deux vrais appareils** : la synchronisation est couverte par des tests (deux bases qui s'échangent leurs fichiers par un faux Drive : créations, modifications, suppressions, la plus récente qui l'emporte, la page gardée en double, le journal du jour en double, l'envoi découpé, une version plus récente refusée ; côté Rust, le code de la clé et le chiffrement), et la migration `0014` passe dans les trois SQLite. **Pas encore essayé** : le vrai dépôt sur Google Drive (il faut la connexion Google de l'étape 8, avec l'API Google Drive activée), puis deux instances, par exemple l'app installée sur deux PC, ou une seconde base de développement. Installer cette version met la vraie base au schéma 14 (sauvegarde automatique d'avant migration) ; rien ne part tant que la synchronisation n'est pas activée.
- **V2, étape 8, la vraie connexion Google** : la connexion (OAuth, coffre d'identifiants, appels à Google Agenda) est couverte par des tests Rust (PKCE, adresse d'autorisation, retour du navigateur, lecture des réponses), la relecture et l'affichage par des tests TypeScript avec un faux Google, et l'affichage a été vérifié dans le navigateur de test avec des événements copiés à la main. **Pas encore essayé avec un vrai compte** : il faut d'abord le projet Google Cloud de l'utilisateur ([docs/google-cloud.md](google-cloud.md)), puis se connecter depuis l'app de développement (`npm run tauri dev`, Paramètres › Google Agenda). À vérifier alors : la page de Google, le retour vers Cockpit, la liste des agendas, les fuseaux horaires, les séries, la relecture toutes les 15 minutes, la déconnexion.
- **V2, étape 7, dans la vraie fenêtre** : vérifié dans le navigateur de test (écran du matin, mode focus et Pomodoro, tâche cochée depuis le focus, journée bouclée fêtée, mini-fenêtre ouverte comme page à part, Paramètres). Pas encore essayés dans l'app : la **mini-fenêtre native** (toujours au-dessus, glisser pour la déplacer, place retenue, la fenêtre principale qui suit une tâche cochée), le **plein écran** natif du mode focus, l'écran du matin après un démarrage caché avec Windows, les **sons** et les quatre nouvelles notifications en vraies notifications Windows.
- **V2, étape 6, dans la vraie fenêtre** : vérifié dans le navigateur de test (page Habitudes et ses trois onglets, cocher sur Aujourd'hui, habitude cochée par un bloc Sport fait, objectif et étapes, séance notée depuis la page et depuis un bloc, nouvel exercice, courbe, revue de la semaine, commande de la palette). Pas encore vus : le **bandeau du dimanche** (seulement le dimanche ; la règle est testée), le **rappel d'habitude** en vraie notification Windows, et la mise en page à 125 %.
- **V2, étape 5, dans la vraie fenêtre** : vérifié dans le navigateur de test (page Révisions, session complète au clavier, carte à revoir qui repasse). À essayer à la main : « Créer les flashcards » depuis une vraie fiche de cours, et la fenêtre des révisions à rebours en créant un examen.
- **V2, étape 4, dans la vraie fenêtre** : vérifié dans le navigateur de test (créer une page, titre, enregistrement, « / », tableau, case, lien « [[ » qui crée une sous-page, liens entrants, favoris). Les raccourcis Markdown n'ont pu être essayés qu'en simulant la frappe : à vérifier au clavier. Pas encore essayés : coller ou déposer une image, l'export Markdown dans la vraie fenêtre « Enregistrer sous », et **l'import Notion** (seulement dans l'app ; couvert par des tests Rust et TypeScript).
- **V2, étape 3, dans la vraie fenêtre** : vérifié dans le navigateur de test (poser un module, déplacer, étirer, ranger des tâches, remplir les trous, semaines types, vue semaine), pas encore dans l'app. La migration `0009` passe dans les trois SQLite. À essayer à la main : le glisser-déposer à la souris réelle, l'étirement, les notifications de blocs, et le bilan du soir après 20 h.
- **V2, étape 2, dans la vraie fenêtre** : tout a été vérifié dans le navigateur de test (`npm run dev`), pas encore dans l'app de développement ni installée. La migration `0008` passe dans `node:sqlite`, sql.js et le SQLite de Rust (`cargo test --lib`) ; installer cette version met la vraie base au schéma 8, avec la sauvegarde automatique d'avant migration. À essayer à la main : le sélecteur de mode et `Ctrl M`, la saisie d'une semaine type complète, et la mise en page à 125 %.

**Choix faits en V2, étape 9 (« Synchronisation »)**, à confirmer à l'usage :
- **Journal par déclencheurs** (migration `0014`, générée depuis le schéma) : trois déclencheurs par table de données (celles de l'export, 33) tiennent `sync_rows`, le dernier changement de chaque ligne : sa clé (tableau JSON), son heure (UTC), son appareil et un numéro d'ordre local tant qu'il n'est pas envoyé ; une suppression laisse sa trace (`deleted`). Les écritures de l'app n'ont pas changé (« Annuler » compris). Les lignes déjà là partent au premier envoi. Les traces de suppression et les fichiers sur Drive ne sont pas encore élagués.
- **Pas synchronisés** (choix de l'étape) : les réglages, le journal des notifications, l'index de recherche et la copie de Google Agenda, propres à chaque appareil.
- **Fichiers** : les lignes changées, avec leurs valeurs du moment, en fichiers de 3 Mo au plus, nommés par appareil et par numéro ; chiffrés côté Rust (XChaCha20-Poly1305, clé de 256 bits) puis déposés dans le dossier caché de l'app sur Google Drive (`drive.appdata`). L'app de développement écrit des fichiers à part (préfixe `dev-`). Chaque minute tant que Cockpit est ouvert et quand sa fenêtre se ferme : d'abord lire les autres, puis envoyer.
- **Conflits** (choix de l'étape) : pour une même ligne, la modification la plus récente l'emporte en entier (à égalité, l'appareil au plus grand identifiant) : tous les appareils arrivent au même résultat. Une **page** modifiée des deux côtés avant d'être envoyée garde l'autre version dans une page à part « … (autre version) » (sauf si les deux sont identiques). Une contrainte d'unicité heurtée (journal du même jour, type de projet ou catégorie de même nom, paiement lié deux fois, exception d'événement) fait céder la ligne locale (date retirée, « (2) » ajouté, lien retiré, exception retirée), et ce changement repart aux autres.
- **Réception** : un fichier par transaction, clés étrangères vérifiées à la fin ; les changements reçus ne sont pas renvoyés. Un fichier d'une version plus récente de Cockpit arrête la synchronisation (« mets à jour cet appareil »).
- **Clé** (choix de l'étape) : créée sur le premier appareil (« Activer ici »), gardée dans le Gestionnaire d'identification de Windows, donnée aux autres par un **code** de 13 groupes de 4 caractères (« Rejoindre la synchronisation ») ; un fichier « key-check » chiffré sur Drive vérifie le code saisi. Rejoindre donne un nouvel identifiant d'appareil (une base restaurée d'un autre PC ne garde pas le sien). Le code QR pour le téléphone viendra à l'étape 10.
- **Connexion Google** : elle demande désormais aussi `drive.appdata` (le dossier caché de Cockpit, rien d'autre du Drive) ; un compte connecté à l'étape 8 voit « Autoriser la synchronisation ».

**Choix faits en V2, étape 8 (« Connexion Google et Google Agenda »)**, à confirmer à l'usage :
- **Lecture seule** (choix de l'étape) : seul le droit `calendar.readonly` est demandé. Drive viendra à l'étape 9, avec une nouvelle autorisation.
- **Projet Google Cloud de l'utilisateur** : Cockpit n'a pas d'identifiant à lui (dépôt public). L'utilisateur crée un client « Application de bureau » ([docs/google-cloud.md](google-cloud.md)) et colle son ID et son code secret dans Paramètres › Google Agenda. Le projet est passé **en production** sans validation par Google (sinon la connexion expire au bout de 7 jours) : un avertissement s'affiche à la connexion.
- **Connexion** (`src-tauri/src/google.rs`) : le navigateur s'ouvre sur la page de Google, qui revient sur un serveur local d'un instant (`http://127.0.0.1:<port>`), avec PKCE et un état aléatoire ; 5 minutes au plus. L'ID et le code secret du client, et le jeton de renouvellement, sont dans le **Gestionnaire d'identification de Windows** (un coffre à part pour l'app de développement) ; le jeton d'accès ne vit qu'en mémoire. Rien de tout cela n'est dans la base, les exports ou le dépôt. HTTP par `ureq` (rustls), coffre par `keyring`.
- **Copie locale** (migration `0013`) : les agendas (`google_calendars`) et leurs événements (`google_events`), d'un mois en arrière à un peu plus d'un an en avant, séries dépliées par Google, heures écrites dans le fuseau de l'ordinateur. Relue au lancement, toutes les 15 minutes tant que Cockpit tourne, et avec « Actualiser » ; chaque agenda est remplacé d'un coup (une erreur réseau garde la copie d'avant). Ni annulés ni refusés. Pas exportée : elle se relit.
- **Agendas** : tous, chacun réglable dans Paramètres (affiché ou non, couleur). Un nouvel agenda est affiché s'il est coché dans Google, avec la couleur de la palette la plus proche de la sienne (par la teinte ; grise pour une couleur terne). Un agenda masqué n'est plus relu.
- **Dans Cockpit** (les deux modes) : une source de l'agenda, « Google Agenda » (filtre du calendrier) ; calendrier, Journée (dessinés sous les blocs), Prochains jours, prochain rendez-vous sous la date d'Aujourd'hui, écran du matin, et le rappel « Rendez-vous » 15 minutes avant. Ils ne se glissent pas ; un clic ouvre leur détail en lecture seule (quand, où, agenda) avec « Ouvrir dans Google Agenda ».
- **Déconnexion** : le jeton est révoqué chez Google et retiré du coffre, la copie locale est effacée ; l'ID du client reste (« Tout oublier » le retire aussi).

**Choix faits en V2, étape 7 (« Le compagnon »)**, à confirmer à l'usage :
- **Écran du matin** (`domains/companion`, P21) : plein écran, à la première ouverture du jour (fenêtre visible) et **avant midi** ; une fois par jour (jour retenu dans l'état d'interface). La journée en une phrase (blocs, cours en mode Cours, rendez-vous, tâches du mode), le premier bloc (ou celui en cours), le devoir à rendre au plus tard demain, l'examen des 7 prochains jours, les habitudes encore attendues. Entrée, Échap ou Espace le ferment ; « Ne plus afficher le matin » le désactive (Paramètres › Compagnon le rallume).
- **Mode focus** : `F` partout (hors saisie et fenêtres), la palette, ou « Focus → » sous la date de la Journée quand un bloc est en cours. Plein écran (dans l'app, la fenêtre passe aussi en plein écran) : le bloc en cours, le temps qui lui reste, ses tâches (la première en grand, cochable). **Pomodoro** au choix : 25 min de travail et 5 de pause par défaut (durées réglables dans le focus, gardées en réglage), les phases s'enchaînent seules ; il vit le temps du mode focus. Sans bloc en cours : le suivant, et le Pomodoro. Échap en sort.
- **Mini-fenêtre « En ce moment »** (`now.html`, `src-tauri/src/now.rs`) : `Ctrl Maj E` ou la palette l'ouvrent et la ferment. 320 × 140, sans bordure, toujours au-dessus, hors de la barre des tâches ; on la déplace en la faisant glisser, sa place est retenue. Elle relit la base toutes les 15 secondes et quand on y revient ; cocher sa tâche prévient la fenêtre principale (`cockpit:data-changed`). Dans le navigateur de développement, une petite fenêtre de navigateur la remplace.
- **Célébrations** (discrètes, désactivables) : un toast avec une étincelle quand la journée est bouclée (il restait des tâches du jour, il n'en reste plus, au moins une faite aujourd'hui), quand une habitude cochée atteint un palier de série (3, 5, 7, 10, 14, 21, 30… jours ; 2, 3, 4, 6… semaines) et quand un objectif est atteint (marqué, ou toutes ses étapes faites). Seulement pendant que Cockpit est ouvert, jamais au lancement.
- **Sons** (désactivés par défaut) : quelques notes douces jouées par Web Audio, sans fichier : fin d'un bloc prévu, fin d'un tour de Pomodoro, fin de pause. Les activer en fait entendre un.
- **Notifications ajoutées** (chacune désactivable) : bilan du soir à 20 h s'il reste des blocs à marquer (une fois) ; devoir à rendre demain et examen à J-3 (à l'ouverture ou à 8 h) ; cartes à revoir (idem). « Révisions du jour » n'a pas de règle à part : ce sont des blocs Révision, annoncés comme les autres blocs.

**Choix faits en V2, étape 6 (« Sport, habitudes et objectifs »)**, à confirmer à l'usage :
- **Habitudes** (migration `0012`, `domains/habits`, P20) : chaque jour, X fois par semaine ou certains jours ; icône et couleur ; rappel facultatif ; un **module** de la Journée (un bloc fait de ce module la coche tout seul) ; un objectif servi. Seules les coches sont stockées (`habit_logs`, un jour par ligne). La semaine va du lundi au dimanche. **Série** : jours prévus faits d'affilée (aujourd'hui compte s'il est déjà fait, sinon la série court jusqu'à hier ; un jour non prévu ne la casse pas), ou semaines réussies d'affilée pour « X fois par semaine ». **Taux** : jours prévus faits sur les 30 derniers jours (semaines réussies pour « X fois par semaine »). Arrêter une habitude l'archive (ses coches restent pour les revues passées), avec « Annuler ».
- **Page Habitudes**, commune aux deux modes, en trois onglets : **Habitudes et objectifs** (une ligne par habitude : case du jour, la semaine en points, la série, le taux ; la fenêtre d'une habitude montre la grille du mois), **Séances**, **Revue de la semaine**.
- **Aujourd'hui** (les deux modes, aujourd'hui seulement) : une rangée de pastilles, une par habitude attendue ce jour (pour « X fois par semaine » : tant que la semaine n'est pas tenue, avec « 1/3 ») ; un clic la coche. Aussi sur l'Aujourd'hui vide d'un nouvel utilisateur.
- **Objectifs** : titre, date visée, notes, étapes à cocher ; progression = étapes faites (atteint = complet) ; atteints repliés sous la liste. Supprimer un objectif garde ses habitudes, avec « Annuler ».
- **Carnet de séances** : une séance a une date, un ressenti (Dure, Difficile, Correcte, Bonne, Excellente), des notes et des séries ; muscu : répétitions × charge (sans charge : poids du corps) ; cardio : durée et distance. Les exercices se créent dans la séance et se réutilisent. **Courbe** par exercice : le meilleur de chaque séance (charge la plus lourde, sinon le plus de répétitions ; distance, sinon durée). Un **bloc de sport** (module Sport ou icône haltère) propose « Noter la séance » : le bloc est marqué fait au passage, la séance lui est rattachée (« Voir la séance » ensuite) ; supprimer le bloc garde la séance.
- **Revue de la semaine** (`habits/service.ts`) : heures de travail, de cours et devoirs (blocs Cours faits et emploi du temps) et de sport (blocs de sport faits), tâches terminées, devoirs faits, encaissé, habitudes tenues (« 3/7 »), et une phrase de bilan ; toute semaine passée se consulte (flèches ← →). Le **dimanche**, un bandeau sur Aujourd'hui la propose ; fermé, il revient la semaine suivante.
- **Rappel d'habitude** : nouvelle règle de notification « Rappels d'habitude » (désactivable) : à l'heure choisie, pendant 30 minutes, une fois par jour, si l'habitude est attendue et pas encore faite.

**Choix faits en V2, étape 5 (« Révisions »)**, à confirmer à l'usage :
- **Flashcards** (migration `0011`, `school/flashcards`) : un recto, un verso, une matière. Seules les révisions sont stockées (`flashcard_reviews`) ; l'état d'une carte (intervalle, facilité, échéance) est recalculé en les rejouant : SM-2 simplifié, à la façon d'Anki. Notes : 1 à revoir (la carte repart de zéro et revient le jour même), 2 difficile, 3 bien, 4 facile ; le prochain intervalle est écrit sous chaque bouton.
- **Cartes du jour** : celles dont l'échéance est arrivée (la plus en retard d'abord), puis les nouvelles, **20 par jour au plus** (une carte vue pour la première fois aujourd'hui en fait partie).
- **Session** : une fenêtre au clavier, Espace pour voir la réponse, 1 à 4 pour se noter ; une carte « à revoir » repasse à la fin. Chaque note est enregistrée aussitôt (fermer en cours de route ne perd rien). Depuis la page **Révisions** (mode Cours : par matière, « Tout réviser »), la fiche d'une matière (section Flashcards) et « Cartes à revoir » sur Aujourd'hui en mode Cours.
- **Cartes depuis une page** : dans une page rattachée à une matière, chaque ligne « question :: réponse » devient une carte avec « Créer les flashcards » (menu de la page) ; une réponse changée met la carte à jour ; une ligne retirée ne supprime pas sa carte (on garde l'historique). Une fiche de cours est donc une page rattachée à sa matière (P19).
- **Révisions à rebours** (`exams/revision-plan.ts`) : à la création d'un examen à venir, une fenêtre propose J-7, J-3 et J-1 (les jours encore à venir), chacun en bloc « Révision » d'une heure dans le premier créneau libre de 17 h à 22 h (pas avant l'heure qu'il est, aujourd'hui) ; sans créneau libre, 18 h, signalé par un triangle. On décoche ce qu'on ne veut pas ; « Annuler » retire les blocs posés.
- **Pas encore** : la notification « cartes à revoir » (étape 7).

**Choix faits en V2, étape 4 (« Pages »)**, à confirmer à l'usage :
- **Éditeur** : TipTap 3 (`domains/pages/editor`), sans style imposé (styles dans `global.css`, classe `page-editor`). Le schéma des blocs (`editor/nodes.ts`) est séparé de leurs vues React (`editor/extensions.ts`) : l'import et l'export Markdown l'utilisent sans l'éditeur (`@tiptap/markdown`).
- **Blocs** : titres (3 niveaux), paragraphes, listes à puces et numérotées, cases à cocher, citations, séparateurs, code, tableaux simples, images. « / » ouvre la liste des blocs (filtrée en tapant) ; les raccourcis Markdown marchent en tapant (`# `, `- `, `1. `, `[ ] `, `> `, ` ``` `, `---`, `**gras**`).
- **Liens entre pages** : « [[ » puis quelques lettres ; « Nouvelle page « … » » crée une sous-page du même nom. Le lien montre le titre à jour de la page (barré si elle n'existe plus) et l'ouvre au clic. Les liens sont indexés à chaque enregistrement (`page_links`) pour « Pages qui renvoient ici ».
- **Images** : collées, déposées ou choisies (`/` › Image), réduites à 1600 px (WebP) et gardées **dans la base** (table `attachments`, en data URL), au lieu d'un dossier `attachments\` à côté de la base comme le prévoyait le §9.4 : une sauvegarde contient tout, et la synchronisation (étape 9) les transportera comme le reste. Une image est référencée dans la page par `attachment:<id>`.
- **Arborescence** : sous-pages sans limite de profondeur, « Déplacer dans une autre page… » (jamais dans une de ses propres sous-pages), fil d'Ariane. Supprimer une page emporte ses sous-pages ; « Annuler » remet tout, liens et images compris.
- **Pages communes aux deux modes**, une page « Pages » (arbre, puis « Journal » et « Modèles » repliés) et les **favoris** (étoile) dans la barre latérale des deux modes.
- **Rattachement** (P19) : à un projet, un client ou une matière (menu « … » de la page) ; la page apparaît dans la fiche du projet (« Pages ») et de la matière (« Fiches et pages »), d'où l'on peut aussi en créer. Une page créée depuis une fiche y est rattachée. L'entité n'a pas de clé étrangère : si elle disparaît, la page reste.
- **Modèles** : trois proposés (Fiche de cours, Compte rendu client, Brief de projet), modifiables comme des pages ; « Enregistrer comme modèle » copie une page parmi eux ; « Nouvelle page » propose une page vierge ou un modèle.
- **Journal du jour** : bouton « Journal » de la Journée ; la page du jour est créée au premier clic (« Journal du jeudi 26 novembre »).
- **Case → tâche** : `Ctrl+Entrée` dans une case à cocher la transforme en vraie tâche (rattachée au projet ou à la matière de la page) et la retire de la page ; « Annuler » supprime la tâche et remet la case.
- **Recherche** : titre et texte des pages dans `Ctrl K` (triggers de la migration `0010`).
- **Export** : « Exporter en Markdown… » (`cockpit-export-page-<titre>-<date>.md`), liens en `[[Titre]]`, images incluses dans le fichier.
- **Import Notion** : depuis la page Pages, on choisit le dossier d'un export Notion « Markdown & CSV » **décompressé** (commande native `notion_import_pick`, qui lit sans rien écrire, 5 000 fichiers et 400 Mo au plus). Tout arrive sous une page « Import Notion du … », en un seul lot : pages et sous-pages (d'après les dossiers de Notion), titres, images (réduites) et liens entre pages. Les bases de données Notion (CSV) ne sont pas reprises. Pas d'import dans le navigateur de développement.

**Choix faits en V2, étape 3 (« Organisateur de journée »)**, à confirmer à l'usage :
- **Page Journée** (`domains/day`, migration `0009`) : une page à part, commune aux deux modes, juste sous Aujourd'hui (qui reste l'accueil). Une colonne de 6 h à 24 h (Paramètres › Journée), ouverte sur l'heure qu'il est ; vue jour (avec la bibliothèque et « À caser ») ou semaine (`J`, `S`, `←` `→`, `T`, `D`). Les cours, les rendez-vous et les examens à heure fixe sont dessinés dessous, en pointillés ; un bloc qui les chevauche porte un triangle, sans être interdit.
- **Modules** (P16) : quatre proposés (Sport 3 h, Devoirs 1 h 30, Deep work 2 h, Révision 1 h), à modifier ou supprimer. Un module a un nom, une icône (liste fermée de 18), une couleur, une durée et un mode (la bibliothèque montre ceux du mode, « N de l'autre mode » montre le reste). Un bloc recopie le nom, l'icône, la couleur et le mode du module au moment où il est posé : modifier ou supprimer le module ne touche pas les blocs déjà posés.
- **Poser et bouger** : glisser un module sur la colonne pose un bloc à cette heure (au quart d'heure) ; un clic dans un créneau libre propose les modules ou un bloc libre. Un bloc se glisse (aussi d'un jour à l'autre en vue semaine), s'étire par sa poignée du bas (15 minutes au moins, jamais après minuit), et s'ouvre d'un clic (titre, jour, horaire, statut, ses tâches). Chaque geste a son « Annuler ».
- **Tâches dans les blocs** (P17, `tasks.block_id`) : on glisse une tâche ou un devoir de « À caser » (ce qui est prévu ce jour-là et pas encore dans un bloc) dans un bloc ; la redéposer dans « À caser » l'en sort. La tâche prend le jour du bloc sans le recopier : elle est dans Aujourd'hui ce jour-là (et reportée ensuite si elle n'est pas faite), et suit le bloc qu'on déplace. Le bloc montre ses tâches (à cocher) et le temps qui reste, 30 minutes comptées pour une tâche sans estimation. Supprimer un bloc libère ses tâches.
- **Semaines types** (P18) : plusieurs, nommées. On les crée à partir d'une vraie semaine (« Enregistrer cette semaine comme semaine type… »), on en applique une aux jours affichés (des blocs ordinaires, retirables avec « Annuler »), on peut la remplacer par la semaine affichée, la renommer ou la supprimer. Pas d'éditeur à part : on ajuste une semaine, puis on la réenregistre.
- **Remplir les trous** : dans les créneaux libres d'au moins 30 minutes, de 8 h à 21 h (et pas avant l'heure qu'il est), des blocs « Devoirs » ou « Deep work » (l'allure de ces modules) avec les tâches les plus pressantes, dans l'ordre de « Je veux travailler… » ; un bloc ne mélange pas devoirs et travail et dure 2 h au plus. On décoche ce qu'on ne veut pas ; rien n'est posé avant « Poser ».
- **Bloc en cours** : sous la date, le bloc en cours et le temps qui reste, puis le suivant ; le bloc en cours est entouré. **Notifications** (Paramètres › Notifications › Blocs de la journée, activée) : au début et à la fin de chaque bloc pas encore marqué.
- **Bilan du soir** : à partir de 20 h (ou dès que tous les blocs du jour sont finis), un bandeau propose « Faire le bilan » : chaque bloc passé se marque Fait, Raté ou Demain (même heure, avec ses tâches) d'un clic, et se change en recliquant. La notification du bilan viendra avec l'étape 7.
- **Ailleurs** : les blocs sont dans le calendrier (filtre « Blocs », vues semaine et jour, glissables d'un jour à l'autre), pas au mois ni dans « Prochains jours ».

**Choix faits en V2, étape 2 (« Modes et espace Cours »)**, à confirmer à l'usage :
- **Modes** (P13, `app/modes.ts`) : le mode est mémorisé (`ui-store`) et suit la page ouverte (ouvrir un projet depuis la recherche repasse en Travail). Changer de mode sur une page de l'autre mode ramène à Aujourd'hui ; une page commune (calendrier, boîte de réception, paramètres) reste affichée. Les pages de l'autre mode se trouvent toujours par `Ctrl K` ; seules celles du mode en cours y sont suggérées. Le menu « Nouveau » et `N` suivent le mode.
- **Chaque mode montre les siens** : la page Tâches, Aujourd'hui (mode Travail) et « Je veux travailler… » ne montrent pas les devoirs ; le dashboard du mode Travail ne montre ni cours ni examens. Le calendrier, la boîte de réception, la recherche et les notifications montrent tout.
- **Matières** (migration `0008`, `domains/school`) : nom, couleur (la première libre est proposée), prof, salle, coefficient (saisi « 1,5 » ou « 1.5 »). Une fiche par matière : ses devoirs, ses notes du semestre, ses cours de la semaine, ses examens. Supprimer une matière emporte ses devoirs, cours, examens et notes ; le toast dit ce qui part et « Annuler » remet tout.
- **Devoirs** (P14) : une tâche avec `subject_id` ; jamais à la fois dans un projet et une matière (choisir l'un retire l'autre). Les sous-tâches suivent la matière de leur parente. Leur date principale est « À rendre » (la deadline) ; « À faire le » (le début) est facultatif. Page Devoirs : en retard, à rendre jour par jour, sans date, puis « Rendus ».
- **Emploi du temps** : **une seule semaine type**, toute l'année (pas de semaines A/B, comme demandé). Contrairement à l'esquisse du §9.4, les cours ne sont pas des événements récurrents mais une table à part (`timetable_slots`) : ils suivent le calendrier scolaire (semestres, vacances), et `events.kind` ne peut pas recevoir de nouvelle valeur sans reconstruire la table. Les cours de chaque jour sont tout de même calculés, jamais recopiés (P8, P15). Ils sont dans les vues semaine et jour du calendrier (filtre « Cours »), pas au mois (une routine qui cacherait le reste), et ne se glissent pas : on les change dans la page Emploi du temps. Annuler un seul cours (prof absent) n'existe pas encore.
- **Semestres et vacances** (`school_periods`) : saisis dans Emploi du temps › Semestres et vacances, avec deux semestres proposés en un clic (septembre-janvier, février-juin). Les semestres ne se chevauchent pas. Sans semestre, la semaine type vaut toute l'année et les notes font une seule moyenne. Une seule année scolaire pour l'instant : à la rentrée suivante, il faudra changer les dates (une vraie « nouvelle année » reste à prévoir).
- **Examens** (`exams`, pas des événements, pour la même raison) : matière, titre, jour, horaire facultatif, salle, « À réviser ». Dans le calendrier (filtre « Examens »), ils se glissent d'un jour à l'autre. Supprimer un examen garde sa note. Les révisions à rebours viendront avec l'étape 5.
- **Notes** (`grades`) : note sur un barème (20 par défaut), coefficient, date (qui la range dans un semestre), intitulé, examen d'origine facultatif. Un examen passé propose « Ajouter la note ». Moyenne d'une matière : notes ramenées sur 20, pondérées par leur coefficient ; moyenne générale : pondérée par le coefficient des matières notées ; année : moyenne des moyennes de semestre de chaque matière. Rien n'est stocké.
- **Aujourd'hui en mode Cours** : deux colonnes. À gauche, les cours du jour (celui en cours en avant, les passés effacés) et les devoirs à rendre (retards, semaine qui vient, à faire ce jour-là) ; à droite, le prochain examen et les prochains jours (examens et événements sans projet). Même navigation de jour en jour qu'en mode Travail ; `P` compose un programme de devoirs.

**Choix faits en V2, étape 1 (« Toujours là »)**, à confirmer à l'usage :
- **Boîte de réception** (migration `0006`, domaine `inbox`) : une page sous « Aujourd'hui », sans raccourci `Ctrl+chiffre` (les six pages gardent les leurs), avec un compteur dans la barre latérale (un point quand elle est réduite). Les captures les plus récentes d'abord, sur une ligne. Sur la ligne qui a le focus : `T` et `E` ouvrent « Nouvelle tâche » et « Nouvel événement » pré-remplis (on choisit le projet ou la date avant de valider), `I` range la capture en idée d'un projet, `Entrée` la reformule, `Suppr` la supprime. La capture quitte la boîte dans le même lot que la création ; « Annuler » la remet à sa place. Le focus passe à la ligne suivante.
- **Zone de notification** (`presence.rs`) : fermer la fenêtre la cache (réglage `presence.keepInTray`, activé par défaut, lu côté natif à la fermeture) ; décoché, fermer quitte. L'icône est toujours là tant que Cockpit tourne : un clic rouvre la fenêtre, le clic droit propose « Ouvrir Cockpit », « Capture rapide » et « Quitter ». La palette a aussi « Quitter Cockpit ». En développement, l'infobulle de l'icône dit « Cockpit (développement) ».
- **Démarrage avec Windows** : activé d'office une seule fois, au premier lancement de l'app installée (réglage `presence.autostartDecided`), puis réglable dans Paramètres › Démarrage et fermeture. La case montre l'état réel côté Windows (il peut aussi être coupé depuis le Gestionnaire des tâches), pas une valeur recopiée. Jamais inscrit depuis un build de développement : il pointerait vers un exécutable qui ne marche pas sans son serveur.
- **Lancé caché** (`--autostart`) : la tournée des rappels n'est pas celle d'« ouverture » mais une vérification ordinaire, qui devient la tournée du matin dès 8 h, résumé compris (avant midi) : le tableau de bord n'est pas à l'écran. Le journal des notifications est purgé à chaque tournée, et la sauvegarde du jour vérifiée chaque heure, puisque Cockpit peut rester lancé plusieurs jours.
- **Instance unique** : seulement dans l'app installée. L'app de développement et l'app installée ont le même identifiant et doivent pouvoir tourner ensemble.
- **Fenêtres créées cachées** : elles ne prennent pas le focus à leur création (sinon la frappe en cours dans une autre application se perdait) ; elles le reçoivent en s'affichant.
- **Capture rapide** (`capture.rs`, `capture.html`) : le raccourci ouvre une fenêtre d'une ligne, sans bordure, toujours au-dessus, au premier quart de l'écran où se trouve le pointeur ; un second appui la referme. `Entrée` note et referme, `Ctrl+Entrée` note et garde la fenêtre, `Échap` abandonne ; cliquer ailleurs la cache en gardant le brouillon. Raccourcis proposés : `Ctrl+Maj+Espace`, `Alt+Maj+C`, `Win+Alt+C`, ou aucun (réglage `capture.shortcut`). Si Windows refuse un raccourci déjà pris, rien ne change et Paramètres le dit. Quand l'app de développement et l'app installée tournent ensemble, le raccourci appartient à la première lancée.
- **Événements récurrents** (migration `0007`, `agenda/recurrence.ts`) : le RRULE est écrit à la main pour ce que l'interface saisit (jour, semaine, mois, année, intervalle, jours de la semaine, fin). Une règle incomprise ne répète rien. Les jours sont calculés sans fuseau horaire. « Chaque mois » le 31 saute les mois plus courts et le 29 février ne revient que les années bissextiles, comme le veut la norme. « Toutes les 2 semaines » compte en semaines du lundi au dimanche, quel que soit le réglage du premier jour de la semaine. Le jour de la semaine du premier événement reste toujours coché ; il suit un changement de date.
- **Occurrences** : `listAgenda` renvoie une ligne par occurrence. Le calendrier, « Prochains jours », le bloc Deadlines et les notifications suivent sans autre changement ; chaque occurrence a sa notification. La fiche projet montre l'événement une fois, à sa prochaine occurrence. Dans `Ctrl+K`, un événement récurrent n'a pas de date et n'est jamais « passé ».
- **Une fois ou toute la série** : dans le panneau ouvert sur une occurrence, « Date » et « Horaire » sont ceux de cette occurrence ; les changer demande « Cette fois » ou « Toute la série ». « Cette fois » ne porte que sur la date et l'heure : le titre, le type, le lieu, les notes, « Journée entière » et la répétition valent pour l'événement entier. Changer le jour pour toute la série remplace ce jour de la semaine par le nouveau ; une série non hebdomadaire se décale d'autant. Une occurrence modifiée « cette fois » garde son moment si l'heure de la série change ensuite. Glisser une occurrence dans le calendrier ne déplace qu'elle. Supprimer « celle-ci et les suivantes » arrête la série la veille ; depuis la première occurrence, cela supprime l'événement. `Ctrl+Z` n'agit pas tant que le panneau est ouvert (règle commune aux fenêtres) : le bouton « Annuler » du toast reste cliquable.
- **Chiffre d'affaires** : onglet de Finances, une année à la fois, trimestres et mois. Tous les encaissements reçus, à leur date de réception, quel que soit le type de projet ou le compte : la même règle que « Encaissé ce mois ». Un mois à venir affiche un tiret. Si certains types de projet doivent un jour être exclus de la déclaration, ce sera un réglage à ajouter.
- **Animations** (Motion, `ui/motion`) : fondu au changement de page (pas de déplacement : les pages qui se mesurent, comme le calendrier, restent justes), lignes qui s'ouvrent et se replient dans les listes de tâches sans glisser-déposer et dans la boîte de réception, toasts, repli de la barre latérale. Une liste qui change de plus de 3 lignes d'un coup s'affiche sans animation. Le principe 6 du design system (§6.1) est revu en conséquence. Restent pour plus tard : l'arbre des tâches et le kanban (glisser-déposer), les fenêtres et les panneaux.
- **Poids** : le code chargé au démarrage grossit d'environ 47 kB (15 kB compressés) ; le moteur d'animation (49 kB) est chargé après le premier rendu.


**Choix faits en V1.1.2, étape 4 (« Je veux travailler… »)**, à confirmer à l'usage :
- **Où** : « Je veux travailler… » à côté du titre du bloc Aujourd'hui du dashboard (touche `P`), en haut des pages Tâches et Planning (`P` aussi sur le planning), et dans la palette Ctrl+K. Une seule fenêtre (`WorkPlanDialog`), qui compose le programme d'aujourd'hui.
- **Demande** : « Un temps » (30 min, 1 h, 2 h, 4 h d'un clic, puis − / + au quart d'heure, de 15 min à 10 h) ou « Un nombre de tâches » (de 1 à 10, 3 par défaut). La dernière demande est retenue pour la fois suivante.
- **Quelles tâches** (`planCandidates`) : toutes les tâches à faire, sauf celles qui ont des sous-tâches (une catégorie ; ses sous-tâches, elles, peuvent être choisies) et celles des projets en pause. Celles des projets à venir ou en proposition peuvent l'être : ce sont de vraies choses à faire.
- **Ordre de préférence** (`rankForPlan`), par paliers : d'abord les retards et ce qui est dû aujourd'hui ; puis ce qui est prévu aujourd'hui (ou avant), dû dans les 3 jours ou **urgent** (« Urgente » veut dire « à faire vite », même sans deadline) ; puis les tâches de priorité haute et les deadlines de la semaine ; puis le reste. Dans un palier : la deadline la plus proche, la priorité, le début le plus ancien, l'ordre manuel. La fenêtre le résume en une ligne.
- **Par durée** : dans cet ordre, chaque tâche estimée qui tient dans le temps restant ; une tâche trop longue est sautée et une plus courte, plus loin, peut combler. Le total ne dépasse jamais la durée (pour 2 h et deux tâches de 1 h 30 : une seule). **Les tâches sans estimation ne sont pas proposées** (impossible de savoir si elles tiennent : une durée par défaut pourrait faire dépasser le temps choisi). La fenêtre dit combien sont laissées de côté ; « Leur donner une durée… » les liste (les 5 premières dans l'ordre de préférence, les autres s'estiment dans leur panneau), chacune avec un menu de durée : une tâche estimée ici entre aussitôt dans le calcul. **Par nombre** : les premières dans l'ordre, estimées ou non.
- **Ajuster** : « Pas celle-ci » au survol d'une tâche proposée (une autre prend sa place), « Autre proposition » (écarte toutes celles proposées ; quand il n'y a plus rien, on repart des premières). Les tâches écartées sont oubliées à la fermeture.
- **Mettre au programme** (Ctrl+Entrée) : les tâches choisies reçoivent le jour (`planned_on`, migration 0005) ; leurs dates ne changent pas. Un nouveau programme remplace celui du jour (la fenêtre le dit, avec « Effacer le programme ») ; les tâches déjà terminées gardent le leur. Toast « 3 tâches au programme d'aujourd'hui. » avec « Annuler ».
- **Dans Aujourd'hui** (dashboard et page Tâches) : un groupe « Au programme » en tête, avec son estimation et « Modifier », puis « En retard » et « Aussi aujourd'hui » pour le reste du jour. Une tâche venue d'un autre jour y montre sa date (« Dans 10 jours ») : on voit d'où elle vient. « Retirer du programme » au survol, avec « Annuler ». Tout fait : « Programme terminé : 3 tâches faites. ». Les compteurs (« 6 aujourd'hui ») comptent le programme ; une tâche au programme n'est plus répétée dans les jours à venir (7 jours, Prochains jours, un jour à venir du dashboard).
- **En fin de journée** : rien n'est réécrit. Le lendemain, `planned_on` n'est plus aujourd'hui : une tâche du programme qui n'est pas faite est de nouveau à sa place, sa date d'avant (dans quelques jours, ou sans date). Une tâche en retard le reste. Le calendrier ne montre pas le programme : il garde les vraies dates.

**Choix faits en V1.1.2, étape 3 (deadlines du dashboard)**, à confirmer à l'usage :
- **Le bloc suit le jour affiché** (flèches, `D`) : il montre ce qui doit être fini de ce jour-là à J+N, avec un compte à rebours compté depuis ce jour (« Dans 5 jours » vu du 2 octobre pour le 7). Sa période s'affiche à côté du titre : « 7 prochains jours » aujourd'hui, sinon « du 2 au 9 oct. ». Un projet en retard ce jour-là reste en tête ; une tâche dont la deadline tombe avant ce jour n'y est plus (elle est dans les jours précédents). Les échéances du calendrier sont lues sur la même période. Le reste du dashboard ne change pas : les chiffres, À surveiller et Prochains jours restent ceux d'aujourd'hui.
- **Réglage** (Paramètres › Tableau de bord › Deadlines, `deadlines.days`) : 3, 5, 7 (par défaut), 10, 14, 21 ou 30 jours avant la deadline. C'est l'horizon des deadlines de toute l'app : une copie (`core/deadline-horizon.ts`, comme le premier jour de la semaine) est lue avant le premier rendu et suit chaque changement.
- **Couleurs recalées** (`deadlineThresholds`, dans les proportions de 7 jours : rouge le jour même, ambre à 3 jours) : pour 14 jours, rouge aujourd'hui et demain, ambre jusqu'à 6 jours, bleu jusqu'à 14 ; pour 30 jours, rouge jusqu'à 3 jours, ambre jusqu'à 13. Au-delà de 7 jours, le compte à rebours continue (« Dans 12 jours ») au lieu de la date. Pour attirer l'œil à mesure que la deadline approche, le drapeau se remplit en ambre et en rouge, et le compte à rebours s'appuie en rouge.
- **Partout la même échelle** : lignes et cartes de tâches, panneau d'une tâche, fiche et lignes de projet, calendrier (drapeaux et fonds teintés des deadlines qui pressent), planning, À surveiller (un projet rouge ou ambre n'y a pas de rappel secondaire) suivent le même horizon. Une deadline a donc la même couleur dans le bloc et sur sa ligne. Avec un horizon long, il y a un peu plus de bleu dans les listes et le calendrier ; à 7 jours, rien ne change. Les notifications gardent leurs règles (J-3, jour J, veille).

**Choix faits en V1.1.2, étape 2 (titres complets)** : dans le panneau d'une tâche et d'un événement, le titre passe à la ligne et le champ grandit avec lui (`InlineText` avec `wrap`). Il reste un titre d'une ligne : Entrée l'enregistre, un retour à la ligne collé devient un espace. La case d'une tâche reste alignée sur la première ligne. Les listes gardent leurs titres sur une ligne, coupés : le panneau les montre en entier.

**Choix faits en V1.1.2, étape 1 (terminer une tâche en douceur)**, à confirmer à l'usage :
- **Animation** (1,2 s, `tasks/completion-store.ts` et `global.css`) : la case se remplit et la coche se dessine, le titre se barre de gauche à droite et passe en gris, puis la ligne s'efface et se replie sans à-coup. La tâche n'est terminée en base qu'à la fin : recocher pendant l'animation la garde à faire, sans rien écrire ; la supprimer pendant l'animation l'empêche d'être terminée. Changer de page pendant l'animation ne perd rien (le minuteur ne dépend d'aucun composant).
- **Partout où l'on coche** : lignes de tâches (dashboard, page Tâches, fiche projet), cartes du kanban (la carte s'efface de sa colonne puis passe dans « Terminé »), panneau d'une tâche (case ou statut « Terminé » : rien ne s'efface, la case et le titre suffisent, 0,45 s). Une carte déposée dans la colonne « Terminé » est terminée tout de suite. Espace sur une ligne fait pareil.
- **Fiche projet** : une sous-tâche cochée reste sous sa parente, barrée ; cocher une tâche qui a des sous-tâches, ou la dernière sous-tâche ouverte (ce qui termine la parente), efface tout le groupe, qui passe dans les terminées (règle `treeCompletion`). Dans le panneau d'une tâche, ses sous-tâches cochées restent aussi.
- **Toast** : « Tâche terminée : Faire la refonte graphique » (titre raccourci au-delà de 60 caractères), avec « Annuler » (et Ctrl+Z), qui remet la tâche, sa parente et ses sous-tâches comme avant (statut et date de fin). Rouvrir une tâche terminée reste immédiat, sans toast. La barre de sélection dit « 3 tâches terminées. ».
- Avec « Réduire les animations » de Windows, rien ne bouge : la ligne disparaît à la fin du délai.

**Choix faits en V1.1, étape 8 (petits défauts)**, à confirmer à l'usage :
- **Suppr partout** : dans le panneau d'une tâche ou d'un événement, Suppr supprime ce qu'il montre (« Annuler » dans le toast, Ctrl+Z), sauf pendant la saisie, sur une sous-tâche (Suppr supprime alors la sous-tâche) ou dans un menu ouvert par-dessus (`handlePanelDeleteKey`). Sur la fiche projet, Suppr supprime le projet seulement quand rien d'autre n'a le focus (ni champ, ni ligne, ni bouton ou lien : `useDeleteShortcut`), puis revient à la liste ; « Annuler » le remet avec tout ce qu'il contenait. Le menu « … » de la fiche l'indique.
- **Clients** : « Archiver » dans la fiche, avec « Annuler » ; « Réactiver » depuis la fiche d'un client archivé. Un client archivé garde ses projets et ses paiements, n'est plus proposé dans les formulaires (celui déjà choisi reste affiché) et apparaît sous « N clients archivés », replié, en bas de la page Clients. La fiche montre « 600 € encaissés · 1 550 € à recevoir » (propositions exclues, comme partout ; ses paiements directs compris).
- **Comptes** (Paramètres › Comptes) : ajouter (nom, professionnel ou personnel), renommer d'un clic, changer le type, archiver. Un compte ne s'archive qu'à 0 € (sinon cet argent disparaîtrait des soldes : « fais d'abord un virement ») et s'il en reste un autre ; ses transactions restent. Archivés : listés à part, avec « Réactiver ».
- **Fiche projet** : « Prochains événements » entre Propriétés et Finances : les 3 plus proches qui ne sont pas passés (un événement en cours sur plusieurs jours compris), avec « Aujourd'hui · 16:00 · Visio », « Lundi · 09:30 » ou « Jusqu'à demain », puis « et N autres dans le calendrier » et « + Événement » (lié au projet). Un clic ouvre le panneau de l'événement.
- **Erreurs dans les fenêtres** : une erreur dans une fenêtre (`Dialog`), un panneau de tâche ou d'événement ou la palette s'affiche dans cette fenêtre (« Cette fenêtre a rencontré un problème », avec le message et « Fermer ») : le reste de l'app continue. Un dernier filet (`OverlaysBoundary`) entoure toutes les fenêtres globales : il les ferme et le dit dans un toast, sans jamais remplacer la page.
- **Vue mois** : seulement les semaines du mois (4 à 6, plus de sixième semaine entièrement au mois suivant). Les rangées se partagent la hauteur de la fenêtre et la page ne défile plus ; chaque case montre ce qui tient dans sa rangée (3 éléments au plus, barres comprises), la dernière ligne cédant sa place à « +N » (règle `monthCellLimit`). Sous 82 px par rangée (fenêtre très basse), la page défile. « Aucune date sur cette période » passe sous le titre.
- **Vérifié dans la vraie fenêtre** (WebView2) : Ctrl+N ouvre « Nouvelle tâche » (l'aide des raccourcis l'indique désormais), Ctrl+K la palette, ? l'aide.
- **Au passage** : « 100 % » ne passe plus à la ligne à côté d'une barre de progression étroite (projets en cours du dashboard).

**Choix faits en V1.1, étape 7 (exports et paramètres)**, à confirmer à l'usage :
- **Exports** (Paramètres › Exports, `data/export/`) : trois boutons. Le fichier est préparé par l'interface, puis la commande Rust `export_save` ouvre « Enregistrer sous » dans Documents, sous un nom daté (`cockpit-export-donnees-2026-09-26.json`, `…-transactions-….csv`, `…-encaissements-….csv`) : Entrée suffit. Rust refuse tout nom qui n'est pas un simple `cockpit-export-….json` ou `….csv` (motif ignoré par Git), et la base elle-même comme destination. Dans le navigateur de développement, un téléchargement ordinaire remplace la fenêtre native.
- **JSON** : toutes les tables de données (types, catégories, comptes, clients, projets, tâches, idées, événements, encaissements, transactions), dans l'ordre des dépendances, avec la version du schéma et la date de l'export ; clés en camelCase, valeurs telles qu'en base (centimes, dates ISO). Ni les réglages, ni le journal des notifications, ni l'index de recherche : ce ne sont pas des données saisies (et un futur secret, comme l'adresse iCal de la V2, n'y sera jamais).
- **CSV des transactions** : une ligne par mouvement sur un compte (un virement en a deux), du plus ancien au plus récent : date (JJ/MM/AAAA), compte, type, libellé, catégorie, projet, montant signé (« -35,00 », virgule décimale, sans espace ni symbole : Excel le lit comme un nombre), notes.
- **CSV des encaissements** : libellé, projet, client (celui du projet, sinon le client direct), montant, date prévue, statut, date de réception, n° de facture, notes ; tous, y compris ceux des propositions, marqués « Prévu (proposition) ».
- **Thème** (Paramètres › Apparence, réglage `appearance.theme`) : « Comme Windows » (par défaut), « Clair » ou « Sombre ». Il pose `data-theme` sur la page et règle aussi la barre de titre de Windows (permission `core:window:allow-set-theme`).
- **Premier jour de la semaine** (réglage `calendar.weekStartsOn`) : lundi (par défaut) ou dimanche. Il vaut pour le calendrier (mois et semaine), le planning (semaines et bande « En parallèle ») et le sélecteur de date. Les règles pures le reçoivent en paramètre ; une copie dans `core/week-start.ts` évite une requête à chaque grille. « Lundi prochain » (raccourci des dates) reste un lundi.
- **Au démarrage**, thème et premier jour sont lus avant le premier rendu, pendant que la fenêtre est encore cachée : ni éclair de l'autre thème, ni calendrier redessiné. Un changement dans Paramètres s'applique tout de suite.
- **Fenêtre** : plugin officiel `window-state`, côté Rust seulement. Cockpit se rouvre à la même taille, au même endroit, agrandi s'il l'était ; sa visibilité n'est pas restaurée (la fenêtre reste cachée jusqu'au premier rendu). L'état est gardé dans le dossier de configuration de l'app (`.window-state.json`), partagé par l'app installée et celle de développement.

**Choix faits en V1.1, étape 6 (notifications)**, à confirmer à l'usage :
- **Règles** (`notifications/model.ts`), chacune une case de Paramètres › Notifications, toutes cochées par défaut (réglage `notifications.rules` ; une règle absente du réglage est cochée) :
  - **Rendez-vous** : tout événement à heure fixe, 15 minutes avant (« Dans 15 minutes, à 14:00 · lieu ») ; moins si Cockpit vient d'être ouvert, « Maintenant » s'il commence.
  - **Deadlines** : projets ouverts et validés (pas les Propositions) et événements « Échéance », une fois dans les 3 jours qui précèdent (« Deadline dans 3 jours · mercredi 30 septembre », ou « demain » si Cockpit était fermé à J-3), puis le jour même. Pas les deadlines de tâches : c'est la règle suivante.
  - **Tâches prioritaires** : Haute ou Urgente, la veille de leur deadline (« Tâche urgente, deadline demain · projet »).
  - **Encaissements** : attendus (règle `EXPECTED_PAYMENT`), la veille de la date prévue (« Prévu demain : Acompte · 600 € »), puis une fois en retard (« En retard de 3 jours : … »). À la première ouverture, ceux qui sont déjà en retard sont signalés une fois.
  - **Débuts de projet** : À venir ou En cours, le jour même (« Commence aujourd'hui : il passe En cours »).
  - **Résumé du matin** : la phrase de synthèse du dashboard (« 3 tâches aujourd'hui, dont 1 en retard · rendez-vous à 14:00 »), titrée par la date ; rien s'il n'y a rien de prévu.
- **Quand** (`roundFor`) : les rendez-vous à chaque vérification (une par minute) ; le reste pendant une tournée, à l'ouverture puis à 8 h si Cockpit est resté ouvert. Ainsi, rien ne sonne à minuit, et un élément qu'on vient de saisir (une tâche prioritaire pour demain) ne déclenche pas de notification sur-le-champ. Une ouverture après 8 h vaut la tournée du jour. Le résumé n'est que de la tournée de 8 h (à l'ouverture, le dashboard est déjà à l'écran), et plus après midi (ordinateur sorti de veille l'après-midi).
- **Une seule fois** : la clé de chaque notification (`project-deadline:<id>:<date>:J-3`, `event:<id>:<début>`…) est réservée dans `notification_log` avant l'envoi, une instruction par clé : deux vérifications simultanées ne l'envoient jamais deux fois. La date fait partie de la clé : décaler une deadline ou un rendez-vous relance son rappel. Le journal oublie ce qui a plus de six mois.
- **Regroupement** : au-delà de 3 notifications dans une même vérification (ouverture après quelques jours), les 2 plus urgentes partent, puis une seule « N autres rappels » avec leurs titres.
- **Montants** : le réglage « Afficher les montants » (Tableau de bord) vaut aussi pour les notifications, qui se voient à l'écran.
- **Envoi** : commande Rust `notify` (`src-tauri/src/notify.rs`, plugin officiel `notification` utilisé côté Rust seulement : aucune permission ajoutée à l'interface). En développement, Windows attribue les notifications à « Windows PowerShell » ; l'app installée a son nom et son icône. Dans le navigateur de développement, un toast les remplace. « Envoyer une notification d'essai » dans Paramètres.
- **Limites** : un clic sur la notification n'ouvre pas Cockpit (le plugin ne le permet pas sous Windows) ; app fermée, rien n'arrive (V2 : zone de notification, démarrage avec Windows) ; « Ne pas déranger » de Windows les retient.

**Choix faits en V1.1, étape 5 (planning)**, à confirmer à l'usage :
- **Période** (`agenda/timeline/model.ts`) : elle commence le lundi de la semaine précédente, pour garder un peu de passé en vue. Zoom **mois** : 6 semaines, chaque lundi daté (« 28 sept. ») ; zoom **trimestre** : 13 semaines, le numéro du jour sous le nom du mois. Les flèches avancent de 4 ou 12 semaines (on garde du contexte), `T` revient à aujourd'hui, `M` et `R` changent de zoom. Le jour est dans l'URL interne (`?date=`), le zoom est mémorisé.
- **Lignes** : les projets du jour « En cours » ou « À venir » (un projet à venir commencé est en cours, les Propositions et les projets en pause n'y sont pas), rangés par début, puis par deadline. À gauche, le nom (« à venir » en gris) ; un clic ouvre la fiche.
- **Barres** : du début à la deadline, jours compris, sans aplat de couleur (la couleur du type reste une pastille) : grise pour un projet en cours, en pointillés pour un projet à venir. La part des tâches faites est plus foncée, à l'échelle de toute la barre : on la compare d'un coup d'œil à la ligne « aujourd'hui ». Sans date de début, un projet en cours part du bord gauche, estompé ; sans deadline, la barre file jusqu'au bord droit. Un projet à venir sans début n'a que son drapeau de deadline. Le drapeau suit la couleur de l'urgence (`core/deadline.ts`) et se place juste après la barre. Une deadline dépassée ajoute une queue rouge en pointillés jusqu'à aujourd'hui. Au survol : dates, part des tâches faites, retard.
- **Encaissements** : un losange à la date prévue (contour gris, rouge en retard), plein et vert à la date de réception ; au survol, le libellé, le montant et la date ; un clic ouvre l'encaissement.
- **Bande de densité** (« En parallèle ») : pour chaque semaine, le nombre de projets dont la barre (retard compris) touche la semaine, avec leurs noms au survol. Une seule couleur, plus soutenue à mesure qu'ils s'empilent, sans alerte : ce qui est « trop » dépend de chacun. Un projet sans deadline compte à partir de son début ; un projet en cours sans début compte jusqu'à sa deadline ; un projet à venir qui n'a qu'une deadline ne compte pas.
- **Hors de la période et sans dates** : une phrase sous la timeline donne le nombre de projets hors de la période, et la liste des projets sans aucune date (avec un lien), pour qu'aucun ne soit oublié.
- Le planning ne se modifie pas en glissant (le calendrier le permet déjà pour les débuts et deadlines).

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

---

## 9. V2 : tout dans Cockpit

> Statut : **en cours**. Conception rédigée le 25/11/2026 à partir des envies de l'utilisateur ; les propositions P13 à P22 sont validées (25/11/2026) et les choix faits sont au §9.6.
> Cette V2 n'est plus « si l'usage le demande » : c'est une vraie version, faite en entier, étape par étape (§9.7). **Étape 1 (« Toujours là ») faite le 25/11/2026**, branche `v2-toujours-la` ; **étape 2 (« Modes et espace Cours ») faite le 26/11/2026**, branche `v2-modes-cours` ; **étape 3 (« Organisateur de journée ») faite le 26/11/2026**, branche `v2-journee` ; **étape 4 (« Pages ») faite le 26/11/2026**, branche `v2-pages` ; **étape 5 (« Révisions ») faite le 26/11/2026**, branche `v2-revisions` ; **étape 6 (« Sport, habitudes et objectifs ») faite le 26/11/2026**, branche `v2-habitudes` ; **étape 7 (« Le compagnon ») faite le 26/11/2026**, branche `v2-compagnon` ; **étape 8 (« Connexion Google et Google Agenda ») faite le 26/11/2026**, branche `v2-google` (la connexion avec un vrai compte reste à essayer) ; **étape 9 (« Synchronisation ») faite le 26/11/2026**, branche `v2-sync` (l'échange réel par Drive reste à essayer). Leurs choix de réalisation et ce qui reste à vérifier sont au §7.3.

### 9.1 L'intention

Cockpit devient le compagnon de tous les jours, celui qu'on ne peut plus quitter : il se lance avec Windows, il est aussi sur le téléphone, et il sert à tenir de nouvelles résolutions :

- **se remettre à travailler sérieusement** (projets, clients, deep work) ;
- **reprendre les devoirs** (cours, révisions, examens) ;
- **faire du sport** régulièrement ;
- **organiser chaque journée**, bloc par bloc.

Notion, l'agenda papier et les applis d'habitudes ne doivent plus être utiles : tout est dans Cockpit.

Aux cinq questions du §1.1 s'ajoutent trois questions, auxquelles l'app doit aussi répondre en quelques secondes :

| # | Question | Où se trouve la réponse |
|---|---|---|
| 6 | Qu'est-ce que je fais **maintenant** ? | Journée › bloc en cours, mini-fenêtre, widget du téléphone |
| 7 | Qu'est-ce que je dois rendre ou réviser ? | Cours › Devoirs et Révisions du jour |
| 8 | Est-ce que je tiens mes résolutions ? | Habitudes, revue de la semaine |

Les principes du design system ne changent pas : peu d'informations à la fois, beaucoup d'espace, pas de cartes partout. Plus de fonctionnalités ne veut pas dire des écrans plus chargés : chaque espace garde ses propres pages.

### 9.2 Propositions produit (validées)

**P13. Deux modes, Travail et Cours, et des espaces communs.**
Un sélecteur en haut de la sidebar bascule entre **Travail** (Projets, Tâches, Planning, Finances, Clients) et **Cours** (Matières, Devoirs, Examens, Révisions). La **Journée**, les **Pages**, le **Calendrier** et les **Habitudes** sont communs aux deux. Le dashboard s'adapte au mode, mais la Journée montre toujours tout : on n'a qu'une seule journée. Le mode est mémorisé, et un raccourci le change.

**P14. Un devoir est une tâche rattachée à une matière.**
Comme une tâche peut appartenir à un projet, elle peut appartenir à une matière (`subject_id`). On garde ainsi les dates, priorités, sous-tâches, « Annuler », la recherche et le glisser-déposer déjà écrits. Les vues Devoirs ne sont que des tâches filtrées.

**P15. L'emploi du temps et les séances de sport sont des événements récurrents.**
Les événements récurrents (déjà prévus en V2) servent à la fois aux cours, au sport régulier et aux rendez-vous qui reviennent. Une règle de récurrence est stockée une fois ; les occurrences sont calculées, jamais recopiées (P8). Une occurrence peut être annulée ou déplacée seule (exception stockée).

**P16. La journée se construit avec des blocs, faits à partir de modules.**
Un **module** est un modèle réutilisable : nom, icône, couleur, durée par défaut, mode (Travail, Cours ou les deux). Exemples : « Sport 3 h », « Devoirs 1 h 30 », « Deep work 2 h ». Un **bloc** est un module posé sur un jour à une heure : c'est lui qui porte sa date (P8). Modifier un module ne change pas les blocs déjà posés.

**P17. Une tâche placée dans un bloc prend la date de ce bloc.**
Glisser une tâche ou un devoir dans un bloc la rattache au bloc (`block_id`) : sa date du jour vient du bloc et n'est pas recopiée dans `planned_on`. Déplacer le bloc déplace donc ses tâches. Une tâche sans durée estimée prend 30 minutes par défaut dans le bloc.

**P18. Une semaine type s'applique, elle ne se synchronise pas.**
On enregistre une semaine modèle (sport lundi, mercredi et vendredi, devoirs chaque soir…) puis on l'applique à une semaine : cela crée des blocs ordinaires, modifiables ensuite un par un. Changer la semaine type plus tard ne touche pas les semaines déjà remplies.

**P19. Les pages remplacent Notion, mais restent rattachables.**
Une page est un document libre en blocs (titres, listes, cases, images…). Elle peut vivre seule, ou être rattachée à un projet, un client, une matière ou un événement : elle apparaît alors dans sa fiche. Une case cochable peut devenir une vraie tâche en un raccourci.

**P20. Une résolution est un objectif suivi par des habitudes.**
Un **objectif** (« Reprendre le sport ») a une échéance facultative et des étapes. Une **habitude** (« Sport 3 fois par semaine ») a une fréquence et se coche. Elle se coche aussi toute seule quand un bloc du module lié est marqué fait. Les séries et les taux sont calculés, jamais stockés.

**P21. Le compagnon parle peu, mais au bon moment.**
Trois rendez-vous fixes : l'**écran du matin** à la première ouverture du jour, le **bilan du soir** (heure réglable) et la **revue de la semaine** le dimanche. En dehors de ces moments, l'app reste silencieuse, sauf les notifications choisies.

**P22. Le téléphone et le PC ont chacun leur base, synchronisée par Google Drive.**
Chaque appareil garde sa base SQLite complète et marche hors ligne. Ils s'échangent leurs modifications par de petits fichiers chiffrés, déposés dans le dossier caché de l'app sur Google Drive (§9.5). La base active n'est jamais mise dans le Drive.

### 9.3 Les fonctionnalités, espace par espace

#### Journée (organisateur)
- *(Fait, étape 3, sauf Google Agenda qui vient à l'étape 8 ; détail au §7.3.)*
- Une colonne pour la journée, de 6 h à 24 h (plage réglable), avec une ligne « maintenant ». Les cours, les événements et Google Agenda y sont affichés, sous les blocs.
- **Bibliothèque de modules** à côté : on les crée, les modifie et les range ; chacun se glisse sur la journée.
- **Glisser-déposer** au pas de 15 minutes ; étirer un bloc change sa durée ; un chevauchement avec un cours ou un rendez-vous est signalé, sans être interdit.
- **Tâches dans un bloc** (P17), avec leur durée, et ce qui reste de temps dans le bloc.
- **Remplir les trous** : l'app propose de caser ce qui est urgent dans les créneaux libres, avec les règles de « Je veux travailler… » (V1.1.2). Rien n'est posé sans validation.
- **Semaines types** (P18).
- **Bloc en cours** mis en avant, avec le temps restant ; notification au début et à la fin (réglable).
- **Bilan du soir** : chaque bloc passé est marqué fait, raté ou décalé à demain, en un clic par bloc.
- Vues **jour** et **semaine**.

#### Cours
- **Matières** : nom, couleur, prof, salle, coefficient. *(Fait, étape 2.)*
- **Emploi du temps** : cours récurrents (P15) et vacances (période sans cours). *(Fait, étape 2 : une semaine type pour toute l'année, sans semaines A/B ; semestres et vacances réglables.)*
- **Devoirs** (P14) : à rendre, en retard, rendus. *(Fait, étape 2.)*
- **Contrôles et examens** : rattachés à une matière. À sa création, l'app propose des **révisions à rebours** (J-7, J-3, J-1), créées comme des blocs « Révision ». *(Examens faits à l'étape 2 ; révisions à rebours à l'étape 5.)*
- **Notes** : note, sur combien, coefficient, date ; **moyenne** par matière et générale, calculées. *(Fait, étape 2 : par semestre et pour l'année.)*
- **Fiches et flashcards** : une fiche est une page (P19) ; une flashcard a un recto et un verso, par matière. **Répétition espacée** : chaque jour, l'app dit quelles cartes revoir, et la session se fait au clavier (Espace pour retourner, 1 à 4 pour noter). *(Fait, étape 5 : 20 nouvelles cartes par jour au plus, cartes tirées des lignes « question :: réponse » d'une page.)*
- Dashboard en mode Cours : les cours du jour, les devoirs à rendre, le prochain examen, les cartes à revoir. *(Fait, étape 2, en deux colonnes, avec les prochains jours ; cartes à revoir ajoutées à l'étape 5.)*

#### Pages
- *(Fait, étape 4 ; détail au §7.3. Images gardées dans la base plutôt que dans un dossier.)*
- **Éditeur en blocs** : titres, paragraphes, listes, cases à cocher, citations, séparateurs, code, tableaux simples, images collées ou glissées. La commande `/` insère un bloc, et la mise en forme courante se fait au clavier (`**gras**`, `#` titre…).
- **Arborescence** : une page peut contenir des sous-pages.
- **Rattachement** (P19) et **liens entre pages** avec `[[…]]`, avec la liste des pages qui pointent vers celle qu'on lit.
- **Modèles** : fiche de cours, compte rendu client, brief de projet, page vierge ; on peut enregistrer une page comme modèle.
- **Journal du jour** : une page par jour, créée à la demande depuis la Journée.
- **Recherche** : le texte des pages entre dans l'index FTS5 (nouveaux triggers).
- **Import Notion** : import de l'export Markdown de Notion (pages, sous-pages, images).
- **Export** : une page en Markdown.

#### Sport, habitudes et objectifs
- **Habitudes** (P20) : fréquence (chaque jour, X fois par semaine, certains jours), heure de rappel facultative, série en cours et grille du mois. *(Fait, étape 6 : une page « Habitudes », et cochables aussi sur Aujourd'hui.)*
- **Objectifs** : étapes, échéance facultative, habitudes liées, progression calculée. *(Fait, étape 6, sous les habitudes.)*
- **Carnet de séances** : un bloc de sport fait peut recevoir sa séance (exercices, séries, répétitions, charges ou durée, ressenti). Les exercices sont réutilisables, et chacun a sa courbe de progression. *(Fait, étape 6 : muscu et cardio ; une séance peut aussi être notée sans bloc.)*
- **Revue de la semaine** : heures de travail, de cours et de sport (d'après les blocs faits), habitudes tenues, devoirs rendus, chiffre d'affaires encaissé ; un écran court, une phrase de bilan. *(Fait, étape 6 : proposée le dimanche par un bandeau, consultable pour toute semaine.)*

#### Le compagnon (fluidité et envie)
- **Animations douces** partout : changement de page, blocs qui glissent et se posent, tâche cochée qui se range (dans la continuité de la V1.1.2). Elles respectent le réglage Windows « Réduire les animations ».
- **Écran du matin** (P21) : la journée en une phrase, le premier bloc, le devoir du jour, l'habitude à tenir. Une touche le ferme. *(Fait, étape 7 : plein écran, avant midi.)*
- **Mode focus** : plein écran sur le bloc en cours, avec un minuteur (Pomodoro au choix), la tâche en cours et rien d'autre. *(Fait, étape 7 : touche F ; fin du bloc par défaut, Pomodoro 25/5 réglable.)*
- **Mini-fenêtre « En ce moment »** : petite fenêtre toujours au-dessus, avec le bloc en cours, le temps restant et la case de la tâche. *(Fait, étape 7 : à la demande, Ctrl Maj E.)*
- **Petites célébrations** : une journée bouclée, une série qui continue, un objectif atteint. Discrètes et désactivables. *(Fait, étape 7 : un toast avec une étincelle ; les séries à certains paliers.)*
- **Sons** facultatifs (fin de bloc, fin de Pomodoro), désactivés par défaut. *(Fait, étape 7.)*
- **Boîte de réception** : tout ce qui est capturé vite (idée, tâche, devoir, note) atterrit là, et se trie plus tard en un geste. *(Fait, étape 1 : en tâche, en idée de projet ou en événement ; les devoirs et les notes viendront avec leurs espaces.)*

#### Toujours là
- **Lancé au démarrage de Windows** (réglable) et **gardé dans la zone de notification** : fermer la fenêtre ne quitte pas l'app, donc les notifications arrivent toujours. *(Fait, étape 1.)*
- **Raccourci global** de capture rapide, même fenêtre cachée : une petite fenêtre s'ouvre, on tape, Entrée, c'est dans la boîte de réception. *(Fait, étape 1 : `Ctrl+Maj+Espace` par défaut.)*
- **Notifications**, en plus de celles du §2.8 (chacune désactivable) : début et fin de bloc, devoir à rendre demain, révisions du jour, examen à J-3, habitude pas encore faite (heure réglable), bilan du soir, cartes à revoir. *(Début et fin de bloc faits à l'étape 3, rappel d'habitude à l'étape 6, les autres à l'étape 7 ; les révisions du jour sont des blocs Révision.)*

#### Mobile (Android)
- **Application Android** construite avec Tauri 2, avec le même code React et des écrans adaptés au téléphone : Journée, Capture rapide, Tâches et devoirs du jour, Habitudes, Pages (lecture et petite édition).
- **Hors ligne** : le téléphone a sa propre base, synchronisée (P22).
- **Notifications** sur le téléphone, calculées sur place à partir des données synchronisées.
- **Widget** sur l'écran d'accueil : le bloc en cours et le suivant, et un bouton de capture.

#### Google Agenda
- **Lecture** : les événements Google apparaissent dans le calendrier, la Journée et les Prochains jours du dashboard, avec leur propre couleur ; ils ne se modifient pas dans Cockpit. *(Fait, étape 8 : tous les agendas, réglables un par un, dans les deux modes.)*
- **Écriture** (option) : les blocs de la journée peuvent être envoyés dans un agenda Google dédié (« Cockpit »), pour les voir ailleurs. *(Écartée à l'étape 8 : lecture seule.)*
- La connexion Google est la même que pour la synchronisation (§9.5). Elle remplace la piste de l'adresse iCal secrète, qui ne permettait que la lecture.

#### Restes de la V2 d'origine
- **Chiffre d'affaires par mois et par trimestre** (pour l'URSSAF), dans Finances. *(Fait, étape 1 : onglet « Chiffre d'affaires ».)*

### 9.4 Modèle de données (esquisse)

Nouvelles tables, à préciser étape par étape (une migration par étape) :

| Table | Rôle | Remarques |
|---|---|---|
| `block_templates` | Modules | nom, icône, couleur, durée par défaut, mode |
| `day_blocks` | Blocs posés | `template_id` facultatif, date, début, fin, titre, couleur, statut (prévu, fait, raté) |
| `week_templates`, `week_template_blocks` | Semaines types | jour de la semaine, heure, module |
| `subjects` | Matières | nom, couleur, prof, salle, coefficient |
| `grades` | Notes | matière, note, barème, coefficient, date |
| `flashcards`, `flashcard_reviews` | Flashcards | matière, recto, verso ; échéance de révision calculée à partir des révisions |
| `pages`, `page_links` | Pages | parent, titre, contenu (JSON de l'éditeur), texte brut pour la recherche, rattachement (entité + id) |
| `attachments` | Images des pages | fichiers dans un dossier `attachments\` à côté de la base, référencés par id |
| `habits`, `habit_logs` | Habitudes | fréquence, module lié ; une ligne par jour coché |
| `goals`, `goal_steps` | Objectifs | échéance, étapes |
| `exercises`, `workouts`, `workout_sets` | Carnet de séances | séance (date, ressenti, bloc facultatif) et ses séries |
| `inbox_items` | Boîte de réception | texte, date de capture. **Fait** (migration `0006`) |
| `sync_rows`, `sync_state` | Synchronisation | dernier changement de chaque ligne (traces de suppression comprises), état de l'appareil, dernier fichier lu par appareil. **Fait** (migration `0014`) |

Colonnes ajoutées : `tasks.subject_id`, `tasks.block_id`, `events.subject_id`, `events.recurrence` (règle au format RRULE) et une table `event_exceptions` pour les occurrences annulées ou déplacées.

**Fait à l'étape 1** (migration `0007`) : `events.recurrence` et `event_exceptions`.

**Fait à l'étape 8** (migration `0013`) : `google_calendars` (nom, couleur Google et couleur de la palette, principal, affiché, dernière relecture) et `google_events` (copie locale en lecture seule, heure locale ou journées) ; non exportées.

**Fait à l'étape 6** (migration `0012`) : `goals` et `goal_steps`, `habits` (fréquence, jours, rappel, module et objectif liés, archivage) et `habit_logs` (un jour coché par ligne), `exercises` (muscu ou cardio), `workouts` (date, ressenti, notes, bloc facultatif) et `workout_sets` (répétitions, charge, durée, distance). Séries, taux et progression ne sont pas stockés.

**Fait à l'étape 5** (migration `0011`) : `flashcards` (matière, page d'origine, recto, verso) et `flashcard_reviews` (jour, note de 1 à 4) ; l'échéance n'est pas stockée.

**Fait à l'étape 4** (migration `0010`) : `pages` (arborescence, contenu JSON, texte brut pour la recherche, rattachement, favori, modèle, journal), `page_links` et `attachments` (images en data URL, dans la base). Trois modèles proposés.

**Fait à l'étape 3** (migration `0009`) : `block_templates` (modules, quatre proposés), `day_blocks`, `tasks.block_id`, `week_templates` et `week_template_blocks`. Un bloc recopie le nom, l'icône, la couleur et le mode de son module (P16) ; il a un statut (prévu, fait, raté).

**Fait à l'étape 2** (migration `0008`) : `subjects`, `tasks.subject_id`, `school_periods` (semestres et vacances), `timetable_slots` (la semaine type), `exams` et `grades`, avec les triggers de recherche des matières et des examens. Les cours et les examens ont leurs propres tables au lieu d'être des événements (`events.subject_id` n'existe donc pas) : voir les choix de l'étape 2 au §7.3.

```sql
ALTER TABLE events ADD COLUMN recurrence TEXT;   -- RRULE (RFC 5545), NULL : pas de répétition

CREATE TABLE event_exceptions (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence  TEXT NOT NULL,   -- jour prévu par la règle ('YYYY-MM-DD') : il désigne l'occurrence
  kind        TEXT NOT NULL CHECK (kind IN ('cancelled', 'moved')),
  starts_at   TEXT,            -- déplacée : son nouveau moment, au format de events.starts_at
  ends_at     TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (event_id, occurrence),
  CHECK ((kind = 'moved') = (starts_at IS NOT NULL)),
  CHECK (kind = 'moved' OR ends_at IS NULL)
);
```

`events.starts_at` est la première occurrence. Les occurrences sont calculées par `agenda/recurrence.ts` (P15) : rien n'est recopié, et une exception ne stocke que ce qui s'écarte de la règle. Une exception dont le jour n'est plus dans la règle (règle modifiée depuis) est ignorée.

L'agenda (§3.5) gagne des sources : `block`, `class` (occurrences des cours), `exam` et `google`. Le calendrier, la Journée, le dashboard et les notifications continuent de lire ce même flux. Depuis l'étape 1, un événement qui se répète y donne une ligne par occurrence (champ `occurrence`, clé propre à chacune).

Les nouvelles tables cherchables (pages, matières, boîte de réception) ajoutent leurs triggers FTS5 dans leur migration.

### 9.5 Architecture : synchronisation, mobile, éditeur

**Synchronisation par Google Drive (P22)**
- Chaque appareil a un identifiant. Chaque écriture (`db.batch`) enregistre aussi, dans `sync_changes`, ce qui a changé : table, id de la ligne, colonnes modifiées et horodatage. *(Fait à l'étape 9 autrement : des déclencheurs tiennent `sync_rows`, le dernier changement de chaque ligne ; voir §7.3.)*
- **Suppressions** : une ligne supprimée laisse une trace (`deleted_at`), purgée quand tous les appareils l'ont vue. « Annuler » continue de marcher comme aujourd'hui.
- **Envoi** : à intervalles réguliers (environ chaque minute quand l'app est ouverte, et à la fermeture), les modifications sont regroupées dans un fichier, **chiffré sur l'appareil**, puis déposé dans le dossier caché de l'app sur Google Drive (`appDataFolder`, invisible dans le Drive). Chaque appareil n'écrit que ses propres fichiers : aucun conflit de fichier.
- **Réception** : l'appareil lit les nouveaux fichiers des autres et les applique dans une transaction.
- **Conflits** : pour une même ligne, la modification la plus récente l'emporte, colonne par colonne. Pour une page modifiée sur les deux appareils, la plus récente l'emporte, et l'autre version est gardée dans l'historique de la page. *(Étape 9 : la ligne entière, pas colonne par colonne ; l'autre version d'une page est gardée dans une page à part.)*
- **Clé de chiffrement** : créée au premier appareil et transmise au téléphone une seule fois (code QR affiché sur le PC). Google ne voit que des fichiers illisibles. *(Étape 9 : transmise à un autre PC par un code à recopier ; le code QR viendra avec le téléphone.)*
- **Côté Rust** : la connexion Google (OAuth), le jeton (dans le coffre d'identifiants de Windows ou d'Android, jamais dans la base ni les exports), les appels réseau et le chiffrement. L'interface ne fait toujours aucun appel réseau.
- **À faire une fois** : créer un projet Google Cloud pour avoir le droit de se connecter (Drive, dossier de l'app, et Agenda). *(Guide : [docs/google-cloud.md](google-cloud.md). Connexion faite à l'étape 8, pour l'agenda ; le jeton est dans le Gestionnaire d'identification de Windows.)*
- Les sauvegardes quotidiennes restent, sur chaque appareil.

**Mobile**
- Tauri 2 compile pour Android depuis Windows (Android Studio et le SDK à installer une fois). Le pont SQLite (`rusqlite`) et les migrations sont les mêmes.
- Les écrans du téléphone sont des pages à part (`src/mobile/`), qui utilisent les mêmes domaines (`model`, `repository`, `service`, `hooks`).
- Les plugins natifs à vérifier au moment de l'étape : notifications, widget de l'écran d'accueil, ouverture au démarrage du téléphone.

**Éditeur de pages**
- Recommandation : **TipTap** (sur ProseMirror). Sans style imposé, il se plie au design system ; les blocs, la commande `/`, les liens `[[…]]` et le collage d'images sont des extensions. Le contenu est stocké en JSON, avec une copie en texte brut pour la recherche.
- Alternative : BlockNote, plus proche de Notion dès le départ, mais il impose ses styles.

**Toujours là** *(fait, étape 1)*
- Plugins Tauri : `autostart` (démarrage avec Windows), icône de la zone de notification (`tray`), `global-shortcut` (capture rapide), et une seconde fenêtre pour la mini-fenêtre et la capture. S'y ajoute `single-instance` : sans lui, relancer Cockpit alors qu'il attend dans la zone de notification ouvrirait une seconde app.
- Ces plugins demandent **Tauri 2.12** (Rust et paquets npm), au lieu de 2.11.
- Côté natif : `presence.rs` (icône, fermeture, démarrage, battement d'une minute) et `capture.rs` (raccourci, petite fenêtre). Les règles restent côté TypeScript.
- La capture est une seconde page (`capture.html`, entrée Vite à part), sans routeur ni cache de requêtes : elle écrit par le même pont SQLite, et la fenêtre principale est prévenue par un événement.

**Animations** *(premières faites, étape 1)*
- Une bibliothèque d'animation (Motion, ex-Framer Motion) pour les transitions et les ressorts, chargée seulement là où elle sert, pour garder un démarrage en moins d'une seconde (§2.6).
- En pratique : `LazyMotion`. Les composants légers (`m`) sont dans le code de départ ; le moteur d'animation est un morceau à part, chargé après le premier rendu. Durées et courbes sont dans `ui/motion/presets.ts`.

### 9.6 Choix faits

1. **Téléphone** : Android (25/11/2026). Pas d'iPhone, donc ni Mac ni compte Apple nécessaires.
2. **Synchronisation** : par Google Drive, avec des fichiers de modifications chiffrés dans le dossier caché de l'app, jamais la base elle-même (25/11/2026).
3. **Périmètre** : tout ce qui est au §9.3 fait partie de la V2 ; rien n'est remis à plus tard.
4. **Propositions P13 à P22** : retenues (25/11/2026).
5. **Sélecteur de mode** (P13, étape 2) : un interrupteur à deux icônes, sans texte, en haut à gauche de la barre latérale, sur le modèle du sélecteur Chat / Code de l'application Claude Desktop. Le mode actif est mis en évidence (demandé le 25/11/2026).

6. **Étape 1, « Toujours là »** (25/11/2026) :
   - le démarrage avec Windows est activé d'office, et Cockpit démarre alors caché dans la zone de notification ;
   - le raccourci global de capture est `Ctrl+Maj+Espace`, modifiable dans Paramètres (jamais `Ctrl+Alt`, qui est AltGr en AZERTY) ;
   - la boîte de réception est une page de la barre latérale, sous « Aujourd'hui », avec un compteur ;
   - la répétition se saisit par un menu de choix tout faits, des pastilles de jours en hebdomadaire et une fin facultative ;
   - sur une occurrence : modifier ou déplacer « cette fois » ou « toute la série » ; supprimer « cette fois », « celle-ci et les suivantes » ou « toute la série » ;
   - le chiffre d'affaires compte tous les encaissements reçus, à leur date de réception.

7. **Étape 2, « Modes et espace Cours »** (26/11/2026) :
   - chaque mode montre les siens : les devoirs n'apparaissent pas dans les tâches du mode Travail ; le calendrier et la boîte de réception montrent tout ;
   - moyennes par semestre, avec des dates réglables, plus la moyenne de l'année ;
   - une semaine type toute l'année, avec des vacances (périodes sans cours) ;
   - dashboard du mode Cours en deux colonnes : cours du jour et devoirs à rendre à gauche, prochain examen et prochains jours à droite.

8. **Étape 3, « Organisateur de journée »** (26/11/2026) :
   - la Journée est une page à part, commune aux deux modes, sous Aujourd'hui (qui reste l'accueil) ;
   - quelques modules prêts au départ (Sport, Devoirs, Deep work, Révision) ;
   - plusieurs semaines types, nommées ;
   - « Remplir les trous » pose des blocs (Devoirs ou Travail) avec les tâches urgentes dans les créneaux libres, après validation.

9. **Étape 4, « Pages »** (26/11/2026) :
   - éditeur TipTap ;
   - pages communes aux deux modes ;
   - une page « Pages » et les favoris dans la barre latérale ;
   - import d'un export Notion (pages, sous-pages, images).

10. **Étape 5, « Révisions »** (26/11/2026) :
   - 20 nouvelles flashcards par jour au plus ;
   - cartes créées dans la matière, et depuis une page avec des lignes « question :: réponse » ;
   - révisions à rebours dans le premier créneau libre du soir ;
   - notation à 4 boutons, façon Anki.

11. **Étape 6, « Sport, habitudes et objectifs »** (26/11/2026) :
   - habitudes cochables aussi sur Aujourd'hui, dans les deux modes ;
   - une seule page « Habitudes », les objectifs dessous ;
   - carnet de muscu et de cardio, avec la courbe de chaque exercice ;
   - revue de la semaine proposée le dimanche, consultable pour toute semaine.

12. **Étape 7, « Le compagnon »** (26/11/2026) :
   - écran du matin en plein écran, fermé d'une touche ;
   - mode focus : le temps restant du bloc, Pomodoro au choix ;
   - mini-fenêtre « En ce moment » ouverte à la demande ;
   - célébrations discrètes.

13. **Étape 8, « Connexion Google et Google Agenda »** (26/11/2026) :
   - lecture seule (les blocs ne sont pas envoyés dans Google) ;
   - tous les agendas, réglables un par un dans Paramètres ;
   - événements Google visibles dans les deux modes ;
   - seulement l'accès à l'agenda pour l'instant ; Drive sera demandé à l'étape 9.

14. **Étape 9, « Synchronisation »** (26/11/2026) :
   - la modification la plus récente l'emporte, ligne entière ;
   - une page modifiée des deux côtés garde l'autre version dans une page à part ;
   - la clé se donne par un code à recopier ;
   - les données seulement : les réglages restent propres à chaque appareil.

15. **Étape 10, « Application Android »** (26/11/2026) :
   - Aujourd'hui à l'ouverture (bloc en cours, tâches et devoirs du jour, habitudes) ;
   - tâches et devoirs ensemble, sans les modes ;
   - la clé de synchronisation par un code QR affiché sur le PC ;
   - l'essentiel modifiable (cocher, capturer, marquer un bloc fait, retoucher une page), le reste sur le PC.

### 9.7 Ordre de construction

Tout est fait. L'ordre suit seulement les dépendances : chaque étape s'appuie sur les précédentes. Une branche `v2-…` par étape, validée une à une.

1. **Toujours là** : démarrage avec Windows, zone de notification, raccourci global et boîte de réception, événements récurrents, chiffre d'affaires par mois et par trimestre, premières animations. **Fait le 25/11/2026** (branche `v2-toujours-la`, 8 sous-étapes ; détail au §7.3).
2. **Modes et espace Cours** : modes Travail et Cours (P13), matières, emploi du temps, devoirs (P14), examens, notes et moyennes. **Fait le 26/11/2026** (branche `v2-modes-cours`, 8 sous-étapes ; détail au §7.3).
3. **Organisateur de journée** : modules, blocs, glisser-déposer, tâches dans les blocs, semaines types, remplir les trous, bloc en cours, bilan du soir. **Fait le 26/11/2026** (branche `v2-journee` ; détail au §7.3).
4. **Pages** : éditeur, arborescence, rattachement, liens, modèles, journal du jour, recherche, import Notion. **Fait le 26/11/2026** (branche `v2-pages` ; détail au §7.3).
5. **Révisions** : fiches, flashcards et répétition espacée, révisions à rebours des examens. **Fait le 26/11/2026** (branche `v2-revisions` ; détail au §7.3).
6. **Sport, habitudes et objectifs** : habitudes, objectifs, carnet de séances, revue de la semaine. **Fait le 26/11/2026** (branche `v2-habitudes` ; détail au §7.3).
7. **Le compagnon** : écran du matin, mode focus, mini-fenêtre, célébrations, sons, nouvelles notifications. **Fait le 26/11/2026** (branche `v2-compagnon` ; détail au §7.3).
8. **Connexion Google et Google Agenda** : projet Google Cloud, connexion, lecture (et écriture si retenue) de l'agenda. **Fait le 26/11/2026** (branche `v2-google`, lecture seule ; connexion avec un vrai compte à essayer ; détail au §7.3).
9. **Synchronisation** : journal des modifications, traces de suppression, chiffrement, échange par Google Drive, entre deux instances du PC d'abord. **Fait le 26/11/2026** (branche `v2-sync` ; échange réel par Drive à essayer ; détail au §7.3).
10. **Application Android** : écrans du téléphone, synchro, notifications, widget. **En cours** (branche `v2-android`) : écrans du téléphone (`src/mobile/`, essayables dans le navigateur avec `?mobile`) et code QR de la clé faits ; le reste attend l'outillage Android de ce PC ([docs/android.md](android.md)).

La V2.5 (partage de projets, voir CONTRIBUTING.md) vient après.
