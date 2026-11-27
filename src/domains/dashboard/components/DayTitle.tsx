import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDaysISO } from '@/core/dates';
import { DatePicker, type DayMark } from '@/ui/primitives/DatePicker';
import { dashboardTitle } from '../model';

/**
 * Date en titre, entre deux flèches pour passer d'un jour à l'autre (← → au clavier), puis le
 * calendrier pour aller directement à un jour (D) : on y voit les jours qui ont des tâches (point
 * gris) ou une deadline (point rouge). La flèche de gauche déborde dans la marge : la date reste
 * alignée sur le contenu. La date a une largeur minimale pour que la flèche de droite ne bouge pas.
 */
export function DayTitle(props: {
  day: string;
  today: string;
  marks: Map<string, DayMark>;
  onGo: (day: string) => void;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
}) {
  const { day, today, onGo } = props;
  const button =
    'grid size-8 shrink-0 place-items-center rounded-md text-ink-3 transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink ' +
    'data-[state=open]:bg-hover data-[state=open]:text-ink';
  return (
    <span className="-ml-10 flex items-center gap-2 phone:-ml-2 phone:gap-0.5">
      <button
        type="button"
        onClick={() => onGo(addDaysISO(day, -1))}
        aria-label="Jour précédent"
        title="Jour précédent · ←"
        className={button}
      >
        <ChevronLeft className="size-[18px]" strokeWidth={1.75} />
      </button>
      <span className="min-w-[232px] phone:min-w-0 phone:flex-1 phone:truncate">{dashboardTitle(day, today)}</span>
      <button type="button" onClick={() => onGo(addDaysISO(day, 1))} aria-label="Jour suivant" title="Jour suivant · →" className={button}>
        <ChevronRight className="size-[18px]" strokeWidth={1.75} />
      </button>
      <DatePicker
        value={day}
        marks={props.marks}
        onPick={(picked) => picked && onGo(picked)}
        open={props.pickerOpen}
        onOpenChange={props.onPickerOpenChange}
      >
        <button type="button" aria-label="Choisir un jour" title="Choisir un jour · D" className={button}>
          <CalendarDays className="size-[18px]" strokeWidth={1.75} />
        </button>
      </DatePicker>
    </span>
  );
}
