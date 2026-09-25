//! Migrations versionnées par `PRAGMA user_version`, appliquées au démarrage.

use crate::backup::{self, Reason};
use rusqlite::Connection;
use std::error::Error;
use std::path::Path;

/// Une entrée par version du schéma, dans l'ordre. Ne jamais modifier une migration publiée :
/// en ajouter une nouvelle.
pub const MIGRATIONS: &[&str] = &[
    include_str!("../../migrations/0001_init.sql"),
    include_str!("../../migrations/0002_search.sql"),
    include_str!("../../migrations/0003_ideas.sql"),
];

pub fn run(conn: &mut Connection, backup_dir: &Path) -> Result<(), Box<dyn Error>> {
    let current = conn.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))? as usize;

    if current > MIGRATIONS.len() {
        return Err(format!(
            "Cette base a été créée par une version plus récente de Cockpit (schéma {current})."
        )
        .into());
    }
    if current == MIGRATIONS.len() {
        return Ok(());
    }

    // Une base existante est toujours sauvegardée avant d'être modifiée.
    if current > 0 {
        backup::create(conn, backup_dir, Reason::PreMigration)?;
        backup::prune(backup_dir, Reason::PreMigration)?;
    }

    for (index, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (index + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}
