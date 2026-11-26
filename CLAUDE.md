# Cockpit : contexte pour Claude

Application desktop personnelle (Windows) pour piloter projets, tâches, planning et finances d'un freelance débutant.
Locale, hors ligne, sans compte. Dépôt **public** : https://github.com/Raphi72/cockpit

## Par où commencer

- **Référence complète** : [docs/CONCEPTION.md](docs/CONCEPTION.md). Le besoin, les décisions (§8), l'architecture, le schéma SQL et le design system y sont décrits.
- **Où on en est et quoi faire ensuite** : §7 de ce document. Les jalons 0 à 6 sont faits (le **MVP**), puis la **V1.1** en 8 étapes et la **V1.1.2** en 4 étapes (§7.2), terminées. Les points encore à vérifier sont au §7.3. La **V2** est au **§9** : modes Travail et Cours, organisateur de journée, pages, habitudes, Google Agenda, synchro par Google Drive, appli Android ; elle se fait en entier, dans l'ordre du §9.7. Son **étape 1 (« Toujours là ») est faite** (branche `v2-toujours-la`) : zone de notification, démarrage avec Windows, capture rapide et boîte de réception (retirées le 26/11/2026 : un clic droit sur une ligne de page en fait une tâche, un devoir, un événement, une idée ou un projet ; les captures sont dans la page « Captures », migration 0018), événements récurrents, chiffre d'affaires, premières animations. Son **étape 2 (« Modes et espace Cours ») est faite** (branche `v2-modes-cours`, partie de `v2-toujours-la`) : modes Travail et Cours (`Ctrl M`), matières, devoirs, emploi du temps, semestres et vacances, examens, notes et moyennes, dashboard Cours. Son **étape 3 (« Organisateur de journée ») est faite** (branche `v2-journee`, partie de `v2-modes-cours`) : page Journée, modules, blocs, tâches dans les blocs, semaines types, remplir les trous, bilan du soir. Son **étape 4 (« Pages ») est faite** (branche `v2-pages`, partie de `v2-journee`) : éditeur TipTap, arborescence, favoris, liens `[[…]]`, modèles, journal, images, export Markdown, import Notion. Son **étape 5 (« Révisions ») est faite** (branche `v2-revisions`, partie de `v2-pages`) : révisions à rebours des examens ; les flashcards ont été retirées le 26/11/2026 à la demande de l'utilisateur (migration 0015). Son **étape 6 (« Sport, habitudes et objectifs ») est faite** (branche `v2-habitudes`, partie de `v2-revisions`) : habitudes, objectifs, carnet de séances, revue de la semaine, rappels d'habitude. Son **étape 7 (« Le compagnon ») est faite** (branche `v2-compagnon`, partie de `v2-habitudes`) : écran du matin, mode focus et Pomodoro, mini-fenêtre « En ce moment », célébrations, sons, nouvelles notifications. Son **étape 8 (« Connexion Google et Google Agenda ») est faite** (branche `v2-google`, partie de `v2-compagnon`) : connexion OAuth côté Rust, Google Agenda en lecture seule dans le calendrier, la Journée et Aujourd'hui ; la connexion avec un vrai compte attend le projet Google Cloud de l'utilisateur ([docs/google-cloud.md](docs/google-cloud.md)). Son **étape 9 (« Synchronisation ») est faite** (branche `v2-sync`, partie de `v2-google`) : journal des changements par déclencheurs, fichiers chiffrés dans le dossier caché de Google Drive, la plus récente l'emporte, clé donnée par un code ; l'échange réel reste à essayer. L'**étape 10 (application Android) est en cours** (branche `v2-android`, partie de `v2-sync`) : écrans du téléphone faits (`src/mobile/`, essayables dans le navigateur avec `?mobile` dans l'adresse) et code QR de la clé sur le PC. Reste, une fois l'outillage de [docs/android.md](docs/android.md) installé : `tauri android init`, le côté Rust pour Android (plugins de bureau mis à part, coffre de secrets Android), le scan du code QR, les notifications et le widget.
- **Maquette de référence du dashboard** : [docs/maquette-dashboard.html](docs/maquette-dashboard.html). La disposition finale en diffère (Prochains jours sous À surveiller) : voir « Choix faits au jalon 5 » au §7.3.

