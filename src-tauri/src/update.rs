//! Mises à jour par GitHub (après la 2.6.2) : chaque version publiée porte une fiche `latest.json`
//! (version, notes, installateur signé du PC, APK du téléphone). Sans Internet, rien ne se passe.
//!
//! - **PC** (module officiel de Tauri, signature vérifiée avec la clé publique de `tauri.conf.json`) :
//!   vérifié peu après le lancement puis toutes les 6 heures, téléchargé en arrière-plan ; l'interface
//!   propose « Redémarrer » (`cockpit:update-ready`). Laissée de côté, la mise à jour s'installe à
//!   l'ouverture suivante (fichier témoin dans le dossier des données).
//! - **Téléphone** : la même fiche, l'APK téléchargé dans le cache de l'appli ; l'interface ouvre
//!   l'écran « Installer » d'Android (`window.CockpitAndroid.installApk`), qu'il faut toujours confirmer.

use serde::Serialize;

/// La fiche de la dernière version publiée (le PC la lit par `tauri.conf.json`, le téléphone par ici).
#[cfg_attr(desktop, allow(dead_code))]
pub const MANIFEST_URL: &str = "https://github.com/Raphi72/cockpit/releases/latest/download/latest.json";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

/// « 2.10.0 » après « 2.9.3 » : on compare nombre par nombre.
#[cfg_attr(desktop, allow(dead_code))]
pub(crate) fn newer(candidate: &str, current: &str) -> bool {
    let parts = |v: &str| v.split('.').map(|n| n.trim().parse::<u64>().unwrap_or(0)).collect::<Vec<_>>();
    parts(candidate) > parts(current)
}

// Les commandes s'appellent par leur module (`update::desktop::…`, `update::mobile::…`) : la macro de Tauri l'exige.
#[cfg(desktop)]
pub use desktop::{start, UpdateState};

#[cfg(desktop)]
pub mod desktop {
    use super::UpdateInfo;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter, Manager, State};
    use tauri_plugin_updater::{Update, UpdaterExt};

    /// La mise à jour téléchargée, prête à installer.
    #[derive(Default)]
    pub struct UpdateState(Mutex<Option<(Update, Vec<u8>)>>);

    const FIRST_CHECK: Duration = Duration::from_secs(20);
    const EVERY: Duration = Duration::from_secs(6 * 3600);
    pub const READY_EVENT: &str = "cockpit:update-ready";

    /// Témoin d'une mise à jour prête mais pas installée : elle s'installe à l'ouverture suivante.
    fn flag(app: &AppHandle) -> Option<PathBuf> {
        app.path().app_data_dir().ok().map(|dir| dir.join("mise-a-jour-prete"))
    }

    fn info(update: &Update) -> UpdateInfo {
        UpdateInfo { version: update.version.clone(), notes: update.body.clone() }
    }

    /// Cherche une nouvelle version et la télécharge ; `None` s'il n'y en a pas (ou hors ligne).
    async fn fetch(app: &AppHandle) -> Result<Option<UpdateInfo>, String> {
        let state = app.state::<UpdateState>();
        if let Some((update, _)) = state.0.lock().map_err(|e| e.to_string())?.as_ref() {
            return Ok(Some(info(update)));
        }
        let updater = app.updater().map_err(|e| e.to_string())?;
        let Some(update) = updater.check().await.map_err(|e| format!("Pas de nouvelle version joignable ({e}).",))? else {
            return Ok(None);
        };
        let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| format!("Téléchargement interrompu ({e}).",))?;
        let found = info(&update);
        if let Some(path) = flag(app) {
            let _ = std::fs::write(path, &found.version);
        }
        *state.0.lock().map_err(|e| e.to_string())? = Some((update, bytes));
        let _ = app.emit(READY_EVENT, &found);
        Ok(Some(found))
    }

    /// Installe ce qui a été téléchargé : l'installateur prend la main (barre de progression), puis
    /// relance Cockpit. Le processus actuel s'arrête.
    fn install(app: &AppHandle) -> Result<(), String> {
        let state = app.state::<UpdateState>();
        let pending = state.0.lock().map_err(|e| e.to_string())?.take();
        let Some((update, bytes)) = pending else { return Err("Aucune mise à jour prête.".into()) };
        if let Some(path) = flag(app) {
            let _ = std::fs::remove_file(path);
        }
        update.install(bytes).map_err(|e| format!("Installation impossible ({e}).",))?;
        app.restart();
    }

    /// Au lancement : une mise à jour laissée de côté s'installe tout de suite ; sinon, une première
    /// recherche peu après le lancement, puis toutes les 6 heures. Rien en développement.
    pub fn start(app: &AppHandle) {
        if cfg!(debug_assertions) {
            return;
        }
        let app = app.clone();
        std::thread::spawn(move || {
            let waiting = flag(&app).is_some_and(|path| path.exists());
            if waiting {
                if let Ok(Some(_)) = tauri::async_runtime::block_on(fetch(&app)) {
                    let _ = install(&app);
                }
                // Plus rien à installer (déjà fait, ou version retirée) : le témoin part.
                if let Some(path) = flag(&app) {
                    let _ = std::fs::remove_file(path);
                }
            }
            std::thread::sleep(FIRST_CHECK);
            loop {
                let _ = tauri::async_runtime::block_on(fetch(&app));
                std::thread::sleep(EVERY);
            }
        });
    }

    /// La mise à jour prête, s'il y en a une (l'interface la demande en s'ouvrant).
    #[tauri::command]
    pub fn update_pending(state: State<'_, UpdateState>) -> Option<UpdateInfo> {
        state.0.lock().ok()?.as_ref().map(|(update, _)| info(update))
    }

    /// « Rechercher une mise à jour » (Paramètres) : cherche et télécharge maintenant.
    #[tauri::command]
    pub async fn update_check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
        fetch(&app).await
    }

    /// « Redémarrer » : installe la mise à jour prête et relance Cockpit.
    #[tauri::command]
    pub fn update_install(app: AppHandle) -> Result<(), String> {
        install(&app)
    }
}

