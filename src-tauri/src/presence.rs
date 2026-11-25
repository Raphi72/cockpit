//! « Toujours là » : Cockpit reste dans la zone de notification quand on ferme sa fenêtre, se lance
//! avec Windows et ne s'ouvre qu'une fois. Tant qu'il tourne, les notifications continuent d'arriver.
//!
//! Les règles (quoi notifier, quand) restent côté TypeScript : ici, seulement la fenêtre, l'icône,
//! l'inscription au démarrage de Windows et le battement d'une minute qui réveille l'interface.

use crate::backup;
use crate::capture;
use crate::db::{self, Database};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, State, Window, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

pub const MAIN_WINDOW: &str = "main";

/// Argument ajouté à la commande inscrite au démarrage de Windows : Cockpit démarre alors caché.
pub const AUTOSTART_ARG: &str = "--autostart";

/// Réglage (table `settings`, valeur JSON) : fermer la fenêtre garde Cockpit dans la zone de
/// notification. Vrai par défaut. Même clé que `KEEP_IN_TRAY` dans src/domains/presence/model.ts.
const KEEP_IN_TRAY_SETTING: &str = "presence.keepInTray";

/// Chaque minute pleine : l'interface vérifie les notifications (ses propres minuteries ralentissent
/// quand la fenêtre est cachée).
const MINUTE_EVENT: &str = "cockpit:minute";

/// La fenêtre vient d'être cachée dans la zone de notification (l'interface l'explique la première fois).
const HIDDEN_EVENT: &str = "cockpit:hidden";

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Comment Cockpit a été lancé, et si sa fenêtre a déjà été montrée.
pub struct Presence {
    /// Lancé par Windows à l'ouverture de session : la fenêtre reste cachée jusqu'à ce qu'on l'ouvre.
    start_hidden: bool,
    revealed: AtomicBool,
}

impl Presence {
    pub fn from_args() -> Self {
        Self {
            start_hidden: std::env::args().any(|arg| arg == AUTOSTART_ARG),
            revealed: AtomicBool::new(false),
        }
    }

    pub fn start_hidden(&self) -> bool {
        self.start_hidden
    }

    /// Premier affichage de la fenêtre, une seule fois : jamais si Cockpit a démarré caché, ni après
    /// un rechargement de l'interface (la fenêtre peut alors être dans la zone de notification).
    ///
    /// La fenêtre est créée sans le focus (tauri.conf.json) : cachée, elle ne doit pas prendre le
    /// clavier à l'application en cours. C'est ici qu'elle le reçoit, en s'affichant.
    fn reveal(&self, app: &AppHandle) {
        if self.start_hidden || self.revealed.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// Ramène la fenêtre devant : clic sur l'icône, « Ouvrir Cockpit », ou Cockpit relancé alors qu'il tourne déjà.
pub fn show_main(app: &AppHandle) {
    app.state::<Presence>().revealed.store(true, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Filet de sécurité : si l'interface n'a toujours rien rendu après 3 secondes, la fenêtre s'affiche
/// quand même (l'écran d'erreur est alors visible).
pub fn reveal_after_timeout(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        app.state::<Presence>().reveal(&app);
    });
}

/// L'interface a fait son premier rendu : la fenêtre, créée invisible, peut s'afficher.
#[tauri::command]
pub fn window_ready(app: AppHandle, presence: State<'_, Presence>) {
    presence.reveal(&app);
}

/// Vrai si Cockpit a été lancé caché, au démarrage de Windows : les rappels du jour partent alors
/// comme une tournée du matin (le tableau de bord n'est pas à l'écran).
#[tauri::command]
pub fn started_hidden(presence: State<'_, Presence>) -> bool {
    presence.start_hidden()
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

// ─── Zone de notification ───────────────────────────────────────────────────

/// L'icône près de l'horloge : un clic rouvre la fenêtre, le clic droit propose la capture rapide et « Quitter ».
pub fn create_tray(app: &App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Ouvrir Cockpit", true, None::<&str>)?;
    let note = MenuItem::with_id(app, "capture", "Capture rapide", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &note, &PredefinedMenuItem::separator(app)?, &quit])?;

    let mut tray = TrayIconBuilder::with_id("cockpit")
        // Pour distinguer l'app de développement de l'app installée, qui peuvent tourner ensemble.
        .tooltip(if cfg!(debug_assertions) { "Cockpit (développement)" } else { "Cockpit" })
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "capture" => capture::open(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn keep_in_tray(app: &AppHandle) -> bool {
    let db = app.state::<Database>();
    let kept = db.lock().ok().and_then(|conn| db::read_setting::<bool>(&conn, KEEP_IN_TRAY_SETTING));
    kept.unwrap_or(true)
}

/// Fermer la fenêtre principale la cache (réglage par défaut) : Cockpit continue dans la zone de
/// notification. Réglage désactivé : la fermer quitte Cockpit, comme avant.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != MAIN_WINDOW {
        return;
    }
    let app = window.app_handle();
    if let WindowEvent::CloseRequested { api, .. } = event {
        if keep_in_tray(app) {
            api.prevent_close();
            let _ = window.hide();
            let _ = app.emit(HIDDEN_EVENT, ());
        } else {
            // Sans attendre que toutes les fenêtres soient fermées : il pourra y en avoir d'autres, cachées.
            app.exit(0);
        }
    }
}

// ─── Démarrage avec Windows ─────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutostartState {
    /// Faux en développement : l'exécutable de dev ne marche pas sans son serveur, on ne l'inscrit jamais.
    available: bool,
    /// Ce que Windows fera vraiment (l'inscription peut aussi être coupée depuis le Gestionnaire des tâches).
    enabled: bool,
}

#[tauri::command]
pub fn autostart_get(app: AppHandle) -> Result<AutostartState, String> {
    if cfg!(debug_assertions) {
        return Ok(AutostartState { available: false, enabled: false });
    }
    Ok(AutostartState { available: true, enabled: app.autolaunch().is_enabled().map_err(err)? })
}

#[tauri::command]
pub fn autostart_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err("Le démarrage avec Windows se règle dans l’application installée.".into());
    }
    let manager = app.autolaunch();
    if enabled { manager.enable() } else { manager.disable() }.map_err(err)
}

