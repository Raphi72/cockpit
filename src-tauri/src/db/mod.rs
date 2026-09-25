pub mod commands;
mod convert;
pub mod migrations;

use crate::backup::BackupDirs;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

/// Connexion unique partagée par toutes les commandes : les transactions ne peuvent pas
/// s'éparpiller sur plusieurs connexions, contrairement à un pool.
pub struct Database {
    conn: Mutex<Connection>,
    pub path: PathBuf,
    backups: Mutex<BackupDirs>,
    /// Copie vérifiée de la sauvegarde choisie, en attente de confirmation (Paramètres › Données).
    pending_restore: Mutex<Option<PathBuf>>,
}

impl Database {
    pub fn new(conn: Connection, path: PathBuf, backups: BackupDirs) -> Self {
        Self {
            conn: Mutex::new(conn),
            path,
            backups: Mutex::new(backups),
            pending_restore: Mutex::new(None),
        }
    }

    pub fn lock(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|_| "Base de données indisponible".to_string())
    }

    /// Dossiers des sauvegardes (copie : aucun verrou n'est gardé pendant une opération).
    pub fn backup_dirs(&self) -> Result<BackupDirs, String> {
        self.backups.lock().map(|dirs| dirs.clone()).map_err(|_| "Réglages indisponibles".to_string())
    }

    pub fn set_chosen_backup_dir(&self, chosen: Option<PathBuf>) -> Result<(), String> {
        let mut dirs = self.backups.lock().map_err(|_| "Réglages indisponibles".to_string())?;
        dirs.chosen = chosen;
        Ok(())
    }

    pub fn pending_restore(&self) -> Result<MutexGuard<'_, Option<PathBuf>>, String> {
        self.pending_restore.lock().map_err(|_| "Restauration indisponible".to_string())
    }

    /// Fichier temporaire, à côté de la base, où la sauvegarde choisie est copiée avant d'être vérifiée.
    pub fn restore_candidate_path(&self) -> PathBuf {
        let stem = self.path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        self.path.with_file_name(format!("{stem}-restauration.db"))
    }
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    configure(&conn)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.set_prepared_statement_cache_capacity(64);
    Ok(conn)
}

/// Réglages de la connexion, à réappliquer après une restauration.
pub fn configure(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", true)?;
    Ok(())
}
