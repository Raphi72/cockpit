//! Sauvegardes locales : copie cohérente de la base (même ouverte) via `VACUUM INTO`,
//! et restauration contrôlée via l'API de sauvegarde de SQLite.
//! Nom des fichiers : cockpit_<AAAA-MM-JJ_HHMMSS>_<raison>.db — l'ordre alphabétique est chronologique.

use crate::db::migrations::MIGRATIONS;
use rusqlite::{backup::Progress, Connection, OpenFlags, MAIN_DB};
use serde::Serialize;
use std::error::Error;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const PREFIX: &str = "cockpit_";

/// Réglage (table `settings`, valeur JSON) : dossier des sauvegardes choisi dans Paramètres › Données.
const DIR_SETTING: &str = "data.backupDir";

#[derive(Clone, Copy)]
pub enum Reason {
    Auto,
    PreMigration,
    Manual,
    PreRestore,
}

impl Reason {
    const ALL: [Reason; 4] = [Reason::Auto, Reason::PreMigration, Reason::Manual, Reason::PreRestore];

    fn tag(self) -> &'static str {
        match self {
            Reason::Auto => "auto",
            Reason::PreMigration => "migration",
            Reason::Manual => "manuelle",
            Reason::PreRestore => "restauration",
        }
    }

    /// Nombre de sauvegardes conservées pour cette raison. Celles faites à la main ne sont jamais effacées.
    fn keep(self) -> usize {
        match self {
            Reason::Auto => 14,
            Reason::PreMigration | Reason::PreRestore => 5,
            Reason::Manual => usize::MAX,
        }
    }
}

/// Horodatage local du nom de fichier : AAAA-MM-JJ_HHMMSS.
pub fn stamp(conn: &Connection) -> rusqlite::Result<String> {
    conn.query_row("SELECT strftime('%Y-%m-%d_%H%M%S', 'now', 'localtime')", [], |row| row.get(0))
}

pub fn file_name(stamp: &str, reason: Reason) -> String {
    format!("{PREFIX}{stamp}_{}.db", reason.tag())
}

pub fn create(conn: &Connection, dir: &Path, reason: Reason) -> rusqlite::Result<PathBuf> {
    let path = dir.join(file_name(&stamp(conn)?, reason));
    conn.execute("VACUUM INTO ?1", [path.to_string_lossy()])?;
    Ok(path)
}

/// Une sauvegarde automatique par jour, au premier lancement de la journée.
pub fn daily(conn: &Connection, dir: &Path) -> Result<(), Box<dyn Error>> {
    let today: String = conn.query_row("SELECT date('now', 'localtime')", [], |row| row.get(0))?;
    let done_today = list(dir, Reason::Auto)?
        .iter()
        .any(|name| name.starts_with(&format!("{PREFIX}{today}_")));
    if !done_today {
        create(conn, dir, Reason::Auto)?;
    }
    prune(dir, Reason::Auto)?;
    Ok(())
}

/// Supprime les plus anciennes sauvegardes au-delà du nombre conservé.
pub fn prune(dir: &Path, reason: Reason) -> io::Result<()> {
    let names = list(dir, reason)?;
    let excess = names.len().saturating_sub(reason.keep());
    for name in &names[..excess] {
        fs::remove_file(dir.join(name))?;
    }
    Ok(())
}

/// Horodatage (AAAA-MM-JJ_HHMMSS) de la sauvegarde la plus récente, toutes raisons confondues.
pub fn latest_stamp(dir: &Path) -> Option<String> {
    Reason::ALL
        .iter()
        .filter_map(|reason| list(dir, *reason).ok()?.pop())
        .filter_map(|name| name.get(PREFIX.len()..PREFIX.len() + 17).map(String::from))
        .max()
}

/// Fichiers de sauvegarde d'une raison donnée, du plus ancien au plus récent.
fn list(dir: &Path, reason: Reason) -> io::Result<Vec<String>> {
    let suffix = format!("_{}.db", reason.tag());
    let mut names: Vec<String> = fs::read_dir(dir)?
        .filter_map(Result::ok)
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.starts_with(PREFIX) && name.ends_with(&suffix))
        .collect();
    names.sort();
    Ok(names)
}

// ─── Dossier des sauvegardes ────────────────────────────────────────────────

