import { useSearch } from '@tanstack/react-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarClock, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { useUiStore } from '@/app/ui-store';
import { addDaysISO, isISODate, timeToMinutes } from '@/core/dates';
import { useMinutesOfDay, useToday } from '@/core/use-today';
import { useWeekStartsOn } from '@/core/week-start';
import { AgendaMarker, useAgenda, useOpenAgendaItem, type AgendaItem } from '@/domains/agenda';
import { deadlineDay, groupByDay, isAgendaItemLate, isDeadlineItem, itemTimeRange, viewDays } from '@/domains/agenda/model';
import { Button } from '@/ui/primitives/Button';
import { ScreenHeader, ScreenSection } from './parts';

const longDate = (day: string) => format(new Date(`${day}T12:00:00`), 'EEEE d MMMM', { locale: fr });

/**
 * Ce que l'agenda du téléphone montre : ni les blocs (dans Journée), ni l'argent (choix de l'étape 10),
 * ni les simples débuts de tâche (dans Tâches). Une deadline, le jour où elle tombe. En emploi du temps :
 * seulement les cours.
 */
function shownOn(item: AgendaItem, day: string, timetable: boolean): boolean {
  if (timetable) return item.kind === 'class' && !item.allDay;
  if (item.source === 'block' || item.source === 'payment' || item.kind === 'task_scheduled') return false;
  return !isDeadlineItem(item) || deadlineDay(item) === day;
}