#[cfg(mobile)]
pub mod mobile {
    use super::{newer, UpdateInfo, MANIFEST_URL};
    use serde::Deserialize;
    use std::collections::HashMap;
    use std::time::Duration;
    use tauri::{AppHandle, Manager};

    /// La clé de l'APK dans la fiche de version (à côté de celle du PC, `windows-x86_64`).
    const ANDROID: &str = "android-aarch64";
    const MAX_APK: u64 = 200 * 1024 * 1024;

    #[derive(Deserialize)]
    struct Manifest {
        version: String,
        notes: Option<String>,
        platforms: HashMap<String, Platform>,
    }

    #[derive(Deserialize)]
    struct Platform {
        url: String,
    }

    fn agent(timeout: Duration) -> ureq::Agent {
        ureq::Agent::config_builder().timeout_global(Some(timeout)).build().new_agent()
    }

    fn manifest() -> Result<Manifest, String> {
        let mut response = agent(Duration::from_secs(20)).get(MANIFEST_URL).call().map_err(|e| format!("GitHub injoignable ({e}).",))?;
        response.body_mut().read_json::<Manifest>().map_err(|e| format!("Fiche de version illisible ({e}).",))
    }

    /// Une version plus récente que celle installée, avec un APK : `None` sinon (ou hors ligne).
    #[tauri::command]
    pub async fn update_check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
        let current = app.package_info().version.to_string();
        tauri::async_runtime::spawn_blocking(move || {
            let manifest = manifest()?;
            if !newer(&manifest.version, &current) || !manifest.platforms.contains_key(ANDROID) {
                return Ok(None);
            }
            Ok(Some(UpdateInfo { version: manifest.version, notes: manifest.notes }))
        })
        .await
        .map_err(|e| e.to_string())?
    }

    /// Télécharge l'APK de la dernière version dans le cache de l'appli ; renvoie son chemin.
    #[tauri::command]
    pub async fn update_download(app: AppHandle) -> Result<String, String> {
        let cache = app.path().app_cache_dir().map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || {
            let manifest = manifest()?;
            let url = manifest.platforms.get(ANDROID).ok_or("Pas d'APK dans cette version.")?.url.clone();
            let mut response = agent(Duration::from_secs(600)).get(&url).call().map_err(|e| format!("Téléchargement impossible ({e}).",))?;
            let bytes = response
                .body_mut()
                .with_config()
                .limit(MAX_APK)
                .read_to_vec()
                .map_err(|e| format!("Téléchargement interrompu ({e}).",))?;
            std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
            let path = cache.join(format!("cockpit-{}.apk", manifest.version));
            std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
            Ok(path.to_string_lossy().into_owned())
        })
        .await
        .map_err(|e| e.to_string())?
    }
}

#[cfg(test)]
mod tests {
    use super::newer;

    #[test]
    fn compare_les_versions_nombre_par_nombre() {
        assert!(newer("2.10.0", "2.9.3"));
        assert!(newer("2.6.3", "2.6.2"));
        assert!(!newer("2.6.2", "2.6.2"));
        assert!(!newer("2.5.9", "2.6.0"));
    }
}
