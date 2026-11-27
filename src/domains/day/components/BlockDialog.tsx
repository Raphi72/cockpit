import { Dumbbell, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { AppMode } from '@/core/app-mode';
import { useWorkoutEditor } from '@/domains/habits/components/WorkoutDialog';
import { useWorkouts } from '@/domains/habits/hooks';
import { isSportBlock } from '@/domains/habits/model';
import type { TaskItem } from '@/domains/tasks/model';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { ColorChoice } from '@/ui/primitives/ColorChoice';
import { DateField } from '@/ui/primitives/DateField';
import { Input } from '@/ui/primitives/Input';
import { TimeField } from '@/ui/primitives/TimeField';
import type { AppColor } from '@/ui/data/ColorDot';
import { useCreateBlock, useDeleteBlock, useMoveTasksToBlock, useUpdateBlock } from '../hooks';
import { moduleIcon } from '../icons';
import {
  BLOCK_STATUS_LABELS,
  blockFromModule,
  formatMinutes,
  fromMinutes,
  modulesOfMode,
  toMinutes,
  validateBlock,
  type BlockStatus,
  type DayBlock,
  type Module,
} from '../model';
import { colorVar } from '@/ui/data/ColorDot';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

/** Durées en un geste : d'une demi-heure à une demi-journée. */
const FREE_DURATIONS = [30, 60, 90, 120, 180, 240];

/** Nouveau bloc à l'heure cliquée : un module en un clic, ou un bloc libre (titre, durée, couleur). */
function CreateBlockForm(props: { day: string; minutes: number; modules: Module[]; mode: AppMode; onDone: () => void }) {
  const create = useCreateBlock();
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(60);
  const [color, setColor] = useState<AppColor>('slate');
  const place = (module: Module) => create.mutate(blockFromModule(module, props.day, props.minutes), { onSuccess: props.onDone });
  const modules = modulesOfMode(props.modules, props.mode);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (title.trim() === '') return;
    const start = props.minutes;
    create.mutate(
      {
        templateId: null,
        date: props.day,
        startsAt: fromMinutes(start),
        endsAt: fromMinutes(Math.min(start + duration, 24 * 60)),
        title,
        icon: 'sparkles',
        color,
        mode: 'both',
      },
      { onSuccess: props.onDone },
    );
  };

  return (
    <div className="mt-5">
      <h3 className="mb-2 text-meta font-medium text-ink-2">Un module</h3>
      <div className="flex flex-wrap gap-1.5">
        {modules.map((module) => {
          const Icon = moduleIcon(module.icon);
          return (
            <button
              key={module.id}
              type="button"
              onClick={() => place(module)}
              className="flex h-9 items-center gap-2 rounded-md border border-line px-3 transition-colors duration-[120ms] ease-soft hover:bg-hover"
            >
              <Icon className="size-3.5" style={{ color: colorVar(module.color) }} strokeWidth={2} />
              {module.name}
              <span className="tnum text-meta text-ink-3">{formatMinutes(module.durationMin)}</span>
            </button>
          );
        })}
        {modules.length === 0 && <p className="text-meta text-ink-3">Aucun module pour ce mode.</p>}
      </div>

      <form onSubmit={submit} className="mt-6">
        <h3 className="mb-2 text-meta font-medium text-ink-2">Ou un bloc libre</h3>
        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
          <Row label="Titre">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rendez-vous, courses, lecture…" aria-label="Titre du bloc" />
          </Row>
          <Row label="Durée">
            <ChoiceChips
              label="Durée"
              options={FREE_DURATIONS.map((m) => ({ value: String(m), label: formatMinutes(m) }))}
              value={String(duration)}
              onChange={(v) => setDuration(Number(v))}
            />
          </Row>
          <Row label="Couleur">
            <ColorChoice value={color} onChange={setColor} label="Couleur" />
          </Row>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onDone}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" disabled={title.trim() === '' || create.isPending}>
            Poser le bloc
          </Button>
        </DialogFooter>
      </form>
    </div>
  );
}

