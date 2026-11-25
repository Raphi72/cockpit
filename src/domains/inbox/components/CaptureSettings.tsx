import { Section } from '@/ui/layout/Section';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { useCaptureShortcut, useSetCaptureShortcut } from '../hooks';
import { CAPTURE_SHORTCUTS, NO_CAPTURE_SHORTCUT } from '../model';

/** Paramètres › Capture rapide : le raccourci global qui ouvre la petite fenêtre de capture. */
export function CaptureSettings() {
  const { shortcut, native } = useCaptureShortcut();
  const setShortcut = useSetCaptureShortcut();
  if (shortcut === undefined) return null;

  return (
    <Section title="Capture rapide">
      <ChoiceChips label="Raccourci de capture rapide" options={CAPTURE_SHORTCUTS} value={shortcut} onChange={(v) => setShortcut.mutate(v)} />
      <p className="mt-2.5 max-w-[640px] text-meta text-ink-3">
        Depuis n’importe quelle application, même quand Cockpit attend dans la zone de notification : une petite
        fenêtre s’ouvre, tu notes, Entrée, et c’est dans la boîte de réception.
      </p>
      {native && !native.available && (
        <p className="mt-1.5 text-meta text-ink-3">Le raccourci global n’existe que dans l’application.</p>
      )}
      {native?.available && !native.active && shortcut !== NO_CAPTURE_SHORTCUT && (
        <p className="mt-1.5 text-meta text-warning">
          Ce raccourci est déjà pris par une autre application : choisis-en un autre.
        </p>
      )}
    </Section>
  );
}
