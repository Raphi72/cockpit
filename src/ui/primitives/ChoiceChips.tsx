type Option<T extends string> = { value: T; label: string };

type ChoiceChipsProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
};

/** Choix exclusif en un clic parmi quelques options courtes. */
export function ChoiceChips<T extends string>({ options, value, onChange, label }: ChoiceChipsProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={
              'h-8 rounded-md border px-3 text-meta whitespace-nowrap transition-colors duration-[120ms] ease-soft ' +
              (selected
                ? 'border-line-strong bg-active font-medium text-ink'
                : 'border-line text-ink-2 hover:bg-hover hover:text-ink')
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
