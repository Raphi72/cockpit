//! Coquille native de Cockpit, volontairement fine : toute la logique métier est côté TypeScript.
//! Ici : ouverture de la base, migrations, sauvegardes, exposition du pont SQLite, exports,
//! envoi des notifications, connexion Google et synchronisation ; sur le PC, en plus, mémoire de la
//! fenêtre, présence dans la zone de notification et mini-fenêtre « En ce moment ». Le même code fait
//! l'appli Android (V2, étape 10) : ce qui n'existe que sur le PC est marqué `#[cfg(desktop)]`.

// Sur le téléphone, une partie du code du PC (exports, restauration, connexion Google) ne sert pas.
#![cfg_attr(mobile, allow(dead_code))]

mod backup;
#[cfg(desktop)]
mod data;
mod db;
mod google;
mod link;
#[cfg(desktop)]
mod notion;
mod notify;
#[cfg(desktop)]
mod now;
#[cfg(desktop)]
mod presence;
mod sync;
mod update;
mod vault;

use backup::BackupDirs;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = desktop::plugins(builder);
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    let builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(google::GoogleSession::default())
        .setup(|app| {
            open_database(app)?;
            #[cfg(desktop)]
            desktop::setup(app)?;
            Ok(())
        });

    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db::commands::db_query,
        db::commands::db_execute,
        db::commands::db_batch,
        db::commands::app_info,
        db::commands::db_recovery,
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
        now::now_toggle,
        now::now_changed,
        google::google_status,
        google::google_set_client,
        google::google_connect,
        google::google_disconnect,
        google::google_forget,
        google::google_calendars,
        google::google_events,
        google::google_open_link,
        google::google_event_insert,
        google::google_event_patch,
        google::google_event_delete,
        google::google_series_retime,
        sync::sync_has_key,
        sync::sync_create_key,
        sync::sync_join,
        sync::sync_show_code,
        sync::sync_forget_key,
        sync::sync_list,
        sync::sync_download,
        sync::sync_upload,
        link::link_code,
        update::desktop::update_pending,
        update::desktop::update_check,
        update::desktop::update_install,
    ]);
    // Le téléphone : la base, les notifications, Google (reçu du PC) et la synchronisation.
    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        db::commands::db_query,
        db::commands::db_execute,
        db::commands::db_batch,
        db::commands::app_info,
        db::commands::db_recovery,
        notify::notify,
        google::google_status,
        google::google_disconnect,
        google::google_calendars,
        google::google_events,
        google::google_open_link,
        google::google_event_insert,
        google::google_event_patch,
        google::google_event_delete,
        google::google_series_retime,
        sync::sync_has_key,
        sync::sync_show_code,
        sync::sync_forget_key,
        sync::sync_list,
        sync::sync_download,
        sync::sync_upload,
        link::link_apply,
        link::link_forget,
        update::mobile::update_check,
        update::mobile::update_download,
    ]);

    builder
        .build(tauri::generate_context!())
        .expect("impossible de lancer Cockpit")
        .run(|app, event| {
            // En quittant (« Quitter » de l'icône) : le journal est versé dans la base, qui tient alors
            // en un seul fichier, sans rien en suspens.
            if let tauri::RunEvent::Exit = event {
                if let Some(database) = app.try_state::<db::Database>() {
                    if let Ok(conn) = database.lock() {
                        db::recovery::checkpoint(&conn);
                    }
                }
            }
        });
}

/// Ouvre la base (vérifiée, migrée, sauvegardée chaque jour) et, sur le téléphone, le coffre des secrets.
fn open_database(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
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
    // Sur le téléphone, les secrets vont dans un dossier que seule l'appli peut lire.
    #[cfg(mobile)]
    vault::init(data_dir.join("coffre"))?;

    // Une base abîmée est mise de côté et remplacée par la dernière sauvegarde intacte
    // (l'interface le dit au lancement) ; sans sauvegarde intacte, rien n'est touché.
    let (mut conn, recovery) = db::recovery::open_checked(&db_path, &default_backup_dir)?;
    app.manage(db::recovery::RecoveryNotice(std::sync::Mutex::new(recovery)));
    // Le dossier choisi dans Paramètres (OneDrive…), s'il est joignable ; sinon celui d'AppData.
    let dirs = BackupDirs { default: default_backup_dir, chosen: backup::read_chosen_dir(&conn) };
    db::migrations::run(&mut conn, dirs.active())?;
    if let Err(err) = backup::daily(&conn, dirs.active()) {
        // Une sauvegarde ratée ne doit pas empêcher d'utiliser l'app.
        eprintln!("Sauvegarde automatique impossible : {err}");
    }
    app.manage(db::Database::new(conn, db_path, dirs));
    Ok(())
}

/// Ce que le PC a en plus : instance unique, mémoire de la fenêtre, lancement avec Windows, zone de notification.
#[cfg(desktop)]
mod desktop {
    use super::presence::{self, Presence};
    use tauri::{App, Builder, Wry};
    use tauri_plugin_window_state::StateFlags;

    pub fn plugins(mut builder: Builder<Wry>) -> Builder<Wry> {
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
            // La fenêtre se rouvre à la même taille et au même endroit (agrandie si elle l'était).
            // Sauf sa visibilité : elle reste cachée jusqu'au premier rendu de l'interface.
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_state_flags(StateFlags::all() - StateFlags::VISIBLE)
                    .build(),
            )
            // Lancé par Windows, Cockpit reçoit `--autostart` et démarre caché.
            .plugin(tauri_plugin_autostart::Builder::new().app_name("Cockpit").arg(presence::AUTOSTART_ARG).build())
            // Mises à jour par GitHub (update.rs).
            .plugin(tauri_plugin_updater::Builder::new().build())
            .manage(super::update::UpdateState::default())
            .manage(Presence::from_args())
            .on_window_event(|window, event| {
                presence::on_window_event(window, event);
            })
    }

    pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
        presence::create_tray(app)?;
        presence::start_heartbeat(app.handle());
        // La fenêtre est affichée par l'interface après son premier rendu (`window_ready`).
        // Filet de sécurité : si ce rendu échoue, on l'affiche quand même.
        presence::reveal_after_timeout(app.handle());
        // Une nouvelle version publiée sur GitHub se télécharge en arrière-plan.
        super::update::start(app.handle());
        Ok(())
    }
}
