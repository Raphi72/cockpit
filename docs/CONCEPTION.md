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
| Planning | — | Timeline type Gantt avec bande de densité | Charge par semaine face au temps posé dans la Journée (fait le 26/11/2026, §7.3) |
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
- Les animations (V2) ne pèsent pas sur le démarrage : le moteur de Motion est un morceau à part, chargé après le premier rendu.

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
| Toujours là (V2) | Plugins Tauri `autostart`, `single-instance`, icône `tray` | Démarrage avec Windows, une seule instance, zone de notification (la capture rapide et son plugin `global-shortcut` ont été retirés le 26/11/2026) |
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

Une seule requête `UNION ALL` sur une plage de dates renvoie tous les éléments en un aller-retour. Le calendrier, les « Prochains jours » du dashboard et les notifications consomment ce même flux. Le planning lit directement les projets et leurs encaissements (il lui faut la période entière de chaque projet et sa progression), et, pour la charge par semaine, les tâches à faire et les blocs de la Journée : les dates restent celles des tables, rien n'est recopié.

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
- Depuis, les idées de projet (`idea`, migration `0003`) y sont aussi, avec leurs triggers (les captures de la boîte de réception, `inbox`, migration `0006`, en sont reparties avec elle, migration `0018`). Un événement qui se répète y est sans date.
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
│  │  └─ presence.rs                  # V2 : zone de notification, fermeture, démarrage avec Windows, battement
│  ├─ migrations/
│  │  ├─ 0001_init.sql
│  │  ├─ 0002_search.sql              # index FTS5 et ses triggers
│  │  ├─ 0003 … 0005                  # idées, sous-tâches, programme du jour
│  │  ├─ 0006_inbox.sql               # V2 : boîte de réception (retirée par 0018)
│  │  ├─ 0007_recurrence.sql          # V2 : événements récurrents et leurs exceptions
│  │  ├─ …
│  │  └─ 0018_inbox_to_pages.sql      # V2 : la boîte de réception rejoint les Pages (page « Captures »)
│  ├─ capabilities/                   # permissions Tauri minimales (fenêtre principale, mini-fenêtre)
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
│  │  │  ├─ recurrence.ts             # V2 : règle RRULE, occurrences, exceptions (règles pures)
│  │  │  ├─ calendar/                 # MonthView, WeekView, DayView
│  │  │  └─ timeline/                 # PlanningPage (Gantt simplifié)
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
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

---

## 5. Pages et composants

### 5.1 Navigation

**Sidebar** (232 px, réductible à 56 px avec Ctrl+B). Depuis la V2 (étape 2), elle dépend du mode, choisi en haut à gauche par un sélecteur à deux icônes (Travail, Cours ; `Ctrl M`) :

- **dans les deux modes**, sous Aujourd'hui : **Journée** (V2, étape 3), **Pages** (V2, étape 4) et **Habitudes** (V2, étape 6), en une rangée de trois icônes (le nom au survol, depuis les retours du 26/11/2026 : la place va aux projets en cours) ; les pages favorites sont listées sous la navigation ;
- **mode Travail** : Aujourd'hui (dashboard), Projets, Tâches, Calendrier, Planning, Finances ; une section « Projets en cours » pour accéder directement à chaque projet (pastille couleur du type) ; en bas, Clients et Paramètres ;
- **mode Cours** : Aujourd'hui, Devoirs, Emploi du temps, Calendrier, Examens, Notes, Matières ; en bas, Paramètres. (La page Révisions des flashcards a été retirée le 26/11/2026. Les matières se créent seules depuis les cours de Google ; leur page, retirée puis remise le même jour à la demande, sert à les gérer, d'où sa place en dernier, sans chiffre. La Boîte de réception aussi : ce qu'elle faisait se fait depuis n'importe quelle page, voir §7.3.)

