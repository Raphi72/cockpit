import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ExternalLink, NotebookPen, Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useCreateStore } from '@/app/create-store';
import { formatShortDate } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { useSubjects } from '@/domains/school/subjects/hooks';
import { ColorDot } from '@/ui/data/ColorDot';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { googleError, useCourseContext, useGoogleEvent, useGoogleEventSheet, useLinkCourse } from '../hooks';
import { freeSubjectColor, type LocalEvent } from '../model';
import { openGoogleLink } from '../native';
import type { GoogleEventDetail } from '../repository';

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
      <span className="min-w-0 first-letter:uppercase">{children}</span>
    </>
  );
}

/** La matière d'un cours : celle qu'on lui a donnée (ou créée toute seule), à changer d'un clic. */
function SubjectPicker({ event }: { event: GoogleEventDetail }) {
  const { data: subjects = [] } = useSubjects();
  const link = useLinkCourse();
  const course = event.course!;
  const label = event.subjectName ?? (event.ignored ? 'Pas un cours' : 'À relier à une matière');
  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton variant="field" aria-label="Matière de ce cours" className="!w-fit">
          {event.subjectId && <ColorDot color={event.color} />}
          <span className={event.subjectId ? '' : 'text-ink-3'}>{label}</span>
        </PropertyButton>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup value={event.subjectId ?? ''} onValueChange={(id) => link.mutate({ course, subjectId: id || null })}>
          {subjects.map((subject) => (
            <MenuRadioItem key={subject.id} value={subject.id} leading={<ColorDot color={subject.color} />}>
              {subject.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem icon={Plus} onSelect={() => link.mutate({ course, subjectId: null, newSubject: { name: course, color: freeSubjectColor(subjects.map((s) => s.color)) } })}>
          Nouvelle matière « {course} »
        </MenuItem>
        <MenuItem onSelect={() => link.mutate({ course, subjectId: null })}>Ce n’est pas un cours</MenuItem>
      </MenuContent>
    </Menu>
  );
}

/**
 * Un cours de l'agenda des cours : sa matière, les devoirs attendus pour lui, et « Ajouter un devoir »,
 * à rendre par défaut au cours suivant de la même matière.
 */
function CourseSection({ event, itemId, onClose }: { event: GoogleEventDetail; itemId: string; onClose: () => void }) {
  const today = useToday();
  const openCreate = useCreateStore((state) => state.openCreate);
  const courseDay = event.startsAt.slice(0, 10);
  const { data: context } = useCourseContext(itemId, event.subjectId, courseDay);
  const dueDay = context?.nextDay ?? courseDay;
  return (
    <>
      <Row label="Matière">
        <SubjectPicker event={event} />
      </Row>
      {event.subjectId && (
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
            <span className="text-ink-3">Rien à rendre pour ce cours.</span>
          )}
          <Button
            variant="secondary"
            icon={NotebookPen}
            className="mt-2"
            onClick={() => {
              onClose();
              openCreate('homework', { subjectId: event.subjectId, dueDate: dueDay });
            }}
          >
            Ajouter un devoir
          </Button>
          <span className="mt-1 block text-meta text-ink-3">
            À rendre {context?.nextDay ? `au cours suivant, ${formatShortDate(dueDay, today)}` : `pour ce cours`} (modifiable).
          </span>
        </Row>
      )}
    </>
  );
}

/** Un événement Google, en lecture seule (il se change dans Google Agenda) ; un cours propose ses devoirs. */
export function GoogleEventDialog() {
  const itemId = useGoogleEventSheet((state) => state.itemId);
  const close = useGoogleEventSheet((state) => state.close);
  const { data: event } = useGoogleEvent(itemId);
  const isCourse = Boolean(event?.isSchool && event.course);
  // « Ajouter un devoir » ferme cette fenêtre pour ouvrir celle du devoir : le focus ne revient pas au cours.
  const [chaining, setChaining] = useState(false);
  useEffect(() => {
    if (itemId) setChaining(false);
  }, [itemId]);
  return (
    <Dialog
      open={itemId !== null && Boolean(event)}
      onOpenChange={(open) => !open && close()}
      title={event?.title ?? ''}
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
                onClose={() => {
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
