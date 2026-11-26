import { useState } from 'react';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { useApplyFill } from '../hooks';
import { moduleIcon } from '../icons';
import { formatMinutes, taskMinutes } from '../model';
import type { FillProposal } from '../service';
import { colorVar } from '@/ui/data/ColorDot';

/**
 * « Remplir les trous » : les blocs proposés dans les créneaux libres, chacun avec ses tâches. On
 * décoche ceux qu'on ne veut pas ; rien n'est posé avant « Poser ». « Annuler » dans le toast retire tout.
 */
function FillForm({ proposals, onDone }: { proposals: FillProposal[]; onDone: () => void }) {
  const apply = useApplyFill();
  const [kept, setKept] = useState<Set<number>>(() => new Set(proposals.map((_, i) => i)));
  const toggle = (index: number) =>
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  if (proposals.length === 0) {
    return (
      <>
        <p className="mt-4 text-ink-2">Rien à proposer : pas de créneau libre d’au moins 30 minutes, ou plus rien à caser.</p>
        <DialogFooter>
          <Button variant="primary" onClick={onDone}>
            Fermer
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <ul className="mt-4 flex flex-col gap-3">
        {proposals.map(({ input, tasks }, index) => {
          const Icon = moduleIcon(input.icon);
          return (
            <li key={index}>
              <label className="flex cursor-default items-start gap-3">
              <input
                type="checkbox"
                checked={kept.has(index)}
                onChange={() => toggle(index)}
                aria-label={`Garder le bloc de ${input.startsAt}`}
                className="mt-1 size-4 shrink-0 rounded-sm accent-[var(--accent)]"
              />
              <div className={`min-w-0 flex-1 ${kept.has(index) ? '' : 'opacity-50'}`}>
                <p className="flex items-center gap-2">
                  <Icon className="size-3.5" style={{ color: colorVar(input.color) }} strokeWidth={2} />
                  <span className="font-medium">{input.title}</span>
                  <span className="tnum text-meta text-ink-3">
                    {input.startsAt} – {input.endsAt}
                  </span>
                </p>
                <ul className="mt-0.5 text-meta text-ink-2">
                  {tasks.map((task) => (
                    <li key={task.id} className="flex gap-2">
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      <span className="tnum text-ink-3">{formatMinutes(taskMinutes(task))}</span>
                    </li>
                  ))}
                </ul>
              </div>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-meta text-ink-3">Une tâche sans estimation compte pour 30 minutes.</p>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button
          variant="primary"
          disabled={kept.size === 0 || apply.isPending}
          onClick={() =>
            apply.mutate(
              proposals.filter((_, i) => kept.has(i)).map(({ input, tasks }) => ({ input, taskIds: tasks.map((t) => t.id) })),
              { onSuccess: onDone },
            )
          }
        >
          Poser {kept.size > 1 ? `ces ${kept.size} blocs` : 'ce bloc'}
        </Button>
      </DialogFooter>
    </>
  );
}

export function FillGapsDialog({ open, onOpenChange, proposals }: { open: boolean; onOpenChange: (open: boolean) => void; proposals: FillProposal[] }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Remplir les trous"
      description="Les créneaux libres de la journée, avec ce qui presse le plus."
    >
      {open && <FillForm proposals={proposals} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}
