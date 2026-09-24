import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-block min-w-[18px] rounded-sm border border-line bg-elevated px-[5px] py-[3px] text-center font-sans text-[11px] leading-none font-medium text-ink-3">
      {children}
    </kbd>
  );
}
