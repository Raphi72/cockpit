//! Import Notion (V2, étape 4) : on choisit le dossier d'un export Notion (Markdown, décompressé) ;
//! ici, on en lit seulement les pages (.md) et les images, sans rien écrire. L'interface en fait des
//! pages Cockpit. Comme les autres fenêtres de fichier, elle s'ouvre côté natif : l'interface ne
//! transmet jamais de chemin.

use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

/// Garde-fous : un export Notion raisonnable tient largement dedans.
const MAX_FILES: usize = 5000;
const MAX_PAGE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 400 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFile {
    /// Chemin relatif au dossier choisi, avec des `/`.
    path: String,
    /// Une page : son Markdown.
    text: Option<String>,
    /// Une image : son contenu en base64, et son type.
    data: Option<String>,
    mime: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotionExport {
    /// Nom du dossier choisi.
    root: String,
    files: Vec<ExportFile>,
    /// Fichiers laissés de côté (trop gros, trop nombreux, ou d'un autre type).
    skipped: usize,
}

fn image_mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Base64 standard (avec `=`), pour passer une image à l'interface.
fn base64(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(ALPHABET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { ALPHABET[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHABET[n as usize & 63] as char } else { '=' });
    }
    out
}

/// Lit le dossier, sous-dossiers compris : les pages et les images, dans l'ordre des chemins.
fn read_export(root: &Path) -> NotionExport {
    let mut files = Vec::new();
    let mut skipped = 0;
    let mut total = 0u64;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(path);
                continue;
            }
            let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            let is_page = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("md"));
            let mime = image_mime(&path);
            let limit = if is_page { MAX_PAGE_BYTES } else { MAX_IMAGE_BYTES };
            if (!is_page && mime.is_none()) || meta.len() > limit || files.len() >= MAX_FILES || total + meta.len() > MAX_TOTAL_BYTES {
                skipped += 1;
                continue;
            }
            let Ok(bytes) = fs::read(&path) else {
                skipped += 1;
                continue;
            };
            total += meta.len();
            if is_page {
                files.push(ExportFile { path: relative, text: Some(String::from_utf8_lossy(&bytes).into_owned()), data: None, mime: None });
            } else {
                files.push(ExportFile { path: relative, text: None, data: Some(base64(&bytes)), mime: mime.map(String::from) });
            }
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let root_name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    NotionExport { root: root_name, files, skipped }
}

/// Choisir le dossier d'un export Notion décompressé, puis le lire. `None` si on annule.
#[tauri::command]
pub async fn notion_import_pick(app: AppHandle, window: WebviewWindow) -> Result<Option<NotionExport>, String> {
    let Some(picked) = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Dossier de l'export Notion (décompressé)")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let root = picked.into_path().map_err(|e| e.to_string())?;
    Ok(Some(read_export(&root)))
}

#[cfg(test)]
mod tests {
    use super::{base64, read_export};
    use std::fs;

    #[test]
    fn encode_en_base64() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn lit_les_pages_et_les_images_d_un_export() {
        let dir = std::env::temp_dir().join(format!("cockpit-notion-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("Cours 123")).unwrap();
        fs::write(dir.join("Cours 123.md"), "# Cours\n\nTexte").unwrap();
        fs::write(dir.join("Cours 123").join("Maths 456.md"), "# Maths").unwrap();
        fs::write(dir.join("Cours 123").join("schema.png"), [1u8, 2, 3]).unwrap();
        fs::write(dir.join("Base.csv"), "a,b").unwrap();

        let export = read_export(&dir);
        let paths: Vec<_> = export.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["Cours 123.md", "Cours 123/Maths 456.md", "Cours 123/schema.png"]);
        assert_eq!(export.skipped, 1);
        assert_eq!(export.files[2].data.as_deref(), Some("AQID"));
        let _ = fs::remove_dir_all(&dir);
    }
}
