//! Connexion Google et lecture de Google Agenda (V2, étape 8).
//!
//! Tout ce qui touche au réseau et aux secrets est ici, côté Rust : l'interface ne fait aucun appel
//! réseau et ne voit jamais un jeton. La connexion suit le parcours OAuth des applications de bureau :
//! le navigateur s'ouvre sur la page de Google, qui renvoie vers un petit serveur local d'un instant
//! (`http://127.0.0.1:<port>`), avec PKCE. Seule la lecture des agendas est demandée.
//!
//! L'identifiant du client (créé par l'utilisateur dans son projet Google Cloud, voir
//! docs/google-cloud.md) et le jeton de renouvellement sont gardés dans le coffre de l'appareil (`vault` :
//! Gestionnaire d'identification de Windows sur le PC) : jamais dans la base, les exports ni le dépôt. Le
//! jeton d'accès, lui, ne vit qu'en mémoire. Le téléphone ne se connecte pas lui-même : il reçoit le client
//! et le jeton du PC par le code QR qui le relie (`link`).

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const API: &str = "https://www.googleapis.com/calendar/v3";
/// Lire tous les agendas (étape 8), écrire leurs événements (après la 2.7.0 : modifier, créer et supprimer
/// depuis Cockpit), et le dossier caché de l'app sur Google Drive pour la synchronisation (étape 9) :
/// Cockpit n'y voit que ses propres fichiers.
const CALENDAR_SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly";
const EVENTS_SCOPE: &str = "https://www.googleapis.com/auth/calendar.events";
pub(crate) const DRIVE_SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata";

/// Le coffre : un nom par application, l'app de développement à part (comme sa base).
const SERVICE: &str = if cfg!(debug_assertions) { "Cockpit (développement) · Google" } else { "Cockpit · Google" };
const CLIENT_KEY: &str = "client";
const TOKEN_KEY: &str = "token";

/// Temps laissé pour autoriser Cockpit dans le navigateur.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(300);

/// Message des erreurs qui demandent de se reconnecter (l'interface le montre tel quel).
pub(crate) const RECONNECT: &str = "Google a coupé la connexion : reconnecte-toi dans Paramètres › Google Agenda.";

#[derive(Serialize, Deserialize)]
struct Client {
    client_id: String,
    client_secret: String,
}

#[derive(Serialize, Deserialize)]
struct Token {
    refresh_token: String,
    account: Option<String>,
    /// Les droits accordés (séparés par des espaces) ; absent pour une connexion de l'étape 8.
    #[serde(default)]
    scopes: Option<String>,
}

/// La synchronisation est-elle autorisée (droit sur le dossier caché de Drive) ?
pub(crate) fn drive_allowed() -> Result<bool, String> {
    Ok(vault_read::<Token>(TOKEN_KEY)?.and_then(|t| t.scopes).is_some_and(|s| s.split(' ').any(|scope| scope == DRIVE_SCOPE)))
}

/// Le jeton d'accès en cours et sa fin de validité : en mémoire seulement.
#[derive(Default)]
pub struct GoogleSession(Mutex<Option<(String, Instant)>>);

// ─── Coffre d'identifiants ──────────────────────────────────────────────────

fn vault_read<T: DeserializeOwned>(key: &str) -> Result<Option<T>, String> {
    Ok(crate::vault::read(SERVICE, key)?.and_then(|text| serde_json::from_str(&text).ok()))
}

fn vault_write<T: Serialize>(key: &str, value: &T) -> Result<(), String> {
    let text = serde_json::to_string(value).map_err(|e| e.to_string())?;
    crate::vault::write(SERVICE, key, &text)
}

fn vault_remove(key: &str) -> Result<(), String> {
    crate::vault::remove(SERVICE, key)
}

/// L'accès Google du PC, tel que le téléphone le reçoit (`link`).
pub(crate) struct Linked {
    pub client_id: String,
    pub client_secret: String,
    pub refresh_token: String,
    pub account: Option<String>,
    pub scopes: Option<String>,
}

/// L'accès Google de cet appareil, s'il est connecté.
pub(crate) fn linked() -> Result<Option<Linked>, String> {
    let (Some(client), Some(token)) = (vault_read::<Client>(CLIENT_KEY)?, vault_read::<Token>(TOKEN_KEY)?) else { return Ok(None) };
    Ok(Some(Linked {
        client_id: client.client_id,
        client_secret: client.client_secret,
        refresh_token: token.refresh_token,
        account: token.account,
        scopes: token.scopes,
    }))
}

