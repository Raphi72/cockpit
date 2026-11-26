import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { SlotDialog } from '../timetable/components/SlotDialog';
import { useSlots } from '../timetable/hooks';
import { WEEKDAY_LABELS, slotRoom, type TimetableSlot } from '../timetable/model';

/** Fiche d'une matière : ses cours de la semaine type. */
export function SubjectClasses({ subjectId }: { subjectId: string }) {
  const { data: slots = [] } = useSlots();
  const [editing, setEditing] = useState<{ slot?: TimetableSlot } | null>(null);
  const mine = slots.filter((slot) => slot.subjectId === subjectId);

  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <h2 className="font-semibold">Cours</h2>
        <Button variant="ghost" icon={Plus} className="ml-auto" onClick={() => setEditing({})}>
          Ajouter
        </Button>
      </div>
      {mine.length === 0 ? (
        <p className="py-2 text-ink-3">Pas encore dans l’emploi du temps.</p>
      ) : (
        <ul>
          {mine.map((slot) => (
            <li key={slot.id}>
              <button
                type="button"
                onClick={() => setEditing({ slot })}
                className="-mx-2.5 flex min-h-10 w-[calc(100%+20px)] items-baseline gap-2 rounded-md px-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover"
              >
                <span>{WEEKDAY_LABELS[slot.weekday]}</span>
                <span className="tnum text-ink-2">
                  {slot.startsAt} – {slot.endsAt}
                </span>
                <span className="truncate text-meta text-ink-3">{[slot.label, slotRoom(slot)].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <SlotDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        slot={editing?.slot}
        defaults={{ subjectId }}
      />
    </section>
  );
}
