import { useState, type FormEvent, type ReactNode } from 'react';
import { useCreateStore } from '@/app/create-store';
import { addMinutesToTime, timeToMinutes } from '@/core/dates';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { Input } from '@/ui/primitives/Input';
import { TimeField } from '@/ui/primitives/TimeField';
import { SubjectMenu } from '../../subjects/components/SubjectMenu';
import { useSubjects } from '../../subjects/hooks';
import { useDeleteSlot, useSaveSlot } from '../hooks';
import { WEEKDAYS, WEEKDAY_LABELS, WEEKDAY_SHORT, validateSlot, type SlotInput, type TimetableSlot, type Weekday } from '../model';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

function toInput(slot: TimetableSlot): SlotInput {
  return {
    subjectId: slot.subjectId,
    weekday: slot.weekday,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    label: slot.label ?? '',
    room: slot.room ?? '',
  };
}

function SlotForm({ slot, defaults, onDone }: { slot?: TimetableSlot; defaults?: Partial<SlotInput>; onDone: () => void }) {
  const { data: subjects = [] } = useSubjects();
  const [input, setInput] = useState<SlotInput>(() =>
    slot
      ? toInput(slot)
      : {
          subjectId: defaults?.subjectId ?? null,
          weekday: defaults?.weekday ?? 1,
          startsAt: defaults?.startsAt ?? '08:00',
          endsAt: defaults?.endsAt ?? addMinutesToTime(defaults?.startsAt ?? '08:00', 60),
          label: '',
          room: '',
        },
  );
  const [submitted, setSubmitted] = useState(false);
  const save = useSaveSlot();
  const remove = useDeleteSlot();
  const errors = validateSlot(input);
  const set = <K extends keyof SlotInput>(key: K, value: SlotInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const subjectRoom = subjects.find((s) => s.id === input.subjectId)?.room;

  // Changer l'heure de début garde la durée du cours.
  const setStart = (time: string | null) => {
    if (!time) return;
    setInput((prev) => {
      const duration = Math.max(15, timeToMinutes(prev.endsAt) - timeToMinutes(prev.startsAt));
      return { ...prev, startsAt: time, endsAt: addMinutesToTime(time, duration) };
    });
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    save.mutate(
      { id: slot?.id, input },
      {
        onSuccess: () => {
          if (!slot) toast(`Cours ajouté le ${WEEKDAY_LABELS[input.weekday].toLowerCase()}.`);
          onDone();
        },
      },
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
        <Row label="Matière">
          <SubjectMenu variant="field" value={input.subjectId} onChange={(id) => set('subjectId', id)} />
          {submitted && errors.subjectId && <p className="mt-1.5 text-meta text-danger">{errors.subjectId}</p>}
        </Row>
        <Row label="Jour">
          <ChoiceChips
            label="Jour"
            options={WEEKDAYS.map((day) => ({ value: String(day), label: WEEKDAY_SHORT[day] }))}
            value={String(input.weekday)}
            onChange={(v) => set('weekday', Number(v) as Weekday)}
          />
        </Row>
        <Row label="Horaire">
          <div className="flex items-center gap-2">
            <TimeField value={input.startsAt} onChange={setStart} aria-label="Début du cours" />
            <span className="text-ink-3">–</span>
            <TimeField value={input.endsAt} onChange={(time) => time && set('endsAt', time)} aria-label="Fin du cours" />
          </div>
          {submitted && errors.time && <p className="mt-1.5 text-meta text-danger">{errors.time}</p>}
        </Row>
        <Row label="Type">
          <Input value={input.label} onChange={(e) => set('label', e.target.value)} placeholder="TD, TP, amphi… (facultatif)" aria-label="Type de cours" />
        </Row>
        <Row label="Salle">
          <Input
            value={input.room}
            onChange={(e) => set('room', e.target.value)}
            placeholder={subjectRoom ? `${subjectRoom} (celle de la matière)` : 'Facultatif'}
            aria-label="Salle"
          />
        </Row>
      </div>

      <DialogFooter>
        {slot && (
          <Button variant="ghost" className="mr-auto !text-danger" onClick={() => remove.mutate(slot.id, { onSuccess: onDone })}>
            Retirer
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={save.isPending}>
          {slot ? 'Enregistrer' : 'Ajouter le cours'}
        </Button>
      </DialogFooter>
    </form>
  );
}

type SlotDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent : nouveau cours (avec `defaults`, par exemple le jour et l'heure cliqués). */
  slot?: TimetableSlot;
  defaults?: Partial<SlotInput>;
};

export function SlotDialog({ open, onOpenChange, slot, defaults }: SlotDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={slot ? 'Cours de la semaine type' : 'Nouveau cours'} restoreFocus={Boolean(slot)}>
      {open && <SlotForm slot={slot} defaults={defaults} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

/** Fenêtre de création globale (menu « Nouveau », palette). */
export function CreateSlotDialog() {
  const open = useCreateStore((state) => (state.open?.kind === 'class' ? state.open : null));
  const close = useCreateStore((state) => state.close);
  return (
    <SlotDialog
      open={open !== null}
      onOpenChange={(next) => !next && close()}
      defaults={{ subjectId: open?.defaults.subjectId ?? null }}
    />
  );
}
