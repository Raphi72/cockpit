export const paletteKeys = [
  'slate',
  'blue',
  'violet',
  'pink',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
] as const;

export type PaletteKey = (typeof paletteKeys)[number];

/** Nom de chaque couleur, pour les choix au clavier et les lecteurs d’écran. */
export const PALETTE_NAMES: Record<PaletteKey, string> = {
  slate: 'Ardoise',
  blue: 'Bleu',
  violet: 'Violet',
  pink: 'Rose',
  red: 'Rouge',
  orange: 'Orange',
  amber: 'Ambre',
  green: 'Vert',
  teal: 'Turquoise',
};

/** Pastille de 8 px : la seule forme sous laquelle les couleurs de type apparaissent. */
export function ColorDot({ color }: { color: PaletteKey }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: `var(--p-${color})` }}
    />
  );
}
