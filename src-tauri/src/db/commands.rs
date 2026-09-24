//! Pont SQLite exposé à l'interface. Les commandes sont `async` pour s'exécuter hors du
//! thread principal : une requête ne bloque jamais la fenêtre.

use super::{convert, Database};
use crate::backup;
use rusqlite::{params_from_iter, types::Value as SqlValue, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::State;

type Rows = Vec<Map<String, Value>>;

#[derive(Deserialize)]
pub struct Statement {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecResult {
    rows_affected: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    db_path: String,
    backup_dir: String,
    schema_version: i64,
    last_backup: Option<String>,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn bind(params: &[Value]) -> Result<Vec<SqlValue>, String> {
    params.iter().map(convert::to_sql).collect()
}

fn run_query(conn: &Connection, sql: &str, params: &[Value]) -> Result<Rows, String> {
    let mut stmt = conn.prepare_cached(sql).map_err(err)?;
    let names: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
    let values = bind(params)?;
    let mut rows = stmt.query(params_from_iter(values.iter())).map_err(err)?;

    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(err)? {
        let mut object = Map::with_capacity(names.len());
        for (i, name) in names.iter().enumerate() {
            object.insert(name.clone(), convert::to_json(row.get_ref(i).map_err(err)?));
        }
        out.push(object);
    }
    Ok(out)
}

#[tauri::command]
pub async fn db_query(db: State<'_, Database>, sql: String, params: Vec<Value>) -> Result<Rows, String> {
    let conn = db.lock()?;
    run_query(&conn, &sql, &params)
}

#[tauri::command]
pub async fn db_execute(
    db: State<'_, Database>,
    sql: String,
    params: Vec<Value>,
) -> Result<ExecResult, String> {
    let conn = db.lock()?;
    let values = bind(&params)?;
    let rows_affected = conn
        .prepare_cached(&sql)
        .and_then(|mut stmt| stmt.execute(params_from_iter(values.iter())))
        .map_err(err)?;
    Ok(ExecResult { rows_affected })
}

/// Exécute toutes les instructions dans une seule transaction : tout ou rien.
#[tauri::command]
pub async fn db_batch(db: State<'_, Database>, statements: Vec<Statement>) -> Result<(), String> {
    let mut conn = db.lock()?;
    let tx = conn.transaction().map_err(err)?;
    for statement in &statements {
        let values = bind(&statement.params)?;
        tx.prepare_cached(&statement.sql)
            .and_then(|mut stmt| stmt.execute(params_from_iter(values.iter())))
            .map_err(|e| format!("{e} (dans : {})", statement.sql.trim()))?;
    }
    // En cas d'erreur plus haut, `tx` est abandonnée et SQLite annule tout.
    tx.commit().map_err(err)
}

#[tauri::command]
pub async fn app_info(db: State<'_, Database>) -> Result<AppInfo, String> {
    let schema_version = {
        let conn = db.lock()?;
        conn.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
            .map_err(err)?
    };
    Ok(AppInfo {
        db_path: db.path.display().to_string(),
        backup_dir: db.backup_dir.display().to_string(),
        schema_version,
        last_backup: backup::latest_stamp(&db.backup_dir),
    })
}