/// Le téléphone prend l'accès Google reçu du PC.
#[cfg_attr(desktop, allow(dead_code))]
pub(crate) fn adopt(app: &AppHandle, linked: Linked) -> Result<(), String> {
    vault_write(CLIENT_KEY, &Client { client_id: linked.client_id, client_secret: linked.client_secret })?;
    vault_write(TOKEN_KEY, &Token { refresh_token: linked.refresh_token, account: linked.account, scopes: linked.scopes })?;
    *app.state::<GoogleSession>().0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

/// Oublie l'accès Google de cet appareil sans le révoquer (le PC s'en sert encore).
#[cfg_attr(desktop, allow(dead_code))]
pub(crate) fn forget_here(app: &AppHandle) -> Result<(), String> {
    vault_remove(TOKEN_KEY)?;
    vault_remove(CLIENT_KEY)?;
    *app.state::<GoogleSession>().0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

// ─── Règles pures (testées) ─────────────────────────────────────────────────

/// Une suite aléatoire en base64 URL, pour le vérificateur PKCE et l'état.
fn random_token(bytes: usize) -> Result<String, String> {
    let mut buffer = vec![0u8; bytes];
    getrandom::fill(&mut buffer).map_err(|e| format!("Aléa indisponible : {e}"))?;
    Ok(URL_SAFE_NO_PAD.encode(buffer))
}

/// PKCE (RFC 7636) : le défi envoyé à Google est le SHA-256 du vérificateur, en base64 URL.
fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// Encodage d'un morceau d'URL : tout sauf les caractères sûrs (un identifiant d'agenda contient `@`, `#`…).
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn hex(digit: u8) -> Option<u8> {
    (digit as char).to_digit(16).map(|d| d as u8)
}

fn decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => match (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                (Some(high), Some(low)) => {
                    out.push(high * 16 + low);
                    i += 3;
                }
                _ => {
                    out.push(b'%');
                    i += 1;
                }
            },
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    let scope = format!("{CALENDAR_SCOPE} {EVENTS_SCOPE} {DRIVE_SCOPE}");
    let params = [
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("response_type", "code"),
        ("scope", &scope),
        // Garder les droits déjà donnés (l'agenda) en ajoutant ceux qui manquent.
        ("include_granted_scopes", "true"),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
        ("state", state),
        // Un jeton de renouvellement, pour ne pas redemander chaque heure.
        ("access_type", "offline"),
        ("prompt", "consent"),
    ];
    let query: Vec<String> = params.iter().map(|(k, v)| format!("{k}={}", encode(v))).collect();
    format!("{AUTH_URL}?{}", query.join("&"))
}

/// Ce que Google renvoie sur le serveur local : le code, ou un refus.
#[derive(Debug, PartialEq)]
enum Redirect {
    Code { code: String, state: String },
    Refused(String),
    /// Autre chose (favicon, connexion anticipée du navigateur) : on attend la suite.
    Other,
}

/// Lit la première ligne d'une requête HTTP (« GET /?code=…&state=… HTTP/1.1 »).
fn parse_redirect(request_line: &str) -> Redirect {
    let Some(target) = request_line.split_whitespace().nth(1) else { return Redirect::Other };
    let Some((_, query)) = target.split_once('?') else { return Redirect::Other };
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        match key {
            "code" => code = Some(decode(value)),
            "state" => state = Some(decode(value)),
            "error" => error = Some(decode(value)),
            _ => {}
        }
    }
    match (code, state, error) {
        (_, _, Some(error)) => Redirect::Refused(error),
        (Some(code), Some(state), None) => Redirect::Code { code, state },
        _ => Redirect::Other,
    }
}

/// Une date de début ou de fin d'événement Google : un jour entier (`date`), ou une heure (`dateTime`).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventTime {
    date: Option<String>,
    date_time: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Attendee {
    #[serde(default, rename = "self")]
    is_self: bool,
    response_status: Option<String>,
}

