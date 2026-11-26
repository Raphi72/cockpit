import { invoke, isTauri } from '@tauri-apps/api/core';
import type { GoogleStatus, RemoteCalendar, RemoteEvent } from './model';

/**
 * Les commandes natives de la connexion Google (src-tauri/src/google.rs). Hors de l'app (navigateur de
 * développement), Google n'existe pas : l'état dit « non disponible ».
 */
export const googleAvailable = (): boolean => isTauri();

const OFFLINE: GoogleStatus = { configured: false, connected: false, account: null, clientHint: null };

export function readGoogleStatus(): Promise<GoogleStatus> {
  return googleAvailable() ? invoke<GoogleStatus>('google_status') : Promise.resolve(OFFLINE);
}

export function saveGoogleClient(clientId: string, clientSecret: string): Promise<GoogleStatus> {
  return invoke<GoogleStatus>('google_set_client', { clientId, clientSecret });
}

export function connectGoogle(): Promise<GoogleStatus> {
  return invoke<GoogleStatus>('google_connect');
}

export function disconnectGoogle(): Promise<GoogleStatus> {
  return invoke<GoogleStatus>('google_disconnect');
}

export function forgetGoogle(): Promise<GoogleStatus> {
  return invoke<GoogleStatus>('google_forget');
}

export function fetchCalendars(): Promise<RemoteCalendar[]> {
  return invoke<RemoteCalendar[]>('google_calendars');
}

export function fetchEvents(calendarId: string, timeMin: string, timeMax: string, timeZone: string): Promise<RemoteEvent[]> {
  return invoke<RemoteEvent[]>('google_events', { calendarId, timeMin, timeMax, timeZone });
}

export function openGoogleLink(url: string): Promise<void> {
  return invoke('google_open_link', { url });
}