// ─── Battement ──────────────────────────────────────────────────────────────

/// Secondes à attendre jusqu'à la prochaine minute pleine, plus une de marge.
fn seconds_to_next_minute(now_secs: u64) -> u64 {
    60 - now_secs % 60 + 1
}

/// Une fois par minute, tant que Cockpit tourne : prévient l'interface, et, à chaque heure, s'assure
/// que la sauvegarde du jour existe (Cockpit peut rester ouvert plusieurs jours sans être relancé).
pub fn start_heartbeat(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let now = || SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let mut last_hour = now() / 3600;
        loop {
            std::thread::sleep(Duration::from_secs(seconds_to_next_minute(now())));
            let _ = app.emit(MINUTE_EVENT, ());
            let hour = now() / 3600;
            if hour != last_hour {
                last_hour = hour;
                daily_backup(&app);
            }
        }
    });
}

fn daily_backup(app: &AppHandle) {
    let db = app.state::<Database>();
    let Ok(dirs) = db.backup_dirs() else { return };
    let Ok(conn) = db.lock() else { return };
    if let Err(err) = backup::daily(&conn, dirs.active()) {
        eprintln!("Sauvegarde automatique impossible : {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attend_la_minute_pleine_suivante() {
        assert_eq!(seconds_to_next_minute(0), 61);
        assert_eq!(seconds_to_next_minute(59), 2);
        assert_eq!(seconds_to_next_minute(3_600 + 30), 31);
    }

    #[test]
    fn lit_le_reglage_de_la_zone_de_notification() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)").unwrap();
        assert_eq!(db::read_setting::<bool>(&conn, KEEP_IN_TRAY_SETTING), None);

        conn.execute("INSERT INTO settings (key, value) VALUES (?1, 'false')", [KEEP_IN_TRAY_SETTING]).unwrap();
        assert_eq!(db::read_setting::<bool>(&conn, KEEP_IN_TRAY_SETTING), Some(false));

        // Une valeur inattendue (modifiée à la main…) retombe sur le réglage par défaut.
        conn.execute("UPDATE settings SET value = '\"oui\"'", []).unwrap();
        assert_eq!(db::read_setting::<bool>(&conn, KEEP_IN_TRAY_SETTING), None);
    }
}
