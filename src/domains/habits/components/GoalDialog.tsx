import { X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { DateField } from '@/ui/primitives/DateField';
import { Input, Textarea } from '@/ui/primitives/Input';
import { useDeleteGoal, useGoalActions, useGoals, useHabits, useSaveGoal } from '../hooks';
import type { Goal } from '../model';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

/** Une étape d'un objectif déjà créé : cochée, renommée ou retirée tout de suite. */
function StepList({ goal }: { goal: Goal }) {
  const actions = useGoalActions();
  return (
    <ul className="flex flex-col gap-1">
      {goal.steps.map((step) => (
        <li key={step.id} className="group -mx-1.5 flex min-h-8 items-center justify-between gap-2 rounded-md px-1.5 hover:bg-hover">
          <Checkbox checked={step.doneAt !== null} onChange={(done) => void actions.toggleStep(step.id, done)}>
            <span className={step.doneAt ? 'text-ink-3 line-through' : ''}>{step.title}</span>
          </Checkbox>
          <button
            type="button"
            aria-label={`Retirer l’étape « ${step.title} »`}
            onClick={() => void actions.deleteStep(step.id)}
            className="grid size-6 place-items-center rounded text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const save = useSaveGoal();
  const remove = useDeleteGoal();
  const actions = useGoalActions();
  const { data: habits = [] } = useHabits();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [dueDate, setDueDate] = useState<string | null>(goal?.dueDate ?? null);
  const [notes, setNotes] = useState(goal?.notes ?? '');
  // Un nouvel objectif garde ses étapes ici jusqu'à l'enregistrement ; un objectif existant les écrit tout de suite.
  const [draftSteps, setDraftSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const linked = goal ? habits.filter((h) => h.goalId === goal.id) : [];

  const addStep = () => {
    const text = newStep.trim();
    if (!text) return;
    if (goal) void actions.addStep(goal.id, text);
    else setDraftSteps((prev) => [...prev, text]);
    setNewStep('');
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (!title.trim()) return;
    const steps = newStep.trim() ? [...draftSteps, newStep.trim()] : draftSteps;
    save.mutate({ id: goal?.id, goal: { title, dueDate, notes: notes.trim() || null }, steps }, { onSuccess: onDone });
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          submit();
        }
      }}
      className="mt-5"
    >
      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <Row label="Objectif">
          <Input autoFocus={!goal} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Courir 10 km, avoir 14 de moyenne…" aria-label="Objectif" />
          {submitted && !title.trim() && <p className="mt-1.5 text-meta text-danger">Écris l’objectif.</p>}
        </Row>
        <Row label="Pour le">
          <DateField value={dueDate} onChange={setDueDate} placeholder="Sans date" aria-label="Date visée" />
        </Row>
        <Row label="Étapes">
          {goal ? (
            <StepList goal={goal} />
          ) : (
            draftSteps.length > 0 && (
              <ul className="mb-1 flex flex-col gap-1">
                {draftSteps.map((step, index) => (
                  <li key={`${index}-${step}`} className="flex min-h-8 items-center gap-2.5 text-ink">
                    <span className="size-4 rounded-sm border border-line-strong" />
                    {step}
                  </li>
                ))}
              </ul>
            )
          )}
          <Input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault();
                addStep();
              }
            }}
            placeholder="Ajouter une étape (Entrée)"
            aria-label="Nouvelle étape"
            className="mt-1"
          />
        </Row>
        <Row label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Pourquoi, comment…" aria-label="Notes" />
        </Row>
        {linked.length > 0 && (
          <Row label="Habitudes">
            <p className="pt-2 text-ink-2">{linked.map((h) => h.name).join(', ')}</p>
          </Row>
        )}
      </div>
      <DialogFooter>
        {goal && (
          <>
            <Button variant="ghost" className="!text-danger" onClick={() => remove.mutate(goal.id, { onSuccess: onDone })}>
              Supprimer
            </Button>
            <Button variant="ghost" className="mr-auto" onClick={() => void actions.setAchieved(goal.id, !goal.achievedAt).then(onDone)}>
              {goal.achievedAt ? 'Rouvrir' : 'Marquer atteint'}
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={save.isPending}>
          {goal ? 'Enregistrer' : 'Créer l’objectif'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** L'objectif est relu à chaque rendu : ses étapes cochées dans la fenêtre s'y voient tout de suite. */
export function GoalDialog({ open, onOpenChange, goalId }: { open: boolean; onOpenChange: (open: boolean) => void; goalId: string | null }) {
  const { data: goals = [] } = useGoals();
  const goal = goalId ? goals.find((g) => g.id === goalId) : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={goal ? goal.title : 'Nouvel objectif'} width={560}>
      {open && (goal || !goalId) && <GoalForm key={goalId ?? 'new'} goal={goal} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}
