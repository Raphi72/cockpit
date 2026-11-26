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

/**
 * Une couleur choisie par l'utilisateur : une clé de la palette (adaptée au thème clair ou sombre), ou
 * une couleur libre '#rrggbb' (la même dans les deux thèmes).
 */
export type AppColor = PaletteKey | (string & {});

export function isPaletteKey(color: string): color is PaletteKey {
  return (paletteKeys as readonly string[]).includes(color);
}

export function isHexColor(color: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(color);
}

/** La valeur CSS d'une couleur : la variable de la palette, ou la couleur libre telle quelle (gris si inconnue). */
export function colorVar(color: AppColor | null | undefined): string {
  if (color && isHexColor(color)) return color;
  return `var(--p-${color && isPaletteKey(color) ? color : 'slate'})`;
}

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
export function ColorDot({ color }: { color: AppColor }) {
  return <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: colorVar(color) }} />;
}
