import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ExternalLink, NotebookPen } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useCreateStore } from '@/app/create-store';
import { formatDateField } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { ColorDot } from '@/ui/data/ColorDot';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { ColorButton } from '@/ui/primitives/ColorButton';
import { googleError, useCourseHomework, useGoogleEvent, useGoogleEventSheet, useIgnoreCourse, useSetCourseColor } from '../hooks';
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
 * devoirs à rendre pour ce cours, et « Ajouter un devoir », à rendre par défaut au cours suivant du même
 * nom. « Ce n'est pas un cours » l'écarte pour de bon (une réunion, un atelier…).
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
            const target = next ?? { itemId, startsAt: event.startsAt };
            openCreate('homework', { subjectId: event.subjectId, courseEvent: target.itemId, dueDate: target.startsAt.slice(0, 10) });
          }}
        >
          Ajouter un devoir
        </Button>
        <span className="mt-1 block text-meta text-ink-3">
          {next ? `À rendre au cours suivant, ${formatDateField(next.startsAt.slice(0, 10), today)} (modifiable).` : 'À rendre pour ce cours (modifiable).'}
        </span>
      </Row>
    </>
  );
}

/** Un événement Google, en lecture seule (il se change dans Google Agenda) ; un cours propose ses devoirs. */
export function GoogleEventDialog() {
  const itemId = useGoogleEventSheet((state) => state.itemId);
  const close = useGoogleEventSheet((state) => state.close);
  const { data: event } = useGoogleEvent(itemId);
  const isCourse = Boolean(event?.isSchool && event.course && !event.ignored);
  const ignore = useIgnoreCourse();
  // « Ajouter un devoir » ferme cette fenêtre pour ouvrir celle du devoir : le focus ne revient pas au cours.
  const [chaining, setChaining] = useState(false);
  useEffect(() => {
    if (itemId) setChaining(false);
  }, [itemId]);
  return (
    <Dialog
      open={itemId !== null && Boolean(event)}
      onOpenChange={(open) => !open && close()}
      title={event ? (isCourse ? courseLabel({ ...event, course: event.subjectName ?? event.course }) : event.title) : ''}
      width={isCourse ? 520 : 480}
      restoreFocus={!chaining}
    >
      {event && itemId && (
        <>
          <div className="mt-4 grid grid-cols-[80px_minmax(0,1fr)] gap-x-4 gap-y-3">
            <Row label="Quand">{googleWhen(event)}</Row>
            {event.location && <Row label="Où">{event.location}</Row>}
            {isCourse ? (
              <CourseSection
                event={event}
                itemId={itemId}
                onAddHomework={() => {
                  setChaining(true);
                  close();
                }}
              />
            ) : (
              <Row label="Agenda">
                <span className="flex items-center gap-2">
                  <ColorDot color={event.color} />
                  {event.calendarName}
                </span>
              </Row>
            )}
          </div>
          <p className="mt-4 text-meta text-ink-3">
            {isCourse ? 'Le cours lui-même vient de ton agenda des cours (Google Agenda).' : 'Un événement Google Agenda se modifie dans Google Agenda ; Cockpit le relit toutes les 15 minutes.'}
            {event.isSchool && event.course && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => ignore.mutate({ course: event.course!, ignored: !event.ignored })}
                  className="text-ink-2 underline-offset-2 transition-colors hover:text-ink hover:underline"
                >
                  {event.ignored ? 'C’est un cours' : 'Ce n’est pas un cours'}
                </button>
              </>
            )}
          </p>
          <DialogFooter>
            {event.htmlLink && (
              <Button
                variant="ghost"
                icon={ExternalLink}
                className="mr-auto"
                onClick={() => void openGoogleLink(event.htmlLink!).catch((error: unknown) => toast(googleError(error), { tone: 'danger' }))}
              >
                Ouvrir dans Google Agenda
              </Button>
            )}
            <Button variant="primary" onClick={close}>
              Fermer
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
