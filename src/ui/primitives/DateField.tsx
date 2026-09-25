import { DateButton } from './DatePicker';

type DateFieldProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Faux pour une date obligatoire : pas de « Retirer la date ». */
  clearable?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label': string;
};

/** Champ date de formulaire : la date lisible, et le sélecteur maison au clic (« demain », « +3j »…). */
export function DateField({ value, onChange, clearable = true, placeholder = 'Choisir une date', className = '', ...aria }: DateFieldProps) {
  return (
    <DateButton
      variant="field"
      value={value}
      onChange={onChange}
      clearable={clearable}
      placeholder={placeholder}
      className={`max-w-[200px] ${className}`}
      {...aria}
    />
  );
}
