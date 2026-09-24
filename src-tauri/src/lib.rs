//! Coquille native de Cockpit, volontairement fine : toute la logique métier est côté TypeScript.
//! Ici : ouverture de la base, migrations, sauvegardes et exposition du pont SQLite.

mod backup;
mod db;

use std::time::Duration;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // En développement, une base séparée : les essais ne touchent jamais les vraies données.
            let (db_file, backup_folder) = if cfg!(debug_assertions) {
                ("cockpit-dev.db", "backups-dev")
            } else {
                ("cockpit.db", "backups")
            };
            let data_dir = app.path().app_data_dir()?;
            let backup_dir = data_dir.join(backup_folder);
            std::fs::create_dir_all(&backup_dir)?;
            let db_path = data_dir.join(db_file);

            let mut conn = db::open(&db_path)?;
            db::migrations::run(&mut conn, &backup_dir)?;
            if let Err(err) = backup::daily(&conn, &backup_dir) {
                // Une sauvegarde ratée ne doit pas empêcher d'utiliser l'app.
                eprintln!("Sauvegarde automatique impossible : {err}");
            }
            app.manage(db::Database::new(conn, db_path, backup_dir));

            // La fenêtre est affichée par l'interface après son premier rendu.
            // Filet de sécurité : si ce rendu échoue, on l'affiche quand même.
            if let Some(window) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(3));
                    let _ = window.show();
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::commands::db_query,
            db::commands::db_execute,
            db::commands::db_batch,
            db::commands::app_info,
        ])
        .run(tauri::generate_context!())
        .expect("impossible de lancer Cockpit");
}