/// Les champs privés que Cockpit range dans un événement Google (son rattachement), invisibles ailleurs.
#[derive(Deserialize, Default)]
struct ExtendedProperties {
    #[serde(default)]
    private: std::collections::HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawEvent {
    id: String,
    status: Option<String>,
    summary: Option<String>,
    location: Option<String>,
    description: Option<String>,
    start: Option<EventTime>,
    end: Option<EventTime>,
    html_link: Option<String>,
    recurring_event_id: Option<String>,
    #[serde(default)]
    extended_properties: Option<ExtendedProperties>,
    #[serde(default)]
    attendees: Vec<Attendee>,
}

/// Le projet ou la matière auxquels Cockpit a rattaché un événement Google.
const PROJECT_PROPERTY: &str = "cockpitProjectId";
const SUBJECT_PROPERTY: &str = "cockpitSubjectId";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventPage {
    #[serde(default)]
    items: Vec<RawEvent>,
    next_page_token: Option<String>,
}

/// Un événement tel que l'interface le reçoit. `start` et `end` restent ceux de Google : un jour
/// ('YYYY-MM-DD', fin exclue) ou une heure dans le fuseau demandé ('YYYY-MM-DDTHH:MM:SS+01:00').
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleEvent {
    id: String,
    title: String,
    location: Option<String>,
    notes: Option<String>,
    start: String,
    end: String,
    all_day: bool,
    html_link: Option<String>,
    /// L'événement répété dont celui-ci est une occurrence.
    series_id: Option<String>,
    project_id: Option<String>,
    subject_id: Option<String>,
}

/// Garde les événements à montrer : ni annulés, ni refusés, avec un début et une fin.
fn keep_events(raw: Vec<RawEvent>) -> Vec<GoogleEvent> {
    raw.into_iter()
        .filter(|e| e.status.as_deref() != Some("cancelled"))
        .filter(|e| !e.attendees.iter().any(|a| a.is_self && a.response_status.as_deref() == Some("declined")))
        .filter_map(|e| {
            let (start, end) = (e.start?, e.end?);
            let all_day = start.date.is_some();
            let start = start.date.or(start.date_time)?;
            let end = end.date.or(end.date_time)?;
            let private = e.extended_properties.unwrap_or_default().private;
            let linked = |key: &str| private.get(key).filter(|v| !v.is_empty()).cloned();
            Some(GoogleEvent {
                id: e.id,
                title: e.summary.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "(Sans titre)".into()),
                location: e.location.filter(|s| !s.trim().is_empty()),
                notes: e.description.filter(|s| !s.trim().is_empty()),
                start,
                end,
                all_day,
                html_link: e.html_link,
                series_id: e.recurring_event_id,
                project_id: linked(PROJECT_PROPERTY),
                subject_id: linked(SUBJECT_PROPERTY),
            })
        })
        .collect()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCalendar {
    id: String,
    summary: Option<String>,
    summary_override: Option<String>,
    background_color: Option<String>,
    #[serde(default)]
    primary: bool,
    #[serde(default)]
    selected: bool,
    #[serde(default)]
    hidden: bool,
    /// « owner » ou « writer » : on peut y écrire ; « reader » : un agenda en lecture seule (iCal…).
    access_role: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarPage {
    #[serde(default)]
    items: Vec<RawCalendar>,
    next_page_token: Option<String>,
}

/// Un agenda Google : son nom, sa couleur dans Google, s'il est le principal, s'il est coché dans Google.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleCalendar {
    id: String,
    name: String,
    color: Option<String>,
    primary: bool,
    selected: bool,
    writable: bool,
}

fn keep_calendars(raw: Vec<RawCalendar>) -> Vec<GoogleCalendar> {
    raw.into_iter()
        .filter(|c| !c.hidden)
        .map(|c| GoogleCalendar {
            name: c.summary_override.or(c.summary).unwrap_or_else(|| c.id.clone()),
            id: c.id,
            color: c.background_color,
            primary: c.primary,
            selected: c.selected,
            writable: matches!(c.access_role.as_deref(), Some("owner" | "writer")),
        })
        .collect()
}

// ─── Réseau ─────────────────────────────────────────────────────────────────

pub(crate) fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(30)))
        .http_status_as_error(false)
        .build()
        .new_agent()
}

pub(crate) fn network(e: ureq::Error) -> String {
    format!("Google injoignable ({e}). Vérifie la connexion à Internet.")
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
    scope: Option<String>,
}

#[derive(Deserialize)]
struct TokenError {
    error: String,
}