/// Où vont les sauvegardes : le dossier choisi (OneDrive, clé USB…) s'il est joignable, sinon celui d'AppData.
#[derive(Clone)]
pub struct BackupDirs {
    pub default: PathBuf,
    /// Dossier choisi dans Paramètres, gardé même s'il est momentanément indisponible.
    pub chosen: Option<PathBuf>,
}

impl BackupDirs {
    pub fn active(&self) -> &Path {
        match &self.chosen {
            Some(dir) if dir.is_dir() => dir,
            _ => &self.default,
        }
    }

    /// Le dossier choisi n'est pas joignable (disque débranché, OneDrive absent) : on sauvegarde dans AppData.
    pub fn chosen_unavailable(&self) -> bool {
        self.chosen.as_ref().is_some_and(|dir| !dir.is_dir())
    }
}

/// Dossier choisi, lu dans la table `settings` (absente d'une base toute neuve : aucun choix).
pub fn read_chosen_dir(conn: &Connection) -> Option<PathBuf> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [DIR_SETTING], |row| row.get::<_, String>(0))
        .ok()
        .and_then(|json| serde_json::from_str::<String>(&json).ok())
        .map(PathBuf::from)
}

pub fn write_chosen_dir(conn: &Connection, dir: Option<&Path>) -> rusqlite::Result<()> {
    match dir {
        Some(dir) => {
            let json = serde_json::Value::String(dir.to_string_lossy().into_owned()).to_string();
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                (DIR_SETTING, json),
            )?;
        }
        None => {
            conn.execute("DELETE FROM settings WHERE key = ?1", [DIR_SETTING])?;
        }
    }
    Ok(())
}

/// Vrai si l'app peut écrire dans ce dossier (et pas seulement le lire).
pub fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(".cockpit-test");
    let ok = fs::write(&probe, b"").is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

/// Même fichier, même s'il n'existe pas encore (Windows ignore la casse).
pub fn same_file(a: &Path, b: &Path) -> bool {
    let normalize = |path: &Path| -> Option<String> {
        let parent = fs::canonicalize(path.parent()?).ok()?;
        Some(parent.join(path.file_name()?).to_string_lossy().to_lowercase())
    };
    matches!((normalize(a), normalize(b)), (Some(x), Some(y)) if x == y)
}

// ─── Copie vers un fichier choisi ───────────────────────────────────────────

/// Copie complète de la base vers `target`, qui est remplacé s'il existe.
/// `VACUUM INTO` refuse un fichier existant : on écrit à côté, puis on renomme.
pub fn export_to(conn: &Connection, target: &Path, live_db: &Path) -> Result<(), String> {
    if same_file(target, live_db) {
        return Err("Choisis un autre fichier que la base elle-même.".into());
    }
    let mut tmp = target.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    let _ = fs::remove_file(&tmp);
    conn.execute("VACUUM INTO ?1", [tmp.to_string_lossy()])
        .map_err(|e| format!("Sauvegarde impossible : {e}"))?;
    fs::rename(&tmp, target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Sauvegarde impossible : {e}")
    })
}

// ─── Restauration ───────────────────────────────────────────────────────────

const NOT_COCKPIT: &str = "Ce fichier n'est pas une sauvegarde de Cockpit.";

/// Ce que l'interface montre avant de confirmer une restauration.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    file_name: String,
    /// Horodatage lu dans le nom (AAAA-MM-JJ_HHMMSS), pour une sauvegarde faite par Cockpit.
    stamp: Option<String>,
    /// Date de dernière modification du fichier, en millisecondes depuis 1970.
    modified_ms: Option<u64>,
    schema_version: i64,
    projects: i64,
    tasks: i64,
    transactions: i64,
}

/// Copie le fichier choisi (et son journal WAL éventuel) à `copy` : la restauration ne lit jamais
/// l'original, qui peut changer ou disparaître entre la vérification et la confirmation.
pub fn copy_candidate(source: &Path, copy: &Path) -> io::Result<()> {
    remove_candidate(copy);
    fs::copy(source, copy)?;
    let wal = |path: &Path| {
        let mut name = path.as_os_str().to_owned();
        name.push("-wal");
        PathBuf::from(name)
    };
    if wal(source).is_file() {
        fs::copy(wal(source), wal(copy))?;
    }
    Ok(())
}

