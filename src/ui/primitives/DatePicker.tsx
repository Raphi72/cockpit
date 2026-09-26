import { addMonths, format, parseISO, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { parseDateInput } from '@/core/date-input';
import { addDaysISO, formatDateField, formatLongDate, monthOf, nextMondayISO, shiftMonth, toISODate } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { useWeekStartsOn, type WeekStart } from '@/core/week-start';
import { Popover, PopoverContent, PopoverTrigger } from '../overlays/Popover';

/** Repère sous un jour de la grille : une deadline (rouge) ou des tâches prévues (gris). */
export type DayMark = 'deadline' | 'task';

/** Initiales des jours, du dimanche au samedi (numérotation de date-fns). */
const WEEKDAYS = ['di', 'lu', 'ma', 'me', 'je', 've', 'sa'];

function weekdayHeaders(weekStartsOn: WeekStart): string[] {
  return [...WEEKDAYS.slice(weekStartsOn), ...WEEKDAYS.slice(0, weekStartsOn)];
}

/** Les 6 semaines affichées pour un mois 'YYYY-MM', du lundi (ou du dimanche) au jour qui précède. */
function monthGrid(month: string, weekStartsOn: WeekStart): string[] {
  const first = toISODate(startOfWeek(parseISO(`${month}-01`), { weekStartsOn }));
  return Array.from({ length: 42 }, (_, index) => addDaysISO(first, index));
}

/** « Septembre 2026 » : l'année toujours, on navigue d'un mois à l'autre. */
function monthTitle(month: string): string {
  const title = format(parseISO(`${month}-01`), 'MMMM yyyy', { locale: fr });
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** « Mardi 29 septembre », avec l'année si elle diffère. */
function longLabel(day: string, today: string): string {
  const label = formatLongDate(parseISO(day));
  return day.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${day.slice(0, 4)}`;
}

const chipClass =
  'h-7 rounded-md px-2 text-left text-meta text-ink-2 outline-none transition-colors duration-[120ms] ease-soft ' +
  'hover:bg-hover hover:text-ink focus-visible:bg-hover focus-visible:text-ink';

type DatePickerPanelProps = {
  value: string | null;
  onPick: (date: string | null) => void;
  /** Propose « Retirer la date » : pour un champ facultatif. */
  clearable?: boolean;
  /** Repères sous certains jours (deadlines, tâches prévues). */
  marks?: Map<string, DayMark>;
};

/**
 * Contenu du sélecteur de date : une date tapée au clavier (« demain », « +3j », « 25/10 »…),
 * quatre raccourcis, puis le mois. Entrée valide la date tapée ; ↓ passe dans la grille, où les
 * flèches changent de jour, Page préc. / suiv. de mois, et Entrée choisit.
 */
export function DatePickerPanel({ value, onPick, clearable = false, marks }: DatePickerPanelProps) {
  const today = useToday();
  const weekStartsOn = useWeekStartsOn();
  const [text, setText] = useState('');
  const [month, setMonth] = useState(monthOf(value ?? today));
  const [focusDay, setFocusDay] = useState(value ?? today);
  const grid = useRef<HTMLDivElement>(null);
  // Vrai quand le jour actif vient du clavier : le focus doit le suivre.
  const moveFocus = useRef(false);

  const parsed = text.trim() === '' ? undefined : parseDateInput(text, today);
  const typed = typeof parsed === 'string' ? parsed : null;

  // Une date tapée s'affiche aussitôt dans la grille.
  useEffect(() => {
    if (!typed) return;
    setMonth(monthOf(typed));
    setFocusDay(typed);
  }, [typed]);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, month]);

  const goToDay = (day: string) => {
    moveFocus.current = true;
    setFocusDay(day);
    setMonth(monthOf(day));
  };

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    // Page préc. / suiv. : même jour du mois voisin (le 31 devient le dernier jour qui existe).
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDaysISO(focusDay, -1),
      ArrowRight: () => addDaysISO(focusDay, 1),
      ArrowUp: () => addDaysISO(focusDay, -7),
      ArrowDown: () => addDaysISO(focusDay, 7),
      PageUp: () => toISODate(addMonths(parseISO(focusDay), -1)),
      PageDown: () => toISODate(addMonths(parseISO(focusDay), 1)),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    goToDay(move());
  };

  const choices = [
    { label: 'Aujourd’hui', date: today },
    { label: 'Demain', date: addDaysISO(today, 1) },
    { label: 'Lundi prochain', date: nextMondayISO(today) },
    { label: 'Dans une semaine', date: addDaysISO(today, 7) },
  ];

  return (
    <div className="w-[260px]">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (typed) onPick(typed);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            goToDay(focusDay);
          }
        }}
        placeholder="demain, +3j, lundi, 25/10…"
        aria-label="Taper une date"
        className="h-8 w-full rounded-md border border-line-strong bg-canvas px-2.5 text-body outline-none placeholder:text-ink-3 focus:border-accent focus:ring-3 focus:ring-accent-soft"
      />
      {text.trim() !== '' && (
        <p className={`px-0.5 pt-1.5 text-meta ${typed ? 'text-ink-2' : 'text-ink-3'}`}>
          {typed ? `${longLabel(typed, today)} · Entrée` : 'Date non comprise'}
        </p>
      )}

      <div className="mt-2 grid grid-cols-2 gap-x-1">
        {choices.map((choice) => (
          <button key={choice.label} type="button" onClick={() => onPick(choice.date)} className={chipClass}>
            {choice.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-line pt-2.5 pb-1">
        <span className="pl-1 text-meta font-medium">{monthTitle(month)}</span>
        <span className="flex">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Mois précédent"
            className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Mois suivant"
            className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
          >
            <ChevronRight className="size-4" strokeWidth={1.75} />
          </button>
        </span>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] text-ink-3">
        {weekdayHeaders(weekStartsOn).map((day) => (
          <span key={day} className="py-1">
            {day}
          </span>
        ))}
      </div>
      <div ref={grid} role="group" aria-label={monthTitle(month)} onKeyDown={onGridKey} className="grid grid-cols-7 gap-y-0.5">
        {monthGrid(month, weekStartsOn).map((day) => {
          const selected = day === value;
          const inMonth = monthOf(day) === month;
          const mark = marks?.get(day);
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              tabIndex={day === focusDay ? 0 : -1}
              onClick={() => onPick(day)}
              aria-label={longLabel(day, today) + (mark === 'deadline' ? ', deadline' : mark === 'task' ? ', tâches prévues' : '')}
              aria-pressed={selected}
              className={
                'tnum relative grid h-8 place-items-center rounded-md text-meta outline-none transition-colors duration-[120ms] ease-soft ' +
                'focus-visible:ring-2 focus-visible:ring-accent ' +
                (selected
                  ? 'bg-accent font-semibold text-canvas'
                  : day === typed
                    ? 'bg-accent-soft font-semibold text-accent'
                    : day === today
                      ? 'font-semibold text-accent hover:bg-hover'
                      : inMonth
                        ? 'text-ink hover:bg-hover'
                        : 'text-ink-3 hover:bg-hover')
              }
            >
              {Number(day.slice(8))}
              {mark && (
                <span
                  aria-hidden
                  className={`absolute bottom-[3px] size-1 rounded-full ${selected ? 'bg-canvas' : mark === 'deadline' ? 'bg-danger' : 'bg-ink-3'}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {clearable && value !== null && (
        <button type="button" onClick={() => onPick(null)} className={`${chipClass} mt-2 w-full text-ink-3`}>
          Retirer la date
        </button>
      )}
    </div>
  );
}

type DatePickerProps = DatePickerPanelProps & {
  /** Déclencheur (un bouton) : le sélecteur s'ouvre sous lui. */
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  /** Ouverture pilotée de l'extérieur (raccourci clavier), facultative. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Sélecteur de date maison, dans une petite fenêtre ancrée à son déclencheur. */
export function DatePicker({ children, align = 'start', side = 'bottom', open, onOpenChange, onPick, ...panel }: DatePickerProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} side={side} className="p-3">
        <DatePickerPanel
          {...panel}
          onPick={(date) => {
            setOpen(false);
            onPick(date);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

type DateButtonProps = {
  value: string | null;
  onChange: (date: string | null) => void;
  /** `field` : encadré, dans un formulaire. `inline` : ressemble à du texte, dans une fiche. */
  variant: 'field' | 'inline';
  placeholder: string;
  clearable: boolean;
  className?: string;
  'aria-label': string;
  ref?: Ref<HTMLButtonElement>;
};

/** Champ date : la date lisible (« ven. 25 sept. »), qui ouvre le sélecteur au clic. */
export function DateButton({ value, onChange, variant, placeholder, clearable, className = '', ...aria }: DateButtonProps) {
  const today = useToday();
  const text = value ? formatDateField(value, today) : placeholder;
  const base =
    variant === 'field'
      ? 'h-9 w-full gap-2 rounded-md border border-line-strong bg-elevated px-3 hover:border-ink-3 data-[state=open]:border-accent data-[state=open]:ring-3 data-[state=open]:ring-accent-soft'
      : 'h-8 w-full -mx-2 rounded-md px-2 hover:bg-hover data-[state=open]:bg-hover';
  return (
    <DatePicker value={value} clearable={clearable} onPick={(date) => date !== value && onChange(date)}>
      <button
        type="button"
        aria-label={`${aria['aria-label']} : ${value ? format(parseISO(value), 'EEEE d MMMM yyyy', { locale: fr }) : 'aucune'}`}
        className={
          'tnum flex items-center text-left outline-none transition-[background-color,border-color] duration-[120ms] ease-soft ' +
          `focus-visible:ring-2 focus-visible:ring-accent-soft ${base} ${value ? '' : 'text-ink-3'} ${className}`
        }
      >
        <span className="truncate">{text}</span>
        {variant === 'field' && <CalendarDays className="ml-auto size-4 shrink-0 text-ink-3" strokeWidth={1.75} />}
      </button>
    </DatePicker>
  );
}