/// Échange au point de jeton de Google (code d'autorisation ou renouvellement).
fn token_request(form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let mut response = agent().post(TOKEN_URL).send_form(form.iter().copied()).map_err(network)?;
    let status = response.status().as_u16();
    let text = response.body_mut().read_to_string().map_err(network)?;
    if status == 200 {
        return serde_json::from_str(&text).map_err(|e| format!("Réponse de Google illisible : {e}"));
    }
    match serde_json::from_str::<TokenError>(&text) {
        Ok(TokenError { error }) if error == "invalid_grant" => Err(RECONNECT.into()),
        Ok(TokenError { error }) if error == "invalid_client" || error == "unauthorized_client" => {
            Err("Google refuse l'identifiant du client : vérifie l'ID et le code secret dans Paramètres › Google Agenda.".into())
        }
        Ok(TokenError { error }) => Err(format!("Google a refusé la connexion ({error}).")),
        Err(_) => Err(format!("Google a refusé la connexion (HTTP {status}).")),
    }
}

/// Le jeton d'accès : celui en mémoire s'il vaut encore, sinon un nouveau, demandé avec le jeton de renouvellement.
pub(crate) fn access_token(app: &AppHandle) -> Result<String, String> {
    let session = app.state::<GoogleSession>();
    if let Some((token, until)) = session.0.lock().map_err(|e| e.to_string())?.as_ref() {
        if Instant::now() < *until {
            return Ok(token.clone());
        }
    }
    let client: Client = vault_read(CLIENT_KEY)?.ok_or("Google n'est pas configuré.")?;
    let token: Token = vault_read(TOKEN_KEY)?.ok_or("Cockpit n'est pas connecté à Google.")?;
    let fresh = token_request(&[
        ("client_id", &client.client_id),
        ("client_secret", &client.client_secret),
        ("refresh_token", &token.refresh_token),
        ("grant_type", "refresh_token"),
    ])
    .inspect_err(|message| {
        // Jeton révoqué ou expiré : il ne servira plus, on l'oublie (l'interface propose de se reconnecter).
        if message == RECONNECT {
            let _ = vault_remove(TOKEN_KEY);
        }
    })?;
    let until = Instant::now() + Duration::from_secs(fresh.expires_in.saturating_sub(60));
    *session.0.lock().map_err(|e| e.to_string())? = Some((fresh.access_token.clone(), until));
    Ok(fresh.access_token)
}

/// Un appel en lecture à l'API Google Agenda.
fn api_get<T: DeserializeOwned>(app: &AppHandle, path: &str, query: &[(&str, &str)]) -> Result<T, String> {
    let token = access_token(app)?;
    let mut request = agent().get(format!("{API}{path}")).header("Authorization", format!("Bearer {token}"));
    for (key, value) in query {
        request = request.query(*key, *value);
    }
    let mut response = request.call().map_err(network)?;
    let status = response.status().as_u16();
    match status {
        200 => response.body_mut().read_json::<T>().map_err(|e| format!("Réponse de Google illisible : {e}")),
        401 => {
            if let Ok(mut session) = app.state::<GoogleSession>().0.lock() {
                *session = None;
            }
            Err(RECONNECT.into())
        }
        403 => Err("Google refuse l'accès à l'agenda : l'API Google Calendar est-elle activée dans le projet ?".into()),
        _ => Err(format!("Google Agenda a répondu une erreur (HTTP {status}).")),
    }
}

fn list_calendars(app: &AppHandle) -> Result<Vec<GoogleCalendar>, String> {
    let mut all = Vec::new();
    let mut page_token: Option<String> = None;
    loop {
        let mut query = vec![
            ("minAccessRole", "reader"),
            ("maxResults", "250"),
            ("fields", "items(id,summary,summaryOverride,backgroundColor,primary,selected,hidden,accessRole),nextPageToken"),
        ];
        if let Some(token) = page_token.as_deref() {
            query.push(("pageToken", token));
        }
        let page: CalendarPage = api_get(app, "/users/me/calendarList", &query)?;
        all.extend(page.items);
        match page.next_page_token {
            Some(next) => page_token = Some(next),
            None => break,
        }
    }
    Ok(keep_calendars(all))
}

// ─── Serveur local d'un instant ─────────────────────────────────────────────

const PAGE_DONE: &str = "<!doctype html><meta charset=utf-8><title>Cockpit</title>\
<body style=\"font-family:system-ui;margin:20vh auto;max-width:28rem;text-align:center;color:#222\">\
<h1 style=\"font-size:1.4rem\">Cockpit est connecté à Google</h1><p>Tu peux fermer cet onglet.</p>";
const PAGE_REFUSED: &str = "<!doctype html><meta charset=utf-8><title>Cockpit</title>\
<body style=\"font-family:system-ui;margin:20vh auto;max-width:28rem;text-align:center;color:#222\">\
<h1 style=\"font-size:1.4rem\">Connexion annulée</h1><p>Cockpit n'a pas été autorisé. Tu peux fermer cet onglet.</p>";

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.flush();
}

