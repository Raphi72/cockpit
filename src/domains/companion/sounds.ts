/**
 * Sons du compagnon (facultatifs, désactivés par défaut) : quelques notes douces, jouées par Web Audio,
 * sans fichier. Fin de bloc (et fin du temps d'une séance de focus) : deux notes qui montent ; fin d'un
 * tour de Pomodoro : trois ; fin de pause : deux qui descendent ; séance de focus finie avant l'heure : un
 * petit arpège.
 */
export type ChimeKind = 'block' | 'pomodoro' | 'break' | 'success';

const NOTES: Record<ChimeKind, number[]> = {
  block: [660, 880],
  pomodoro: [784, 988, 1175],
  break: [988, 740],
  success: [523, 659, 784, 1047],
};

let context: AudioContext | null = null;

export function playChime(kind: ChimeKind): void {
  try {
    context ??= new AudioContext();
    const audio = context;
    const start = audio.currentTime + 0.02;
    NOTES[kind].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const at = start + index * 0.18;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.75);
    });
  } catch {
    // Pas de son possible ici (pas de sortie audio) : on s'en passe.
  }
}
