//! Coquille native de Cockpit, volontairement fine : toute la logique métier est côté TypeScript.
//! Ici : ouverture de la base, migrations, sauvegardes, exposition du pont SQLite et envoi des notifications.

mod backup;
mod data;
mod db;
mod notify;

use backup::BackupDirs;
use std::time::Duration;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // En développement, une base séparée : les essais ne touchent jamais les vraies données.
            let (db_file, backup_folder) = if cfg!(debug_assertions) {
                ("cockpit-dev.db", "backups-dev")
            } else {
                ("cockpit.db", "backups")
            };
            let data_dir = app.path().app_data_dir()?;
            let default_backup_dir = data_dir.join(backup_folder);
            std::fs::create_dir_all(&default_backup_dir)?;
            let db_path = data_dir.join(db_file);

            let mut conn = db::open(&db_path)?;
            // Le dossier choisi dans Paramètres (OneDrive…), s'il est joignable ; sinon celui d'AppData.
            let dirs = BackupDirs { default: default_backup_dir, chosen: backup::read_chosen_dir(&conn) };
            db::migrations::run(&mut conn, dirs.active())?;
            if let Err(err) = backup::daily(&conn, dirs.active()) {
                // Une sauvegarde ratée ne doit pas empêcher d'utiliser l'app.
                eprintln!("Sauvegarde automatique impossible : {err}");
            }
            app.manage(db::Database::new(conn, db_path, dirs));

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
            data::backup_export,
            data::backup_choose_dir,
            data::backup_reset_dir,
            data::restore_pick,
            data::restore_confirm,
            data::restore_cancel,
            data::open_data_dir,
            data::open_backup_dir,
            notify::notify,
        ])
        .run(tauri::generate_context!())
        .expect("impossible de lancer Cockpit");
}