/** Un bloc posé : titre, jour, horaire, statut et ses tâches (qu'on peut en sortir). */
/** `onChain` : la fenêtre en ouvre une autre en se fermant (la séance) ; le focus ne revient alors pas au bloc. */
function EditBlockForm({ block, tasks, onDone, onChain }: { block: DayBlock; tasks: TaskItem[]; onDone: () => void; onChain: () => void }) {
  const update = useUpdateBlock();
  const remove = useDeleteBlock();
  const moveTasks = useMoveTasksToBlock();
  const [title, setTitle] = useState(block.title);
  const [date, setDate] = useState<string | null>(block.date);
  const [startsAt, setStartsAt] = useState<string | null>(block.startsAt);
  const [endsAt, setEndsAt] = useState<string | null>(block.endsAt === '24:00' ? '23:59' : block.endsAt);
  const [status, setStatus] = useState<BlockStatus>(block.status);
  const [error, setError] = useState<string | null>(null);
  const openWorkout = useWorkoutEditor((state) => state.openWorkout);
  const { data: workouts = [] } = useWorkouts();
  const sport = isSportBlock(block);
  const noted = sport && workouts.some((w) => w.blockId === block.id);

  /** Enregistrer le bloc ; « Noter la séance » le marque fait au passage (la séance a eu lieu). */
  const save = (nextStatus: BlockStatus, then: () => void) => {
    const end = endsAt === '23:59' && block.endsAt === '24:00' ? '24:00' : (endsAt ?? '');
    const input = { title, date: date ?? '', startsAt: startsAt ?? '', endsAt: end };
    const problem = validateBlock(input);
    if (problem) return setError(problem);
    update.mutate({ block, patch: { title: title.trim(), date: input.date, startsAt: input.startsAt, endsAt: end, status: nextStatus } }, { onSuccess: then });
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    save(status, onDone);
  };

  const noteWorkout = () =>
    save(status === 'planned' ? 'done' : status, () => {
      onChain();
      onDone();
      openWorkout({ blockId: block.id, date: date ?? block.date });
    });

  const duration = startsAt && endsAt ? toMinutes(endsAt) - toMinutes(startsAt) : 0;

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
        <Row label="Titre">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titre du bloc" />
        </Row>
        <Row label="Jour">
          <DateField value={date} onChange={setDate} clearable={false} aria-label="Jour du bloc" />
        </Row>
        <Row label="Horaire">
          <div className="flex items-center gap-2">
            <TimeField value={startsAt} onChange={setStartsAt} aria-label="Début" />
            <span className="text-ink-3">–</span>
            <TimeField value={endsAt} onChange={setEndsAt} aria-label="Fin" />
            {duration > 0 && <span className="tnum text-meta text-ink-3">{formatMinutes(duration)}</span>}
          </div>
        </Row>
        {/* La fin en un geste, à partir du début (plus simple au doigt que l'heure de fin). */}
        <Row label="Durée">
          <ChoiceChips
            label="Durée"
            options={FREE_DURATIONS.map((m) => ({ value: String(m), label: formatMinutes(m) }))}
            value={FREE_DURATIONS.includes(duration) ? String(duration) : null}
            onChange={(v) => startsAt && setEndsAt(fromMinutes(Math.min(toMinutes(startsAt) + Number(v), 24 * 60)))}
          />
        </Row>
        <Row label="Statut">
          <ChoiceChips
            label="Statut"
            options={(['planned', 'done', 'missed'] as BlockStatus[]).map((s) => ({ value: s, label: BLOCK_STATUS_LABELS[s] }))}
            value={status}
            onChange={setStatus}
          />
        </Row>
        {sport && (
          <Row label="Séance">
            <Button variant="secondary" icon={Dumbbell} onClick={noteWorkout}>
              {noted ? 'Voir la séance' : 'Noter la séance'}
            </Button>
          </Row>
        )}
        <Row label="Tâches">
          {tasks.length === 0 ? (
            <p className="pt-2 text-meta text-ink-3">Glisse des tâches ou des devoirs dans le bloc depuis « À caser ».</p>
          ) : (
            <ul className="pt-1">
              {tasks.map((task) => (
                <li key={task.id} className="flex min-h-8 items-center gap-2">
                  <span className={`min-w-0 flex-1 truncate ${task.status === 'done' ? 'text-ink-3 line-through' : ''}`}>{task.title}</span>
                  <Button
                    variant="ghost"
                    icon={X}
                    aria-label={`Sortir « ${task.title} » du bloc`}
                    onClick={() => moveTasks.mutate({ taskIds: [task.id], blockId: null, message: 'Tâche sortie du bloc.' })}
                  />
                </li>
              ))}
            </ul>
          )}
        </Row>
      </div>
      {error && <p className="mt-3 text-meta text-danger">{error}</p>}
      <DialogFooter>
        <Button variant="ghost" className="mr-auto !text-danger" onClick={() => remove.mutate(block.id, { onSuccess: onDone })}>
          Retirer le bloc
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={update.isPending}>
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  );
}

export type BlockDialogState = { kind: 'create'; day: string; minutes: number } | { kind: 'edit'; block: DayBlock } | null;

export function BlockDialog(props: {
  state: BlockDialogState;
  onClose: () => void;
  modules: Module[];
  mode: AppMode;
  tasksByBlock: Map<string, TaskItem[]>;
}) {
  const { state } = props;
  const title = state?.kind === 'edit' ? state.block.title : state ? `Nouveau bloc à ${fromMinutes(state.minutes)}` : '';
  // Rendre le focus au bloc fermerait aussitôt la fenêtre de la séance ouverte à sa place.
  const [chaining, setChaining] = useState(false);
  useEffect(() => {
    if (state) setChaining(false);
  }, [state]);
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && props.onClose()} title={title} restoreFocus={!chaining}>
      {state?.kind === 'create' && (
        <CreateBlockForm day={state.day} minutes={state.minutes} modules={props.modules} mode={props.mode} onDone={props.onClose} />
      )}
      {state?.kind === 'edit' && (
        <EditBlockForm key={state.block.id} block={state.block} tasks={props.tasksByBlock.get(state.block.id) ?? []} onDone={props.onClose} onChain={() => setChaining(true)} />
      )}
    </Dialog>
  );
}