pub fn remove_candidate(copy: &Path) {
    for suffix in ["", "-wal", "-shm"] {
        let mut name = copy.as_os_str().to_owned();
        name.push(suffix);
        let _ = fs::remove_file(PathBuf::from(name));
    }
}

/// Vérifie qu'un fichier est une base Cockpit intacte, qu'une version égale ou plus ancienne a créée.
pub fn inspect(copy: &Path, original: &Path) -> Result<Candidate, String> {
    let conn = Connection::open_with_flags(copy, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|_| NOT_COCKPIT.to_string())?;
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|_| NOT_COCKPIT.to_string())?;
    if integrity != "ok" {
        return Err("Ce fichier est endommagé : il ne peut pas être restauré.".into());
    }

    let version: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|_| NOT_COCKPIT.to_string())?;
    let tables: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'
             AND name IN ('projects', 'tasks', 'clients', 'payments', 'transactions', 'settings')",
            [],
            |row| row.get(0),
        )
        .map_err(|_| NOT_COCKPIT.to_string())?;
    if version < 1 || tables < 6 {
        return Err(NOT_COCKPIT.into());
    }
    if version > MIGRATIONS.len() as i64 {
        return Err("Cette sauvegarde vient d'une version plus récente de Cockpit.".into());
    }

    let count = |table: &str| -> Result<i64, String> {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
            .map_err(|e| e.to_string())
    };
    let file_name = original
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let stamp = file_name
        .strip_prefix(PREFIX)
        .and_then(|rest| rest.get(..17))
        .filter(|s| s.as_bytes().get(10) == Some(&b'_'))
        .map(String::from);
    let modified_ms = fs::metadata(original)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);

    Ok(Candidate {
        file_name,
        stamp,
        modified_ms,
        schema_version: version,
        projects: count("projects")?,
        tasks: count("tasks")?,
        transactions: count("transactions")?,
    })
}

