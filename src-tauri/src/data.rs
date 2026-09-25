//! Paramètres › Données : sauvegarder, restaurer, choisir le dossier des sauvegardes, ouvrir les dossiers.
//! Les fenêtres de choix de fichier s'ouvrent ici, côté natif : l'interface ne transmet jamais de chemin,
//! elle ne peut donc ni lire ni écrire un fichier arbitraire.

use crate::backup::{self, Candidate, Reason};
use crate::db::{self, migrations, Database};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const DB_FILTER: (&str, &[&str]) = ("Base Cockpit", &["db"]);

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// « Sauvegarder maintenant… » : une copie complète là où l'on veut. Par défaut, dans le dossier
/// des sauvegardes, sous un nom daté : Entrée suffit. Renvoie le nom du fichier, ou rien si annulé.
#[tauri::command]
pub async fn backup_export(
    app: AppHandle,
    window: WebviewWindow,
    db: State<'_, Database>,
) -> Result<Option<String>, String> {
    let dirs = db.backup_dirs()?;
    let stamp = backup::stamp(&*db.lock()?).map_err(err)?;
    let picked = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Sauvegarder mes données")
        .set_directory(dirs.active())
        .set_file_name(backup::file_name(&stamp, Reason::Manual))
        .add_filter(DB_FILTER.0, DB_FILTER.1)
        .blocking_save_file();
    let Some(picked) = picked else { return Ok(None) };
    let target = picked.into_path().map_err(err)?;

    backup::export_to(&*db.lock()?, &target, &db.path)?;
    Ok(target.file_name().map(|name| name.to_string_lossy().into_owned()))
}

/// Choix du dossier des sauvegardes (un dossier OneDrive en garde une copie hors de l'ordinateur).
/// Une première sauvegarde y est faite tout de suite. Renvoie vrai si le dossier a changé.
#[tauri::command]
pub async fn backup_choose_dir(app: AppHandle, window: WebviewWindow, db: State<'_, Database>) -> Result<bool, String> {
    let dirs = db.backup_dirs()?;
    let picked = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Dossier des sauvegardes")
        .set_directory(dirs.active())
        .blocking_pick_folder();
    let Some(picked) = picked else { return Ok(false) };
    let dir = picked.into_path().map_err(err)?;
    if !backup::is_writable(&dir) {
        return Err("Cockpit ne peut pas écrire dans ce dossier : choisis-en un autre.".into());
    }

    let conn = db.lock()?;
    let chosen = if dir == dirs.default { None } else { Some(dir.clone()) };
    backup::write_chosen_dir(&conn, chosen.as_deref()).map_err(err)?;
    db.set_chosen_backup_dir(chosen)?;
    backup::daily(&conn, &dir).map_err(err)?;
    Ok(true)
}

/// Revenir au dossier par défaut (dans AppData). Les sauvegardes déjà faites ne bougent pas.
#[tauri::command]
pub async fn backup_reset_dir(db: State<'_, Database>) -> Result<(), String> {
    let conn = db.lock()?;
    backup::write_chosen_dir(&conn, None).map_err(err)?;
    db.set_chosen_backup_dir(None)?;
    let dirs = db.backup_dirs()?;
    backup::daily(&conn, dirs.active()).map_err(err)
}

/// Étape 1 de « Restaurer » : choisir un fichier, le copier à côté de la base et le vérifier.
/// Rien n'est remplacé avant `restore_confirm`. Renvoie ce que contient la sauvegarde, ou rien si annulé.
#[tauri::command]
pub async fn restore_pick(
    app: AppHandle,
    window: WebviewWindow,
    db: State<'_, Database>,
) -> Result<Option<Candidate>, String> {
    let dirs = db.backup_dirs()?;
    let picked = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Restaurer une sauvegarde")
        .set_directory(dirs.active())
        .add_filter(DB_FILTER.0, DB_FILTER.1)
        .blocking_pick_file();
    let Some(picked) = picked else { return Ok(None) };
    let source = picked.into_path().map_err(err)?;
    if backup::same_file(&source, &db.path) {
        return Err("C'est la base actuelle : choisis une sauvegarde.".into());
    }

    let copy = db.restore_candidate_path();
    let mut pending = db.pending_restore()?;
    *pending = None;
    backup::copy_candidate(&source, &copy).map_err(|e| format!("Lecture impossible : {e}"))?;
    match backup::inspect(&copy, &source) {
        Ok(candidate) => {
            *pending = Some(copy);
            Ok(Some(candidate))
        }
        Err(message) => {
            backup::remove_candidate(&copy);
            Err(message)
        }
    }
}

/// Étape 2 : les données actuelles sont mises de côté (sauvegarde « restauration »), puis remplacées.
/// Une sauvegarde plus ancienne est mise au schéma actuel. L'interface se recharge ensuite.
#[tauri::command]
pub async fn restore_confirm(db: State<'_, Database>) -> Result<(), String> {
    let Some(copy) = db.pending_restore()?.take() else {
        return Err("Aucune sauvegarde choisie.".into());
    };
    let dirs = db.backup_dirs()?;
    let mut conn = db.lock()?;

    let result = (|| -> Result<(), String> {
        backup::create(&conn, dirs.active(), Reason::PreRestore)
            .map_err(|e| format!("Copie de sécurité impossible, rien n'a été remplacé : {e}"))?;
        backup::prune(dirs.active(), Reason::PreRestore).map_err(err)?;
        backup::restore_into(&mut conn, &copy).map_err(|e| format!("Restauration impossible : {e}"))?;
        db::configure(&conn).map_err(err)?;
        migrations::run(&mut conn, dirs.active()).map_err(err)?;
        Ok(())
    })();
    backup::remove_candidate(&copy);
    result
}

/// Abandon après l'étape 1 : la copie vérifiée est effacée.
#[tauri::command]
pub async fn restore_cancel(db: State<'_, Database>) -> Result<(), String> {
    if let Some(copy) = db.pending_restore()?.take() {
        backup::remove_candidate(&copy);
    }
    Ok(())
}

/// Ouvre l'Explorateur sur la base (cockpit.db), dans le dossier des données.
#[tauri::command]
pub async fn open_data_dir(app: AppHandle, db: State<'_, Database>) -> Result<(), String> {
    app.opener().reveal_item_in_dir(&db.path).map_err(err)
}

#[tauri::command]
pub async fn open_backup_dir(app: AppHandle, db: State<'_, Database>) -> Result<(), String> {
    let dirs = db.backup_dirs()?;
    app.opener()
        .open_path(dirs.active().to_string_lossy(), None::<&str>)
        .map_err(err)
}
