import { CalendarClock, Flag, Minus, Plus, Shuffle, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useUiStore } from '@/app/ui-store';
import { useDeadlineHorizon } from '@/core/deadline-horizon';
import { useToday } from '@/core/use-today';
import { useProjects } from '@/domains/projects/hooks';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { useOpenTasks, useSaveWorkPlan, useUpdateTask } from '../hooks';
import { formatDuration, taskDateLabel, type TaskItem } from '../model';
import {
  PLAN_COUNT_MAX,
  PLAN_COUNT_MIN,
  PLAN_DURATIONS,
  PLAN_DURATION_MAX,
  PLAN_DURATION_MIN,
  planCandidates,
  proposalSummary,
  proposePlan,
  resolvePlanRequest,
  stepDuration,
  type PlanMode,
  type PlanRequest,
} from '../work-plan';
import { useWorkPlanDialog } from '../work-plan-store';
import { TaskEstimateMenu } from './TaskFields';

const MODES: { value: PlanMode; label: string }[] = [
  { value: 'duration', label: 'Un temps' },
  { value: 'count', label: 'Un nombre de tâches' },
];

/** « − 2 h 15 + » : ajuster la durée ou le nombre de tâches. */
function Stepper(props: { label: string; value: string; onStep: (direction: 1 | -1) => void; min: boolean; max: boolean }) {
  return (
    <div role="group" aria-label={props.label} className="flex items-center gap-1">
      <Button variant="ghost" icon={Minus} aria-label="Moins" onClick={() => props.onStep(-1)} disabled={props.min} />
      <span className="tnum min-w-[80px] text-center font-medium">{props.value}</span>
      <Button variant="ghost" icon={Plus} aria-label="Plus" onClick={() => props.onStep(1)} disabled={props.max} />
    </div>
  );
}