La « Vue globale » de ta liste devient **Planning** (la timeline), puisque le dashboard joue déjà le rôle de vue globale. La sidebar utilise des icônes Lucide plutôt que des emojis, pour un rendu plus net et plus sobre.

**Raccourcis clavier** :

| Raccourci | Action |
|---|---|
| `Ctrl K` | Rechercher ou lancer une commande |
| `C` | Menu Créer, puis `T` tâche · `E` événement · `P` projet · `L` client · `R` encaissement · `D` transaction ; en mode Cours : `D` devoir · `X` examen · `N` note · `E` événement · `M` matière · `C` cours |
| `N` (ou `Ctrl N`) | Nouvelle tâche (l'action la plus fréquente) ; dans une fiche projet, elle est rattachée au projet. En mode Cours : nouveau devoir (rattaché à la matière de la fiche ouverte) |
| `Ctrl 1` … `Ctrl 6` | Aller aux pages principales du mode (`Ctrl 4` : le calendrier dans les deux) |
| `Ctrl M` | V2 : passer du mode Travail au mode Cours, et inversement |
| Clic droit sur une ligne de page | V2 : en faire une tâche, un devoir, un événement, une idée de projet ou un projet (remplace la boîte de réception et la capture rapide, retirées le 26/11/2026) |
| `+` · `⠿` à gauche d'un bloc (au survol) | V2 : ajouter un bloc dessous (menu « / ») ; glisser le bloc, ou ouvrir ses actions (transformer en, en faire, dupliquer, supprimer) |
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
- En haut, la **charge par semaine** : le travail à finir avant les deadlines, face au temps posé dans la Journée ; la semaine passe en ambre quand il manque du temps, et un clic l'ouvre dans la Journée. Elle remplace depuis le 26/11/2026 la bande de densité (nombre de projets simultanés par semaine) : voir « Planning : la charge par semaine » au §7.3.
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

**Mise en page** : sidebar de 232 px (56 px réduite), barre supérieure de 56 px. Le contenu est centré avec une largeur maximale de 1120 px et des marges de 48 px ; sur un grand écran, il s'élargit par paliers (1440 px dès 1700 px de fenêtre, 1760 px dès 2100 ; `CONTENT_WIDTH` dans `ui/layout/Page.tsx`, la barre du haut suit), pour ne pas laisser de grands vides. Un écran 1080p à 125 % (environ 1536 px) garde 1120 px. Le dashboard est en deux colonnes (`1.5fr / 1fr`) et passe en une seule sous 1180 px.

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

### 7.3 Points à reprendre, retours d'usage et choix faits

Déplacés dans le [journal](JOURNAL.md) (26/11/2026) : les points encore à vérifier à la main, les retours
d'usage, du plus récent au plus ancien, et les « choix faits » de chaque jalon et de chaque étape. Les
renvois « §7.3 » de ce document y mènent.

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
- **Mode focus** : plein écran sur le bloc en cours, avec un minuteur (Pomodoro au choix), la tâche en cours et rien d'autre. *(Fait, étape 7 : touche F ; revu le 26/11/2026 : durée ou Pomodoro au choix, liste de la séance à cocher, fond nuit, fins animées, voir §7.3.)*
- **Mini-fenêtre « En ce moment »** : petite fenêtre toujours au-dessus, avec le bloc en cours, le temps restant et la case de la tâche. *(Fait, étape 7 : à la demande, Ctrl Maj E.)*
- **Petites célébrations** : une journée bouclée, une série qui continue, un objectif atteint. Discrètes et désactivables. *(Fait, étape 7 : un toast avec une étincelle ; les séries à certains paliers.)*
- **Sons** facultatifs (fin de bloc, fin de Pomodoro), désactivés par défaut. *(Fait, étape 7.)*
- **Boîte de réception** : tout ce qui est capturé vite (idée, tâche, devoir, note) atterrit là, et se trie plus tard en un geste. *(Fait, étape 1 : en tâche, en idée de projet ou en événement ; les devoirs et les notes viendront avec leurs espaces.)* *(Retirée le 26/11/2026 : « c'est vraiment le principe de Page ». Un clic droit sur une ligne de n'importe quelle page en fait une tâche, un devoir, un événement, une idée ou un projet ; voir §7.3.)*

#### Toujours là
- **Lancé au démarrage de Windows** (réglable) et **gardé dans la zone de notification** : fermer la fenêtre ne quitte pas l'app, donc les notifications arrivent toujours. *(Fait, étape 1.)*
- **Raccourci global** de capture rapide, même fenêtre cachée : une petite fenêtre s'ouvre, on tape, Entrée, c'est dans la boîte de réception. *(Fait, étape 1 : `Ctrl+Maj+Espace` par défaut. Retiré le 26/11/2026, avec la boîte de réception : on note dans la page qu'on veut.)*
- **Notifications**, en plus de celles du §2.8 (chacune désactivable) : début et fin de bloc, devoir à rendre demain, révisions du jour, examen à J-3, habitude pas encore faite (heure réglable), bilan du soir, cartes à revoir. *(Début et fin de bloc faits à l'étape 3, rappel d'habitude à l'étape 6, les autres à l'étape 7 ; les révisions du jour sont des blocs Révision.)*

#### Mobile (Android)
- **Application Android** construite avec Tauri 2, avec le même code React et des écrans adaptés au téléphone : Journée, Tâches et devoirs du jour, Habitudes, Pages (lecture et petite édition). (La capture rapide du téléphone a été retirée le 26/11/2026.)
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
| `inbox_items` | Boîte de réception | texte, date de capture. **Fait** (migration `0006`), **retirée** (migration `0018` : les captures passent dans la page « Captures ») |
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

Les nouvelles tables cherchables (pages, matières) ajoutent leurs triggers FTS5 dans leur migration.

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
- Plugins Tauri : `autostart` (démarrage avec Windows), icône de la zone de notification (`tray`), et une seconde fenêtre pour la mini-fenêtre (le plugin `global-shortcut` et la fenêtre de capture rapide ont été retirés le 26/11/2026). S'y ajoute `single-instance` : sans lui, relancer Cockpit alors qu'il attend dans la zone de notification ouvrirait une seconde app.
- Ces plugins demandent **Tauri 2.12** (Rust et paquets npm), au lieu de 2.11.
- Côté natif : `presence.rs` (icône, fermeture, démarrage, battement d'une minute) (et `capture.rs`, retiré le 26/11/2026). Les règles restent côté TypeScript.
- La capture était une seconde page (`capture.html`, entrée Vite à part), sans routeur ni cache de requêtes ; retirée le 26/11/2026. La mini-fenêtre « En ce moment » (étape 7) suit le même principe.

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
   - le raccourci global de capture est `Ctrl+Maj+Espace`, modifiable dans Paramètres (jamais `Ctrl+Alt`, qui est AltGr en AZERTY) ; *(retiré le 26/11/2026)*
   - la boîte de réception est une page de la barre latérale, sous « Aujourd'hui », avec un compteur ; *(retirée le 26/11/2026 : le clic droit sur une ligne de page la remplace)*
   - la répétition se saisit par un menu de choix tout faits, des pastilles de jours en hebdomadaire et une fin facultative ;
   - sur une occurrence : modifier ou déplacer « cette fois » ou « toute la série » ; supprimer « cette fois », « celle-ci et les suivantes » ou « toute la série » ;
   - le chiffre d'affaires compte tous les encaissements reçus, à leur date de réception.

7. **Étape 2, « Modes et espace Cours »** (26/11/2026) :
   - chaque mode montre les siens : les devoirs n'apparaissent pas dans les tâches du mode Travail ; le calendrier montre tout ;
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
   - mode focus : une séance minutée (durée, fin du bloc ou Pomodoro) avec sa liste à cocher ;
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
