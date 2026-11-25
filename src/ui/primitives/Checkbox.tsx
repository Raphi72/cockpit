import type { ReactNode } from 'react';

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
};

/** Case à cocher carrée avec son libellé (les tâches, elles, ont leur case ronde). */
export function Checkbox({ checked, onChange, disabled = false, children }: CheckboxProps) {
  return (
    <label className={`flex cursor-default items-center gap-2.5 select-none ${disabled ? 'text-ink-3' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 rounded-sm accent-[var(--accent)]"
      />
      {children}
    </label>
  );
}
