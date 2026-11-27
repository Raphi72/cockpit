import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { version } from '../../../package.json';
import { isMobileApp } from '@/core/platform';

/**
 * Mises à jour par GitHub (src-tauri/src/update.rs). Le réseau est côté Rust ; ici, seulement les appels.
 * Rien dans le navigateur de développement ni dans l'app de développement (`tauri dev`).
 */
export type UpdateInfo = { version: string; notes: string | null };

/** La version de cette appli. */
export const APP_VERSION: string = version;

export function updatesAvailable(): boolean {
  return isTauri() && !import.meta.env.DEV;
}

/** PC : la mise à jour déjà téléchargée, prête à installer. */
export function pendingUpdate(): Promise<UpdateInfo | null> {
  return invoke<UpdateInfo | null>('update_pending');
}

/** Cherche une nouvelle version (le PC la télécharge aussitôt). `null` s'il n'y en a pas. */
export function checkUpdate(): Promise<UpdateInfo | null> {
  return invoke<UpdateInfo | null>('update_check');
}

/** PC : installe la mise à jour prête, puis Cockpit redémarre. */
export function installUpdate(): Promise<void> {
  return invoke('update_install');
}

type AndroidBridge = { installApk?: (path: string) => void };

/** Téléphone : télécharge l'APK, puis ouvre l'écran « Installer » d'Android (à confirmer). */
export async function downloadAndOpenInstaller(): Promise<void> {
  const path = await invoke<string>('update_download');
  const bridge = (window as { CockpitAndroid?: AndroidBridge }).CockpitAndroid;
  if (!bridge?.installApk) throw new Error('Installation impossible sur cet appareil.');
  bridge.installApk(path);
}

/** PC : une mise à jour vient d'être téléchargée en arrière-plan. */
export function onUpdateReady(handler: (info: UpdateInfo) => void): Promise<UnlistenFn> {
  return listen<UpdateInfo>('cockpit:update-ready', (event) => handler(event.payload));
}

/** Le téléphone se met à jour par l'écran « Installer » d'Android ; le PC, par l'installateur signé. */
export const updatesByApk = isMobileApp;