/// Attend le retour de Google sur le serveur local : le code d'autorisation, ou un refus.
fn wait_for_code(listener: &TcpListener, state: &str) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + CONNECT_TIMEOUT;
    while Instant::now() < deadline {
        let mut stream = match listener.accept() {
            Ok((stream, _)) => stream,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
        let mut line = String::new();
        if BufReader::new(&stream).read_line(&mut line).is_err() {
            continue;
        }
        match parse_redirect(&line) {
            Redirect::Code { code, state: returned } if returned == state => {
                respond(&mut stream, "200 OK", PAGE_DONE);
                return Ok(code);
            }
            Redirect::Code { .. } => respond(&mut stream, "400 Bad Request", PAGE_REFUSED),
            Redirect::Refused(_) => {
                respond(&mut stream, "200 OK", PAGE_REFUSED);
                return Err("Connexion annulée dans le navigateur.".into());
            }
            Redirect::Other => respond(&mut stream, "404 Not Found", ""),
        }
    }
    Err("Temps écoulé : la connexion à Google n'a pas été terminée dans le navigateur.".into())
}

fn connect(app: &AppHandle) -> Result<GoogleStatus, String> {
    let client: Client = vault_read(CLIENT_KEY)?.ok_or("Colle d'abord l'ID et le code secret du client.")?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Serveur local impossible : {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let verifier = random_token(48)?;
    let state = random_token(24)?;
    let url = auth_url(&client.client_id, &redirect_uri, &pkce_challenge(&verifier), &state);
    app.opener().open_url(url, None::<&str>).map_err(|e| format!("Navigateur impossible à ouvrir : {e}"))?;

    let code = wait_for_code(&listener, &state)?;
    let token = token_request(&[
        ("client_id", &client.client_id),
        ("client_secret", &client.client_secret),
        ("code", &code),
        ("code_verifier", &verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", &redirect_uri),
    ])?;
    let refresh_token = token
        .refresh_token
        .ok_or("Google n'a pas donné de jeton de renouvellement : retire l'accès de Cockpit dans ton compte Google, puis réessaie.")?;
    let until = Instant::now() + Duration::from_secs(token.expires_in.saturating_sub(60));
    *app.state::<GoogleSession>().0.lock().map_err(|e| e.to_string())? = Some((token.access_token, until));
    vault_write(TOKEN_KEY, &Token { refresh_token, account: None, scopes: token.scope })?;

    // Le compte connecté : l'identifiant de l'agenda principal est l'adresse e-mail.
    let account = list_calendars(app).ok().and_then(|calendars| calendars.into_iter().find(|c| c.primary).map(|c| c.id));
    if let Some(token) = vault_read::<Token>(TOKEN_KEY)? {
        vault_write(TOKEN_KEY, &Token { account, ..token })?;
    }
    status()
}

// ─── Commandes ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStatus {
    /// L'ID et le code secret du client sont dans le coffre.
    configured: bool,
    connected: bool,
    account: Option<String>,
    /// Le début de l'ID du client, pour le reconnaître (jamais le code secret).
    client_hint: Option<String>,
    /// Le droit sur le dossier caché de Drive (synchronisation) a été donné.
    sync_allowed: bool,
    /// Le droit de modifier les événements a été donné (après la 2.7.0 ; sinon : se reconnecter).
    write_allowed: bool,
}

fn status() -> Result<GoogleStatus, String> {
    let client: Option<Client> = vault_read(CLIENT_KEY)?;
    let token: Option<Token> = vault_read(TOKEN_KEY)?;
    let granted = |wanted: &str| token.as_ref().and_then(|t| t.scopes.as_deref()).is_some_and(|s| s.split(' ').any(|scope| scope == wanted));
    let (sync_allowed, write_allowed) = (granted(DRIVE_SCOPE), granted(EVENTS_SCOPE));
    Ok(GoogleStatus {
        sync_allowed,
        write_allowed,
        configured: client.is_some(),
        connected: token.is_some(),
        account: token.and_then(|t| t.account),
        client_hint: client.map(|c| c.client_id.chars().take(12).collect()),
    })
}

/// Lance le travail bloquant (réseau, coffre) hors du fil de l'interface.
async fn blocking<T: Send + 'static>(job: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn google_status() -> Result<GoogleStatus, String> {
    blocking(status).await
}

