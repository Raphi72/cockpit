import { useRef } from 'react';
import { PALETTE_NAMES, colorVar, isHexColor, paletteKeys, type AppColor } from '@/ui/data/ColorDot';

/** La teinte d'une clé de la palette, pour proposer une couleur libre de départ proche. */
const PALETTE_HEX: Record<string, string> = {
  slate: '#8b8d98',
  blue: '#3e7bfa',
  violet: '#8a63d2',
  pink: '#d6589a',
  red: '#dc5050',
  orange: '#e07b39',
  amber: '#d4a018',
  green: '#3aa56b',
  teal: '#2a9d9a',
};

/**
 * Choix d'une couleur : les pastilles de la palette (flèches au clavier), et une dernière pastille
 * « Autre couleur » qui ouvre la roue de couleurs du système pour n'importe quelle couleur.
 */
export function ColorChoice({ value, onChange, label }: { value: AppColor; onChange: (color: AppColor) => void; label: string }) {
  const picker = useRef<HTMLInputElement>(null);
  const custom = isHexColor(value);
  const move = (delta: number) => {
    const index = paletteKeys.indexOf(value as (typeof paletteKeys)[number]);
    const next = paletteKeys[(Math.max(index, 0) + delta + paletteKeys.length) % paletteKeys.length];
    if (next) onChange(next);
  };
  const swatch =
    'grid size-7 place-items-center rounded-full outline-none transition-colors duration-[120ms] ease-soft hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-soft ';
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex h-9 flex-wrap items-center gap-1 phone:h-auto phone:min-h-9 phone:py-1"
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {paletteKeys.map((key) => {
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={PALETTE_NAMES[key]}
            title={PALETTE_NAMES[key]}
            tabIndex={selected || (custom && key === paletteKeys[0]) ? 0 : -1}
            onClick={() => onChange(key)}
            className={swatch + (selected ? 'ring-1 ring-line-strong' : '')}
          >
            <span className="size-3 rounded-full" style={{ backgroundColor: colorVar(key) }} />
          </button>
        );
      })}
      <button
        type="button"
        role="radio"
        aria-checked={custom}
        aria-label="Autre couleur"
        title={custom ? `Autre couleur (${value})` : 'Autre couleur…'}
        onClick={() => picker.current?.click()}
        className={swatch + (custom ? 'ring-1 ring-line-strong' : '')}
      >
        <span
          className="size-3 rounded-full"
          style={{ background: custom ? value : 'conic-gradient(#dc5050, #d4a018, #3aa56b, #2a9d9a, #3e7bfa, #8a63d2, #d6589a, #dc5050)' }}
        />
      </button>
      <input
        ref={picker}
        type="color"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none size-0 opacity-0"
        value={custom ? value : (PALETTE_HEX[value] ?? '#3e7bfa')}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