/** Une tâche proposée : son titre, d'où elle vient (projet, deadline ou début), son estimation, et « Pas celle-ci ». */
function ProposalRow({ task, today, onRemove }: { task: TaskItem; today: string; onRemove: () => void }) {
  const date = taskDateLabel(task, today, useDeadlineHorizon());
  return (
    <li className="group -mx-2.5 grid min-h-11 grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-3 rounded-md px-2.5 py-1.5 hover:bg-hover">
      <span className="min-w-0">
        <span className="block truncate">
          {task.parentTitle && <span className="text-ink-3">{task.parentTitle} › </span>}
          {task.title}
        </span>
        {(task.projectName || date) && (
          <span className="flex min-w-0 items-center gap-2.5 text-meta text-ink-3">
            {task.projectName && <span className="truncate">{task.projectName}</span>}
            {date && (
              <span className={`tnum flex shrink-0 items-center gap-1 ${DEADLINE_TONE_CLASS[date.tone]}`}>
                {date.kind === 'due' ? (
                  <Flag className="size-3" strokeWidth={2} aria-label="Deadline" />
                ) : (
                  <CalendarClock className="size-3" strokeWidth={2} aria-label="Début" />
                )}
                {date.label}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="tnum text-meta text-ink-2">{task.estimateMin ? formatDuration(task.estimateMin) : '—'}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Pas celle-ci : ${task.title}`}
        title="Pas celle-ci : en proposer une autre"
        className="grid size-7 place-items-center rounded-md text-ink-3 opacity-0 transition-opacity duration-[120ms] ease-soft group-hover:opacity-100 hover:bg-active hover:text-ink focus-visible:opacity-100"
      >
        <X className="size-4" strokeWidth={1.75} />
      </button>
    </li>
  );
}

/** Tâches sans estimation montrées d'emblée quand on déplie la liste ; les autres s'estiment dans leur panneau. */
const UNESTIMATED_SHOWN = 5;

/**
 * Mode durée : les tâches sans estimation ne sont pas proposées. « Leur donner une durée… » les
 * liste (les premières dans l'ordre de préférence) : une durée choisie ici les fait entrer dans le calcul.
 */
function Unestimated({ tasks }: { tasks: TaskItem[] }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateTask();
  const count = tasks.length;
  const hidden = count - Math.min(count, UNESTIMATED_SHOWN);
  return (
    <div className="mt-2">
      <p className="text-meta text-ink-3">
        {count === 1 ? '1 tâche sans estimation n’est pas proposée.' : `${count} tâches sans estimation ne sont pas proposées.`}{' '}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="text-ink-2 underline-offset-2 transition-colors hover:text-ink hover:underline"
        >
          {open ? 'Masquer' : count === 1 ? 'Lui donner une durée…' : 'Leur donner une durée…'}
        </button>
      </p>
      {open && (
        <ul className="mt-1">
          {tasks.slice(0, UNESTIMATED_SHOWN).map((task) => (
            <li key={task.id} className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <span className="truncate text-ink-2">
                {task.parentTitle && <span className="text-ink-3">{task.parentTitle} › </span>}
                {task.title}
              </span>
              <TaskEstimateMenu value={null} onChange={(estimateMin) => update.mutate({ id: task.id, patch: { estimateMin } })} />
            </li>
          ))}
          {hidden > 0 && (
            <li className="pt-1 text-meta text-ink-3">
              Et {hidden} autre{hidden > 1 ? 's' : ''}, à estimer dans leur panneau.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function WorkPlanForm({ onDone }: { onDone: () => void }) {
  const today = useToday();
  const { data: open } = useOpenTasks();
  const { data: paused } = useProjects({ statuses: ['on_hold'] });
  const request = resolvePlanRequest(useUiStore((state) => state.workPlanRequest));
  const setRequest = useUiStore((state) => state.setWorkPlanRequest);
  // Tâches écartées pendant que la fenêtre est ouverte (« Pas celle-ci », « Autre proposition »).
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const save = useSaveWorkPlan();
  if (!open || !paused) return null;

  const candidates = planCandidates(open, new Set(paused.map((p) => p.id)));
  const proposal = proposePlan(candidates, request, today, excluded);
  const current = open.filter((t) => t.plannedOn === today);
  const update = (patch: Partial<PlanRequest>) => setRequest({ ...request, ...patch });

  const reshuffle = () => {
    const next = new Set([...excluded, ...proposal.tasks.map((t) => t.id)]);
    // Plus rien d'autre à proposer : on repart des premières.
    setExcluded(proposePlan(candidates, request, today, next).tasks.length > 0 ? next : new Set());
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (proposal.tasks.length === 0 || save.isPending) return;
    save.mutate({ day: today, ids: proposal.tasks.map((t) => t.id) }, { onSuccess: onDone });
  };

  let empty: string | null = null;
  if (candidates.length === 0) empty = 'Aucune tâche à faire : rien à mettre au programme.';
  else if (proposal.tasks.length === 0 && excluded.size > 0) {
    empty = 'Plus rien d’autre à proposer : « Autre proposition » repart des premières.';
  } else if (proposal.tasks.length === 0) {
    empty = `Aucune tâche estimée ne tient dans ${formatDuration(request.minutes)}.`;
  }

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
      <ChoiceChips label="Je veux travailler" options={MODES} value={request.mode} onChange={(mode) => update({ mode })} />

      <div className="mt-3 flex min-h-10 flex-wrap items-center justify-between gap-3">
        {request.mode === 'duration' ? (
          <>
            <ChoiceChips
              label="Durée"
              options={PLAN_DURATIONS.map((minutes) => ({ value: String(minutes), label: formatDuration(minutes) }))}
              value={PLAN_DURATIONS.includes(request.minutes) ? String(request.minutes) : null}
              onChange={(v) => update({ minutes: Number(v) })}
            />
            <Stepper
              label="Durée"
              value={formatDuration(request.minutes)}
              onStep={(direction) => update({ minutes: stepDuration(request.minutes, direction) })}
              min={request.minutes <= PLAN_DURATION_MIN}
              max={request.minutes >= PLAN_DURATION_MAX}
            />
          </>
        ) : (
          <Stepper
            label="Nombre de tâches"
            value={`${request.count} tâche${request.count > 1 ? 's' : ''}`}
            onStep={(direction) => update({ count: request.count + direction })}
            min={request.count <= PLAN_COUNT_MIN}
            max={request.count >= PLAN_COUNT_MAX}
          />
        )}
      </div>

      <section className="mt-6">
        <div className="mb-1 flex items-baseline gap-2.5">
          <h3 className="font-medium">Programme proposé</h3>
          {proposal.tasks.length > 0 && <span className="tnum text-meta text-ink-3">{proposalSummary(proposal, request)}</span>}
        </div>
        {empty ? (
          <p className="py-2 text-ink-3">{empty}</p>
        ) : (
          <ul>
            {proposal.tasks.map((task) => (
              <ProposalRow
                key={task.id}
                task={task}
                today={today}
                onRemove={() => setExcluded(new Set([...excluded, task.id]))}
              />
            ))}
          </ul>
        )}
        {request.mode === 'duration' && proposal.unestimated.length > 0 && <Unestimated tasks={proposal.unestimated} />}
        <p className="mt-1 text-meta text-ink-3">Retards et tâches du jour d’abord, puis deadlines proches et priorités.</p>
      </section>

      {current.length > 0 && (
        <p className="mt-5 text-meta text-ink-2">
          Remplace le programme actuel ({current.length} tâche{current.length > 1 ? 's' : ''} à faire).{' '}
          <button
            type="button"
            onClick={() => save.mutate({ day: today, ids: [] }, { onSuccess: onDone })}
            className="text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          >
            Effacer le programme
          </button>
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" icon={Shuffle} onClick={reshuffle} disabled={candidates.length === 0} className="mr-auto">
          Autre proposition
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={proposal.tasks.length === 0 || save.isPending}>
          Mettre au programme
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * « Je veux travailler… » : pour une durée ou un nombre de tâches, Cockpit compose le programme
 * d'aujourd'hui. Monté une seule fois dans l'AppShell ; ouvert depuis le dashboard (P), la page
 * Tâches, le planning ou la palette.
 */
export function WorkPlanDialog() {
  const open = useWorkPlanDialog((state) => state.open);
  const close = useWorkPlanDialog((state) => state.close);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="Je veux travailler…"
      description="Choisis un temps ou un nombre de tâches : Cockpit compose le programme d’aujourd’hui."
      width={580}
    >
      {open && <WorkPlanForm onDone={close} />}
    </Dialog>
  );
}
