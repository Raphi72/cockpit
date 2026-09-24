import type { InputHTMLAttributes, Ref } from 'react';
import { Input } from './Input';

/** Champ de montant en euros : saisie libre (« 1500 », « 1 234,50 »), symbole € à droite. */
export function AmountField({
  className = '',
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <div className={`relative ${className}`}>
      <Input ref={ref} inputMode="decimal" className="tnum pr-8" {...props} />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3">€</span>
    </div>
  );
}
