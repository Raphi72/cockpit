import { Plus, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { create } from 'zustand';
import { newId } from '@/core/ids';
import { useToday } from '@/core/use-today';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { DateField } from '@/ui/primitives/DateField';
import { Input, Textarea } from '@/ui/primitives/Input';
import { useDeleteWorkout, useExercises, useSaveWorkout, useWorkouts } from '../hooks';
import { FEELINGS, type Exercise, type ExerciseKind, type Workout, type WorkoutSet } from '../model';

/** Ouvrir la fenêtre d'une séance de n'importe où (page Habitudes, bloc de sport de la Journée). */
type WorkoutTarget = { workoutId?: string; blockId?: string | null; date?: string };

export const useWorkoutEditor = create<{ target: WorkoutTarget | null; openWorkout: (target: WorkoutTarget) => void; close: () => void }>()((set) => ({
  target: null,
  openWorkout: (target) => set({ target }),
  close: () => set({ target: null }),
}));

const KIND_LABELS: Record<ExerciseKind, string> = { strength: 'Muscu', cardio: 'Cardio' };

/** Une série saisie : des textes, convertis à l'enregistrement (virgule acceptée). */
type SetDraft = { reps: string; weightKg: string; durationMin: string; distanceKm: string };
type EntryDraft = { exerciseId: string; sets: SetDraft[] };

const EMPTY_SET: SetDraft = { reps: '', weightKg: '', durationMin: '', distanceKm: '' };

const text = (value: number | null) => (value === null ? '' : String(value).replace('.', ','));

function parseNumber(value: string): number | null {
  const number = Number(value.trim().replace(',', '.'));
  return value.trim() === '' || !Number.isFinite(number) || number < 0 ? null : number;
}

/** Les séries d'une séance enregistrée, regroupées par exercice dans leur ordre. */
function entriesOf(workout: Workout): EntryDraft[] {
  const entries: EntryDraft[] = [];
  for (const set of workout.sets) {
    const draft = { reps: text(set.reps), weightKg: text(set.weightKg), durationMin: text(set.durationMin), distanceKm: text(set.distanceKm) };
    const last = entries[entries.length - 1];
    if (last && last.exerciseId === set.exerciseId) last.sets.push(draft);
    else entries.push({ exerciseId: set.exerciseId, sets: [draft] });
  }
  return entries;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

function SmallField({ value, onChange, label, suffix }: { value: string; onChange: (value: string) => void; label: string; suffix: string }) {
  return (
    <label className="flex items-center gap-1.5 text-meta text-ink-3">
      <Input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" aria-label={label} className="tnum !h-8 !w-20 text-right" />
      {suffix}
    </label>
  );
}

/** Un exercice de la séance et ses séries : répétitions × charge (muscu), ou durée et distance (cardio). */
function EntryEditor({
  entry,
  exercise,
  onChange,
  onRemove,
}: {
  entry: EntryDraft;
  exercise: Exercise;
  onChange: (entry: EntryDraft) => void;
  onRemove: () => void;
}) {
  const setSet = (index: number, patch: Partial<SetDraft>) =>
    onChange({ ...entry, sets: entry.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium">
          {exercise.name} <span className="text-meta font-normal text-ink-3">{KIND_LABELS[exercise.kind]}</span>
        </span>
        <button type="button" onClick={onRemove} aria-label={`Retirer « ${exercise.name} »`} className="grid size-6 place-items-center rounded text-ink-3 hover:text-ink">
          <X className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {entry.sets.map((set, index) => (
          <li key={index} className="flex items-center gap-4">
            <span className="tnum w-14 text-meta text-ink-3">{exercise.kind === 'strength' ? `Série ${index + 1}` : `Partie ${index + 1}`}</span>
            {exercise.kind === 'strength' ? (
              <>
                <SmallField value={set.reps} onChange={(reps) => setSet(index, { reps })} label={`Répétitions, série ${index + 1}`} suffix="répét." />
                <SmallField value={set.weightKg} onChange={(weightKg) => setSet(index, { weightKg })} label={`Charge, série ${index + 1}`} suffix="kg" />
              </>
            ) : (
              <>
                <SmallField value={set.durationMin} onChange={(durationMin) => setSet(index, { durationMin })} label={`Durée, partie ${index + 1}`} suffix="min" />
                <SmallField value={set.distanceKm} onChange={(distanceKm) => setSet(index, { distanceKm })} label={`Distance, partie ${index + 1}`} suffix="km" />
              </>
            )}
            {entry.sets.length > 1 && (
              <button
                type="button"
                onClick={() => onChange({ ...entry, sets: entry.sets.filter((_, i) => i !== index) })}
                aria-label={`Retirer la série ${index + 1}`}
                className="ml-auto grid size-6 place-items-center rounded text-ink-3 hover:text-ink"
              >
                <X className="size-3" strokeWidth={1.75} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        // Une nouvelle série reprend la précédente : le plus souvent, on refait la même.
        onClick={() => onChange({ ...entry, sets: [...entry.sets, { ...(entry.sets[entry.sets.length - 1] ?? EMPTY_SET) }] })}
        className="mt-2 text-meta text-ink-3 transition-colors hover:text-ink"
      >
        + {exercise.kind === 'strength' ? 'Série' : 'Partie'}
      </button>
    </div>
  );
}

/** Ajouter un exercice : un déjà connu, ou un nouveau (nom et type). */
function AddExercise({ exercises, onPick }: { exercises: Exercise[]; onPick: (exercise: Exercise, isNew: boolean) => void }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ExerciseKind>('strength');
  if (creating) {
    const confirm = () => {
      if (!name.trim()) return;
      onPick({ id: newId(), name: name.trim(), kind }, true);
      setCreating(false);
      setName('');
    };
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.ctrlKey) {
              e.preventDefault();
              confirm();
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              setCreating(false);
            }
          }}
          placeholder="Squat, course à pied…"
          aria-label="Nom de l’exercice"
          className="w-52"
        />
        <ChoiceChips label="Type d’exercice" options={(['strength', 'cardio'] as ExerciseKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))} value={kind} onChange={setKind} />
        <Button variant="secondary" onClick={confirm}>
          Ajouter
        </Button>
      </div>
    );
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" icon={Plus}>
          Exercice
        </Button>
      </MenuTrigger>
      <MenuContent align="start">
        {exercises.map((exercise) => (
          <MenuItem key={exercise.id} onSelect={() => onPick(exercise, false)}>
            {exercise.name} <span className="ml-auto pl-4 text-meta text-ink-3">{KIND_LABELS[exercise.kind]}</span>
          </MenuItem>
        ))}
        {exercises.length > 0 && <MenuSeparator />}
        <MenuItem icon={Plus} onSelect={() => setCreating(true)}>
          Nouvel exercice…
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function WorkoutForm({ workout, target, onDone }: { workout?: Workout; target: WorkoutTarget; onDone: () => void }) {
  const today = useToday();
  const { data: known = [] } = useExercises();
  const save = useSaveWorkout();
  const remove = useDeleteWorkout();
  const [date, setDate] = useState(workout?.date ?? target.date ?? today);
  const [feeling, setFeeling] = useState<number | null>(workout?.feeling ?? null);
  const [notes, setNotes] = useState(workout?.notes ?? '');
  const [entries, setEntries] = useState<EntryDraft[]>(workout ? entriesOf(workout) : []);
  const [newExercises, setNewExercises] = useState<Exercise[]>([]);
  const exercises = [...known, ...newExercises];
  const exerciseOf = (id: string) => exercises.find((e) => e.id === id);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const sets: WorkoutSet[] = entries.flatMap((entry) =>
      entry.sets
        .map((s) => ({
          exerciseId: entry.exerciseId,
          reps: parseNumber(s.reps),
          weightKg: parseNumber(s.weightKg),
          durationMin: parseNumber(s.durationMin),
          distanceKm: parseNumber(s.distanceKm),
        }))
        .filter((s) => s.reps !== null || s.weightKg !== null || s.durationMin !== null || s.distanceKm !== null),
    );
    const used = new Set(sets.map((s) => s.exerciseId));
    save.mutate(
      {
        id: workout?.id,
        blockId: workout?.blockId ?? target.blockId ?? null,
        date,
        feeling,
        notes: notes.trim() || null,
        newExercises: newExercises.filter((e) => used.has(e.id)),
        sets,
      },
      { onSuccess: onDone },
    );
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
        <Row label="Date">
          <DateField value={date} onChange={(d) => d && setDate(d)} clearable={false} aria-label="Date de la séance" />
        </Row>
        <Row label="Ressenti">
          <ChoiceChips
            label="Ressenti"
            options={FEELINGS.map((label, index) => ({ value: String(index + 1), label }))}
            value={feeling === null ? null : String(feeling)}
            onChange={(v) => setFeeling(Number(v) === feeling ? null : Number(v))}
          />
        </Row>
        <Row label="Exercices">
          {entries.length > 0 && (
            <div className="mb-3">
              {entries.map((entry, index) => {
                const exercise = exerciseOf(entry.exerciseId);
                if (!exercise) return null;
                return (
                  <EntryEditor
                    key={`${entry.exerciseId}-${index}`}
                    entry={entry}
                    exercise={exercise}
                    onChange={(next) => setEntries((prev) => prev.map((e, i) => (i === index ? next : e)))}
                    onRemove={() => setEntries((prev) => prev.filter((_, i) => i !== index))}
                  />
                );
              })}
            </div>
          )}
          <AddExercise
            exercises={exercises}
            onPick={(exercise, isNew) => {
              if (isNew) setNewExercises((prev) => [...prev, exercise]);
              setEntries((prev) => [...prev, { exerciseId: exercise.id, sets: [{ ...EMPTY_SET }] }]);
            }}
          />
        </Row>
        <Row label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Comment ça s’est passé…" aria-label="Notes de la séance" />
        </Row>
      </div>
      <DialogFooter>
        {workout && (
          <Button variant="ghost" className="mr-auto !text-danger" onClick={() => remove.mutate(workout.id, { onSuccess: onDone })}>
            Supprimer
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={save.isPending}>
          {workout ? 'Enregistrer' : 'Noter la séance'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** La fenêtre d'une séance, montée une fois dans la coquille. Un bloc déjà noté rouvre sa séance. */
export function WorkoutDialog() {
  const target = useWorkoutEditor((state) => state.target);
  const close = useWorkoutEditor((state) => state.close);
  const { data: workouts } = useWorkouts();
  const workout = target
    ? workouts?.find((w) => (target.workoutId ? w.id === target.workoutId : target.blockId ? w.blockId === target.blockId : false))
    : undefined;
  const ready = Boolean(target && workouts);
  return (
    <Dialog open={ready} onOpenChange={(open) => !open && close()} title={workout ? 'Séance' : 'Noter une séance'} width={620}>
      {ready && target && <WorkoutForm key={workout?.id ?? `new-${target.blockId ?? ''}`} workout={workout} target={target} onDone={close} />}
    </Dialog>
  );
}
