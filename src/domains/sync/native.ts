import { invoke, isTauri } from '@tauri-apps/api/core';
import type { SyncTransport } from './service';

/** Commandes natives de la synchronisation (src-tauri/src/sync.rs) : clé, chiffrement, Google Drive. */
export const syncAvailable = (): boolean => isTauri();

export const nativeTransport: SyncTransport = {
  list: () => invoke<{ id: string; name: string }[]>('sync_list'),
  download: (id) => invoke<string>('sync_download', { id }),
  upload: (name, text) => invoke<void>('sync_upload', { name, text }),
};

export function hasSyncKey(): Promise<boolean> {
  return syncAvailable() ? invoke<boolean>('sync_has_key') : Promise.resolve(false);
}

export function createSyncKey(): Promise<string> {
  return invoke<string>('sync_create_key');
}

export function joinSync(code: string): Promise<void> {
  return invoke<void>('sync_join', { code });
}

export function showSyncCode(): Promise<string> {
  return invoke<string>('sync_show_code');
}

export function forgetSyncKey(): Promise<void> {
  return invoke<void>('sync_forget_key');
}

/** PC : le texte du code QR qui relie le téléphone (accès Google et clé). */
export function phoneLinkCode(): Promise<string> {
  return invoke<string>('link_code');
}

/** Téléphone : prendre l'accès Google et la clé du code QR lu (la clé est vérifiée sur Drive). */
export function applyPhoneLink(text: string): Promise<void> {
  return invoke<void>('link_apply', { text });
}

/** Téléphone : délier (rien n'est révoqué, le PC continue). */
export function forgetPhoneLink(): Promise<void> {
  return invoke<void>('link_forget');
}

/**
 * Téléphone : lire un code QR avec la caméra (plugin chargé seulement ici). `null` si la lecture est annulée.
 */
export async function scanQrCode(): Promise<string | null> {
  const scanner = await import('@tauri-apps/plugin-barcode-scanner');
  let permission = await scanner.checkPermissions();
  if (permission !== 'granted') permission = await scanner.requestPermissions();
  if (permission !== 'granted') {
    throw new Error('Cockpit a besoin de la caméra pour lire le code QR : autorise-la dans les réglages du téléphone.');
  }
  try {
    const scanned = await scanner.scan({ windowed: false, formats: [scanner.Format.QRCode] });
    return scanned.content;
  } catch {
    return null;
  }
}
