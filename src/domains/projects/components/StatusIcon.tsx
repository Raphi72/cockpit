import { Circle, CircleCheck, CircleDashed, CircleDot, CirclePause, CircleX, type LucideIcon } from 'lucide-react';
import type { ProjectStatus } from '../model';

const ICONS: Record<ProjectStatus, { icon: LucideIcon; className: string }> = {
  proposal: { icon: CircleDashed, className: 'text-ink-3' },
  planned: { icon: Circle, className: 'text-ink-3' },
  active: { icon: CircleDot, className: 'text-accent' },
  on_hold: { icon: CirclePause, className: 'text-warning' },
  done: { icon: CircleCheck, className: 'text-success' },
  cancelled: { icon: CircleX, className: 'text-ink-3' },
};

export function StatusIcon({ status }: { status: ProjectStatus }) {
  const { icon: Icon, className } = ICONS[status];
  return <Icon aria-hidden className={`size-4 shrink-0 ${className}`} strokeWidth={1.75} />;
}
