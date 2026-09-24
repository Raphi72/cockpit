import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from 'react';

export const fieldClass =
  'w-full rounded-md border border-line-strong bg-elevated px-3 text-ink placeholder:text-ink-3 ' +
  'outline-none transition-[border-color,box-shadow] duration-[120ms] ease-soft ' +
  'focus:border-accent focus:ring-3 focus:ring-accent-soft';

export function Input({
  className = '',
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={`h-9 ${fieldClass} ${className}`} {...props} />;
}

/** Zone de texte qui grandit avec son contenu (field-sizing), sans script. */
export function Textarea({
  className = '',
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea
      ref={ref}
      className={`min-h-20 resize-none py-2 [field-sizing:content] ${fieldClass} ${className}`}
      {...props}
    />
  );
}