/// Enregistre l'ID et le code secret du client. Changer de client oublie la connexion d'avant.
#[tauri::command]
pub async fn google_set_client(app: AppHandle, client_id: String, client_secret: String) -> Result<GoogleStatus, String> {
    blocking(move || {
        let client_id = client_id.trim().to_string();
        let client_secret = client_secret.trim().to_string();
        if !client_id.ends_with(".apps.googleusercontent.com") || client_id.contains(char::is_whitespace) {
            return Err("L'ID du client se termine par « .apps.googleusercontent.com ».".into());
        }
        if client_secret.is_empty() || client_secret.contains(char::is_whitespace) {
            return Err("Colle le code secret du client.".into());
        }
        vault_write(CLIENT_KEY, &Client { client_id, client_secret })?;
        vault_remove(TOKEN_KEY)?;
        *app.state::<GoogleSession>().0.lock().map_err(|e| e.to_string())? = None;
        status()
    })
    .await
}

/// Ouvre le navigateur sur la page de Google et attend l'autorisation (5 minutes au plus).
#[tauri::command]
pub async fn google_connect(app: AppHandle) -> Result<GoogleStatus, String> {
    blocking(move || connect(&app)).await
}

/// Se déconnecter : le jeton est révoqué chez Google et retiré du coffre. L'ID du client reste.
/// Sur le téléphone, le jeton est celui du PC : il est seulement oublié, sans être révoqué.
#[tauri::command]
pub async fn google_disconnect(app: AppHandle) -> Result<GoogleStatus, String> {
    blocking(move || {
        if cfg!(desktop) {
            if let Some(token) = vault_read::<Token>(TOKEN_KEY)? {
                let _ = agent().post(REVOKE_URL).send_form([("token", token.refresh_token.as_str())]);
            }
        }
        vault_remove(TOKEN_KEY)?;
        *app.state::<GoogleSession>().0.lock().map_err(|e| e.to_string())? = None;
        status()
    })
    .await
}

/// Oublie tout : connexion et identifiants du client.
#[tauri::command]
pub async fn google_forget(app: AppHandle) -> Result<GoogleStatus, String> {
    google_disconnect(app).await?;
    blocking(|| {
        vault_remove(CLIENT_KEY)?;
        status()
    })
    .await
}

#[tauri::command]
pub async fn google_calendars(app: AppHandle) -> Result<Vec<GoogleCalendar>, String> {
    blocking(move || list_calendars(&app)).await
}

/// Les événements d'un agenda entre deux instants (RFC 3339), récurrences dépliées, heures dans `time_zone`.
#[tauri::command]
pub async fn google_events(
    app: AppHandle,
    calendar_id: String,
    time_min: String,
    time_max: String,
    time_zone: String,
) -> Result<Vec<GoogleEvent>, String> {
    blocking(move || {
        let path = format!("/calendars/{}/events", encode(&calendar_id));
        let mut all = Vec::new();
        let mut page_token: Option<String> = None;
        loop {
            let mut query = vec![
                ("singleEvents", "true"),
                ("orderBy", "startTime"),
                ("timeMin", time_min.as_str()),
                ("timeMax", time_max.as_str()),
                ("timeZone", time_zone.as_str()),
                ("maxResults", "2500"),
                (
                    "fields",
                    "items(id,status,summary,location,description,start,end,htmlLink,recurringEventId,extendedProperties/private,attendees(self,responseStatus)),nextPageToken",
                ),
            ];
            if let Some(token) = page_token.as_deref() {
                query.push(("pageToken", token));
            }
            let page: EventPage = api_get(&app, &path, &query)?;
            all.extend(page.items);
            match page.next_page_token {
                Some(next) => page_token = Some(next),
                None => break,
            }
        }
        Ok(keep_events(all))
    })
    .await
}

