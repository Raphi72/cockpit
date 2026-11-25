import { nowTimestamp } from '@/core/dates';
import type { Db } from '@/core/db';
import { momentOf, nextRoundDay, roundFor } from './model';
import { runNotifications, type SendNotification } from './service';

/** Une vérification par minute : un rendez-vous est annoncé à la minute près. */
export const CHECK_EVERY_MS = 60_000;

/** Ce qui rythme les vérifications : appelle `onTick` chaque minute, et renvoie de quoi s'arrêter. */
export type Ticker = (onTick: () => void) => () => void;

/** Minuterie de l'interface : pour le navigateur de développement et les tests. */
export const intervalTicker: Ticker = (onTick) => {
  const timer = setInterval(onTick, CHECK_EVERY_MS);
  return () => clearInterval(timer);
};

export type SchedulerOptions = {
  /**
   * Dans l'app, le battement vient du côté natif : fenêtre cachée dans la zone de notification,
   * les minuteries de l'interface ralentissent et un rappel pourrait arriver en retard.
   */
  ticker?: Ticker;
  /**
   * Faux quand Cockpit a démarré caché, avec Windows : la première vérification n'est pas une
   * « ouverture » (le tableau de bord n'est pas à l'écran) mais une vérification ordinaire, qui
   * devient la tournée du matin dès 8 h, résumé compris.
   */
  atLaunch?: boolean;
};

/**
 * Vérifie les notifications au lancement, puis chaque minute tant que Cockpit tourne (fenêtre
 * réduite ou fermée comprises). Renvoie la fonction qui l'arrête.
 */
export function startNotificationScheduler(db: Db, send: SendNotification, options: SchedulerOptions = {}): () => void {
  const { ticker = intervalTicker, atLaunch = true } = options;
  let lastRoundDay: string | null = null;
  let running = false;
  let stopped = false;

  const check = async (atLaunch: boolean) => {
    if (running || stopped) return;
    running = true;
    try {
      const moment = momentOf(new Date());
      const round = roundFor(moment, lastRoundDay, atLaunch);
      lastRoundDay = nextRoundDay(moment, lastRoundDay, round);
      await runNotifications(db, { moment, round, now: nowTimestamp() }, send);
    } catch (error) {
      // Une vérification ratée ne doit rien bloquer : la suivante réessaiera.
      console.error('Notifications :', error);
    } finally {
      running = false;
    }
  };

  void check(atLaunch);
  const stopTicker = ticker(() => void check(false));
  return () => {
    stopped = true;
    stopTicker();
  };
}
