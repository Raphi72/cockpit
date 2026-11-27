# Cockpit

*[Version française](README.fr.md)*

Personal desktop app (Windows) to run projects, tasks, schedule and finances as a freelancer.
Local, offline, no account. Full design document (in French): [docs/CONCEPTION.md](docs/CONCEPTION.md).

## Download

The Windows installer is attached to each [release](https://github.com/Raphi72/cockpit/releases/latest): `Cockpit_<version>_x64-setup.exe`, and the Android app: `Cockpit_<version>_android.apk`.
It installs for the current user only (no administrator rights needed). The installer is not signed by Microsoft: Windows SmartScreen may show a warning, choose "More info" then "Run anyway".
Since 2.7.0, Cockpit updates itself from these releases (the PC offers "Restart", the phone offers "Install").

## Connect your Google account

Google Calendar and the PC–phone sync need a free Google Cloud project of your own (about ten minutes, once):
step-by-step guide in [docs/google-cloud.md](docs/google-cloud.md) (in French). Your client ID, secret and
tokens stay on your devices (Windows Credential Manager, the app's private folder on Android), never in the
repository.

## What it does

- **Dashboard**: today's tasks, upcoming deadlines, things to watch, the next few days and key figures.
- **Projects and clients**: status, budget and payment schedule, tasks and subtasks, ideas.
- **Tasks**: lists, kanban, multi-select, keyboard shortcuts, and "I want to work…", which builds the day's plan for a given time or number of tasks.
- **Calendar and planning**: every date in one place (events, deadlines, payments), drag and drop, project timeline.
- **Finances**: accounts and balances, expected and received payments, transactions, transfers.
- **Windows notifications**: deadlines, priority tasks, payments, appointments, morning summary.
- **Your data**: daily automatic backups, manual backup and restore, JSON and CSV exports (Excel).
- **Work and School modes** (`Ctrl M`): homework tied to a specific class, the real week from Google Calendar, exams and grades.
- **Day planner**: time blocks dragged onto the day, a "to place" list, and a full-screen focus mode with a timer and a checklist.
- **Pages**: Notion-like notes; any line can become a task, homework, event or project.
- **Google**: Google Calendar, read and edit (also offline: changes are sent when the network comes back), and encrypted sync through a hidden Google Drive folder. Set up: [docs/google-cloud.md](docs/google-cloud.md).
- **Android app**: the PC pages on one column, linked to the PC by a QR code.

Getting started: the [tutorial](docs/TUTO.md) (in French).

## Stack

Tauri 2 (Rust, thin shell) · React 19 + TypeScript · SQLite (rusqlite) · Tailwind CSS 4 · TanStack Router / Query · Zustand.

## Commands

| Command | Purpose |
|---|---|
| `npm run tauri dev` | Runs the app in development mode (hot reload) |
| `npm run tauri build` | Builds the Windows installer (`src-tauri/target/release/bundle/nsis/`) |
| `npm test` | Tests (business rules and SQL on an in-memory database) |
| `npm run typecheck` | Type checking |

Requirements: Node 24, Rust (stable, MSVC) and the Visual Studio C++ Build Tools.

In development, the app uses a separate database (`cockpit-dev.db`): experiments never touch real data.
`npm run dev` alone also opens the interface in a browser, on an in-memory SQLite database (sql.js, same migrations): handy for UI testing, and left out of the production build.

## Structure

- `src-tauri/`: SQLite bridge (`db_query`, `db_execute`, `db_batch`), migrations, backups, file dialogs, notifications.
- `src-tauri/migrations/`: versioned SQL schema (`PRAGMA user_version`). A published migration is never edited; a new one is added.
- `src/core/`: technical foundation (database access, amounts, dates).
- `src/domains/<domain>/`: `model` (pure rules) → `repository` (the only place with SQL) → `hooks` → `components` / `pages`.
- `src/ui/`: design system, no business logic.

## Data

Everything stays on your computer; nothing is sent anywhere.

- Database: `%APPDATA%\com.cockpit.desktop\cockpit.db`
- Automatic backups (one a day, 14 kept, plus one before each migration): `%APPDATA%\com.cockpit.desktop\backups\` (the folder can be changed in Settings)

The repository never contains a database, backup or export (see `.gitignore`).

## Roadmap

See [CONTRIBUTING.md](CONTRIBUTING.md) (in French): what is done (up to V1.1.2, then V2 steps 1 to 9), the Android app (V2 step 10, in progress) and V2.5.
