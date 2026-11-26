import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { create } from 'zustand';
import { db } from '@/core/db';
import { addDaysISO, nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { useMinutesOfDay, useToday } from '@/core/use-today';
import { listAgenda } from '@/domains/agenda/repository';
import { invalidateDay } from '@/domains/day/hooks';
import { blockInterval, fromMinutes } from '@/domains/day/model';
import { deleteBlockStatement, insertBlockStatement, listBlocks, listModules } from '@/domains/day/repository';
import { busyItemsOn } from '@/domains/day/service';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { revisionDays, revisionSlot } from '../revision-plan';

type PlannedExam = { title: string; subjectName: string; date: string };

/** L'examen qui vient d'être créé, pour proposer ses révisions à rebours (monté dans l'AppShell). */
export const useRevisionPlan = create<{ exam: PlannedExam | null; open: (exam: PlannedExam) => void; close: () => void }>()((set) => ({
  exam: null,
  open: (exam) => set({ exam }),
  close: () => set({ exam: null }),
}));

type Proposal = { offset: number; day: string; start: number; end: number; taken: boolean };

/** Les révisions proposées : les jours J-7, J-3, J-1 encore à venir, chacun dans son premier créneau libre du soir. */
function useProposals(exam: PlannedExam, today: string, now: number) {
  return useQuery({
    queryKey: ['revision-plan', exam.date, today],
    staleTime: 0,
    queryFn: async (): Promise<Proposal[]> => {
      const days = revisionDays(exam.date, today);
      if (days.length === 0) return [];
      const from = days[days.length - 1]!.day;
      const to = addDaysISO(days[0]!.day, 1);
      const [blocks, agenda] = await Promise.all([listBlocks(db, from, to), listAgenda(db, from, to)]);
      return days.map(({ offset, day }) => {
        const busy = [...blocks.filter((b) => b.date === day).map(blockInterval), ...busyItemsOn(agenda, day)];
        return { offset, day, ...revisionSlot(busy, day === today ? now : undefined) };
      });
    },
  });
}

function PlanForm({ exam, onDone }: { exam: PlannedExam; onDone: () => void }) {
  const today = useToday();
  const now = useMinutesOfDay();
  const queryClient = useQueryClient();
  const { data: proposals } = useProposals(exam, today, now);
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());
  const place = useMutation({
    mutationFn: async (chosen: Proposal[]) => {
      const modules = await listModules(db);
      const module = modules.find((m) => m.id === 'module-revision') ?? modules.find((m) => m.mode === 'school');
      const stamp = nowTimestamp();
      const created = chosen.map((p) => ({ id: newId(), proposal: p }));
      await db.batch(
        created.map(({ id, proposal }) =>
          insertBlockStatement(
            id,
            {
              templateId: module?.id ?? null,
              date: proposal.day,
              startsAt: fromMinutes(proposal.start),
              endsAt: fromMinutes(proposal.end),
              title: `Révision · ${exam.title}`,
              icon: module?.icon ?? 'book',
              color: module?.color ?? 'amber',
              mode: 'school',
            },
            stamp,
          ),
        ),
      );
      return created.map((c) => c.id);
    },
    onSuccess: (ids) => {
      invalidateDay(queryClient);
      toast(`${ids.length} révision${ids.length > 1 ? 's' : ''} posée${ids.length > 1 ? 's' : ''} dans la Journée.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => void db.batch(ids.map(deleteBlockStatement)).then(() => invalidateDay(queryClient)),
        },
      });
      onDone();
    },
  });

  if (!proposals) return null;
  if (proposals.length === 0) {
    return (
      <>
        <p className="mt-4 text-ink-2">L’examen est trop proche pour des révisions à rebours.</p>
        <DialogFooter>
          <Button variant="primary" onClick={onDone}>
            Fermer
          </Button>
        </DialogFooter>
      </>
    );
  }
  const chosen = proposals.filter((p) => !skipped.has(p.offset));
  return (
    <>
      <ul className="mt-4 flex flex-col gap-1">
        {proposals.map((p) => (
          <li key={p.offset}>
            <label className="flex min-h-10 cursor-default items-center gap-3">
              <input
                type="checkbox"
                checked={!skipped.has(p.offset)}
                onChange={() =>
                  setSkipped((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.offset)) next.delete(p.offset);
                    else next.add(p.offset);
                    return next;
                  })
                }
                className="size-4 accent-[var(--accent)]"
              />
              <span className="w-10 text-meta text-ink-3">J-{p.offset}</span>
              <span className="flex-1">{format(parseISO(p.day), 'EEEE d MMMM', { locale: fr })}</span>
              <span className="tnum text-ink-2">
                {fromMinutes(p.start)} – {fromMinutes(p.end)}
              </span>
              {p.taken && <TriangleAlert className="size-3.5 text-warning" strokeWidth={2} aria-label="Chevauche autre chose" />}
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-meta text-ink-3">Des blocs d’une heure dans la Journée, à déplacer ensuite si besoin.</p>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Pas maintenant
        </Button>
        <Button variant="primary" disabled={chosen.length === 0 || place.isPending} onClick={() => place.mutate(chosen)}>
          Poser {chosen.length > 1 ? `ces ${chosen.length} révisions` : 'cette révision'}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Proposé juste après la création d'un examen : ses révisions à rebours (J-7, J-3, J-1). */
export function RevisionPlanDialog() {
  const exam = useRevisionPlan((state) => state.exam);
  const close = useRevisionPlan((state) => state.close);
  return (
    <Dialog
      open={exam !== null}
      onOpenChange={(open) => !open && close()}
      title="Prévoir les révisions ?"
      description={exam ? `${exam.title} (${exam.subjectName}), le ${format(parseISO(exam.date), 'd MMMM', { locale: fr })}.` : undefined}
    >
      {exam && <PlanForm exam={exam} onDone={close} />}
    </Dialog>
  );
}
