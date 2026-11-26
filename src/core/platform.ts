import { invoke, isTauri } from '@tauri-apps/api/core';

/**
 * La fenêtre est créée invisible (tauri.conf.json) et affichée après le premier rendu :
 * pas de flash blanc au démarrage. C'est le côté natif qui l'affiche (`window_ready`) : lancé avec
 * Windows, Cockpit reste caché dans la zone de notification.
 */
export function revealWindow(): void {
  if (!isTauri()) return;
  requestAnimationFrame(() => {
    void invoke('window_ready');
  });
}

/**
 * L'appli du téléphone (V2, étape 10) : construite pour Android (`tauri android`), ou essayée dans le
 * navigateur de développement avec `?mobile` dans l'adresse.
 */
export function isMobileApp(): boolean {
  return import.meta.env.TAURI_ENV_PLATFORM === 'android' || new URLSearchParams(window.location.search).has('mobile');
}

/** En production, le menu contextuel du navigateur (Actualiser, Imprimer…) n'a rien à faire dans l'app. */
export function disableBrowserContextMenu(): void {
  if (!import.meta.env.PROD) return;
  document.addEventListener('contextmenu', (event) => {
    const target = event.target as HTMLElement | null;
    const editable = target?.closest('input, textarea, [contenteditable="true"]');
    if (!editable) event.preventDefault();
  });
}
