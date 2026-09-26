# Cockpit

*[English version](README.md)*

Application desktop personnelle (Windows) pour piloter projets, tâches, planning et finances d'un freelance.
Locale, hors ligne, sans compte. Conception complète : [docs/CONCEPTION.md](docs/CONCEPTION.md).

## Télécharger

L'installeur Windows est joint à chaque [version publiée](https://github.com/Raphi72/cockpit/releases/latest) : `Cockpit_<version>_x64-setup.exe`.
Il s'installe pour l'utilisateur courant (pas besoin de droits administrateur). L'installeur n'est pas signé : Windows SmartScreen peut afficher un avertissement, choisir « Informations complémentaires » puis « Exécuter quand même ».

## Ce qu'elle fait

- **Tableau de bord** : les tâches du jour, les deadlines proches, ce qui mérite attention, les prochains jours et les chiffres clés.
- **Projets et clients** : statut, budget et échéancier, tâches et sous-tâches, idées.
- **Tâches** : listes, kanban, sélection multiple, raccourcis clavier.
- **Calendrier et planning** : toutes les dates au même endroit (événements, deadlines, encaissements), glisser-déposer, planning des projets.
- **Finances** : comptes et soldes, encaissements attendus et reçus, transactions, virements.
- **Notifications Windows** : deadlines, tâches prioritaires, encaissements, rendez-vous, résumé du matin.
- **Tes données** : sauvegarde automatique chaque jour, sauvegarde et restauration à la main, exports JSON et CSV (Excel).

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

- `src-tauri/` : pont SQLite (`db_query`, `db_execute`, `db_batch`), migrations, sauvegardes, fenêtres de fichier, notifications.
- `src-tauri/migrations/` : schéma SQL versionné (`PRAGMA user_version`). On n'édite jamais une migration publiée, on en ajoute une.
- `src/core/` : socle technique (accès base, montants, dates).
- `src/domains/<domaine>/` : `model` (règles pures) → `repository` (seul endroit avec du SQL) → `hooks` → `components` / `pages`.
- `src/ui/` : design system, sans logique métier.

## Données

Tout reste sur ton ordinateur ; rien n'est envoyé nulle part.

- Base : `%APPDATA%\com.cockpit.desktop\cockpit.db`
- Sauvegardes automatiques (une par jour, 14 conservées, plus une avant chaque migration) : `%APPDATA%\com.cockpit.desktop\backups\` (dossier modifiable dans Paramètres)

Le dépôt ne contient jamais de base, de sauvegarde ni d'export (voir `.gitignore`).

## Feuille de route

Voir [CONTRIBUTING.md](CONTRIBUTING.md) : ce qui est fait, la V1.1.2 à venir, puis la V2 et la V2.5.
