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
