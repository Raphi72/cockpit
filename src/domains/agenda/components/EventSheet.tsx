import { Link } from '@tanstack/react-router';
import { parseISO } from 'date-fns';
import { ArrowUpRight, Repeat, Trash2, X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import { useState } from 'react';
import { formatLongDate, formatShortDate, toISODate } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { ProjectMenu } from '@/domains/projects/components/ProjectMenu';
import { handlePanelDeleteKey } from '@/ui/data/row-keys';
import { PropertyRow } from '@/ui/layout/PropertyRow';
import { ChoiceDialog } from '@/ui/overlays/ChoiceDialog';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/ui/overlays/Menu';
import { WindowErrorBoundary } from '@/ui/overlays/WindowErrorBoundary';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { InlineDate, InlineText, InlineTextarea, InlineTime } from '@/ui/primitives/InlineFields';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useEventSheet } from '../event-sheet-store';
import {
  useCancelOccurrence,
  useDeleteEvent,
  useEndSeries,
  useEvent,
  useEventExceptions,
  useMoveOccurrence,
  useResetOccurrence,
  useUpdateEvent,
} from '../hooks';
import {
  EVENT_KINDS,
  EVENT_KIND_LABELS,
  defaultStartTime,
  moveTimingDate,
  moveTimingStart,
  seriesChangeFromOccurrence,
  setTimingAllDay,
  timingColumns,
  timingOf,
  validateTiming,
  type AgendaEvent,
  type EventKind,
  type EventPatch,
  type EventTiming,
} from '../model';
import {
  formatRecurrence,
  isOccurrenceDay,
  moveRecurrenceStart,
  occurrenceMoment,
  parseRecurrence,
  recurrenceLabel,
  validateRecurrence,
  type Recurrence,
} from '../recurrence';
import { RecurrenceField } from './RecurrenceField';

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

/** « le lundi 16 novembre » */
const longDay = (day: string) => `le ${formatLongDate(parseISO(day)).toLowerCase()}`;

type EventSheetContentProps = {
  event: AgendaEvent;
  /** Événement qui se répète : le jour (prévu par la règle) de l'occurrence sur laquelle on a cliqué, s'il y en a une. */
  occurrence: string | null;
  onClose: () => void;
  remove: () => void;
};

