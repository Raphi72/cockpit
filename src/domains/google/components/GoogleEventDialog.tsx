import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { ColorDot } from '@/ui/data/ColorDot';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { googleError, useGoogleEvent, useGoogleEventSheet } from '../hooks';
import type { LocalEvent } from '../model';
import { openGoogleLink } from '../native';
import { toast } from '@/ui/overlays/toast';

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
      <span className="text-ink-3">{label}</span>
      <span className="min-w-0 first-letter:uppercase">{children}</span>
    </>
  );
}

/** Un événement Google, en lecture seule : il se change dans Google Agenda. */
export function GoogleEventDialog() {
  const itemId = useGoogleEventSheet((state) => state.itemId);
  const close = useGoogleEventSheet((state) => state.close);
  const { data: event } = useGoogleEvent(itemId);
  return (
    <Dialog open={itemId !== null && Boolean(event)} onOpenChange={(open) => !open && close()} title={event?.title ?? ''} width={480}>
      {event && (
        <>
          <div className="mt-4 grid grid-cols-[80px_minmax(0,1fr)] gap-x-4 gap-y-2.5">
            <Row label="Quand">{googleWhen(event)}</Row>
            {event.location && <Row label="Où">{event.location}</Row>}
            <Row label="Agenda">
              <span className="flex items-center gap-2">
                <ColorDot color={event.color} />
                {event.calendarName}
              </span>
            </Row>
          </div>
          <p className="mt-4 text-meta text-ink-3">Un événement Google Agenda se modifie dans Google Agenda ; Cockpit le relit toutes les 15 minutes.</p>
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
