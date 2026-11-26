//! Synchronisation entre appareils (V2, étape 9) : chiffrement des fichiers de changements et échange par
//! le dossier caché de l'app sur Google Drive (`appDataFolder`, invisible dans Drive).
//!
//! L'interface prépare et applique les changements (src/domains/sync) ; ici, seulement la clé, le
//! chiffrement (XChaCha20-Poly1305) et le réseau. Google ne voit que des fichiers illisibles. La clé est
//! créée sur le premier appareil, gardée dans le Gestionnaire d'identification de Windows, et donnée aux
//! autres par un code de 52 caractères (13 groupes de 4). Un fichier « key-check » chiffré permet de vérifier
//! un code saisi. L'app de développement écrit des fichiers à part (préfixe `dev-`) : jamais mêlés aux vrais.

use crate::google::{access_token, drive_allowed, network, RECONNECT};
use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::AppHandle;

const SERVICE: &str = if cfg!(debug_assertions) { "Cockpit (développement) · Synchronisation" } else { "Cockpit · Synchronisation" };
const KEY_ENTRY: &str = "key";

/// Les fichiers de l'app de développement ne se mêlent jamais à ceux de l'app installée.
const PREFIX: &str = if cfg!(debug_assertions) { "dev-" } else { "" };
const KEY_CHECK: &str = "key-check";
const EXTENSION: &str = ".ckp";

const MAGIC: &[u8] = b"CKP1";
const CHECK_TEXT: &[u8] = b"cockpit-sync-key-check";
const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL: &str = "https://www.googleapis.com/upload/drive/v3/files";

/// Taille maximale d'un fichier téléchargé.
const MAX_DOWNLOAD: u64 = 64 * 1024 * 1024;

// ─── Clé et code ────────────────────────────────────────────────────────────

/// Le code d'une clé : base32 (A-Z, 2-7), en 13 groupes de 4 séparés par des tirets.
fn encode_code(key: &[u8; 32]) -> String {
    let mut bits: u64 = 0;
    let mut count = 0;
    let mut out = String::new();
    for &byte in key {
        bits = (bits << 8) | u64::from(byte);
        count += 8;
        while count >= 5 {
            count -= 5;
            out.push(ALPHABET[((bits >> count) & 31) as usize] as char);
        }
    }
    if count > 0 {
        out.push(ALPHABET[((bits << (5 - count)) & 31) as usize] as char);
    }
    out.as_bytes().chunks(4).map(|c| String::from_utf8_lossy(c).into_owned()).collect::<Vec<_>>().join("-")
}

/// Lit un code tapé : espaces, tirets et minuscules acceptés ; 0, 1 et 8 lus comme O, I et B.
fn decode_code(code: &str) -> Result<[u8; 32], String> {
    let cleaned: Vec<u8> = code
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| match c.to_ascii_uppercase() {
            '0' => 'O',
            '1' => 'I',
            '8' => 'B',
            other => other,
        } as u8)
        .collect();
    if cleaned.len() != 52 {
        return Err("Le code a 52 caractères (13 groupes de 4).".into());
    }
    let mut bits: u64 = 0;
    let mut count = 0;
    let mut out = Vec::with_capacity(32);
    for byte in cleaned {
        let value = ALPHABET.iter().position(|&a| a == byte).ok_or("Ce code contient un caractère inconnu.")? as u64;
        bits = (bits << 5) | value;
        count += 5;
        if count >= 8 {
            count -= 8;
            out.push(((bits >> count) & 0xff) as u8);
        }
    }
    out.truncate(32);
    out.try_into().map_err(|_| "Code incomplet.".to_string())
}

fn seal(key: &[u8; 32], plain: &[u8]) -> Result<Vec<u8>, String> {
    let mut nonce = [0u8; 24];
    getrandom::fill(&mut nonce).map_err(|e| format!("Aléa indisponible : {e}"))?;
    let cipher = XChaCha20Poly1305::new(key.into());
    let sealed = cipher.encrypt(XNonce::from_slice(&nonce), plain).map_err(|_| "Chiffrement impossible.".to_string())?;
    Ok([MAGIC, &nonce, &sealed].concat())
}

fn open(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < MAGIC.len() + 24 || &data[..MAGIC.len()] != MAGIC {
        return Err("Fichier de synchronisation illisible.".into());
    }
    let (nonce, sealed) = data[MAGIC.len()..].split_at(24);
    XChaCha20Poly1305::new(key.into())
        .decrypt(XNonce::from_slice(nonce), sealed)
        .map_err(|_| "Ce fichier ne s'ouvre pas avec la clé de cet appareil.".to_string())
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, KEY_ENTRY).map_err(|e| format!("Coffre d'identifiants indisponible : {e}"))
}

