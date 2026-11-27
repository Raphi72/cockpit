import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ExternalLink, NotebookPen, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useCreateStore } from '@/app/create-store';
import { formatDateField, isISODate } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { moveTimingDate, moveTimingStart, setTimingAllDay, timingColumns, timingOf, validateTiming, type EventTiming } from '@/domains/agenda/model';
import { ProjectMenu } from '@/domains/projects/components/ProjectMenu';
import { SubjectMenu } from '@/domains/school/subjects/components/SubjectMenu';
import { ColorDot } from '@/ui/data/ColorDot';
import { FormRow } from '@/ui/layout/FormRow';
import { ChoiceDialog } from '@/ui/overlays/ChoiceDialog';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { ColorButton } from '@/ui/primitives/ColorButton';
import { DateField } from '@/ui/primitives/DateField';
import { Input, Textarea } from '@/ui/primitives/Input';
import { TimeField } from '@/ui/primitives/TimeField';
import { useDeleteGoogleEvent, useRestoreGoogleEvent, useSaveGoogleEvent, type EditTarget } from '../edits/hooks';
import type { EditScope, EventContent } from '../edits/model';
import { googleError, useCourseHomework, useGoogleEvent, useGoogleEventSheet, useGoogleStatus, useIgnoreCourse, useSetCourseColor } from '../hooks';
import type { LocalEvent } from '../model';
import { openGoogleLink } from '../native';
import type { GoogleEventDetail } from '../repository';
import { courseLabel } from './CoursePicker';

const day = (iso: string) => format(new Date(`${iso.slice(0, 10)}T12:00:00`), 'EEEE d MMMM', { locale: fr });

