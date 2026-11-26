//! Ouverture surveillée de la base : une base abîmée ne bloque plus Cockpit.
//!
//! Au démarrage, `quick_check` vérifie la base. Si elle est illisible ou abîmée, elle est mise de côté
//! avec son journal (`backups/abimee_<date>/`), et la plus récente sauvegarde intacte est remise à sa
//! place, après avoir été vérifiée sur une copie. Rien n'est jamais supprimé ; sans sauvegarde intacte,
//! on ne touche à rien et l'erreur remonte. L'interface le dit une fois (`db_recovery`).

use crate::backup;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Ce qui a été fait à l'ouverture, pour le dire à l'utilisateur.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovery {
    /// Nom du fichier de sauvegarde remis en place.
    pub restored_from: String,
    /// Son horodatage (AAAA-MM-JJ_HHMMSS), lu dans le nom.
    pub stamp: Option<String>,
    /// Dossier où la base abîmée est gardée.
    pub kept_in: String,
}

/// Le compte rendu, lu une seule fois par l'interface.
#[derive(Default)]
pub struct RecoveryNotice(pub Mutex<Option<Recovery>>);

/// Les fichiers d'une base : elle-même, son journal WAL et son index de journal.
fn companions(db: &Path) -> [PathBuf; 3] {
    let with = |suffix: &str| {
        let mut name = db.as_os_str().to_owned();
        name.push(suffix);
        PathBuf::from(name)
    };
    [db.to_path_buf(), with("-wal"), with("-shm")]
}

/// La base s'ouvre et `quick_check` répond « ok ». La connexion est fermée en sortant.
pub fn is_healthy(path: &Path) -> bool {
    match super::open(path) {
        Ok(conn) => conn
            .query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
            .map(|answer| answer == "ok")
            .unwrap_or(false),
        Err(_) => false,
    }
}

/// Le dossier des sauvegardes choisi dans Paramètres, si la base abîmée le laisse encore lire.
fn chosen_dir_if_readable(path: &Path) -> Option<PathBuf> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    backup::read_chosen_dir(&conn)
}

/// Horodatage local du moment (sans base ouverte : une base en mémoire le calcule).
fn now_stamp() -> String {
    Connection::open_in_memory()
        .ok()
        .and_then(|conn| backup::stamp(&conn).ok())
        .unwrap_or_else(|| "sans-date".into())
}

/// Ouvre la base ; si elle est abîmée, la remplace par la plus récente sauvegarde intacte (voir en tête).
/// `default_backups` : le dossier des sauvegardes dans AppData (où la base abîmée est mise de côté).
pub fn open_checked(db_path: &Path, default_backups: &Path) -> Result<(Connection, Option<Recovery>), Box<dyn Error>> {
    if !db_path.exists() || is_healthy(db_path) {
        return Ok((super::open(db_path)?, None));
    }

    // Les sauvegardes, la plus récente d'abord : celles d'AppData et celles du dossier choisi.
    let mut dirs = vec![default_backups.to_path_buf()];
    if let Some(chosen) = chosen_dir_if_readable(db_path).filter(|dir| dir.is_dir()) {
        dirs.push(chosen);
    }
    let mut candidates: Vec<PathBuf> = dirs.iter().flat_map(|dir| backup::newest_first(dir)).collect();
    candidates.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

    let copy = db_path.with_file_name("cockpit-recuperation.db");
    let chosen = candidates.into_iter().find(|candidate| {
        backup::copy_candidate(candidate, &copy).is_ok() && backup::inspect(&copy, candidate).is_ok()
    });
    let Some(source) = chosen else {
        backup::remove_candidate(&copy);
        return Err("La base de Cockpit est abîmée et aucune sauvegarde intacte n'a été trouvée : rien n'a été modifié.".into());
    };

    // La base abîmée part de côté, avec son journal : rien n'est perdu.
    let kept_in = default_backups.join(format!("abimee_{}", now_stamp()));
    fs::create_dir_all(&kept_in)?;
    for file in companions(db_path) {
        if file.exists() {
            fs::rename(&file, kept_in.join(file.file_name().unwrap_or_default()))?;
        }
    }
    // La copie vérifiée devient la base (elle n'a pas de journal : une sauvegarde est faite par VACUUM INTO).
    for (from, to) in companions(&copy).iter().zip(companions(db_path).iter()) {
        if from.exists() {
            fs::rename(from, to)?;
        }
    }

    let restored_from = source.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    let stamp = restored_from
        .strip_prefix("cockpit_")
        .and_then(|rest| rest.get(..17))
        .filter(|s| s.as_bytes().get(10) == Some(&b'_'))
        .map(String::from);
    let recovery = Recovery { restored_from, stamp, kept_in: kept_in.to_string_lossy().into_owned() };
    Ok((super::open(db_path)?, Some(recovery)))
}

