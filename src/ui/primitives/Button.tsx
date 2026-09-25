import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-canvas hover:opacity-90',
  secondary: 'border border-line-strong bg-elevated text-ink hover:bg-hover',
  ghost: 'text-ink-2 hover:bg-hover hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
};

const kbdVariants: Record<Variant, string> = {
  primary: 'border-canvas/30 text-canvas/70',
  secondary: 'border-line text-ink-3',
  ghost: 'border-line text-ink-3',
  danger: 'border-white/40 text-white/80',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** `lg` : bouton et icône plus grands (en-tête des panneaux latéraux : supprimer, fermer). */
  size?: 'md' | 'lg';
  icon?: LucideIcon;
  /** Raccourci affiché dans le bouton (ex. « C », « Ctrl ↵ »). */
  shortcut?: string;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  shortcut,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={
        `inline-flex ${size === 'lg' ? 'h-10' : 'h-8'} shrink-0 items-center justify-center gap-1.5 rounded-md px-3 font-medium whitespace-nowrap ` +
        'transition-[background-color,opacity] duration-[120ms] ease-soft select-none ' +
        'disabled:pointer-events-none disabled:opacity-50 ' +
        (Icon && !children ? `${size === 'lg' ? 'w-10' : 'w-8'} px-0 ` : '') +
        `${variants[variant]} ${className}`
      }
      {...props}
    >
      {Icon && <Icon className={size === 'lg' ? 'size-5' : 'size-4'} strokeWidth={1.75} />}
      {children}
      {shortcut && (
        <kbd className={`ml-0.5 rounded-sm border px-[5px] py-[2px] font-sans text-[11px] leading-none font-medium ${kbdVariants[variant]}`}>
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
