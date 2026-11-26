//! Coquille native de Cockpit, volontairement fine : toute la logique métier est côté TypeScript.
//! Ici : ouverture de la base, migrations, sauvegardes, exposition du pont SQLite, exports,
//! envoi des notifications, mémoire de la fenêtre, présence dans la zone de notification et capture rapide.

mod backup;
mod capture;
mod data;
mod notion;
mod db;
mod notify;
mod presence;

use backup::BackupDirs;
use presence::Presence;
use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

pub fn run() {
    let mut builder = tauri::Builder::default();
    // Une seule instance, et ce plugin d'abord : relancer Cockpit alors qu'il tourne déjà (dans la zone
    // de notification) ramène sa fenêtre devant. Pas en développement : l'app de dev et l'app installée
    // partagent le même identifiant et doivent pouvoir tourner ensemble.
    if !cfg!(debug_assertions) {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if !args.iter().any(|arg| arg == presence::AUTOSTART_ARG) {
                presence::show_main(app);
            }
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        // La fenêtre se rouvre à la même taille et au même endroit (agrandie si elle l'était).
        // Sauf sa visibilité : elle reste cachée jusqu'au premier rendu de l'interface.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() - StateFlags::VISIBLE)
                // La petite fenêtre de capture se place toute seule à chaque ouverture.
                .with_denylist(&[capture::WINDOW])
                .build(),
        )
        // Raccourci global de la capture rapide.
        .plugin(capture::plugin())
        // Lancé par Windows, Cockpit reçoit `--autostart` et démarre caché.
        .plugin(tauri_plugin_autostart::Builder::new().app_name("Cockpit").arg(presence::AUTOSTART_ARG).build())
        .manage(Presence::from_args())
        .on_window_event(|window, event| {
            presence::on_window_event(window, event);
            capture::on_window_event(window, event);
        })
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

            presence::create_tray(app)?;
            presence::start_heartbeat(app.handle());
            capture::init(app.handle());
            // La fenêtre est affichée par l'interface après son premier rendu (`window_ready`).
            // Filet de sécurité : si ce rendu échoue, on l'affiche quand même.
            presence::reveal_after_timeout(app.handle());
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
            data::export_save,
            notion::notion_import_pick,
            notify::notify,
            presence::window_ready,
            presence::started_hidden,
            presence::quit,
            presence::autostart_get,
            presence::autostart_set,
            capture::capture_done,
            capture::capture_shortcut_get,
            capture::capture_shortcut_set,
        ])
        .run(tauri::generate_context!())
        .expect("impossible de lancer Cockpit");
}