/** « jeudi 26 novembre, 10:00 – 11:00 », « du lundi 1 au mercredi 3 décembre », « samedi 28 novembre ». */
export function googleWhen(event: Pick<LocalEvent, 'startsAt' | 'endsAt' | 'allDay'>): string {
  if (event.allDay) return event.endsAt ? `du ${day(event.startsAt)} au ${day(event.endsAt)}` : day(event.startsAt);
  const start = event.startsAt.slice(11, 16);
  if (!event.endsAt) return `${day(event.startsAt)}, ${start}`;
  const end = event.endsAt.slice(11, 16);
  return event.endsAt.slice(0, 10) === event.startsAt.slice(0, 10) ? `${day(event.startsAt)}, ${start} – ${end}` : `${day(event.startsAt)}, ${start} – ${day(event.endsAt)}, ${end}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-0.5 text-ink-3">{label}</span>
      <div className="min-w-0 first-letter:uppercase">{children}</div>
    </>
  );
}

/**
 * Un cours de l'agenda des cours : son nom (sa matière, créée toute seule), sa couleur, ses profs, les
 * devoirs à rendre pour ce cours, et « Ajouter un devoir », à rendre pour ce cours-ci (le cours suivant
 * est proposé d'un clic). « Ce n'est pas un cours » l'écarte pour de bon (une réunion, un atelier…).
 */
function CourseSection({ event, itemId, onAddHomework }: { event: GoogleEventDetail; itemId: string; onAddHomework: () => void }) {
  const today = useToday();
  const openCreate = useCreateStore((state) => state.openCreate);
  const setColor = useSetCourseColor();
  const { data: context } = useCourseHomework(itemId, event.course ?? null, event.subjectId, event.startsAt);
  const next = context?.next ?? null;
  return (
    <>
      {event.teacher && <Row label="Avec">{event.teacher}</Row>}
      {event.subjectId && (
        <Row label="Couleur">
          <span className="-my-1.5 -ml-1.5 block w-fit">
            <ColorButton value={event.color} onChange={(color) => setColor.mutate({ subjectId: event.subjectId!, color })} label="Couleur de ce cours" />
          </span>
        </Row>
      )}
      <Row label="Devoirs">
        {context && context.homework.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {context.homework.map((task) => (
              <li key={task.id} className={task.status === 'done' ? 'text-ink-3 line-through' : ''}>
                {task.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-3">Rien à rendre pour ce cours.</p>
        )}
        <Button
          variant="secondary"
          icon={NotebookPen}
          className="mt-3"
          onClick={() => {
            onAddHomework();
            // Pour ce cours-ci : la fenêtre du devoir propose aussi le cours suivant, d'un clic.
            openCreate('homework', { subjectId: event.subjectId, courseEvent: itemId, dueDate: event.startsAt.slice(0, 10) });
          }}
        >
          Ajouter un devoir
        </Button>
        <span className="mt-1 block text-meta text-ink-3">
          {next ? `Pour ce cours, ou le suivant (${formatDateField(next.startsAt.slice(0, 10), today)}) : au choix.` : 'Pour ce cours.'}
        </span>
      </Row>
    </>
  );
}

/** Le contenu modifiable d'un événement de la copie. */
function contentOf(event: GoogleEventDetail): EventContent {
  return {
    title: event.title,
    location: event.location,
    notes: event.notes ?? null,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    projectId: event.linkedProjectId,
    subjectId: event.linkedSubjectId,
  };
}

/** Ce que dit la fiche de l'envoi : en attente, refusé, ou retouche qui reste dans Cockpit. */
function WriteState({ event, writeAllowed, onRestore }: { event: GoogleEventDetail; writeAllowed: boolean; onRestore: () => void }) {
  if (!event.writable) {
    return (
      <p className="mt-4 text-meta text-ink-3">
        Cet agenda ne se modifie pas chez Google (l’intranet le fournit) : tes changements restent dans Cockpit, et sur ton téléphone.
        {event.edited && (
          <>
            {' '}
            <button type="button" onClick={onRestore} className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
              Rétablir
            </button>
          </>
        )}
      </p>
    );
  }
  if (event.editError) return <p className="mt-4 text-meta text-warning">Google a refusé une modification : {event.editError}</p>;
  if (event.pendingEdits > 0) {
    return (
      <p className="mt-4 text-meta text-ink-3">
        {writeAllowed
          ? 'Modification en attente : elle partira chez Google dès que la connexion revient.'
          : 'Modification en attente : autorise la modification dans Paramètres › Google Agenda pour qu’elle parte chez Google.'}
      </p>
    );
  }
  return null;
}

/**
 * Un événement Google, modifiable comme un événement de Cockpit (après la 2.7.0) : titre, moment, lieu,
 * notes, rattachement à un projet ou une matière, suppression avec « Annuler ». Les changements partent chez
 * Google (aussi plus tard, hors ligne) ; sur un agenda en lecture seule, ils restent dans Cockpit. Un cours
 * garde ses devoirs. Pour un événement qui se répète : cet événement, ou toute la série.
 */
function GoogleEventForm({ event, itemId, onClose, onChain }: { event: GoogleEventDetail; itemId: string; onClose: () => void; onChain: () => void }) {
  const isCourse = Boolean(event.isSchool && event.course && !event.ignored);
  const ignore = useIgnoreCourse();
  const save = useSaveGoogleEvent();
  const remove = useDeleteGoogleEvent();
  const restore = useRestoreGoogleEvent();
  const { data: status } = useGoogleStatus();
  const before = contentOf(event);
  const [title, setTitle] = useState(event.title);
  const [timing, setTiming] = useState<EventTiming>(() => timingOf(event));
  const [location, setLocation] = useState(event.location ?? '');
  const [notes, setNotes] = useState(event.notes ?? '');
  const [projectId, setProjectId] = useState<string | null>(event.linkedProjectId);
  const [subjectId, setSubjectId] = useState<string | null>(event.linkedSubjectId);
  const [asking, setAsking] = useState<'save' | 'delete' | null>(null);
  const timingError = validateTiming(timing);
  const target: EditTarget = { calendarId: event.calendarId, eventId: event.id, seriesId: event.seriesId ?? null, writable: event.writable };

  const after: EventContent = {
    title: title.trim() || event.title,
    location: location.trim() || null,
    notes: notes.trim() || null,
    ...timingColumns(timing),
    projectId,
    subjectId,
  };

  const doSave = (scope: EditScope) => save.mutate({ target, before, after, scope }, { onSuccess: onClose });
  const doDelete = (scope: EditScope) => {
    onClose();
    remove.mutate({ target, scope, title: event.title });
  };
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (timingError) return;
    if (target.seriesId) setAsking('save');
    else doSave('this');
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
      className="mt-4"
    >
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titre de l’événement" className="h-10 text-[15px]" />
      <div className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <FormRow label="Date">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <DateField
              value={timing.date || null}
              onChange={(date) => setTiming(date && isISODate(date) ? moveTimingDate(timing, date) : { ...timing, date: date ?? '' })}
              clearable={false}
              aria-label="Date"
            />
            <Checkbox checked={timing.allDay} onChange={(allDay) => setTiming(setTimingAllDay(timing, allDay, timing.startTime ?? '09:00'))}>
              Journée entière
            </Checkbox>
          </div>
        </FormRow>
        {timing.allDay ? (
          <FormRow label="Jusqu’au" error={timingError ?? undefined}>
            <DateField value={timing.endDate} onChange={(endDate) => setTiming({ ...timing, endDate })} aria-label="Dernier jour (facultatif)" />
          </FormRow>
        ) : (
          <FormRow label="Horaire" error={timingError ?? undefined}>
            <div className="flex items-center gap-2">
              <TimeField value={timing.startTime} onChange={(startTime) => setTiming(moveTimingStart(timing, startTime ?? ''))} aria-label="Heure de début" />
              <span className="text-ink-3">–</span>
              <TimeField value={timing.endTime} onChange={(endTime) => setTiming({ ...timing, endTime })} aria-label="Heure de fin (facultative)" />
            </div>
          </FormRow>
        )}
        <FormRow label="Lieu">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Adresse, salle, visio…" aria-label="Lieu" />
        </FormRow>
        {isCourse ? (
          <CourseSection event={event} itemId={itemId} onAddHomework={onChain} />
        ) : (
          <>
            <FormRow label="Projet">
              <ProjectMenu variant="field" value={projectId} onChange={(id) => {
                setProjectId(id);
                if (id) setSubjectId(null);
              }} />
            </FormRow>
            <FormRow label="Matière">
              <div className="flex items-center gap-2">
                <SubjectMenu variant="field" value={subjectId} placeholder="Aucune" onChange={(id) => {
                  setSubjectId(id);
                  setProjectId(null);
                }} />
                {subjectId && (
                  <Button variant="ghost" onClick={() => setSubjectId(null)}>
                    Retirer
                  </Button>
                )}
              </div>
            </FormRow>
            <FormRow label="Agenda">
              <span className="flex items-center gap-2 pt-2">
                <ColorDot color={event.color} />
                {event.calendarName}
              </span>
            </FormRow>
          </>
        )}
        <FormRow label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ordre du jour, à préparer…" aria-label="Notes" />
        </FormRow>
      </div>

      <WriteState event={event} writeAllowed={status?.writeAllowed ?? false} onRestore={() => {
        onClose();
        restore.mutate(target);
      }} />
      {event.isSchool && event.course && (
        <p className="mt-2 text-meta text-ink-3">
          <button
            type="button"
            onClick={() => ignore.mutate({ course: event.course!, ignored: !event.ignored })}
            className="text-ink-2 underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            {event.ignored ? 'C’est un cours' : 'Ce n’est pas un cours'}
          </button>
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" icon={Trash2} className="mr-auto !text-danger" onClick={() => (target.seriesId ? setAsking('delete') : doDelete('this'))}>
          Supprimer
        </Button>
        {event.htmlLink && (
          <Button
            variant="ghost"
            icon={ExternalLink}
            aria-label="Ouvrir dans Google Agenda"
            title="Ouvrir dans Google Agenda"
            onClick={() => void openGoogleLink(event.htmlLink!).catch((error: unknown) => toast(googleError(error), { tone: 'danger' }))}
          />
        )}
        <Button variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={save.isPending || Boolean(timingError)}>
          Enregistrer
        </Button>
      </DialogFooter>

      <ChoiceDialog
        open={asking !== null}
        onOpenChange={(open) => !open && setAsking(null)}
        title={asking === 'delete' ? 'Supprimer un événement qui se répète' : 'Modifier un événement qui se répète'}
        choices={[
          { label: 'Cet événement', hint: 'Seulement celui-ci', onSelect: () => (asking === 'delete' ? doDelete('this') : doSave('this')) },
          {
            label: 'Tous les événements de la série',
            hint: asking === 'delete' ? 'Toute la série disparaît' : 'Titre, lieu, notes, rattachement et heures ; chacun garde son jour',
            onSelect: () => (asking === 'delete' ? doDelete('all') : doSave('all')),
          },
        ]}
      />
    </form>
  );
}

/** Monté une fois : un clic sur un événement Google, dans le calendrier, la Journée ou Aujourd'hui. */
export function GoogleEventDialog() {
  const itemId = useGoogleEventSheet((state) => state.itemId);
  const close = useGoogleEventSheet((state) => state.close);
  const { data: event } = useGoogleEvent(itemId);
  const isCourse = Boolean(event?.isSchool && event.course && !event.ignored);
  // « Ajouter un devoir » ferme cette fenêtre pour ouvrir celle du devoir : le focus ne revient pas au cours.
  const [chaining, setChaining] = useState(false);
  useEffect(() => {
    if (itemId) setChaining(false);
  }, [itemId]);
  return (
    <Dialog
      open={itemId !== null && Boolean(event)}
      onOpenChange={(open) => !open && close()}
      title={event ? (isCourse ? courseLabel({ ...event, course: event.subjectName ?? event.course }) : 'Événement Google') : ''}
      description={event ? googleWhen(event) : undefined}
      width={560}
      restoreFocus={!chaining}
    >
      {event && itemId && (
        <GoogleEventForm
          key={itemId}
          event={event}
          itemId={itemId}
          onClose={close}
          onChain={() => {
            setChaining(true);
            close();
          }}
        />
      )}
    </Dialog>
  );
}