function EventSheetContent({ event, occurrence, onClose, remove }: EventSheetContentProps) {
  const update = useUpdateEvent();
  const moveOnce = useMoveOccurrence();
  const resetOnce = useResetOccurrence();
  const setOccurrence = useEventSheet((state) => state.setOccurrence);
  const today = useToday();
  const save = (patch: EventPatch) => update.mutate({ id: event.id, patch });

  const recurrence = parseRecurrence(event.recurrence);
  const { data: exceptions } = useEventExceptions(recurrence && occurrence ? event.id : null);
  /** L'occurrence ouverte, à son moment réel : celui de la règle, ou celui où elle a été déplacée. */
  const opened = recurrence && occurrence ? occurrenceMoment(event, exceptions ?? [], occurrence) : null;
  const seriesTiming = timingOf(event);
  /** Ce que montrent « Date » et « Horaire » : l'occurrence ouverte, sinon l'événement (ou le début de sa série). */
  const timing = opened ? timingOf({ allDay: event.allDay, startsAt: opened.startsAt, endsAt: opened.endsAt }) : seriesTiming;

  /** Changement de date ou d'heure en attente du choix « cette fois » ou « toute la série ». */
  const [pending, setPending] = useState<EventTiming | null>(null);
  /** Remet les champs à leur valeur enregistrée quand un changement est abandonné. */
  const [fieldsVersion, setFieldsVersion] = useState(0);
  const fail = (message: string) => {
    toast(message, { tone: 'danger' });
    setFieldsVersion((version) => version + 1);
    return false;
  };

  /**
   * Date ou heure modifiée. Sur une occurrence, on demande d'abord si le changement vaut pour cette
   * fois ou pour toute la série. Un moment incohérent (fin avant le début…) n'est jamais enregistré.
   */
  const changeTiming = (next: EventTiming): boolean => {
    const error = validateTiming(next);
    if (error) return fail(error);
    if (opened) {
      setPending(next);
      return true;
    }
    // En hebdomadaire, le jour de la semaine de la répétition suit le premier jour.
    const rule = next.date !== timing.date ? moveRecurrenceStart(recurrence, next.date) : recurrence;
    const ruleError = validateRecurrence(rule, next.date);
    if (ruleError) return fail(ruleError);
    save({ ...timingColumns(next), ...(rule ? { recurrence: formatRecurrence(rule) } : {}) });
    return true;
  };

  const applyOnce = (next: EventTiming) => {
    if (!occurrence) return;
    const { startsAt, endsAt } = timingColumns(next);
    moveOnce.mutate({ event, occurrence, startsAt, endsAt });
  };

  const applyToSeries = (next: EventTiming) => {
    if (!occurrence) return;
    const change = seriesChangeFromOccurrence(event, occurrence, timing, next);
    if ('error' in change) {
      fail(change.error);
      return;
    }
    save(change.patch);
    setOccurrence(change.occurrence);
  };

  /** La règle vaut pour toute la série ; une fin avant le début n'est jamais enregistrée. */
  const saveRecurrence = (rule: Recurrence | null) => {
    const error = validateRecurrence(rule, seriesTiming.date);
    if (error) {
      fail(error);
      return;
    }
    save({ recurrence: rule ? formatRecurrence(rule) : null });
    // L'occurrence ouverte n'existe peut-être plus avec la nouvelle règle : le panneau montre alors la série.
    if (occurrence && (!rule || !isOccurrenceDay(seriesTiming.date, rule, occurrence))) setOccurrence(null);
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
            size="lg"
            icon={Trash2}
            aria-label="Supprimer l’événement"
            title="Supprimer · Suppr"
            onClick={remove}
          />
          <RadixDialog.Close asChild>
            <Button variant="ghost" size="lg" icon={X} aria-label="Fermer" title="Fermer · Échap" />
          </RadixDialog.Close>
        </div>
      </div>

      <RadixDialog.Title asChild>
        <div className="mt-5">
          <InlineText
            value={event.title}
            onSave={(title) => save({ title })}
            required
            wrap
            className="min-h-10 py-2 text-[17px] leading-[1.4] font-semibold tracking-tight"
            aria-label="Titre de l’événement"
          />
        </div>
      </RadixDialog.Title>
      <RadixDialog.Description className="sr-only">Modifier l’événement {event.title}</RadixDialog.Description>

      {/* Événement qui se répète : l'occurrence ouverte, sinon la règle en clair. */}
      {recurrence && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2">
          <Repeat className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
          {opened && occurrence ? (
            <>
              {formatLongDate(parseISO(timing.date))}
              {opened.moved && (
                <>
                  {/* Modifiée « cette fois » : un autre jour, ou seulement d'autres heures. */}
                  <span className="text-meta text-ink-3">
                    {timing.date === occurrence ? 'horaire modifié cette fois' : `déplacé, prévu ${longDay(occurrence)}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => resetOnce.mutate({ event, occurrence })}
                    className="text-meta text-ink-2 underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink"
                  >
                    {timing.date === occurrence ? 'Remettre l’horaire habituel' : 'Remettre à sa place'}
                  </button>
                </>
              )}
            </>
          ) : (
            recurrenceLabel(recurrence, seriesTiming.date, today)
          )}
        </p>
      )}

      <div className="mt-6">
        <PropertyRow label="Type">
          <EventKindMenu value={event.kind} onChange={(kind) => save({ kind })} />
        </PropertyRow>
        {/* Recréés après un changement abandonné : ils reprennent la valeur enregistrée. */}
        <div key={fieldsVersion}>
          <PropertyRow label={recurrence && !opened ? 'Depuis le' : 'Date'}>
            <InlineDate
              value={timing.date}
              onSave={(date) => date && changeTiming(moveTimingDate(timing, date))}
              clearable={false}
              aria-label={recurrence && !opened ? 'Première fois' : 'Date'}
            />
          </PropertyRow>
          {timing.allDay ? (
            <PropertyRow label="Jusqu’au">
              <InlineDate
                value={timing.endDate}
                onSave={(endDate) => changeTiming({ ...timing, endDate })}
                aria-label="Dernier jour (facultatif)"
              />
            </PropertyRow>
          ) : (
            <PropertyRow label="Horaire">
              <div className="-ml-2 flex items-center gap-1">
                <InlineTime
                  value={timing.startTime}
                  onSave={(startTime) => startTime !== null && changeTiming(moveTimingStart(timing, startTime))}
                  aria-label="Heure de début"
                />
                <span className="text-ink-3">–</span>
                <InlineTime
                  value={timing.endTime}
                  onSave={(endTime) => changeTiming({ ...timing, endTime })}
                  aria-label="Heure de fin (facultative)"
                />
              </div>
            </PropertyRow>
          )}
        </div>
        <PropertyRow label="">
          <div className="flex h-8 items-center">
            {/* Avec ou sans heures : c'est l'événement entier, jamais une seule occurrence. */}
            <Checkbox
              checked={seriesTiming.allDay}
              onChange={(allDay) => {
                const next = setTimingAllDay(seriesTiming, allDay, defaultStartTime(seriesTiming.date, today, new Date()));
                const error = validateTiming(next);
                if (error) fail(error);
                else save(timingColumns(next));
              }}
            >
              Journée entière
            </Checkbox>
          </div>
        </PropertyRow>
        <PropertyRow label="Répéter">
          <RecurrenceField value={recurrence} start={seriesTiming.date} onChange={saveRecurrence} variant="inline" />
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

      <ChoiceDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (open) return;
          setPending(null);
          setFieldsVersion((version) => version + 1);
        }}
        title="Modifier un événement qui se répète"
        choices={[
          {
            label: 'Cette fois',
            hint: occurrence ? `Seulement ${longDay(occurrence)}.` : undefined,
            onSelect: () => pending && applyOnce(pending),
          },
          { label: 'Toute la série', hint: 'Toutes les fois, passées comprises.', onSelect: () => pending && applyToSeries(pending) },
        ]}
      />
    </>
  );
}

/**
 * Panneau latéral d'un événement : s'ouvre au clic dans le calendrier, tout s'y modifie sur place.
 * Pour un événement qui se répète, ouvert sur une de ses occurrences, changer la date ou l'heure et
 * supprimer demandent d'abord si c'est pour cette fois ou pour toute la série.
 */
export function EventSheet() {
  const eventId = useEventSheet((state) => state.eventId);
  const occurrence = useEventSheet((state) => state.occurrence);
  const close = useEventSheet((state) => state.close);
  const { data: event } = useEvent(eventId);
  const deleteEvent = useDeleteEvent();
  const cancelOnce = useCancelOccurrence();
  const endSeries = useEndSeries();
  const [choosingDelete, setChoosingDelete] = useState(false);

  const removeAll = () => {
    if (!event) return;
    close();
    deleteEvent.mutate(event);
  };
  /** Corbeille ou Suppr : sur une occurrence, on demande d'abord ce qu'il faut supprimer. */
  const remove = () => {
    if (event?.recurrence && occurrence) setChoosingDelete(true);
    else removeAll();
  };

  return (
    <>
      <RadixDialog.Root open={eventId !== null} onOpenChange={(open) => !open && close()}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade bg-backdrop" />
          <RadixDialog.Content
            onKeyDown={(keyEvent) => handlePanelDeleteKey(keyEvent, remove)}
            className="fixed inset-y-0 right-0 z-50 w-[min(460px,100vw)] overflow-y-auto border-l border-line bg-elevated px-7 py-5 phone:px-5 phone:pt-[calc(env(safe-area-inset-top)+1rem)] phone:pb-[calc(env(safe-area-inset-bottom)+1.5rem)] shadow-overlay animate-slide-in focus:outline-none"
          >
            <WindowErrorBoundary onClose={close}>
              {event ? (
                <EventSheetContent event={event} occurrence={occurrence} onClose={close} remove={remove} />
              ) : (
                <RadixDialog.Title className="sr-only">Événement</RadixDialog.Title>
              )}
            </WindowErrorBoundary>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <ChoiceDialog
        open={choosingDelete && Boolean(event) && occurrence !== null}
        onOpenChange={setChoosingDelete}
        title="Supprimer un événement qui se répète"
        choices={[
          {
            label: 'Cette fois',
            hint: occurrence ? `Seulement ${longDay(occurrence)}.` : undefined,
            onSelect: () => {
              if (!event || !occurrence) return;
              close();
              cancelOnce.mutate({ event, occurrence });
            },
          },
          {
            label: 'Celle-ci et les suivantes',
            hint: 'La série s’arrête la veille.',
            onSelect: () => {
              if (!event || !occurrence) return;
              close();
              endSeries.mutate({ event, occurrence });
            },
          },
          { label: 'Toute la série', hint: 'Toutes les fois, passées comprises.', onSelect: removeAll },
        ]}
      />
    </>
  );
}
