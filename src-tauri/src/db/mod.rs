pub mod commands;
mod convert;
pub mod migrations;

use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

/// Connexion unique partagée par toutes les commandes : les transactions ne peuvent pas
/// s'éparpiller sur plusieurs connexions, contrairement à un pool.
pub struct Database {
    conn: Mutex<Connection>,
    pub path: PathBuf,
    pub backup_dir: PathBuf,
}

impl Database {
    pub fn new(conn: Connection, path: PathBuf, backup_dir: PathBuf) -> Self {
        Self { conn: Mutex::new(conn), path, backup_dir }
    }

    pub fn lock(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|_| "Base de données indisponible".to_string())
    }
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", true)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.set_prepared_statement_cache_capacity(64);
    Ok(conn)
}
