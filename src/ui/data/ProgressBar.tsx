/** Barre fine (4 px) avec le pourcentage à côté. */
export function ProgressBar({ percent, tone = 'default' }: { percent: number; tone?: 'default' | 'success' }) {
  return (
    <span className="flex items-center gap-2.5 text-meta text-ink-3">
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-active">
        <span
          className={`block h-full rounded-full ${tone === 'success' ? 'bg-success' : 'bg-ink-2'}`}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </span>
      <span className="tnum w-9 text-right">{percent} %</span>
    </span>
  );
}
