import { useSaveSetting, useSetting } from '@/domains/settings/hooks';
import { Section } from '@/ui/layout/Section';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { useAutostart, useSetAutostart } from '../hooks';
import { KEEP_IN_TRAY } from '../model';

/** Paramètres › Démarrage et fermeture : lancer Cockpit avec Windows, et le garder ouvert à la fermeture. */
export function PresenceSettings() {
  const { data: autostart } = useAutostart();
  const setAutostart = useSetAutostart();
  const { data: keepInTray } = useSetting(KEEP_IN_TRAY);
  const saveKeepInTray = useSaveSetting(KEEP_IN_TRAY);
  if (!autostart || keepInTray === undefined) return null;

  return (
    <Section title="Démarrage et fermeture">
      <Checkbox
        checked={autostart.enabled}
        disabled={!autostart.available || setAutostart.isPending}
        onChange={(checked) => setAutostart.mutate(checked)}
      >
        Lancer Cockpit au démarrage de Windows
      </Checkbox>
      <p className="mt-1.5 pl-[26px] text-meta text-ink-3">
        {autostart.available
          ? 'Discrètement : il attend dans la zone de notification, sans ouvrir de fenêtre.'
          : 'Ce réglage n’existe que dans l’application installée.'}
      </p>
      <div className="mt-5">
        <Checkbox checked={keepInTray} onChange={(checked) => saveKeepInTray.mutate(checked)}>
          Garder Cockpit ouvert quand je ferme la fenêtre
        </Checkbox>
        <p className="mt-1.5 pl-[26px] text-meta text-ink-3">
          Il reste dans la zone de notification, près de l’horloge, et les rappels continuent d’arriver. Pour le
          quitter : clic droit sur son icône, puis Quitter.
        </p>
      </div>
    </Section>
  );
}