fn read_key() -> Result<Option<[u8; 32]>, String> {
    match entry()?.get_password() {
        Ok(text) => {
            let bytes = STANDARD.decode(text).map_err(|_| "Clé de synchronisation abîmée.".to_string())?;
            Ok(Some(bytes.try_into().map_err(|_| "Clé de synchronisation abîmée.".to_string())?))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Lecture du coffre d'identifiants impossible : {e}")),
    }
}

fn write_key(key: &[u8; 32]) -> Result<(), String> {
    entry()?.set_password(&STANDARD.encode(key)).map_err(|e| format!("Écriture dans le coffre d'identifiants impossible : {e}"))
}

fn key() -> Result<[u8; 32], String> {
    read_key()?.ok_or("La synchronisation n'est pas activée sur cet appareil.".into())
}

// ─── Google Drive (dossier caché de l'app) ──────────────────────────────────

fn drive_agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(180)))
        .http_status_as_error(false)
        .build()
        .new_agent()
}

fn token(app: &AppHandle) -> Result<String, String> {
    if !drive_allowed()? {
        return Err("Reconnecte Google en autorisant la synchronisation (Paramètres › Google Agenda › Se connecter).".into());
    }
    access_token(app)
}

fn check(status: u16) -> Result<(), String> {
    match status {
        200..=299 => Ok(()),
        401 => Err(RECONNECT.into()),
        403 => Err("Google refuse l'accès à Drive : l'API Google Drive est-elle activée dans le projet Google Cloud ?".into()),
        _ => Err(format!("Google Drive a répondu une erreur (HTTP {status}).")),
    }
}

#[derive(Deserialize, Serialize, Clone)]
pub struct DriveFile {
    id: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileList {
    #[serde(default)]
    files: Vec<DriveFile>,
    next_page_token: Option<String>,
}

fn list_all(app: &AppHandle) -> Result<Vec<DriveFile>, String> {
    let bearer = format!("Bearer {}", token(app)?);
    let mut all = Vec::new();
    let mut page_token: Option<String> = None;
    loop {
        let mut request = drive_agent()
            .get(FILES_URL)
            .header("Authorization", &bearer)
            .query("spaces", "appDataFolder")
            .query("pageSize", "1000")
            .query("orderBy", "name")
            .query("fields", "nextPageToken,files(id,name)");
        if let Some(next) = page_token.as_deref() {
            request = request.query("pageToken", next);
        }
        let mut response = request.call().map_err(network)?;
        check(response.status().as_u16())?;
        let page: FileList = response.body_mut().read_json().map_err(|e| format!("Réponse de Drive illisible : {e}"))?;
        all.extend(page.files);
        match page.next_page_token {
            Some(next) => page_token = Some(next),
            None => break,
        }
    }
    Ok(all)
}

fn download(app: &AppHandle, id: &str) -> Result<Vec<u8>, String> {
    let mut response = drive_agent()
        .get(format!("{FILES_URL}/{id}"))
        .header("Authorization", format!("Bearer {}", token(app)?))
        .query("alt", "media")
        .call()
        .map_err(network)?;
    check(response.status().as_u16())?;
    response.body_mut().with_config().limit(MAX_DOWNLOAD).read_to_vec().map_err(network)
}

/// Dépôt en deux temps (« resumable ») : il marche quelle que soit la taille du fichier.
fn upload(app: &AppHandle, name: &str, bytes: Vec<u8>) -> Result<(), String> {
    let bearer = format!("Bearer {}", token(app)?);
    let response = drive_agent()
        .post(UPLOAD_URL)
        .query("uploadType", "resumable")
        .header("Authorization", &bearer)
        .header("X-Upload-Content-Type", "application/octet-stream")
        .header("X-Upload-Content-Length", bytes.len().to_string())
        .send_json(serde_json::json!({ "name": name, "parents": ["appDataFolder"] }))
        .map_err(network)?;
    check(response.status().as_u16())?;
    let location = response
        .headers()
        .get("location")
        .and_then(|v| v.to_str().ok())
        .ok_or("Google Drive n'a pas donné d'adresse de dépôt.")?
        .to_string();
    let response = drive_agent()
        .put(location)
        .header("Authorization", &bearer)
        .header("Content-Type", "application/octet-stream")
        .send(&bytes[..])
        .map_err(network)?;
    check(response.status().as_u16())
}

fn key_check_name() -> String {
    format!("{PREFIX}{KEY_CHECK}")
}

// ─── Commandes ──────────────────────────────────────────────────────────────

async fn blocking<T: Send + 'static>(job: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job).await.map_err(|e| e.to_string())?
}

/// Cet appareil a-t-il la clé de synchronisation ?
#[tauri::command]
pub async fn sync_has_key() -> Result<bool, String> {
    blocking(|| Ok(read_key()?.is_some())).await
}

