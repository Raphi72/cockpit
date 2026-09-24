import { fieldClass } from './Input';

type TimeFieldProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
  'aria-label': string;
};

/** Champ heure de formulaire (sélecteur natif, 'HH:MM' sur 24 h). */
export function TimeField({ value, onChange, className = '', ...aria }: TimeFieldProps) {
  return (
    <input
      type="time"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={`date-quiet tnum h-9 max-w-[104px] ${fieldClass} ${value ? '' : 'text-ink-3'} ${className}`}
      {...aria}
    />
  );
}
