# Cockpit : contexte pour Claude

Application desktop personnelle (Windows) pour piloter projets, tâches, planning et finances d'un freelance débutant.
Locale, hors ligne, sans compte. Dépôt **public** : https://github.com/Raphi72/cockpit

## Par où commencer

- **Référence complète** : [docs/CONCEPTION.md](docs/CONCEPTION.md). Le besoin, les décisions (§8), l'architecture, le schéma SQL et le design system y sont décrits.
- **Où on en est et quoi faire ensuite** : §7 de ce document. Les jalons 0 à 3 sont faits ; le suivant est le **jalon 4 (Calendrier)**, détaillé au §7.2. Les points à reprendre sont au §7.3.
- **Maquette de référence du dashboard** : [docs/maquette-dashboard.html](docs/maquette-dashboard.html).

## L'utilisateur

- Écrit en français et tutoie : répondre en français.
- Veut valider étape par étape (un jalon à la fois).
- Déteste les interfaces chargées : peu d'informations à la fois, beaucoup d'espace, pas de cartes partout.
- **Clavier AZERTY**, Windows 11, écran 1080p à 125 %. Les raccourcis doivent tester la touche physique (`event.code`) ou les caractères AZERTY ; voir `digitFromEvent` dans `src/app/shortcuts.ts`.

## Données personnelles : ne JAMAIS les publier

- La vraie base est `%APPDATA%\com.cockpit.desktop\cockpit.db`, **hors du dépôt**, avec ses sauvegardes dans `backups\`.
- En développement (`npm run tauri dev`), l'app utilise **`cockpit-dev.db`** (voir `src-tauri/src/lib.rs`) : les essais ne touchent jamais les vraies données.
- `.gitignore` bloque `*.db`, `*.sqlite*`, `backups/`, `exports/` et `cockpit-export*`. Tout futur export doit être nommé `cockpit-export-…`.
- Ne jamais committer de données réelles, de captures d'écran de données réelles ni d'identifiants.
- Les commits utilisent l'e-mail masqué GitHub (réglé dans la config locale du dépôt) : ne pas le changer.

## Stack et commandes

Tauri 2 (Rust, coquille fine) · React 19 + TypeScript strict · SQLite via `rusqlite` · Tailwind 4 · TanStack Router / Query · Zustand · Radix UI · cmdk · dnd-kit.

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
- **Migrations** : fichiers `src-tauri/migrations/NNNN_*.sql`, à déclarer dans `src-tauri/src/db/migrations.rs`. Ne jamais modifier une migration publiée : en ajouter une nouvelle. Une sauvegarde est faite automatiquement avant chaque migration.

## Vérifier son travail

- Toujours : `npm run typecheck` et `npm test`.
- **Tester l'interface dans le navigateur intégré**, sur `npm run dev` ou le Vite de `tauri dev`, port 1420. C'est isolé et fiable.
- **Ne pas saisir de texte dans la vraie fenêtre Cockpit via l'automatisation Windows** : la fenêtre de Claude peut reprendre le focus et la saisie part ailleurs (c'est déjà arrivé). Des raccourcis seuls ou des captures d'écran suffisent.
- Dans le navigateur de test, `Ctrl+N` et `Ctrl+1…6` sont réservés par le navigateur ; dans l'app, `N` et `Ctrl+1…6` fonctionnent.
- Si l'interface affiche « Invalid hook call » après l'ajout d'une dépendance, recharger complètement la page (réoptimisation Vite).

## Git

- Branche `main` publiée. Pour un jalon : une branche `jalon-N-…`, des commits en français, puis une fusion `--ff-only` dans `main` et un `git push`.
- Messages de commit : passer par un fichier (`git commit -F fichier.txt`), car PowerShell 5.1 abîme les accents et les messages sur plusieurs lignes.
- PowerShell 5.1 : ne jamais relire ou réécrire un fichier UTF-8 avec `Get-Content` / `Set-Content` sans `-Encoding UTF8` (les accents sont corrompus). Préférer les outils d'édition, ou `[IO.File]::ReadAllText(..., [Text.Encoding]::UTF8)`.