/// Remplace le contenu de la base ouverte par celui de `source`, page par page, sans fermer la connexion.
pub fn restore_into(conn: &mut Connection, source: &Path) -> rusqlite::Result<()> {
    conn.restore(MAIN_DB, source, None::<fn(Progress)>)?;
    conn.flush_prepared_statement_cache();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// Dossier temporaire propre à un test.
    fn temp_dir() -> PathBuf {
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!(
            "cockpit-test-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Base au schéma complet, comme au démarrage de l'app, avec un projet.
    fn cockpit_db(path: &Path, project: &str) -> Connection {
        let mut conn = crate::db::open(path).unwrap();
        crate::db::migrations::run(&mut conn, path.parent().unwrap()).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, type_id, created_at, updated_at)
             VALUES (?1, ?1, 'type-freelance', '2026-09-24T10:00:00Z', '2026-09-24T10:00:00Z')",
            [project],
        )
        .unwrap();
        conn
    }

    fn project_names(conn: &Connection) -> Vec<String> {
        let mut stmt = conn.prepare("SELECT name FROM projects ORDER BY name").unwrap();
        stmt.query_map([], |row| row.get(0)).unwrap().map(Result::unwrap).collect()
    }

    #[test]
    fn exporte_en_remplacant_un_fichier_existant() {
        let dir = temp_dir();
        let live = dir.join("cockpit.db");
        let conn = cockpit_db(&live, "Site vitrine");
        let target = dir.join("copie.db");
        fs::write(&target, b"ancien contenu").unwrap();

        export_to(&conn, &target, &live).unwrap();
        let copy = inspect(&target, &target).unwrap();
        assert_eq!(copy.projects, 1);
        assert!(!dir.join("copie.db.tmp").exists());

        // Écraser la base elle-même est refusé.
        assert!(export_to(&conn, &dir.join("COCKPIT.db"), &live).is_err());
    }

    #[test]
    fn refuse_ce_qui_n_est_pas_une_base_cockpit() {
        let dir = temp_dir();
        let text = dir.join("notes.db");
        fs::write(&text, "pas une base SQLite, juste du texte assez long pour ressembler à un fichier")
            .unwrap();
        assert_eq!(inspect(&text, &text).err().unwrap(), NOT_COCKPIT);

        let other = dir.join("autre.db");
        Connection::open(&other).unwrap().execute_batch("CREATE TABLE notes (id INTEGER)").unwrap();
        assert_eq!(inspect(&other, &other).err().unwrap(), NOT_COCKPIT);

        let newer = dir.join("future.db");
        let conn = cockpit_db(&newer, "Projet");
        conn.pragma_update(None, "user_version", 99).unwrap();
        drop(conn);
        assert!(inspect(&newer, &newer).err().unwrap().contains("plus récente"));
    }

    #[test]
    fn restaure_dans_la_base_ouverte() {
        let dir = temp_dir();
        let saved = dir.join("sauvegarde.db");
        let conn = cockpit_db(&saved, "Ancien projet");
        drop(conn);

        let live = dir.join("cockpit.db");
        let mut conn = cockpit_db(&live, "Nouveau projet");
        // Une requête préparée avant la restauration doit continuer de fonctionner.
        assert_eq!(project_names(&conn), ["Nouveau projet"]);

        let copy = dir.join("candidat.db");
        copy_candidate(&saved, &copy).unwrap();
        let candidate = inspect(&copy, &saved).unwrap();
        assert_eq!((candidate.projects, candidate.schema_version), (1, MIGRATIONS.len() as i64));
        assert_eq!(candidate.file_name, "sauvegarde.db");
        assert_eq!(candidate.stamp, None);

        restore_into(&mut conn, &copy).unwrap();
        assert_eq!(project_names(&conn), ["Ancien projet"]);
        let mode: String = conn.pragma_query_value(None, "journal_mode", |row| row.get(0)).unwrap();
        assert_eq!(mode, "wal");
        // L'index de recherche suit (il fait partie de la base restaurée).
        let indexed: i64 = conn
            .query_row("SELECT COUNT(*) FROM search_index WHERE title = 'Ancien projet'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(indexed, 1);

        remove_candidate(&copy);
        assert!(!copy.exists());
    }

    fn backup_names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .filter_map(|entry| entry.unwrap().file_name().into_string().ok())
            .filter(|name| name.starts_with(PREFIX))
            .collect();
        names.sort();
        names
    }

    #[test]
    fn une_seule_sauvegarde_automatique_par_jour() {
        let dir = temp_dir();
        let conn = cockpit_db(&dir.join("cockpit.db"), "Projet");
        daily(&conn, &dir).unwrap();
        daily(&conn, &dir).unwrap();
        let names = backup_names(&dir);
        assert_eq!(names.len(), 1, "{names:?}");
        assert!(names[0].ends_with("_auto.db"));
    }

    #[test]
    fn copie_la_base_avant_une_migration() {
        let dir = temp_dir();
        let mut conn = Connection::open(dir.join("cockpit.db")).unwrap();
        conn.execute_batch(MIGRATIONS[0]).unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();

        crate::db::migrations::run(&mut conn, &dir).unwrap();
        let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0)).unwrap();
        assert_eq!(version, MIGRATIONS.len() as i64);
        let names = backup_names(&dir);
        assert_eq!(names.len(), 1, "{names:?}");
        assert!(names[0].ends_with("_migration.db"));
    }

    #[test]
    fn retrouve_le_dossier_choisi() {
        let dir = temp_dir();
        let conn = cockpit_db(&dir.join("cockpit.db"), "Projet");
        assert_eq!(read_chosen_dir(&conn), None);

        let chosen = dir.join("OneDrive");
        write_chosen_dir(&conn, Some(&chosen)).unwrap();
        assert_eq!(read_chosen_dir(&conn), Some(chosen.clone()));

        let dirs = BackupDirs { default: dir.clone(), chosen: Some(chosen.clone()) };
        assert!(dirs.chosen_unavailable());
        assert_eq!(dirs.active(), dir.as_path());
        fs::create_dir_all(&chosen).unwrap();
        assert_eq!(dirs.active(), chosen.as_path());
        assert!(is_writable(&chosen));

        write_chosen_dir(&conn, None).unwrap();
        assert_eq!(read_chosen_dir(&conn), None);
        assert_eq!(file_name("2026-09-24_101500", Reason::Manual), "cockpit_2026-09-24_101500_manuelle.db");
    }
}
