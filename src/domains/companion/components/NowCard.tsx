import { Check } from 'lucide-react';
import { useMinutesOfDay } from '@/core/use-today';
import { useUpdateBlock } from '@/domains/day/hooks';
import { moduleIcon } from '@/domains/day/icons';
import { currentBlock, formatMinutes, nextBlock } from '@/domains/day/model';
import { colorVar } from '@/ui/data/ColorDot';
import { Button } from '@/ui/primitives/Button';
import { useTodayBlocks } from '../hooks';

/**
 * « En ce moment » sur le téléphone (le PC a sa mini-fenêtre) : le bloc en cours, ce qu'il en reste,
 * « Fait » ; puis le suivant. Rien s'il n'y a plus de bloc aujourd'hui.
 */
export function NowCard({ className = '' }: { className?: string }) {
  const minutes = useMinutesOfDay();
  const { blocks = [] } = useTodayBlocks();
  const update = useUpdateBlock();
  const current = currentBlock(blocks, minutes);
  const upcoming = nextBlock(blocks, minutes);
  if (!current && !upcoming) return null;
  const Icon = current ? moduleIcon(current.block.icon) : null;
  return (
    <section className={`rounded-xl bg-hover px-4 py-4 ${className}`}>
      {current && (
        <>
          <p className="text-meta text-ink-3">En ce moment</p>
          <div className="mt-1 flex items-center gap-2.5">
            {Icon && <Icon className="size-5 shrink-0" strokeWidth={1.75} style={{ color: colorVar(current.block.color) }} />}
            <span className="min-w-0 flex-1 truncate text-[17px] font-medium">{current.block.title}</span>
            {current.block.status === 'planned' && (
              <Button variant="secondary" icon={Check} onClick={() => update.mutate({ block: current.block, patch: { status: 'done' } })}>
                Fait
              </Button>
            )}
          </div>
          <p className="mt-1 text-ink-2">
            encore {formatMinutes(current.remaining)}, jusqu’à {current.block.endsAt === '24:00' ? 'minuit' : current.block.endsAt}
          </p>
        </>
      )}
      {upcoming && (
        <p className={current ? 'mt-3 border-t border-line pt-3 text-ink-2' : 'text-ink-2'}>
          {current ? 'Ensuite' : 'Prochain bloc'} : <span className="text-ink">{upcoming.title}</span> à {upcoming.startsAt}
        </p>
      )}
    </section>
  );
}
