import type { ReactNode } from 'react';

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
};

/** Case à cocher carrée avec son libellé (les tâches, elles, ont leur case ronde). */
export function Checkbox({ checked, onChange, children }: CheckboxProps) {
  return (
    <label className="flex cursor-default items-center gap-2.5 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 rounded-sm accent-[var(--accent)]"
      />
      {children}
    </label>
  );
}
