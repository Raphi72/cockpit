//! Relier le téléphone au PC (V2, étape 10). Le PC affiche, à la demande, un code QR qui porte son accès
//! Google (client et jeton de renouvellement) et la clé de synchronisation ; le téléphone le lit avec sa
//! caméra. Il n'a donc ni identifiants à coller ni connexion Google à refaire. Le code ne passe par aucun
//! réseau : il va de l'écran du PC à la caméra du téléphone, puis dans le coffre du téléphone (`vault`).

use crate::{google, sync};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const PREFIX: &str = "cockpit-link:";
const VERSION: u8 = 1;

/// Le contenu du code QR : noms courts, pour un code plus petit et plus facile à lire.
#[derive(Serialize, Deserialize, Debug, PartialEq)]
struct Payload {
    v: u8,
    /// ID et code secret du client Google.
    c: String,
    s: String,
    /// Jeton de renouvellement, compte et droits accordés.
    r: String,
    a: Option<String>,
    p: Option<String>,
    /// Code de la clé de synchronisation.
    k: String,
}

fn encode(payload: &Payload) -> Result<String, String> {
    Ok(format!("{PREFIX}{}", serde_json::to_string(payload).map_err(|e| e.to_string())?))
}

#[cfg_attr(desktop, allow(dead_code))]
fn decode(text: &str) -> Result<Payload, String> {
    let json = text.trim().strip_prefix(PREFIX).ok_or("Ce n'est pas le code QR de Cockpit : sur le PC, Paramètres › Synchronisation › Relier le téléphone.")?;
    let payload: Payload = serde_json::from_str(json).map_err(|_| "Code QR illisible : réessaie.".to_string())?;
    if payload.v != VERSION {
        return Err("Ce code QR vient d'une autre version de Cockpit : mets à jour le PC et le téléphone.".into());
    }
    Ok(payload)
}

async fn blocking<T: Send + 'static>(job: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job).await.map_err(|e| e.to_string())?
}

/// PC : le texte du code QR qui relie un téléphone. Il faut Google connecté et la synchronisation activée.
#[tauri::command]
pub async fn link_code() -> Result<String, String> {
    blocking(|| {
        let linked = google::linked()?.ok_or("Connecte d'abord ton compte Google.")?;
        let k = sync::current_code().map_err(|_| "Active d'abord la synchronisation sur ce PC.".to_string())?;
        encode(&Payload {
            v: VERSION,
            c: linked.client_id,
            s: linked.client_secret,
            r: linked.refresh_token,
            a: linked.account,
            p: linked.scopes,
            k,
        })
    })
    .await
}

/// Téléphone : prend l'accès Google et la clé du code QR lu, après avoir vérifié la clé sur Drive.
/// Si quelque chose échoue, le téléphone revient à son état d'avant.
#[tauri::command]
#[cfg_attr(desktop, allow(dead_code))]
pub async fn link_apply(app: AppHandle, text: String) -> Result<(), String> {
    blocking(move || {
        let payload = decode(&text)?;
        google::adopt(
            &app,
            google::Linked { client_id: payload.c, client_secret: payload.s, refresh_token: payload.r, account: payload.a, scopes: payload.p },
        )?;
        sync::join(&app, &payload.k).inspect_err(|_| {
            let _ = google::forget_here(&app);
        })
    })
    .await
}

/// Téléphone : délier. La clé et l'accès Google sont oubliés ici, sans rien révoquer : le PC continue.
#[tauri::command]
#[cfg_attr(desktop, allow(dead_code))]
pub async fn link_forget(app: AppHandle) -> Result<(), String> {
    blocking(move || {
        sync::forget_key()?;
        google::forget_here(&app)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Payload {
        Payload {
            v: VERSION,
            c: "id.apps.googleusercontent.com".into(),
            s: "secret".into(),
            r: "refresh".into(),
            a: Some("compte@example.com".into()),
            p: None,
            k: "ABCD".into(),
        }
    }

    #[test]
    fn le_code_se_relit_tel_quel() {
        let text = encode(&sample()).unwrap();
        assert!(text.starts_with(PREFIX));
        assert_eq!(decode(&format!("  {text}\n")).unwrap(), sample());
    }

    #[test]
    fn un_autre_code_qr_est_refuse() {
        assert!(decode("cockpit-sync:ABCD").is_err());
        assert!(decode("cockpit-link:{pas du json").is_err());
        let other_version = encode(&Payload { v: 9, ..sample() }).unwrap();
        assert!(decode(&other_version).is_err());
    }
}
