import { useState, type FormEvent } from 'react';
import { useCreateStore, type CreateDefaults } from '@/app/create-store';
import { isISODate, todayISO } from '@/core/dates';
import { ProjectMenu } from '@/domains/projects/components/ProjectMenu';
import { FormRow } from '@/ui/layout/FormRow';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { DateField } from '@/ui/primitives/DateField';
import { Input, Textarea } from '@/ui/primitives/Input';
import { TimeField } from '@/ui/primitives/TimeField';
import { useCreateEvent } from '../hooks';
import {
  EVENT_KINDS,
  EVENT_KIND_LABELS,
  defaultStartTime,
  initialTiming,
  moveTimingDate,
  moveTimingStart,
  setTimingAllDay,
  validateNewEvent,
  type EventKind,
  type EventTiming,
  type NewEventInput,
} from '../model';

function CreateEventForm({ defaults, onDone }: { defaults: CreateDefaults; onDone: () => void }) {
  const createEvent = useCreateEvent();
  const today = todayISO();

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<EventKind>('appointment');
  const [timing, setTiming] = useState<EventTiming>(() => initialTiming(defaults, today, new Date()));
  const [projectId, setProjectId] = useState<string | null>(defaults.projectId ?? null);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [moreOptions, setMoreOptions] = useState(Boolean(defaults.projectId));
  const [submitted, setSubmitted] = useState(false);

  const input: NewEventInput = { title, kind, timing, location: location || null, notes: notes || null, projectId };
  const errors = validateNewEvent(input);

  const setAllDay = (allDay: boolean) =>
    setTiming(setTimingAllDay(timing, allDay, defaultStartTime(timing.date, today, new Date())));

  // Une échéance (« dossier à rendre avant le 30 ») n'a en général pas d'heure.
  const chooseKind = (next: EventKind) => {
    setKind(next);
    if (next === 'deadline' && !timing.allDay) setAllDay(true);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    createEvent.mutate(input, {
      onSuccess: () => {
        toast('Événement ajouté.');
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
        placeholder="Rendez-vous, réunion, échéance…"
        aria-label="Titre de l’événement"
        className="h-10 text-[15px]"
      />
      {submitted && errors.title && <p className="mt-1.5 text-meta text-danger">{errors.title}</p>}

      <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <FormRow label="Type">
          <ChoiceChips
            label="Type"
            options={EVENT_KINDS.map((k) => ({ value: k, label: EVENT_KIND_LABELS[k] }))}
            value={kind}
            onChange={chooseKind}
          />
        </FormRow>

        <FormRow label="Date">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <DateField
              value={timing.date || null}
              onChange={(date) =>
                setTiming(date && isISODate(date) ? moveTimingDate(timing, date) : { ...timing, date: date ?? '' })
              }
              clearable={false}
              aria-label="Date"
            />
            <Checkbox checked={timing.allDay} onChange={setAllDay}>
              Journée entière
            </Checkbox>
          </div>
        </FormRow>

        {timing.allDay ? (
          <FormRow label="Jusqu’au" error={submitted ? errors.timing : undefined}>
            <DateField
              value={timing.endDate}
              onChange={(endDate) => setTiming({ ...timing, endDate })}
              aria-label="Dernier jour (facultatif)"
            />
            <p className="mt-1.5 text-meta text-ink-3">Facultatif : pour un événement sur plusieurs jours.</p>
          </FormRow>
        ) : (
          <FormRow label="Horaire" error={submitted ? errors.timing : undefined}>
            <div className="flex items-center gap-2">
              <TimeField
                value={timing.startTime}
                onChange={(startTime) => setTiming(moveTimingStart(timing, startTime ?? ''))}
                aria-label="Heure de début"
              />
              <span className="text-ink-3">–</span>
              <TimeField
                value={timing.endTime}
                onChange={(endTime) => setTiming({ ...timing, endTime })}
                aria-label="Heure de fin (facultative)"
              />
            </div>
          </FormRow>
        )}
      </div>

      {moreOptions ? (
        <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
          <FormRow label="Lieu">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Adresse, visio…" aria-label="Lieu" />
          </FormRow>
          <FormRow label="Projet">
            <ProjectMenu variant="field" value={projectId} onChange={setProjectId} />
          </FormRow>
          <FormRow label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ordre du jour, à préparer…" aria-label="Notes" />
          </FormRow>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMoreOptions(true)}
          className="mt-4 text-meta text-ink-3 transition-colors hover:text-ink"
        >
          + Lieu, projet et notes
        </button>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={createEvent.isPending}>
          Ajouter l’événement
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Monté une seule fois dans l'AppShell ; ouvert par le menu « Nouveau » (E) ou un clic dans le calendrier. */
export function CreateEventDialog() {
  const open = useCreateStore((state) => (state.open?.kind === 'event' ? state.open : null));
  const close = useCreateStore((state) => state.close);
  return (
    <Dialog
      open={open !== null}
      onOpenChange={(next) => !next && close()}
      title="Nouvel événement"
      width={580}
      restoreFocus={false}
    >
      {open && <CreateEventForm defaults={open.defaults} onDone={close} />}
    </Dialog>
  );
}
