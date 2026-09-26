import { useCreateStore } from '@/app/create-store';
import { useEventSheet } from '../event-sheet-store';
import { useProjectEvents } from '../hooks';
import { eventWhenLabel } from '../model';

/** Au-delà, « et N autres » : la fiche garde peu de lignes, le calendrier montre le reste. */
const SHOWN = 3;

/**
 * Fiche projet : ses prochains événements (rendez-vous, réunions, échéances saisies), un clic ouvre
 * le panneau de l'événement. Les deadlines et encaissements sont déjà dans Propriétés et Finances.
 */
export function ProjectEvents({ projectId, today }: { projectId: string; today: string }) {
  const { data: events } = useProjectEvents(projectId, today);
  const openEvent = useEventSheet((state) => state.openEvent);
  const openCreate = useCreateStore((state) => state.openCreate);
  if (!events) return null;
  const hidden = events.length - SHOWN;

  return (
    <div>
      {events.length === 0 ? (
        <p className="text-meta text-ink-3">Aucun événement à venir.</p>
      ) : (
        <ul>
          {events.slice(0, SHOWN).map((event) => (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => openEvent(event.id)}
                className="-mx-2 flex w-[calc(100%+16px)] min-w-0 flex-col rounded-md px-2 py-1.5 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-soft"
              >
                <span className="truncate">{event.title}</span>
                <span className="text-meta text-ink-3">
                  {eventWhenLabel(event, today)}
                  {event.location && ` · ${event.location}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="mt-1 text-meta text-ink-3">
          et {hidden} autre{hidden > 1 ? 's' : ''} dans le calendrier
        </p>
      )}
      <button
        type="button"
        onClick={() => openCreate('event', { projectId })}
        className="mt-2 text-meta text-ink-3 transition-colors hover:text-ink"
      >
        + Événement
      </button>
    </div>
  );
}
