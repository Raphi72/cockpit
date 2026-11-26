import { Check, Redo2, X } from 'lucide-react';
import { addDaysISO } from '@/core/dates';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { useReviewBlock } from '../hooks';
import { moduleIcon } from '../icons';
import type { BlockStatus, DayBlock } from '../model';

const VERDICTS: { value: BlockStatus | 'tomorrow'; label: string; icon: typeof Check }[] = [
  { value: 'done', label: 'Fait', icon: Check },
  { value: 'missed', label: 'Raté', icon: X },
  { value: 'tomorrow', label: 'Demain', icon: Redo2 },
];

/**
 * Bilan du soir : chaque bloc passé de la journée, marqué en un clic, fait, raté ou décalé à demain
 * (à la même heure, avec ses tâches). Les blocs déjà marqués restent là, et se changent en recliquant.
 */
export function ReviewDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; blocks: DayBlock[]; today: string }) {
  const review = useReviewBlock();
  const tomorrow = addDaysISO(props.today, 1);
  const left = props.blocks.filter((b) => b.status === 'planned').length;
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Bilan du soir"
      description={left > 0 ? `${left} bloc${left > 1 ? 's' : ''} à marquer.` : 'Tout est marqué. Bonne soirée !'}
    >
      <ul className="mt-4">
        {props.blocks.map((block) => {
          const Icon = moduleIcon(block.icon);
          return (
            <li key={block.id} className="flex min-h-11 items-center gap-3">
              <Icon className="size-4 shrink-0" style={{ color: `var(--p-${block.color})` }} strokeWidth={2} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{block.title}</span>
                <span className="tnum block text-meta text-ink-3">
                  {block.startsAt} – {block.endsAt}
                </span>
              </span>
              <span className="flex gap-1">
                {VERDICTS.map(({ value, label, icon: VerdictIcon }) => {
                  const selected = value === block.status;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => review.mutate({ block, verdict: value, tomorrow })}
                      className={
                        'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-meta transition-colors duration-[120ms] ease-soft ' +
                        (selected ? 'border-transparent bg-active font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink')
                      }
                    >
                      <VerdictIcon className="size-3.5" strokeWidth={2} />
                      {label}
                    </button>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>
      <DialogFooter>
        <Button variant="primary" onClick={() => props.onOpenChange(false)}>
          Fermer
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
