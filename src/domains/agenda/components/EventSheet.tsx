import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Trash2, X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import { formatShortDate, toISODate } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { ProjectMenu } from '@/domains/projects/components/ProjectMenu';
import { PropertyRow } from '@/ui/layout/PropertyRow';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/ui/overlays/Menu';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { InlineDate, InlineText, InlineTextarea, InlineTime } from '@/ui/primitives/InlineFields';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useEventSheet } from '../event-sheet-store';
import { useDeleteEvent, useEvent, useUpdateEvent } from '../hooks';
import {
  EVENT_KINDS,
  EVENT_KIND_LABELS,
  defaultStartTime,
  moveTimingDate,
  moveTimingStart,
  setTimingAllDay,
  timingColumns,
  timingOf,
  validateTiming,
  type AgendaEvent,
  type EventKind,
  type EventPatch,
  type EventTiming,
} from '../model';

function EventKindMenu({ value, onChange }: { value: EventKind; onChange: (kind: EventKind) => void }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton aria-label="Type">{EVENT_KIND_LABELS[value]}</PropertyButton>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as EventKind)}>
          {EVENT_KINDS.map((kind) => (
            <MenuRadioItem key={kind} value={kind}>
              {EVENT_KIND_LABELS[kind]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function EventSheetContent({ event, onClose }: { event: AgendaEvent; onClose: () => void }) {
  const update = useUpdateEvent();
  const remove = useDeleteEvent();
  const today = useToday();
  const save = (patch: EventPatch) => update.mutate({ id: event.id, patch });
  const timing = timingOf(event);

  /** Un moment incohérent (fin avant le début…) n'est jamais enregistré. */
  const saveTiming = (next: EventTiming): boolean => {
    const error = validateTiming(next);
    if (error) {
      toast(error, { tone: 'danger' });
      return false;
    }
    save(timingColumns(next));
    return true;
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        {event.projectId && event.projectName ? (
          <Link
            to="/projects/$projectId"
            params={{ projectId: event.projectId }}
            onClick={onClose}
            className="-ml-2 flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-meta text-ink-2 hover:bg-hover hover:text-ink"
          >
            <span className="truncate">{event.projectName}</span>
            <ArrowUpRight className="size-3.5 shrink-0" strokeWidth={1.75} />
          </Link>
        ) : (
          <span className="text-meta text-ink-3">Événement</span>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            icon={Trash2}
            aria-label="Supprimer l’événement"
            title="Supprimer"
            onClick={() => {
              onClose();
              remove.mutate(event);
            }}
          />
          <RadixDialog.Close asChild>
            <Button variant="ghost" icon={X} aria-label="Fermer" title="Fermer · Échap" />
          </RadixDialog.Close>
        </div>
      </div>

      <RadixDialog.Title asChild>
        <div className="mt-5">
          <InlineText
            value={event.title}
            onSave={(title) => save({ title })}
            required
            className="h-10 text-[17px] font-semibold tracking-tight"
            aria-label="Titre de l’événement"
          />
        </div>
      </RadixDialog.Title>
      <RadixDialog.Description className="sr-only">Modifier l’événement {event.title}</RadixDialog.Description>

      <div className="mt-6">
        <PropertyRow label="Type">
          <EventKindMenu value={event.kind} onChange={(kind) => save({ kind })} />
        </PropertyRow>
        <PropertyRow label="Date">
          <InlineDate
            value={timing.date}
            onSave={(date) => date && saveTiming(moveTimingDate(timing, date))}
            aria-label="Date"
          />
        </PropertyRow>
        {timing.allDay ? (
          <PropertyRow label="Jusqu’au">
            <InlineDate
              value={timing.endDate}
              onSave={(endDate) => saveTiming({ ...timing, endDate })}
              aria-label="Dernier jour (facultatif)"
            />
          </PropertyRow>
        ) : (
          <PropertyRow label="Horaire">
            <div className="-ml-2 flex items-center gap-1">
              <InlineTime
                value={timing.startTime}
                onSave={(startTime) => startTime !== null && saveTiming(moveTimingStart(timing, startTime))}
                aria-label="Heure de début"
              />
              <span className="text-ink-3">–</span>
              <InlineTime
                value={timing.endTime}
                onSave={(endTime) => saveTiming({ ...timing, endTime })}
                aria-label="Heure de fin (facultative)"
              />
            </div>
          </PropertyRow>
        )}
        <PropertyRow label="">
          <div className="flex h-8 items-center">
            <Checkbox
              checked={timing.allDay}
              onChange={(allDay) =>
                saveTiming(setTimingAllDay(timing, allDay, defaultStartTime(timing.date, today, new Date())))
              }
            >
              Journée entière
            </Checkbox>
          </div>
        </PropertyRow>
        <PropertyRow label="Lieu">
          <InlineText
            value={event.location ?? ''}
            onSave={(location) => save({ location: location || null })}
            placeholder="Ajouter un lieu"
            aria-label="Lieu"
          />
        </PropertyRow>
        <PropertyRow label="Projet">
          <ProjectMenu value={event.projectId} currentName={event.projectName} onChange={(projectId) => save({ projectId })} />
        </PropertyRow>
      </div>

      <h3 className="mt-8 mb-1.5 text-meta font-medium text-ink-2">Notes</h3>
      <InlineTextarea
        value={event.notes}
        onSave={(notes) => save({ notes })}
        placeholder="Ordre du jour, à préparer, contacts…"
        className="min-h-28"
        aria-label="Notes"
      />

      <p className="mt-8 text-meta text-ink-3">Créé le {formatShortDate(toISODate(new Date(event.createdAt)), today)}</p>
    </>
  );
}

/** Panneau latéral d'un événement : s'ouvre au clic dans le calendrier, tout s'y modifie sur place. */
export function EventSheet() {
  const eventId = useEventSheet((state) => state.eventId);
  const close = useEventSheet((state) => state.close);
  const { data: event } = useEvent(eventId);

  return (
    <RadixDialog.Root open={eventId !== null} onOpenChange={(open) => !open && close()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade bg-backdrop" />
        <RadixDialog.Content className="fixed inset-y-0 right-0 z-50 w-[min(460px,100vw)] overflow-y-auto border-l border-line bg-elevated px-7 py-5 shadow-overlay animate-slide-in focus:outline-none">
          {event ? (
            <EventSheetContent event={event} onClose={close} />
          ) : (
            <RadixDialog.Title className="sr-only">Événement</RadixDialog.Title>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