/** La semaine en bandeau : un jour se choisit d'un geste ; un point dit qu'il s'y passe quelque chose. */
function WeekStrip(props: { week: string[]; day: string; today: string; busy: Set<string>; onPick: (day: string) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1 px-3 pb-5">
      {props.week.map((d) => {
        const selected = d === props.day;
        const date = new Date(`${d}T12:00:00`);
        return (
          <button
            key={d}
            type="button"
            onClick={() => props.onPick(d)}
            aria-pressed={selected}
            aria-label={longDate(d)}
            className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-lg ${selected ? 'bg-active' : ''}`}
          >
            <span className="text-[11px] text-ink-3 first-letter:uppercase">{format(date, 'EEEEE', { locale: fr })}</span>
            <span className={`tnum text-[17px] ${d === props.today ? 'font-semibold text-accent' : selected ? 'font-medium' : 'text-ink-2'}`}>
              {format(date, 'd')}
            </span>
            <span className={`size-1 rounded-full ${props.busy.has(d) ? 'bg-ink-3' : 'bg-transparent'}`} />
          </button>
        );
      })}
    </div>
  );
}

/** Une ligne de l'agenda : elle s'ouvre d'un geste (fiche de l'événement, du cours, de l'examen, du projet). */
function ItemLine({ item, today, time, now }: { item: AgendaItem; today: string; time?: string | null; now?: boolean }) {
  const open = useOpenAgendaItem();
  return (
    <li>
      <button type="button" onClick={() => open(item)} className="flex min-h-14 w-full items-center gap-3 border-b border-line/60 py-2 text-left">
        {time !== undefined && (
          <span className={`tnum w-[92px] shrink-0 text-meta ${now ? 'font-medium text-accent' : 'text-ink-3'}`}>{time}</span>
        )}
        <AgendaMarker item={item} today={today} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${isAgendaItemLate(item, today) ? 'text-danger' : ''}`}>{item.title}</span>
          {item.detail && <span className="block truncate text-meta text-ink-3">{item.detail}</span>}
        </span>
      </button>
    </li>
  );
}

/**
 * L'agenda du téléphone (V2, étape 10) : la semaine, puis le jour choisi. Toute la journée (échéances,
 * examens, événements), puis heure par heure les cours, rendez-vous et événements Google. Un élément
 * s'ouvre d'un geste ; « + » ajoute un événement ce jour-là. Les blocs sont dans Journée.
 */
export function AgendaScreen() {
  const today = useToday();
  const minutes = useMinutesOfDay();
  const search: { day?: unknown; date?: unknown; timetable?: unknown } = useSearch({ strict: false });
  const asked = search.date ?? search.day;
  const [day, setDay] = useState(() => (typeof asked === 'string' && isISODate(asked) ? asked : today));
  // L'emploi du temps (un mode de l'agenda, comme sur le PC) : la semaine avec seulement les cours.
  const [timetable, setTimetable] = useState(search.timetable === true);
  const mode = useUiStore((state) => state.mode);
  const weekStartsOn = useWeekStartsOn();
  const week = useMemo(() => viewDays('week', day, weekStartsOn), [day, weekStartsOn]);
  const { data: agenda = [] } = useAgenda(useMemo(() => ({ from: week[0] ?? day, to: addDaysISO(week[6] ?? day, 1) }), [week, day]));
  const openCreate = useCreateStore((state) => state.openCreate);

  const byDay = groupByDay(agenda, week);
  const busy = new Set(week.filter((d) => (byDay.get(d) ?? []).some((item) => shownOn(item, d, timetable))));
  const items = (byDay.get(day) ?? []).filter((item) => shownOn(item, day, timetable));
  const allDay = items.filter((item) => item.allDay);
  const timed = items.filter((item) => !item.allDay).sort((a, b) => a.start.localeCompare(b.start));
  const isNow = (item: AgendaItem) => {
    if (day !== today) return false;
    const start = timeToMinutes(item.start.slice(11, 16));
    const end = item.end?.slice(0, 10) === day ? timeToMinutes(item.end.slice(11, 16)) : start + 60;
    return start <= minutes && minutes < end;
  };

  return (
    <>
      <ScreenHeader
        title={timetable ? 'Emploi du temps' : 'Agenda'}
        subtitle={day === today ? `Aujourd’hui, ${longDate(day)}` : longDate(day)}
        actions={
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="lg" icon={ChevronLeft} aria-label="Semaine précédente" onClick={() => setDay(addDaysISO(day, -7))} />
            <Button variant="ghost" size="lg" icon={ChevronRight} aria-label="Semaine suivante" onClick={() => setDay(addDaysISO(day, 7))} />
            <Button variant="ghost" size="lg" icon={Plus} aria-label="Nouvel événement" onClick={() => openCreate('event', { eventStart: day })} />
          </div>
        }
      />
      <WeekStrip week={week} day={day} today={today} busy={busy} onPick={setDay} />
      {(!week.includes(today) || timetable || mode === 'school') && (
        <div className="-mt-2 flex flex-wrap gap-2 px-5 pb-5">
          {(timetable || mode === 'school') && (
            <Button variant={timetable ? 'secondary' : 'ghost'} icon={CalendarClock} aria-pressed={timetable} onClick={() => setTimetable(!timetable)}>
              Emploi du temps
            </Button>
          )}
          {!week.includes(today) && (
            <Button variant="secondary" onClick={() => setDay(today)}>
              Revenir à aujourd’hui
            </Button>
          )}
        </div>
      )}

      {allDay.length === 0 && timed.length === 0 && (
        <p className="px-5 text-ink-3">{timetable ? 'Pas de cours ce jour-là.' : 'Rien de prévu ce jour-là.'}</p>
      )}

      {allDay.length > 0 && (
        <ScreenSection title="Toute la journée">
          <ul>
            {allDay.map((item) => (
              <ItemLine key={item.key} item={item} today={today} />
            ))}
          </ul>
        </ScreenSection>
      )}

      {timed.length > 0 && (
        <ScreenSection title="Dans la journée">
          <ul>
            {timed.map((item) => (
              <ItemLine key={item.key} item={item} today={today} time={itemTimeRange(item)} now={isNow(item)} />
            ))}
          </ul>
        </ScreenSection>
      )}
    </>
  );
}
