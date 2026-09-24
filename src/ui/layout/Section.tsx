import type { ReactNode } from 'react';

type SectionProps = {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
};

export function Section({ title, meta, children }: SectionProps) {
  return (
    <section className="mb-16">
      <div className="mb-3.5 flex items-baseline gap-2.5">
        <h2 className="font-semibold">{title}</h2>
        {meta && <span className="text-meta text-ink-3">{meta}</span>}
      </div>
      {children}
    </section>
  );
}