## L'utilisateur

- Écrit en français et tutoie : répondre en français.
- Veut valider étape par étape (un jalon à la fois).
- Déteste les interfaces chargées : peu d'informations à la fois, beaucoup d'espace, pas de cartes partout.
- **Clavier AZERTY**, Windows 11, écran 1080p à 125 %. Les raccourcis doivent tester la touche physique (`event.code`) ou les caractères AZERTY ; voir `digitFromEvent` dans `src/app/shortcuts.ts`.

## Données personnelles : ne JAMAIS les publier

- La vraie base est `%APPDATA%\com.cockpit.desktop\cockpit.db`, **hors du dépôt**, avec ses sauvegardes dans `backups\`.
- En développement (`npm run tauri dev`), l'app utilise **`cockpit-dev.db`** (voir `src-tauri/src/lib.rs`) : les essais ne touchent jamais les vraies données.
- `.gitignore` bloque `*.db`, `*.sqlite*`, `backups/`, `exports/` et `cockpit-export*`. Tout export est nommé `cockpit-export-…` (vérifié par la commande Rust `export_save`). Un dossier de code ne doit donc pas s'appeler `exports/` ni `backups/` : il serait ignoré sans bruit.
- Ne jamais committer de données réelles, de captures d'écran de données réelles ni d'identifiants.
- **Écrire dans une vraie base** (à la demande de l'utilisateur) : app fermée, sauvegarde d'abord (`backups\cockpit_…_manuelle.db`), une seule transaction, avec **Python `sqlite3`**. Jamais `node:sqlite` : sur cette machine, il ne voit pas le journal WAL écrit par l'app et lit une version périmée de la base (vide ou au mauvais schéma). Les tests Vitest, sur une base en mémoire, ne sont pas concernés.
- **Quel Python** : pas le `python` par défaut, celui du Microsoft Store (`…\WindowsApps\python`) : il a sa propre vue de `%APPDATA%` et y lit une version périmée, sans le WAL ; ses écritures n'arrivent pas dans l'app (constaté le 26/09/2026 sur `cockpit-dev.db`). Utiliser `%LOCALAPPDATA%\Programs\Python\Python310\python.exe`, et vérifier d'abord qu'il lit bien ce que l'app affiche.
- **Claude est lui aussi une app empaquetée** (MSIX `Claude_pzs8sxrjxfjjc`) : tout ce qu'il lance (PowerShell, Python, `tauri dev`, un `cockpit.exe`) voit un `%APPDATA%` **fusionné**. Les fichiers créés depuis Claude vont dans `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\com.cockpit.desktop`, que l'app lancée normalement ne voit pas ; les fichiers qui existaient déjà sont partagés ; un fichier virtuel cache le vrai du même nom. Donc :
  - **ne jamais lancer l'app installée depuis Claude** : le 26/11/2026, cela a mêlé une vieille base virtuelle (créée par un lancement depuis Claude le 24/09) au journal WAL de la vraie, puis effacé ce journal (tout a été récupéré, voir §7.3 de la conception) ;
  - **lire la vraie base** : copier ses fichiers et vérifier la copie, après avoir regardé ce qui est virtuel dans le dossier `LocalCache` ci-dessus ;
  - **écrire dans la vraie base** : préparer le fichier dans le scratchpad (le dossier `Temp` n'est pas virtualisé), puis le mettre en place par un processus lancé **hors de Claude** (`Invoke-CimMethod Win32_Process -MethodName Create`, qui voit le vrai dossier), après avoir mis l'état d'avant de côté, et contrôler par l'empreinte (`certutil -hashfile`) ;
  - la base de dev des essais lancés depuis Claude (`tauri dev`, `target/debug/cockpit.exe`) est la copie virtuelle de `cockpit-dev.db`, ce qui ne gêne pas.
- Les commits utilisent l'e-mail masqué GitHub (réglé dans la config locale du dépôt) : ne pas le changer.

## Stack et commandes

Tauri 2.12 (Rust, coquille fine ; plugins `autostart`, `single-instance`, icône `tray`) · React 19 + TypeScript strict · SQLite via `rusqlite` · Tailwind 4 · TanStack Router / Query · Zustand · Radix UI · cmdk · dnd-kit · Motion.

| Commande | Rôle |
|---|---|
| `npm run tauri dev` | App de développement (base `cockpit-dev.db`) |
| `npm run tauri build` | Installeur : `src-tauri/target/release/bundle/nsis/Cockpit_<version>_x64-setup.exe` |
| `npm test` | Vitest : règles métier et SQL sur une base en mémoire (`node:sqlite`) |
| `npm run typecheck` | Types |
| `npm run dev` | Interface seule dans un navigateur, sur une base SQLite **en mémoire** (sql.js, mêmes migrations, jamais dans le build de production) |

Rust et cargo sont dans `%USERPROFILE%\.cargo\bin` : dans PowerShell, ajouter `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`.

## Règles d'architecture

- Découpage par domaine (`src/domains/<domaine>/`) : `model.ts` (règles pures, testées) → `repository.ts` (**seul endroit avec du SQL**) → `service.ts` (lots multi-tables) → `hooks.ts` (TanStack Query) → `components/` / `pages/`. `src/ui/` ne contient aucune logique métier.
- **Aucune valeur dérivée stockée** : progression, reçu, reste, retard et soldes sont calculés (vues SQL ou `model.ts`).
- **Chaque date à un seul endroit** : le calendrier agrège, il ne duplique pas (P8).
- IDs UUID générés côté app ; montants en **centimes** ; dates `YYYY-MM-DD` ; horodatages en UTC ISO.
- « Aujourd'hui » est passé en paramètre (`useToday()`), jamais `date('now')` en SQL.
- Écritures multi-tables via `db.batch([...])` (atomique). Mutations : invalider les clés concernées (`src/core/query-keys.ts`).
- **Recherche** : l'index FTS5 `search_index` est tenu à jour par des triggers (migration 0002). Une nouvelle table cherchable doit y ajouter ses triggers, dans une nouvelle migration. En mode navigateur (sql.js, sans FTS5), la recherche passe par `LIKE`.
- **Suppressions** : toujours avec « Annuler » dans le toast (`undo: true` sur l'action, déclenchée aussi par Ctrl+Z), jamais de confirmation définitive.
- **Commandes natives** (`src-tauri/src/data.rs`) : les fenêtres de fichier s'ouvrent côté Rust, l'interface ne transmet jamais de chemin.
- **Google** (`src-tauri/src/google.rs`, `src/domains/google/`) : réseau, OAuth et jetons côté Rust seulement, l'interface ne fait aucun appel réseau. Identifiants du client et jeton dans le Gestionnaire d'identification de Windows, **jamais** dans la base, les exports ou le dépôt (public). Les événements sont une copie locale en lecture seule (`google_events`), non exportée, source `google` de l'agenda.
- **Événements récurrents** (P15) : la règle (RRULE) est stockée une fois dans `events.recurrence`, les occurrences sont calculées (`agenda/recurrence.ts`), seules les exceptions sont stockées (`event_exceptions`). Tout ce qui lit des événements passe par ces occurrences (`listAgenda`, `listRecurringOccurrences`).
- **Deux fenêtres** : la principale (`index.html`) et la mini-fenêtre « En ce moment » (`now.html`, `src/now.tsx`, `src-tauri/src/now.rs`), volontairement sans routeur ni cache. Elle écrit par le même pont SQLite et prévient la principale par un événement natif (`cockpit:data-changed`). (La capture rapide et sa fenêtre ont été retirées le 26/11/2026, avec la boîte de réception.)
- **Modes** (P13) : `app/modes.ts` dit à quel mode appartient une page ; `NAV` (`app/navigation.ts`) donne la barre latérale de chaque mode. Une vue d'un seul mode trie avec `tasksOfMode` (tâches) ou `isSchoolItem` (agenda). L'espace Cours est dans `src/domains/school/` (matières, périodes, emploi du temps, examens, notes, devoirs) ; un devoir est une tâche avec `subject_id`, et, s'il est à rendre pour un cours précis de Google, avec `course_event` ('agenda|événement').
- **Journée** (P16-P18) : `src/domains/day/`. Un bloc porte sa date ; une tâche dans un bloc (`tasks.block_id`) prend le jour du bloc via `blockDate` (jointure), jamais recopié. Les heures des blocs sont 'HH:MM', '24:00' pour minuit.
- **Pages** (P19) : `src/domains/pages/`. Le schéma des blocs (`editor/nodes.ts`) sert à l'éditeur et au Markdown (`editor/markdown.ts`, testable sans navigateur) ; les vues React sont dans `editor/extensions.ts`. Images dans la table `attachments` (data URL), référencées par `attachment:<id>`. **Lignes transformées** (ce que faisait la boîte de réception) : un clic droit sur une ligne en fait une tâche, un devoir, un événement, une idée ou un projet (`editor/page-lines.ts` pour les règles, `LineMenu.tsx`, `line-actions.ts`) ; les fenêtres de création reçoivent `fromLine` (`app/create-store.ts`) et appellent `onCreated` au lieu de leur toast. `line-actions.ts` et `page-lines.ts` tirent le schéma de l'éditeur : jamais depuis `pages/hooks.ts` (barre latérale).
- **Couleurs** : une couleur choisie est un `AppColor` : une clé de la palette (`'blue'`…, adaptée au thème) ou une couleur libre `'#rrggbb'`. Tout rendu passe par `colorVar()` (`ui/data/ColorDot.tsx`), jamais `var(--p-…)` écrit à la main ; le choix par `ColorChoice` (palette + « Autre couleur ») ou `ColorButton` (pastille d'une ligne). Un projet a sa couleur, sinon celle de son type (`COALESCE(p.color, pt.color)` dans les requêtes).
- **Cours venant de Google** : l'agenda des cours se **reconnaît seul** à la relecture (`looksLikeTimetable` : intitulés « Matière | Type | Prof », ou `isTimetableName` : un nom comme « Emploi du temps »), tant qu'aucun agenda n'en est un et que le réglage `google.schoolManual` (choix fait à la main dans Paramètres) n'existe pas. `parseCourseTitle()` lit la matière, le type (« Cours », « Examen »…) et les profs (`google_events.course`, `course_kind`, `teacher`) ; `course_links` relie chaque intitulé à une matière, **créée toute seule** à la relecture, ou l'ignore (`subject_id` NULL). Les matières sont **invisibles** : pas de page Matières dans la barre latérale, elles servent aux couleurs, aux examens et aux notes. Dans l'agenda, un cours est un élément `source 'google'`, `kind 'class'`, avec `subjectId`, titré par son nom propre ; il appartient au mode Cours (`isSchoolItem`) : absent du dashboard Travail, dans « Cours du jour » et « Prochains jours » du dashboard Cours (`schoolUpcomingItems`). Un devoir relié à un cours (`tasks.course_event`) garde son jour dans `due_date`, mis à jour par la relecture si le cours change de jour (`followCourseDatesStatement`). Le choix d'un cours passe par `CoursePicker` ; la page Emploi du temps montre la semaine Google (`CourseWeekGrid`), la semaine type saisie à la main n'est plus proposée.
- **Animations** : composants `m` de Motion et réglages de `src/ui/motion` (jamais le composant `motion` complet, `LazyMotion` est strict). Durées dans `presets.ts`, toujours via `transitionFor`, qui respecte « Réduire les animations ».
- **Migrations** : fichiers `src-tauri/migrations/NNNN_*.sql`, à déclarer dans `src-tauri/src/db/migrations.rs`. Ne jamais modifier une migration publiée : en ajouter une nouvelle. Une sauvegarde est faite automatiquement avant chaque migration.
- **Synchronisation** (`src/domains/sync/`, `src-tauri/src/sync.rs`, migration 0014) : une nouvelle table de données va dans `EXPORT_TABLES` **et** reçoit dans sa migration ses trois déclencheurs `sync_<table>_ai/_au/_ad` (même forme que dans 0014) ; une nouvelle contrainte d'unicité a besoin d'une règle dans `UNIQUE_RULES`. `tests/sync.test.ts` vérifie les deux. Jamais de `INSERT OR REPLACE` sur une table qui a des enfants en `ON DELETE CASCADE`. Les écritures Python dans une vraie base sont elles aussi notées et synchronisées.

## Vérifier son travail

- Toujours : `npm run typecheck` et `npm test`.
- **Tester l'interface dans le navigateur intégré**, sur `npm run dev` ou le Vite de `tauri dev`, port 1420. C'est isolé et fiable.
- **Avec de vraies données** : `?data` dans l'adresse (`http://localhost:1420/?data`, `?data&mobile` pour le téléphone) part de `local-data/cockpit.db` (ignoré par git), une copie préparée à partir d'une sauvegarde de Cockpit (index de recherche sans FTS5). Tout reste en mémoire ; rien n'est réécrit. Ne jamais versionner ce dossier.
- **Ne pas saisir de texte dans la vraie fenêtre Cockpit via l'automatisation Windows** : la fenêtre de Claude peut reprendre le focus et la saisie part ailleurs (c'est déjà arrivé). Des raccourcis seuls ou des captures d'écran suffisent.
- Dans le navigateur de test, `Ctrl+N` et `Ctrl+1…6` sont réservés par le navigateur ; dans l'app, `N` et `Ctrl+1…6` fonctionnent.
- Si l'interface affiche « Invalid hook call » après l'ajout d'une dépendance, recharger complètement la page (réoptimisation Vite).
- **Cockpit reste dans la zone de notification** : fermer sa fenêtre ne le quitte pas. Pour libérer le port 1420 ou relancer, le quitter par le clic droit sur son icône (« Cockpit (développement) » pour l'app de dev).
- **App de dev et app installée ensemble** : l'instance unique et le démarrage avec Windows n'existent que dans l'app installée.
- **Essai de lancement sans saisie** : `src-tauri/target/debug/cockpit.exe` (avec Vite sur le port 1420), éventuellement avec `--autostart` pour un démarrage caché. On peut vérifier ses fenêtres et envoyer un raccourci seul ; jamais de texte.
- Pendant un `npm run tauri dev`, modifier un fichier Rust recompile et relance l'app. `cargo test --lib` (dans `src-tauri`) teste les sauvegardes et la restauration.

## Git

- Branche `main` publiée. Pour un jalon : une branche `jalon-N-…`, des commits en français, puis une fusion `--ff-only` dans `main` et un `git push`.
- Messages de commit : passer par un fichier (`git commit -F fichier.txt`), car PowerShell 5.1 abîme les accents et les messages sur plusieurs lignes.
- PowerShell 5.1 : ne jamais relire ou réécrire un fichier UTF-8 avec `Get-Content` / `Set-Content` sans `-Encoding UTF8` (les accents sont corrompus). Préférer les outils d'édition, ou `[IO.File]::ReadAllText(..., [Text.Encoding]::UTF8)`.
