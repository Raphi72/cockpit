# Cockpit : contexte pour Claude

Application desktop personnelle (Windows) pour piloter projets, tâches, planning et finances d'un freelance débutant.
Locale, hors ligne, sans compte. Dépôt **public** : https://github.com/Raphi72/cockpit

## Par où commencer

- **Référence complète** : [docs/CONCEPTION.md](docs/CONCEPTION.md). Le besoin, les décisions (§8), l'architecture, le schéma SQL et le design system y sont décrits.
- **Où on en est** : MVP, V1.1 et V1.1.2 faits ; V2 faite jusqu'à l'étape 9, l'étape 10 (appli Android) en cours : l'appli est sur le téléphone, reliée au PC (synchro vérifiée), et reprend les pages du PC depuis la 2.6.0 ; restent les notifications et le widget (§7 et §9 de la conception). Le détail étape par étape est dans le mémo.
- **Journal** : [docs/JOURNAL.md](docs/JOURNAL.md). Retours d'usage, points à vérifier à la main et choix faits à chaque étape (l'ancien §7.3 de la conception). Y ajouter les retours et les choix des prochaines étapes.
- **Mémo technique** : [docs/MEMO-DEV.md](docs/MEMO-DEV.md). Avancement détaillé de la V2, règles propres à chaque domaine (modes, Journée, Pages, couleurs, cours Google, fenêtres, événements récurrents…), pièges de cette machine (Python, `%APPDATA%` virtuel de Claude), détails pour tester. **À lire avant de toucher un domaine.**
- **Tuto pour l'utilisateur** : [docs/TUTO.md](docs/TUTO.md) (lié depuis les deux README et les notes de version). Le tenir à jour quand une fonction visible change.
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
- **Claude voit un `%APPDATA%` virtuel** (il est lui-même une app empaquetée) : **ne jamais lancer l'app installée depuis Claude**, et pour lire ou écrire la vraie base, suivre la procédure du mémo (§ « Données et cette machine »). Python : `%LOCALAPPDATA%\Programs\Python\Python310\python.exe`, jamais celui du Microsoft Store.
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
- **Google** : réseau, OAuth et jetons côté Rust seulement ; identifiants et jetons dans le Gestionnaire d'identification de Windows, **jamais** dans la base, les exports ou le dépôt (public).
- **Animations** : composants `m` de Motion seulement (jamais `motion` : `LazyMotion` est strict), durées via `transitionFor`.
- **Base au démarrage** (`src-tauri/src/db/recovery.rs`) : `quick_check` ; une base abîmée est mise de côté (`backups/abimee_…`) et remplacée par la dernière sauvegarde intacte, l'interface le dit une fois (`db_recovery`) ; en quittant, le journal est versé dans la base.
- **Règles propres à chaque domaine** : voir le mémo, avant de modifier un domaine.
- **Migrations** : fichiers `src-tauri/migrations/NNNN_*.sql`, à déclarer dans `src-tauri/src/db/migrations.rs`. Ne jamais modifier une migration publiée : en ajouter une nouvelle. Une sauvegarde est faite automatiquement avant chaque migration.
- **Synchronisation** (`src/domains/sync/`, `src-tauri/src/sync.rs`, migration 0014) : une nouvelle table de données va dans `EXPORT_TABLES` **et** reçoit dans sa migration ses trois déclencheurs `sync_<table>_ai/_au/_ad` (même forme que dans 0014) ; une nouvelle contrainte d'unicité a besoin d'une règle dans `UNIQUE_RULES`. `tests/sync.test.ts` vérifie les deux. Jamais de `INSERT OR REPLACE` sur une table qui a des enfants en `ON DELETE CASCADE`. Les écritures Python dans une vraie base sont elles aussi notées et synchronisées.

## Vérifier son travail

- Toujours : `npm run typecheck` et `npm test`.
- **Tester l'interface dans le navigateur intégré**, sur `npm run dev` ou le Vite de `tauri dev`, port 1420. C'est isolé et fiable.
- **Avec de vraies données** : `?data` dans l'adresse (`http://localhost:1420/?data`, `?data&mobile` pour le téléphone) part de `local-data/cockpit.db` (ignoré par git), une copie préparée à partir d'une sauvegarde de Cockpit (index de recherche sans FTS5). Tout reste en mémoire ; rien n'est réécrit. Ne jamais versionner ce dossier.
- **Ne pas saisir de texte dans la vraie fenêtre Cockpit via l'automatisation Windows** : la fenêtre de Claude peut reprendre le focus et la saisie part ailleurs (c'est déjà arrivé). Des raccourcis seuls ou des captures d'écran suffisent.
## Git

- Branche `main` publiée. Depuis le 26/11/2026 (V2 jusqu'à la 2.2.0 fusionnée), **on travaille directement sur `main`**, à la demande de l'utilisateur ; une branche à part seulement pour un gros chantier qu'il veut isoler. Ne pousser qu'à sa demande.
- **Version publiée** : chaque installateur donné à l'utilisateur a son numéro (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, tête de `package-lock.json`) ; une release GitHub (`gh release create vX.Y.Z`) joint `Cockpit_X.Y.Z_x64-setup.exe`, avec des notes en anglais comme les précédentes. Avant de pousser : vérifier qu'aucune donnée réelle (noms de profs, intitulés de son école, adresses, base) n'est dans l'historique.
- Messages de commit : passer par un fichier (`git commit -F fichier.txt`), car PowerShell 5.1 abîme les accents et les messages sur plusieurs lignes.
- PowerShell 5.1 : ne jamais relire ou réécrire un fichier UTF-8 avec `Get-Content` / `Set-Content` sans `-Encoding UTF8` (les accents sont corrompus). Préférer les outils d'édition, ou `[IO.File]::ReadAllText(..., [Text.Encoding]::UTF8)`.
