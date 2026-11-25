//! Capture rapide : un raccourci global, même fenêtre cachée, ouvre une petite fenêtre où l'on note
//! quelque chose ; Entrée, et c'est dans la boîte de réception.
//!
//! Ici : le raccourci, la petite fenêtre et sa place à l'écran. L'écriture dans la base se fait côté
//! interface (src/domains/inbox), par le pont SQLite, comme partout ailleurs.

use crate::db::{self, Database};
use crate::presence::MAIN_WINDOW;
use serde::Serialize;
use std::str::FromStr;
use std::sync::Mutex;
use std::time::Duration;
use tauri::plugin::TauriPlugin;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window,
    WindowEvent, Wry,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const WINDOW: &str = "capture";

/// Taille de la fenêtre, en pixels logiques : une seule ligne de saisie.
const WIDTH: f64 = 620.0;
const HEIGHT: f64 = 68.0;

/// Réglage (table `settings`, valeur JSON) : le raccourci choisi dans Paramètres, ou « none ».
/// Mêmes valeurs que `CAPTURE_SHORTCUTS` dans src/domains/inbox/model.ts.
const SHORTCUT_SETTING: &str = "capture.shortcut";
const DEFAULT_SHORTCUT: &str = "Ctrl+Shift+Space";
const NO_SHORTCUT: &str = "none";

/// La fenêtre de capture vient d'être montrée : l'interface remet le curseur dans le champ.
const OPEN_EVENT: &str = "cockpit:capture-open";

/// Une capture vient d'être notée : la fenêtre principale relit la boîte de réception.
const INBOX_EVENT: &str = "cockpit:inbox-changed";

/// Le raccourci réellement enregistré auprès de Windows (rien : désactivé, ou déjà pris par une autre application).
pub struct CaptureShortcut(Mutex<Option<Shortcut>>);

pub fn plugin() -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle(app);
            }
        })
        .build()
}

/// Au démarrage : enregistre le raccourci choisi et prépare la fenêtre, cachée, pour qu'elle s'ouvre
/// sans attendre à la première capture.
pub fn init(app: &AppHandle) {
    let wanted = {
        let db = app.state::<Database>();
        let stored = db.lock().ok().and_then(|conn| db::read_setting::<String>(&conn, SHORTCUT_SETTING));
        stored.unwrap_or_else(|| DEFAULT_SHORTCUT.to_string())
    };
    let registered = parse(&wanted).ok().flatten().and_then(|shortcut| match app.global_shortcut().register(shortcut) {
        Ok(()) => Some(shortcut),
        Err(error) => {
            // Déjà pris (par une autre application, ou par l'app installée pendant le développement) :
            // Cockpit démarre quand même, Paramètres le signale.
            eprintln!("Raccourci de capture indisponible ({wanted}) : {error}");
            None
        }
    });
    app.manage(CaptureShortcut(Mutex::new(registered)));

    // Après le premier affichage de la fenêtre principale : son démarrage ne doit pas en pâtir.
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1500));
        ensure_window(&app);
    });
}

/// « none » : aucun raccourci. Sinon, une combinaison comme « Ctrl+Shift+Space ».
fn parse(accelerator: &str) -> Result<Option<Shortcut>, String> {
    if accelerator == NO_SHORTCUT {
        return Ok(None);
    }
    Shortcut::from_str(accelerator).map(Some).map_err(|_| format!("Raccourci invalide : {accelerator}"))
}

// ─── Fenêtre ────────────────────────────────────────────────────────────────

