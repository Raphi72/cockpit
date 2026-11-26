import { useSaveSetting, useSetting } from '@/domains/settings/hooks';
import { SETTINGS } from '@/domains/settings/model';
import { Section } from '@/ui/layout/Section';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { playChime } from '../sounds';

function Hint({ children }: { children: string }) {
  return <p className="mt-1 mb-4 pl-[26px] text-meta text-ink-3">{children}</p>;
}

/** Paramètres › Compagnon : écran du matin, célébrations, sons. */
export function CompanionSettings() {
  const { data: morning } = useSetting(SETTINGS.morningScreen);
  const { data: celebrations } = useSetting(SETTINGS.celebrations);
  const { data: sounds } = useSetting(SETTINGS.sounds);
  const saveMorning = useSaveSetting(SETTINGS.morningScreen);
  const saveCelebrations = useSaveSetting(SETTINGS.celebrations);
  const saveSounds = useSaveSetting(SETTINGS.sounds);
  if (morning === undefined || celebrations === undefined || sounds === undefined) return null;
  return (
    <Section title="Compagnon" meta="F : mode focus · Ctrl Maj E : mini-fenêtre « En ce moment »">
      <Checkbox checked={morning} onChange={(checked) => saveMorning.mutate(checked)}>
        Écran du matin
      </Checkbox>
      <Hint>À la première ouverture du jour, avant midi : la journée en une phrase, le premier bloc, le devoir et les habitudes du jour.</Hint>
      <Checkbox checked={celebrations} onChange={(checked) => saveCelebrations.mutate(checked)}>
        Petites célébrations
      </Checkbox>
      <Hint>Un mot discret quand la journée est bouclée, qu’une série atteint un palier ou qu’un objectif est atteint.</Hint>
      <Checkbox
        checked={sounds}
        onChange={(checked) => {
          saveSounds.mutate(checked);
          if (checked) playChime('block');
        }}
      >
        Sons
      </Checkbox>
      <Hint>Quelques notes douces à la fin d’un bloc et d’un tour de Pomodoro.</Hint>
    </Section>
  );
}
