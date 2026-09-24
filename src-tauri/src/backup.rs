//! Sauvegardes locales : copie cohérente de la base (même ouverte) via `VACUUM INTO`.
//! Nom des fichiers : cockpit_<AAAA-MM-JJ_HHMMSS>_<raison>.db — l'ordre alphabétique est chronologique.

use rusqlite::Connection;
use std::error::Error;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const PREFIX: &str = "cockpit_";

#[derive(Clone, Copy)]
pub enum Reason {
    Auto,
    PreMigration,
}

impl Reason {
    fn tag(self) -> &'static str {
        match self {
            Reason::Auto => "auto",
            Reason::PreMigration => "migration",
        }
    }

    /// Nombre de sauvegardes conservées pour cette raison.
    fn keep(self) -> usize {
        match self {
            Reason::Auto => 14,
            Reason::PreMigration => 5,
        }
    }
}

pub fn create(conn: &Connection, dir: &Path, reason: Reason) -> rusqlite::Result<PathBuf> {
    let stamp: String =
        conn.query_row("SELECT strftime('%Y-%m-%d_%H%M%S', 'now', 'localtime')", [], |row| row.get(0))?;
    let path = dir.join(format!("{PREFIX}{stamp}_{}.db", reason.tag()));
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
    let reasons = [Reason::Auto, Reason::PreMigration];
    reasons
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
