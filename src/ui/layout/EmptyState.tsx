import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
};

/** Une phrase, éventuellement une action : jamais d'illustration envahissante. */
export function EmptyState({ icon: Icon, title, children }: EmptyStateProps) {
  return (
    <div className="flex max-w-md flex-col items-start gap-2 py-6">
      <Icon className="mb-1 size-5 text-ink-3" strokeWidth={1.75} />
      <p className="font-medium">{title}</p>
      {children && <div className="text-ink-2">{children}</div>}
    </div>
  );
}
