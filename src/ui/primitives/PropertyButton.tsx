import { ChevronDown } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

type PropertyButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `field` : encadré, dans un formulaire. `inline` : ressemble à du texte, dans une fiche. */
  variant?: 'field' | 'inline';
  placeholder?: string;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

/** Déclencheur d'un menu de choix (statut, type, client…), affiché comme une valeur. */
export function PropertyButton({
  variant = 'inline',
  placeholder = 'Choisir',
  children,
  className = '',
  ...props
}: PropertyButtonProps) {
  const base =
    variant === 'field'
      ? 'h-9 w-full rounded-md border border-line-strong bg-elevated px-3 hover:border-ink-3 data-[state=open]:border-accent data-[state=open]:ring-3 data-[state=open]:ring-accent-soft'
      : 'h-8 w-full rounded-md px-2 -mx-2 hover:bg-hover data-[state=open]:bg-hover';

  return (
    <button
      type="button"
      className={`flex items-center gap-2 text-left outline-none transition-[background-color,border-color] duration-[120ms] ease-soft focus-visible:ring-2 focus-visible:ring-accent-soft ${base} ${className}`}
      {...props}
    >
      {children ?? <span className="text-ink-3">{placeholder}</span>}
      {variant === 'field' && <ChevronDown className="ml-auto size-4 shrink-0 text-ink-3" strokeWidth={1.75} />}
    </button>
  );
}
