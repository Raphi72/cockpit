import type { ReactNode } from 'react';

/** Ligne « libellé : valeur » des panneaux de propriétés (fiche projet, tâche). */
export function PropertyRow({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3 py-1">
      <span className="pt-1.5 text-meta text-ink-3">{label}</span>
      <div className="min-w-0">
        {children}
        {hint && <div className="pb-1 text-meta">{hint}</div>}
      </div>
    </div>
  );
}
