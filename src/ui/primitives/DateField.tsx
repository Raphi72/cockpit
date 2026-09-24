import { DATE_INPUT_BOUNDS } from '@/core/dates';
import { fieldClass } from './Input';

type DateFieldProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
  'aria-label': string;
};

/** Champ date de formulaire (sélecteur natif, borné à des années sur 4 chiffres). */
export function DateField({ value, onChange, className = '', ...aria }: DateFieldProps) {
  return (
    <input
      type="date"
      {...DATE_INPUT_BOUNDS}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={`tnum h-9 max-w-[200px] ${fieldClass} ${value ? '' : 'text-ink-3'} ${className}`}
      {...aria}
    />
  );
}
