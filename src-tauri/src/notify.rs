//! Notifications Windows natives. Les règles (quoi prévenir, et quand) sont côté TypeScript,
//! dans `src/domains/notifications` ; ici, seulement l'envoi.
//!
//! En développement, Windows les attribue à PowerShell : seule l'app installée a son propre
//! identifiant (posé par l'installeur sur son raccourci), et donc son nom et son icône.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

/// Affiche une notification. L'envoi se fait en arrière-plan : un refus de Windows (« Ne pas
/// déranger », notifications coupées pour l'app) passe inaperçu ici.
#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}
