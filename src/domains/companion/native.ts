import { invoke, isTauri } from '@tauri-apps/api/core';

/** Fenêtre « En ce moment » : son nom côté natif (src-tauri/src/now.rs). */
export const NOW_WINDOW = 'now';

/** La mini-fenêtre a changé quelque chose (une tâche cochée) : la fenêtre principale relit tout. */
export const DATA_CHANGED_EVENT = 'cockpit:data-changed';

/**
 * Ouvre ou ferme la mini-fenêtre « En ce moment », toujours au-dessus des autres. Dans le navigateur
 * (`npm run dev`), une petite fenêtre de navigateur la remplace, pour l'essayer.
 */
export function toggleNowWindow(): void {
  if (isTauri()) {
    void invoke('now_toggle');
    return;
  }
  window.open('/now.html', 'cockpit-now', 'popup,width=320,height=140');
}

/** Le pont de l'appli Android (MainActivity.kt) : absent sur le PC et dans le navigateur. */
type AndroidBridge = { keepScreenOn: (on: boolean) => void };

/** Garder l'écran du téléphone allumé (séance de focus). Sans effet ailleurs. */
export function keepScreenOn(on: boolean): void {
  (window as { CockpitAndroid?: AndroidBridge }).CockpitAndroid?.keepScreenOn(on);
}

/** Plein écran natif pour le mode focus (dans l'app seulement). */
export async function setFullscreen(on: boolean): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow()
    .setFullscreen(on)
    .catch(() => undefined);
}