/// Premier appareil : crée la clé (s'il n'y a pas déjà une synchronisation sur ce compte) et renvoie son code.
#[tauri::command]
pub async fn sync_create_key(app: AppHandle) -> Result<String, String> {
    blocking(move || {
        if list_all(&app)?.iter().any(|f| f.name == key_check_name()) {
            return Err("Une synchronisation existe déjà sur ce compte Google : saisis le code affiché sur ton autre appareil.".into());
        }
        let mut key = [0u8; 32];
        getrandom::fill(&mut key).map_err(|e| format!("Aléa indisponible : {e}"))?;
        upload(&app, &key_check_name(), seal(&key, CHECK_TEXT)?)?;
        write_key(&key)?;
        Ok(encode_code(&key))
    })
    .await
}

/// Autre appareil : vérifie le code avec le fichier « key-check », puis garde la clé.
#[tauri::command]
pub async fn sync_join(app: AppHandle, code: String) -> Result<(), String> {
    blocking(move || {
        let key = decode_code(&code)?;
        let check_file = list_all(&app)?
            .into_iter()
            .find(|f| f.name == key_check_name())
            .ok_or("Aucune synchronisation sur ce compte Google : active-la d'abord sur ton autre appareil.")?;
        let plain = open(&key, &download(&app, &check_file.id)?).map_err(|_| "Ce code ne correspond pas : vérifie-le sur l'autre appareil.".to_string())?;
        if plain != CHECK_TEXT {
            return Err("Ce code ne correspond pas : vérifie-le sur l'autre appareil.".into());
        }
        write_key(&key)
    })
    .await
}

/// Le code de la clé, pour l'écrire sur un autre appareil.
#[tauri::command]
pub async fn sync_show_code() -> Result<String, String> {
    blocking(|| Ok(encode_code(&key()?))).await
}

/// Arrêter sur cet appareil : la clé est retirée du coffre (rien n'est effacé sur Drive).
#[tauri::command]
pub async fn sync_forget_key() -> Result<(), String> {
    blocking(|| match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Suppression dans le coffre d'identifiants impossible : {e}")),
    })
    .await
}

/// Les fichiers de changements déposés (noms sans le préfixe de développement).
#[tauri::command]
pub async fn sync_list(app: AppHandle) -> Result<Vec<DriveFile>, String> {
    blocking(move || {
        Ok(list_all(&app)?
            .into_iter()
            .filter_map(|f| {
                let name = f.name.strip_prefix(PREFIX)?;
                // En production, ignorer les fichiers de l'app de développement.
                if PREFIX.is_empty() && name.starts_with("dev-") {
                    return None;
                }
                name.ends_with(EXTENSION).then(|| DriveFile { id: f.id.clone(), name: name.to_string() })
            })
            .collect())
    })
    .await
}

/// Télécharge et déchiffre un fichier de changements.
#[tauri::command]
pub async fn sync_download(app: AppHandle, id: String) -> Result<String, String> {
    blocking(move || {
        let plain = open(&key()?, &download(&app, &id)?)?;
        String::from_utf8(plain).map_err(|_| "Fichier de synchronisation illisible.".to_string())
    })
    .await
}

/// Chiffre et dépose un fichier de changements.
#[tauri::command]
pub async fn sync_upload(app: AppHandle, name: String, text: String) -> Result<(), String> {
    blocking(move || {
        if !name.ends_with(EXTENSION) || name.contains('/') {
            return Err("Nom de fichier refusé.".into());
        }
        upload(&app, &format!("{PREFIX}{name}"), seal(&key()?, text.as_bytes())?)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_code_redonne_la_cle() {
        let key: [u8; 32] = std::array::from_fn(|i| (i * 37 + 11) as u8);
        let code = encode_code(&key);
        assert_eq!(code.len(), 52 + 12);
        assert_eq!(code.split('-').count(), 13);
        assert_eq!(decode_code(&code).unwrap(), key);
        // Tapé en minuscules, sans tirets, avec des espaces : même clé.
        assert_eq!(decode_code(&code.to_lowercase().replace('-', " ")).unwrap(), key);
        assert!(decode_code("ABCD").is_err());
    }

    #[test]
    fn chiffre_et_dechiffre() {
        let key = [7u8; 32];
        let sealed = seal(&key, b"bonjour").unwrap();
        assert_eq!(&sealed[..4], MAGIC);
        assert_eq!(open(&key, &sealed).unwrap(), b"bonjour");
        // Deux chiffrements du même texte diffèrent (nonce aléatoire).
        assert_ne!(seal(&key, b"bonjour").unwrap(), sealed);
        assert!(open(&[8u8; 32], &sealed).is_err());
        let mut abime = sealed.clone();
        let last = abime.len() - 1;
        abime[last] ^= 1;
        assert!(open(&key, &abime).is_err());
        assert!(open(&key, b"rien").is_err());
    }
}