/// Ouvre un événement dans Google Agenda (navigateur). Seulement une adresse de Google Agenda.
#[tauri::command]
pub fn google_open_link(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://www.google.com/calendar/") {
        return Err("Adresse refusée.".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

// ─── Écriture (après la 2.7.0) ──────────────────────────────────────────────

/// Une écriture refusée se dit par son genre, avant « | » : `offline` (réessayer plus tard), `denied` (droit
/// manquant : se reconnecter, ou agenda en lecture seule) ou `error` (Google refuse cette modification).
fn write_error(kind: &str, message: impl Into<String>) -> String {
    format!("{kind}|{}", message.into())
}

/// Un appel en écriture (POST, PATCH, DELETE). `gone` : les codes qui veulent dire « déjà fait » (un
/// second envoi d'une création, d'une suppression) et valent un succès.
fn api_write(app: &AppHandle, method: &str, path: &str, body: Option<&serde_json::Value>, gone: &[u16]) -> Result<Option<serde_json::Value>, String> {
    let token = access_token(app).map_err(|message| {
        let kind = if message.starts_with("Google injoignable") { "offline" } else { "denied" };
        write_error(kind, message)
    })?;
    let url = format!("{API}{path}");
    let auth = format!("Bearer {token}");
    let result = match (method, body) {
        ("POST", Some(body)) => agent().post(&url).header("Authorization", &auth).send_json(body),
        ("PATCH", Some(body)) => agent().patch(&url).header("Authorization", &auth).send_json(body),
        ("DELETE", _) => agent().delete(&url).header("Authorization", &auth).call(),
        _ => return Err(write_error("error", "Écriture inconnue.")),
    };
    let mut response = result.map_err(|e| write_error("offline", network(e)))?;
    let status = response.status().as_u16();
    if gone.contains(&status) {
        return Ok(None);
    }
    match status {
        200 | 201 => Ok(response.body_mut().read_json::<serde_json::Value>().ok()),
        204 => Ok(None),
        401 => {
            if let Ok(mut session) = app.state::<GoogleSession>().0.lock() {
                *session = None;
            }
            Err(write_error("denied", RECONNECT))
        }
        403 => Err(write_error("denied", "Google refuse la modification : autorise-la dans Paramètres › Google Agenda, ou l'agenda est en lecture seule.")),
        _ => {
            let text = response.body_mut().read_to_string().unwrap_or_default();
            Err(write_error("error", format!("Google Agenda a refusé la modification (HTTP {status}). {}", text.chars().take(200).collect::<String>())))
        }
    }
}

/// Crée un événement, avec l'identifiant choisi par Cockpit : un second envoi (l'autre appareil) ne le
/// double pas (409 : il existe déjà).
#[tauri::command]
pub async fn google_event_insert(app: AppHandle, calendar_id: String, event: serde_json::Value) -> Result<(), String> {
    blocking(move || api_write(&app, "POST", &format!("/calendars/{}/events", encode(&calendar_id)), Some(&event), &[409]).map(|_| ())).await
}

/// Change un événement (ou toute une série, par son identifiant) : seulement les champs envoyés.
#[tauri::command]
pub async fn google_event_patch(app: AppHandle, calendar_id: String, event_id: String, patch: serde_json::Value) -> Result<(), String> {
    blocking(move || {
        let path = format!("/calendars/{}/events/{}", encode(&calendar_id), encode(&event_id));
        api_write(&app, "PATCH", &path, Some(&patch), &[]).map(|_| ())
    })
    .await
}

/// Supprime un événement (ou toute une série) ; déjà supprimé, c'est fait (404, 410).
#[tauri::command]
pub async fn google_event_delete(app: AppHandle, calendar_id: String, event_id: String) -> Result<(), String> {
    blocking(move || {
        let path = format!("/calendars/{}/events/{}", encode(&calendar_id), encode(&event_id));
        api_write(&app, "DELETE", &path, None, &[404, 410]).map(|_| ())
    })
    .await
}

/// Change l'heure de toute une série : le premier événement de la série garde son jour, prend les nouvelles
/// heures (`HH:MM`) ; Google les reporte sur chaque occurrence.
#[tauri::command]
pub async fn google_series_retime(
    app: AppHandle,
    calendar_id: String,
    series_id: String,
    start_time: String,
    end_time: String,
    time_zone: String,
) -> Result<(), String> {
    blocking(move || {
        let path = format!("/calendars/{}/events/{}", encode(&calendar_id), encode(&series_id));
        let master: serde_json::Value = api_get(&app, &path, &[("fields", "start,end")]).map_err(|message| {
            let kind = if message.starts_with("Google injoignable") { "offline" } else { "error" };
            write_error(kind, message)
        })?;
        let day = master["start"]["dateTime"].as_str().and_then(|s| s.get(..10)).ok_or_else(|| write_error("error", "Cette série n'a pas d'heure."))?;
        let patch = serde_json::json!({
            "start": { "dateTime": format!("{day}T{start_time}:00"), "timeZone": time_zone },
            "end": { "dateTime": format!("{day}T{end_time}:00"), "timeZone": time_zone },
        });
        api_write(&app, "PATCH", &path, Some(&patch), &[]).map(|_| ())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_suit_la_rfc_7636() {
        // Exemple de l'annexe B de la RFC 7636.
        assert_eq!(pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        let token = random_token(48).unwrap();
        assert_eq!(token.len(), 64);
        assert!(token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn construit_l_adresse_d_autorisation() {
        let url = auth_url("abc.apps.googleusercontent.com", "http://127.0.0.1:5000", "defi", "etat");
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?client_id=abc.apps.googleusercontent.com&"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A5000"));
        assert!(url.contains(
            "scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.appdata"
        ));
        assert!(url.contains("include_granted_scopes=true"));
        assert!(url.contains("code_challenge_method=S256") && url.contains("access_type=offline"));
        assert_eq!(encode("fr.french#holiday@group.v.calendar.google.com"), "fr.french%23holiday%40group.v.calendar.google.com");
    }

    #[test]
    fn lit_le_retour_de_google() {
        assert_eq!(
            parse_redirect("GET /?state=abc&code=4%2F0Ab_x&scope=https://x HTTP/1.1\r\n"),
            Redirect::Code { code: "4/0Ab_x".into(), state: "abc".into() }
        );
        assert_eq!(parse_redirect("GET /?error=access_denied&state=abc HTTP/1.1"), Redirect::Refused("access_denied".into()));
        assert_eq!(parse_redirect("GET /favicon.ico HTTP/1.1"), Redirect::Other);
        assert_eq!(parse_redirect(""), Redirect::Other);
    }

    #[test]
    fn garde_les_evenements_a_montrer() {
        let page: EventPage = serde_json::from_str(
            r#"{"items":[
                {"id":"a","summary":"Dentiste","location":"Lyon","description":"Apporter la carte","start":{"dateTime":"2026-11-27T10:00:00+01:00"},"end":{"dateTime":"2026-11-27T11:00:00+01:00"},"htmlLink":"https://www.google.com/calendar/event?eid=a","recurringEventId":"serie","extendedProperties":{"private":{"cockpitProjectId":"p1","cockpitSubjectId":""}}},
                {"id":"b","start":{"date":"2026-11-28"},"end":{"date":"2026-11-29"}},
                {"id":"c","status":"cancelled","summary":"Annulé","start":{"date":"2026-11-28"},"end":{"date":"2026-11-29"}},
                {"id":"d","summary":"Refusé","start":{"date":"2026-11-28"},"end":{"date":"2026-11-29"},"attendees":[{"self":true,"responseStatus":"declined"}]},
                {"id":"e","summary":"Accepté","start":{"date":"2026-11-30"},"end":{"date":"2026-12-01"},"attendees":[{"self":true,"responseStatus":"accepted"},{"responseStatus":"declined"}]}
            ]}"#,
        )
        .unwrap();
        let events = keep_events(page.items);
        assert_eq!(events.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(), ["a", "b", "e"]);
        assert_eq!(events[0].start, "2026-11-27T10:00:00+01:00");
        assert!(!events[0].all_day && events[1].all_day);
        assert_eq!(events[1].title, "(Sans titre)");
        assert_eq!(events[0].notes.as_deref(), Some("Apporter la carte"));
        assert_eq!(events[0].series_id.as_deref(), Some("serie"));
        assert_eq!((events[0].project_id.as_deref(), events[0].subject_id.as_deref()), (Some("p1"), None));

        let calendars: CalendarPage = serde_json::from_str(
            r##"{"items":[
                {"id":"moi@gmail.com","summary":"moi@gmail.com","summaryOverride":"Perso","backgroundColor":"#9fe1e7","primary":true,"selected":true,"accessRole":"owner"},
                {"id":"x@group.calendar.google.com","summary":"Cours","selected":false},
                {"id":"y","summary":"Caché","hidden":true}
            ]}"##,
        )
        .unwrap();
        let calendars = keep_calendars(calendars.items);
        assert_eq!(calendars.len(), 2);
        assert_eq!(calendars[0].name, "Perso");
        assert!(calendars[0].primary && !calendars[1].selected);
        assert!(calendars[0].writable && !calendars[1].writable);
    }
}
