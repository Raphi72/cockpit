//! Mini-fenêtre « En ce moment » (V2, étape 7) : une petite fenêtre toujours au-dessus des autres, avec
//! le bloc en cours, le temps qui reste et la tâche à faire. Ouverte et fermée à la demande (Ctrl+Maj+E
//! dans Cockpit, palette de commandes). Sa place est retenue (plugin window-state).
//!
//! Ici : la fenêtre seulement. Elle lit et écrit la base par le pont SQLite, comme la fenêtre principale,
//! et la prévient quand elle a coché une tâche.

use crate::presence::MAIN_WINDOW;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const WINDOW: &str = "now";

/// Taille de la fenêtre, en pixels logiques : trois lignes.
const WIDTH: f64 = 320.0;
const HEIGHT: f64 = 140.0;

/// La mini-fenêtre a changé quelque chose : la fenêtre principale relit ce qu'elle montre.
const DATA_EVENT: &str = "cockpit:data-changed";

/// La fenêtre, créée cachée si elle n'existe pas encore. Jamais depuis le fil principal :
/// la création d'une fenêtre attend la boucle d'événements.
fn ensure_window(app: &AppHandle) -> Option<WebviewWindow> {
    static BUILDING: Mutex<()> = Mutex::new(());
    let _guard = BUILDING.lock().ok()?;
    if let Some(window) = app.get_webview_window(WINDOW) {
        return Some(window);
    }
    WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("now.html".into()))
        .title("En ce moment")
        .inner_size(WIDTH, HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .shadow(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|error| eprintln!("Mini-fenêtre impossible : {error}"))
        .ok()
}

/// Ouvre la mini-fenêtre si elle est cachée, la cache sinon.
#[tauri::command]
pub fn now_toggle(app: AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
        }
        return;
    }
    std::thread::spawn(move || {
        if let Some(window) = ensure_window(&app) {
            let _ = window.show();
        }
    });
}

/// La mini-fenêtre a coché une tâche : la fenêtre principale relit ses données.
#[tauri::command]
pub fn now_changed(app: AppHandle) {
    let _ = app.emit_to(MAIN_WINDOW, DATA_EVENT, ());
}
