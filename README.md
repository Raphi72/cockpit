# Cockpit

Application desktop personnelle (Windows) pour piloter projets, tâches, planning et finances.
Locale, hors ligne, sans compte. Conception complète : [docs/CONCEPTION.md](docs/CONCEPTION.md).

## Stack

Tauri 2 (Rust, coquille fine) · React 19 + TypeScript · SQLite (rusqlite) · Tailwind CSS 4 · TanStack Router / Query · Zustand.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run tauri dev` | Lance l'app en développement (rechargement à chaud) |
| `npm run tauri build` | Produit l'installeur Windows (`src-tauri/target/release/bundle/nsis/`) |
| `npm test` | Tests (règles métier et SQL sur une base en mémoire) |
| `npm run typecheck` | Vérification des types |

Prérequis : Node 24, Rust (stable, MSVC) et les Build Tools C++ de Visual Studio.

En développement, l'app utilise une base séparée (`cockpit-dev.db`) : les essais ne touchent jamais les vraies données.
`npm run dev` seul ouvre aussi l'interface dans un navigateur, sur une base SQLite en mémoire (sql.js, mêmes migrations) : pratique pour tester l'interface, absent du build de production.

## Organisation

- `src-tauri/` : pont SQLite (`db_query`, `db_execute`, `db_batch`), migrations, sauvegardes.
- `src-tauri/migrations/` : schéma SQL versionné (`PRAGMA user_version`). On n'édite jamais une migration publiée, on en ajoute une.
- `src/core/` : socle technique (accès base, montants, dates).
- `src/domains/<domaine>/` : `model` (règles pures) → `repository` (seul endroit avec du SQL) → `hooks` → `components` / `pages`.
- `src/ui/` : design system, sans logique métier.

## Données

- Base : `%APPDATA%\com.cockpit.desktop\cockpit.db`
- Sauvegardes automatiques (une par jour, 14 conservées, plus une avant chaque migration) : `%APPDATA%\com.cockpit.desktop\backups\`