/// En quittant : le journal est versé dans la base, qui tient alors en un seul fichier. Une base laissée
/// sans journal en suspens se copie et se relit sans surprise.
pub fn checkpoint(conn: &Connection) {
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn temp_dir() -> PathBuf {
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let dir = std::env::temp_dir().join(format!("cockpit-recup-{}-{}", std::process::id(), COUNTER.fetch_add(1, Ordering::SeqCst)));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Une base au schéma complet, avec un projet.
    fn cockpit_db(path: &Path, project: &str) {
        let mut conn = crate::db::open(path).unwrap();
        crate::db::migrations::run(&mut conn, path.parent().unwrap()).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, type_id, created_at, updated_at)
             VALUES (?1, ?1, 'type-freelance', '2026-09-24T10:00:00Z', '2026-09-24T10:00:00Z')",
            [project],
        )
        .unwrap();
        checkpoint(&conn);
    }

    fn projects(conn: &Connection) -> Vec<String> {
        let mut stmt = conn.prepare("SELECT name FROM projects ORDER BY name").unwrap();
        stmt.query_map([], |row| row.get(0)).unwrap().map(Result::unwrap).collect()
    }

    /// Une sauvegarde de Cockpit, nommée comme celles de l'app.
    fn backup_of(dir: &Path, name: &str, project: &str) {
        let work = temp_dir();
        cockpit_db(&work.join("b.db"), project);
        let conn = Connection::open(work.join("b.db")).unwrap();
        conn.execute("VACUUM INTO ?1", [dir.join(name).to_string_lossy()]).unwrap();
    }

    /// Abîme l'en-tête du fichier : SQLite ne le reconnaît plus.
    fn damage(path: &Path) {
        let mut bytes = fs::read(path).unwrap();
        bytes[..64].copy_from_slice(&[0x55; 64]);
        fs::write(path, bytes).unwrap();
    }

    #[test]
    fn une_base_saine_s_ouvre_sans_rien_toucher() {
        let dir = temp_dir();
        let backups = dir.join("backups");
        fs::create_dir_all(&backups).unwrap();
        let live = dir.join("cockpit.db");
        cockpit_db(&live, "Site vitrine");

        let (conn, recovery) = open_checked(&live, &backups).unwrap();
        assert!(recovery.is_none());
        assert_eq!(projects(&conn), ["Site vitrine"]);
    }

    #[test]
    fn une_base_abimee_reprend_la_derniere_sauvegarde_intacte() {
        let dir = temp_dir();
        let backups = dir.join("backups");
        fs::create_dir_all(&backups).unwrap();
        backup_of(&backups, "cockpit_2026-11-24_220923_auto.db", "Avant-hier");
        backup_of(&backups, "cockpit_2026-11-25_212740_auto.db", "Hier");
        // La plus récente est elle-même abîmée : elle est sautée.
        fs::write(backups.join("cockpit_2026-11-26_080000_auto.db"), b"pas une base").unwrap();

        let live = dir.join("cockpit.db");
        cockpit_db(&live, "Aujourd'hui");
        damage(&live);
        assert!(!is_healthy(&live));

        let (conn, recovery) = open_checked(&live, &backups).unwrap();
        let recovery = recovery.expect("la base aurait dû être reprise");
        assert_eq!(recovery.restored_from, "cockpit_2026-11-25_212740_auto.db");
        assert_eq!(recovery.stamp.as_deref(), Some("2026-11-25_212740"));
        assert_eq!(projects(&conn), ["Hier"]);
        // La base abîmée est gardée, rien n'est perdu ; la copie de travail ne traîne pas.
        assert!(Path::new(&recovery.kept_in).join("cockpit.db").exists());
        assert!(!dir.join("cockpit-recuperation.db").exists());
    }

    #[test]
    fn sans_sauvegarde_intacte_rien_n_est_touche() {
        let dir = temp_dir();
        let backups = dir.join("backups");
        fs::create_dir_all(&backups).unwrap();
        let live = dir.join("cockpit.db");
        cockpit_db(&live, "Projet");
        damage(&live);
        let before = fs::read(&live).unwrap();

        assert!(open_checked(&live, &backups).is_err());
        assert_eq!(fs::read(&live).unwrap(), before);
        assert!(fs::read_dir(&backups).unwrap().next().is_none());
    }

    #[test]
    fn en_quittant_le_journal_est_verse_dans_la_base() {
        let dir = temp_dir();
        let live = dir.join("cockpit.db");
        cockpit_db(&live, "Projet");
        let conn = crate::db::open(&live).unwrap();
        conn.execute("UPDATE projects SET name = 'Renommé'", []).unwrap();
        checkpoint(&conn);
        let wal = dir.join("cockpit.db-wal");
        assert!(!wal.exists() || fs::metadata(&wal).unwrap().len() == 0);
    }
}
