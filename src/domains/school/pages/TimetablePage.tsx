import { CalendarClock, CalendarRange, Plus } from 'lucide-react';
import { useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { useToday } from '@/core/use-today';
import { formatDuration } from '@/domains/tasks/model';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { SchoolCalendarDialog } from '../periods/components/SchoolCalendarDialog';
import { usePeriods } from '../periods/hooks';
import { hasClassesOn, schoolStatus } from '../periods/model';
import { useSubjects } from '../subjects/hooks';
import { SlotDialog } from '../timetable/components/SlotDialog';
import { TimetableGrid } from '../timetable/components/TimetableGrid';
import { useSlots } from '../timetable/hooks';
import { isoWeekday, weeklyMinutes, type SlotInput, type TimetableSlot } from '../timetable/model';

type Editing = { slot?: TimetableSlot; defaults?: Partial<SlotInput> } | null;

/**
 * Emploi du temps : la semaine type, valable toute l'année (pendant les semestres, hors vacances).
 * Les cours de chaque jour en sont calculés : calendrier, dashboard, fiche d'une matière.
 */
export function TimetablePage() {
  const today = useToday();
  const openCreate = useCreateStore((state) => state.openCreate);
  const { data: subjects } = useSubjects();
  const { data: slots } = useSlots();
  const { data: periods } = usePeriods();
  const [editing, setEditing] = useState<Editing>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  if (!subjects || !slots || !periods) return null;

  const status = schoolStatus(periods, today);
  const weekly = weeklyMinutes(slots);
  const subtitle = [slots.length > 0 ? `${formatDuration(weekly)} de cours par semaine` : null, status].filter(Boolean).join(' · ');

  return (
    <Page
      title="Emploi du temps"
      subtitle={subtitle || 'Ta semaine type, valable toute l’année.'}
      actions={
        <>
          <Button variant="ghost" icon={CalendarRange} onClick={() => setCalendarOpen(true)}>
            Semestres et vacances
          </Button>
          <Button variant="secondary" icon={Plus} onClick={() => setEditing({})} disabled={subjects.length === 0}>
            Nouveau cours
          </Button>
        </>
      }
    >
      {subjects.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Commence par tes matières">
          <p>Chaque cours de la semaine appartient à une matière : ajoute-les d’abord.</p>
          <div className="mt-4">
            <Button variant="primary" icon={Plus} onClick={() => openCreate('subject')}>
              Ajouter une matière
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          {slots.length === 0 && (
            <p className="mb-6 text-ink-3">Clique sur un créneau de la grille pour y placer un cours, ou utilise « Nouveau cours ».</p>
          )}
          <TimetableGrid
            slots={slots}
            todayWeekday={hasClassesOn(periods, today) ? isoWeekday(today) : null}
            onOpen={(slot) => setEditing({ slot })}
            onCreate={(weekday, startsAt) => setEditing({ defaults: { weekday, startsAt } })}
          />
        </>
      )}

      <SlotDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        slot={editing?.slot}
        defaults={editing?.defaults}
      />
      <SchoolCalendarDialog open={calendarOpen} onOpenChange={setCalendarOpen} />
    </Page>
  );
}
