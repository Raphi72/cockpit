import type { ReactNode } from 'react';

/** Ligne « libellé : champ » d'un formulaire en grille (`grid-cols-[92px_minmax(0,1fr)]`). */
export function FormRow({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">
        {children}
        {error && <p className="mt-1.5 text-meta text-danger">{error}</p>}
      </div>
    </>
  );
}