/// La fenêtre de capture, créée cachée si elle n'existe pas encore. Jamais depuis le fil principal :
/// la création d'une fenêtre attend la boucle d'événements.
fn ensure_window(app: &AppHandle) -> Option<WebviewWindow> {
    static BUILDING: Mutex<()> = Mutex::new(());
    let _guard = BUILDING.lock().ok()?;
    if let Some(window) = app.get_webview_window(WINDOW) {
        return Some(window);
    }
    WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("capture.html".into()))
        .title("Capture rapide")
        .inner_size(WIDTH, HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .shadow(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        // Créée en arrière-plan : elle ne doit pas prendre le clavier à l'application en cours.
        // C'est `show` qui lui donne le focus, quand on l'ouvre.
        .focused(false)
        .build()
        .map_err(|error| eprintln!("Fenêtre de capture impossible : {error}"))
        .ok()
}

/// Coin haut gauche de la fenêtre : centrée, au premier quart de l'écran (en pixels physiques).
fn position_on(origin: (i32, i32), size: (u32, u32), scale: f64) -> (i32, i32) {
    let width = (WIDTH * scale).round() as i32;
    (origin.0 + (size.0 as i32 - width) / 2, origin.1 + (f64::from(size.1) * 0.22).round() as i32)
}

/// Montre la fenêtre sur l'écran où se trouve le pointeur, prête pour la saisie.
fn show(app: &AppHandle, window: &WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|point| app.monitor_from_point(point.x, point.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let (origin, size) = (monitor.position(), monitor.size());
        let (x, y) = position_on((origin.x, origin.y), (size.width, size.height), monitor.scale_factor());
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
    let _ = window.show();
    let _ = window.set_focus();
    let _ = app.emit_to(WINDOW, OPEN_EVENT, ());
}

/// Ouvre la capture (menu de l'icône).
pub fn open(app: &AppHandle) {
    match app.get_webview_window(WINDOW) {
        Some(window) => show(app, &window),
        None => {
            let app = app.clone();
            std::thread::spawn(move || {
                if let Some(window) = ensure_window(&app) {
                    show(&app, &window);
                }
            });
        }
    }
}

/// Le raccourci global : ouvre la capture, ou la referme si elle est déjà à l'écran.
fn toggle(app: &AppHandle) {
    match app.get_webview_window(WINDOW) {
        Some(window) if window.is_visible().unwrap_or(false) => {
            let _ = window.hide();
        }
        _ => open(app),
    }
}

/// La petite fenêtre ne se ferme jamais vraiment : elle se cache, dès qu'on clique ailleurs aussi.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != WINDOW {
        return;
    }
    match event {
        WindowEvent::Focused(false) => {
            let _ = window.hide();
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = window.hide();
        }
        _ => {}
    }
}

/// Fin d'une capture, appelée par la petite fenêtre : `saved` prévient la fenêtre principale,
/// `keep_open` la laisse à l'écran pour enchaîner (Ctrl+Entrée).
#[tauri::command]
pub fn capture_done(app: AppHandle, window: WebviewWindow, saved: bool, keep_open: bool) {
    if saved {
        let _ = app.emit_to(MAIN_WINDOW, INBOX_EVENT, ());
    }
    if !keep_open && window.label() == WINDOW {
        let _ = window.hide();
    }
}

// ─── Raccourci ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureShortcutInfo {
    /// Faux : désactivé, ou refusé par Windows parce qu'une autre application l'utilise déjà.
    active: bool,
}

#[tauri::command]
pub fn capture_shortcut_get(state: State<'_, CaptureShortcut>) -> Result<CaptureShortcutInfo, String> {
    let current = state.0.lock().map_err(|_| "Raccourci indisponible".to_string())?;
    Ok(CaptureShortcutInfo { active: current.is_some() })
}

/// Change le raccourci (Paramètres). Le nouveau est enregistré avant de lâcher l'ancien : s'il est
/// déjà pris, rien ne change.
#[tauri::command]
pub fn capture_shortcut_set(
    app: AppHandle,
    state: State<'_, CaptureShortcut>,
    accelerator: String,
) -> Result<(), String> {
    let next = parse(&accelerator)?;
    let mut current = state.0.lock().map_err(|_| "Raccourci indisponible".to_string())?;
    if *current == next {
        return Ok(());
    }
    if let Some(shortcut) = next {
        app.global_shortcut()
            .register(shortcut)
            .map_err(|_| "Ce raccourci est déjà pris par une autre application : choisis-en un autre.".to_string())?;
    }
    if let Some(previous) = current.take() {
        let _ = app.global_shortcut().unregister(previous);
    }
    *current = next;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comprend_les_raccourcis_proposes_dans_parametres() {
        // Les valeurs de `CAPTURE_SHORTCUTS` (src/domains/inbox/model.ts).
        for accelerator in ["Ctrl+Shift+Space", "Alt+Shift+C", "Super+Alt+C"] {
            assert!(parse(accelerator).unwrap().is_some(), "{accelerator}");
        }
        assert_eq!(parse("none").unwrap(), None);
        assert!(parse("Ctrl+Shift+").is_err());
        assert!(parse("n'importe quoi").is_err());
    }

    #[test]
    fn centre_la_fenetre_au_premier_quart_de_l_ecran() {
        // Écran 1080p à 125 % : la fenêtre de 620 px logiques en fait 775.
        assert_eq!(position_on((0, 0), (1920, 1080), 1.25), ((1920 - 775) / 2, 238));
        // Second écran, à droite du premier, à 100 %.
        assert_eq!(position_on((1920, 0), (2560, 1440), 1.0), (1920 + (2560 - 620) / 2, 317));
    }
}
