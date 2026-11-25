import type { SettingDef } from '@/domains/settings/model';

/**
 * « Toujours là » : Cockpit reste dans la zone de notification et se lance avec Windows.
 * La fenêtre, l'icône et l'inscription au démarrage sont natives (src-tauri/src/presence.rs) ;
 * ici, les réglages et ce qu'on en dit.
 */

/**
 * Fermer la fenêtre garde Cockpit dans la zone de notification (les rappels continuent d'arriver).
 * Lu aussi côté natif, à la fermeture : même clé que `KEEP_IN_TRAY_SETTING` dans presence.rs.
 */
export const KEEP_IN_TRAY: SettingDef<boolean> = { key: 'presence.keepInTray', fallback: true };

/**
 * Le démarrage avec Windows a déjà été décidé : activé d'office au premier lancement de l'app installée,
 * puis réglé dans Paramètres. Absent : jamais décidé. L'état réel, lui, est celui de Windows
 * (`AutostartState`) : il n'est pas recopié ici.
 */
export const AUTOSTART_DECIDED: SettingDef<boolean> = { key: 'presence.autostartDecided', fallback: false };

/** La première fermeture de la fenêtre a déjà été expliquée (notification « Cockpit reste ouvert »). */
export const TRAY_HINT_SHOWN: SettingDef<boolean> = { key: 'presence.trayHintShown', fallback: false };

/** Ce que Windows fera à l'ouverture de session (commande native `autostart_get`). */
export type AutostartState = {
  /** Faux en développement et dans le navigateur : le réglage n'existe que dans l'app installée. */
  available: boolean;
  enabled: boolean;
};

export const AUTOSTART_UNAVAILABLE: AutostartState = { available: false, enabled: false };

/** Vrai s'il faut activer le démarrage avec Windows d'office : app installée, et jamais décidé. */
export function shouldEnableAutostartByDefault(state: AutostartState, decided: boolean | null): boolean {
  return state.available && decided === null;
}

/** Notification envoyée la première fois que la fenêtre est fermée et que Cockpit reste ouvert. */
export const TRAY_HINT = {
  title: 'Cockpit reste ouvert',
  body: 'Il continue dans la zone de notification, près de l’horloge. Pour le quitter : clic droit sur son icône, puis Quitter.',
};
