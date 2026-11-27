//! Coffre des secrets : identifiants du client Google, jeton de connexion, clé de synchronisation.
//! Jamais dans la base, ni dans les exports, ni dans le dépôt.
//!
//! - PC : le Gestionnaire d'identification de Windows (`keyring`), comme depuis l'étape 8.
//! - Téléphone : un fichier par secret dans un dossier privé de l'appli (`init`), qu'Android réserve à
//!   l'appli : aucune autre appli ne peut le lire, et il part avec elle à la désinstallation.

#[cfg(desktop)]
mod imp {
    fn entry(service: &str, key: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(service, key).map_err(|e| format!("Coffre d'identifiants indisponible : {e}"))
    }

    pub fn read(service: &str, key: &str) -> Result<Option<String>, String> {
        match entry(service, key)?.get_password() {
            Ok(text) => Ok(Some(text)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Lecture du coffre d'identifiants impossible : {e}")),
        }
    }

    pub fn write(service: &str, key: &str, value: &str) -> Result<(), String> {
        entry(service, key)?
            .set_password(value)
            .map_err(|e| format!("Écriture dans le coffre d'identifiants impossible : {e}"))
    }

    pub fn remove(service: &str, key: &str) -> Result<(), String> {
        match entry(service, key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Suppression dans le coffre d'identifiants impossible : {e}")),
        }
    }
}

#[cfg(mobile)]
mod imp {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::OnceLock;

    static DIR: OnceLock<PathBuf> = OnceLock::new();

    /// Le dossier privé du coffre, donné au démarrage.
    pub fn init(dir: PathBuf) -> std::io::Result<()> {
        fs::create_dir_all(&dir)?;
        let _ = DIR.set(dir);
        Ok(())
    }

    fn path(service: &str, key: &str) -> Result<PathBuf, String> {
        let dir = DIR.get().ok_or("Coffre d'identifiants indisponible.")?;
        let safe = |s: &str| s.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '.' { c } else { '_' }).collect::<String>();
        Ok(dir.join(format!("{}__{}.secret", safe(service), safe(key))))
    }

    pub fn read(service: &str, key: &str) -> Result<Option<String>, String> {
        match fs::read_to_string(path(service, key)?) {
            Ok(text) => Ok(Some(text)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("Lecture du coffre d'identifiants impossible : {e}")),
        }
    }

    pub fn write(service: &str, key: &str, value: &str) -> Result<(), String> {
        let target = path(service, key)?;
        // Écrire à côté puis renommer : un secret n'est jamais à moitié écrit.
        let tmp = target.with_extension("tmp");
        fs::write(&tmp, value).and_then(|()| fs::rename(&tmp, &target)).map_err(|e| format!("Écriture dans le coffre d'identifiants impossible : {e}"))
    }

    pub fn remove(service: &str, key: &str) -> Result<(), String> {
        match fs::remove_file(path(service, key)?) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("Suppression dans le coffre d'identifiants impossible : {e}")),
        }
    }
}

#[cfg(mobile)]
pub use imp::init;
pub use imp::{read, remove, write};
