import { PALETTE_NAMES, paletteKeys, type PaletteKey } from '@/ui/data/ColorDot';

/** Choix d'une couleur de la palette : une rangée de pastilles, la choisie entourée. Flèches au clavier. */
export function ColorChoice({ value, onChange, label }: { value: PaletteKey; onChange: (color: PaletteKey) => void; label: string }) {
  const move = (delta: number) => {
    const index = paletteKeys.indexOf(value);
    const next = paletteKeys[(index + delta + paletteKeys.length) % paletteKeys.length];
    if (next) onChange(next);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex h-9 items-center gap-1"
      onKeyDown={(e) => {
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
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(key)}
            className={
              'grid size-7 place-items-center rounded-full outline-none transition-colors duration-[120ms] ease-soft ' +
              'hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-soft ' +
              (selected ? 'ring-1 ring-line-strong' : '')
            }
          >
            <span className="size-3 rounded-full" style={{ backgroundColor: `var(--p-${key})` }} />
          </button>
        );
      })}
    </div>
  );
}
