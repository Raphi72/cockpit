import { addDays, parseISO } from 'date-fns';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useCreateStore, type CreateDefaults } from '@/app/create-store';
import { DATE_INPUT_BOUNDS, toISODate, todayISO } from '@/core/dates';
import { ProjectMenu } from '@/domains/projects/components/ProjectMenu';
import { PRIORITY_LABELS, type Priority } from '@/domains/projects/model';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { Input, Textarea, fieldClass } from '@/ui/primitives/Input';
import { useCreateTask } from '../hooks';
import { validateNewTask } from '../model';
import { TaskEstimateMenu } from './TaskFields';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

type WhenChoice = 'today' | 'tomorrow' | 'none' | 'custom';

function CreateTaskForm({ defaults, onDone }: { defaults: CreateDefaults; onDone: () => void }) {
  const createTask = useCreateTask();
  const today = todayISO();
  const tomorrow = toISODate(addDays(parseISO(today), 1));

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string | null>(defaults.projectId ?? null);
  const [scheduledDate, setScheduledDate] = useState<string | null>(defaults.scheduledDate ?? null);
  const [dueDate, setDueDate] = useState('');
  const [moreOptions, setMoreOptions] = useState(false);
  const [priority, setPriority] = useState<Priority>(1);
  const [estimateMin, setEstimateMin] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const when: WhenChoice =
    scheduledDate === null ? 'none' : scheduledDate === today ? 'today' : scheduledDate === tomorrow ? 'tomorrow' : 'custom';
  const input = {
    title,
    projectId,
    scheduledDate,
    dueDate: dueDate || null,
    priority,
    estimateMin,
    notes: notes || null,
  };
  const errors = validateNewTask(input);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    createTask.mutate(input, {
      onSuccess: () => {
        toast(scheduledDate === today ? 'Tâche ajoutée à aujourd’hui.' : 'Tâche ajoutée.');
        onDone();
      },
    });
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
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre de la tâche"
        aria-label="Titre de la tâche"
        className="h-10 text-[15px]"
      />
      {submitted && errors.title && <p className="mt-1.5 text-meta text-danger">{errors.title}</p>}

      <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <Row label="Projet">
          <ProjectMenu variant="field" value={projectId} onChange={setProjectId} />
        </Row>

        <Row label="Prévue le">
          <div className="flex flex-wrap items-center gap-1.5">
            <ChoiceChips
              label="Prévue le"
              options={[
                { value: 'today', label: 'Aujourd’hui' },
                { value: 'tomorrow', label: 'Demain' },
                { value: 'none', label: 'Sans date' },
              ]}
              value={when === 'custom' ? null : when}
              onChange={(v) => setScheduledDate(v === 'today' ? today : v === 'tomorrow' ? tomorrow : null)}
            />
            <input
              type="date"
              {...DATE_INPUT_BOUNDS}
              value={when === 'custom' && scheduledDate ? scheduledDate : ''}
              onChange={(e) => setScheduledDate(e.target.value || null)}
              aria-label="Autre date prévue"
              className={`tnum h-8 w-[150px] ${fieldClass} ${when === 'custom' ? '' : 'text-ink-3'}`}
            />
          </div>
          {submitted && errors.scheduledDate && <p className="mt-1.5 text-meta text-danger">{errors.scheduledDate}</p>}
        </Row>

        <Row label="Deadline">
          <input
            type="date"
            {...DATE_INPUT_BOUNDS}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Deadline"
            className={`tnum h-9 max-w-[200px] ${fieldClass} ${dueDate ? '' : 'text-ink-3'}`}
          />
          {submitted && errors.dueDate && <p className="mt-1.5 text-meta text-danger">{errors.dueDate}</p>}
        </Row>
      </div>

      {moreOptions ? (
        <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
          <Row label="Priorité">
            <ChoiceChips
              label="Priorité"
              options={([0, 1, 2, 3] as Priority[]).map((p) => ({ value: String(p), label: PRIORITY_LABELS[p] }))}
              value={String(priority)}
              onChange={(v) => setPriority(Number(v) as Priority)}
            />
          </Row>
          <Row label="Estimation">
            <TaskEstimateMenu variant="field" value={estimateMin} onChange={setEstimateMin} />
          </Row>
          <Row label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Détails, liens…" aria-label="Notes" />
          </Row>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMoreOptions(true)}
          className="mt-4 text-meta text-ink-3 transition-colors hover:text-ink"
        >
          + Priorité, estimation et notes
        </button>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={createTask.isPending}>
          Ajouter la tâche
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Monté une seule fois dans l'AppShell ; ouvert par Ctrl+N ou le menu « Nouveau ». */
export function CreateTaskDialog() {
  const open = useCreateStore((state) => (state.open?.kind === 'task' ? state.open : null));
  const close = useCreateStore((state) => state.close);
  return (
    <Dialog open={open !== null} onOpenChange={(next) => !next && close()} title="Nouvelle tâche" restoreFocus={false}>
      {open && <CreateTaskForm defaults={open.defaults} onDone={close} />}
    </Dialog>
  );
}
