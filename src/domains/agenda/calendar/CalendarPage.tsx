import { useNavigate, useSearch } from '@tanstack/react-router';
import { CalendarClock, CalendarRange, ChevronLeft, ChevronRight, ListFilter } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { usePageShortcuts } from '@/app/shortcuts';
import { useUiStore } from '@/app/ui-store';
import { timeToMinutes } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { useWeekStartsOn } from '@/core/week-start';
import { useHasSchoolCalendar } from '@/domains/google/hooks';
import { SchoolCalendarDialog } from '@/domains/school/periods/components/SchoolCalendarDialog';
import { formatDuration } from '@/domains/tasks/model';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Menu, MenuCheckboxItem, MenuContent, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Button } from '@/ui/primitives/Button';
import { SegmentedTabs } from '@/ui/primitives/SegmentedTabs';
import { useAgenda } from '../hooks';
import {
  AGENDA_SOURCES,
  AGENDA_SOURCE_HINTS,
  AGENDA_SOURCE_LABELS,
  CALENDAR_VIEWS,
  CALENDAR_VIEW_KEYS,
  CALENDAR_VIEW_LABELS,
  PLAIN_TASKS_HINT,
  PLAIN_TASKS_LABEL,
  shiftAnchor,
  viewDays,
  viewRange,
  viewTitle,
  type AgendaItem,
  type AgendaSource,
  isShownInMonth,
} from '../model';
import { useOpenAgendaItem } from '../open-item';
import { CalendarDnd } from './CalendarDnd';
import { MonthView } from './MonthView';
import { TimeGridView } from './TimeGridView';

/** « Filtrer » tant que tout est affiché ; sinon ce qui est affiché (« Sans tâches », « Événements »…). */
function filterLabel(hidden: AgendaSource[]): string {
  const shown = AGENDA_SOURCES.filter((source) => !hidden.includes(source));
  if (hidden.length === 0) return 'Filtrer';
  if (shown.length === 0) return 'Rien';
  if (hidden.length === 1) return `Sans ${AGENDA_SOURCE_LABELS[hidden[0]!].toLowerCase()}`;
  return shown.map((source) => AGENDA_SOURCE_LABELS[source]).join(', ');
}

/**
 * Filtres du calendrier : les quatre sources, puis une option (désactivée par défaut) pour y voir
 * aussi les tâches ordinaires, qui n'ont qu'une date de début (ni deadline, ni priorité haute).
 */
function SourceFilter() {
  const hidden = useUiStore((state) => state.calendarHidden);
  const toggle = useUiStore((state) => state.toggleCalendarSource);
  const plainTasks = useUiStore((state) => state.calendarPlainTasks);
  const togglePlainTasks = useUiStore((state) => state.toggleCalendarPlainTasks);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" icon={ListFilter} className={hidden.length > 0 || plainTasks ? '!text-ink' : ''}>
          {filterLabel(hidden)}
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[300px]">
        {AGENDA_SOURCES.map((source) => (
          <MenuCheckboxItem key={source} checked={!hidden.includes(source)} onCheckedChange={() => toggle(source)}>
            {AGENDA_SOURCE_LABELS[source]}
            <span className="ml-2 text-meta text-ink-3">{AGENDA_SOURCE_HINTS[source]}</span>
          </MenuCheckboxItem>
        ))}
        <MenuSeparator />
        <MenuCheckboxItem
          checked={plainTasks && !hidden.includes('task')}
          disabled={hidden.includes('task')}
          onCheckedChange={togglePlainTasks}
        >
          {PLAIN_TASKS_LABEL}
          <span className="ml-2 text-meta text-ink-3">{PLAIN_TASKS_HINT}</span>
        </MenuCheckboxItem>
      </MenuContent>
    </Menu>
  );
}

/** Un cours (semaine type ou agenda des cours de Google), à heure fixe. */
const isCourse = (item: AgendaItem) => item.kind === 'class' && !item.allDay;

/** Heures de cours affichées, en minutes (les cours d'un seul jour). */
function courseMinutes(items: AgendaItem[]): number {
  return items.reduce((sum, item) => {
    if (!item.end || item.end.slice(0, 10) !== item.start.slice(0, 10)) return sum;
    return sum + Math.max(0, timeToMinutes(item.end.slice(11, 16)) - timeToMinutes(item.start.slice(11, 16)));
  }, 0);
}

/**
 * Le calendrier, commun aux deux modes. Son mode « Emploi du temps » (bouton, ou un lien d'Aujourd'hui
 * en mode Cours) montre la semaine avec seulement les cours, comme l'ancienne page du même nom, et donne
 * accès aux semestres et vacances (retours du 27/11/2026 : une seule page pour les deux).
 */
export function CalendarPage() {
  const today = useToday();
  const search = useSearch({ from: '/calendar' });
  const navigate = useNavigate({ from: '/calendar' });
  const mode = useUiStore((state) => state.mode);
  const storedView = useUiStore((state) => state.calendarView);
  const setView = useUiStore((state) => state.setCalendarView);
  const hidden = useUiStore((state) => state.calendarHidden);
  const plainTasks = useUiStore((state) => state.calendarPlainTasks);
  const openCreate = useCreateStore((state) => state.openCreate);
  const openItem = useOpenAgendaItem();
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const { data: hasSchoolCalendar } = useHasSchoolCalendar();

  const timetable = search.timetable === true;
  // L'emploi du temps est une semaine.
  const view = timetable ? 'week' : storedView;
  const anchor = search.date ?? today;
  const weekStartsOn = useWeekStartsOn();
  const days = useMemo(() => viewDays(view, anchor, weekStartsOn), [view, anchor, weekStartsOn]);
  const { data: items } = useAgenda(viewRange(days), { plainTasks });
  const visible = useMemo(
    () =>
      (items ?? []).filter((item) =>
        timetable ? isCourse(item) : !hidden.includes(item.source) && (view !== 'month' || isShownInMonth(item)),
      ),
    [items, hidden, view, timetable],
  );
  const empty = items !== undefined && visible.length === 0;

  const goTo = (date: string) => void navigate({ search: { date: date === today ? undefined : date, timetable: search.timetable } });
  const toggleTimetable = () => void navigate({ search: { date: search.date, timetable: timetable ? undefined : true } });
  const showDay = (day: string) => {
    setView('day');
    void navigate({ search: { date: day === today ? undefined : day } });
  };

  usePageShortcuts({
    arrowleft: () => goTo(shiftAnchor(view, anchor, -1)),
    arrowright: () => goTo(shiftAnchor(view, anchor, 1)),
    t: () => goTo(today),
    m: () => setView('month'),
    s: () => setView('week'),
    j: () => setView('day'),
  });

  const unit = view === 'month' ? 'Mois' : view === 'week' ? 'Semaine' : 'Jour';
  const minutes = timetable ? courseMinutes(visible) : 0;
  const subtitle = timetable
    ? [viewTitle('week', anchor, today, weekStartsOn), minutes > 0 ? `${formatDuration(minutes)} de cours` : 'pas de cours'].join(' · ')
    : empty
      ? `${hidden.length > 0 ? 'Rien à afficher avec ces filtres.' : 'Aucune date sur cette période.'} Clique sur un jour pour ajouter un événement.`
      : undefined;
  // Le bouton se montre en mode Cours, ou tant que l'emploi du temps est affiché.
  const timetableButton = (timetable || mode === 'school') && (
    <Button
      variant={timetable ? 'secondary' : 'ghost'}
      icon={CalendarClock}
      aria-pressed={timetable}
      onClick={toggleTimetable}
      title={timetable ? 'Revenir au calendrier complet' : 'La semaine avec seulement tes cours'}
    >
      Emploi du temps
    </Button>
  );

  return (
    <Page
      title={timetable ? 'Emploi du temps' : viewTitle(view, anchor, today, weekStartsOn)}
      subtitle={subtitle}
      fill={view === 'month'}
      actions={
        <>
          {timetableButton}
          {timetable ? (
            <Button variant="ghost" icon={CalendarRange} onClick={() => setPeriodsOpen(true)}>
              Semestres et vacances
            </Button>
          ) : (
            <>
              <SourceFilter />
              <SegmentedTabs
                tabs={CALENDAR_VIEWS.map((v) => ({
                  value: v,
                  label: CALENDAR_VIEW_LABELS[v],
                  title: `${CALENDAR_VIEW_LABELS[v]} · ${CALENDAR_VIEW_KEYS[v]}`,
                }))}
                value={view}
                onChange={setView}
              />
            </>
          )}
          <div className="ml-2 flex items-center gap-1">
            <Button
              variant="ghost"
              icon={ChevronLeft}
              aria-label={`${unit} précédent${view === 'week' ? 'e' : ''}`}
              title="Précédent · ←"
              onClick={() => goTo(shiftAnchor(view, anchor, -1))}
            />
            <Button variant="secondary" shortcut="T" onClick={() => goTo(today)}>
              Aujourd’hui
            </Button>
            <Button
              variant="ghost"
              icon={ChevronRight}
              aria-label={`${unit} suivant${view === 'week' ? 'e' : ''}`}
              title="Suivant · →"
              onClick={() => goTo(shiftAnchor(view, anchor, 1))}
            />
          </div>
        </>
      }
    >
      {timetable && hasSchoolCalendar === false && visible.length === 0 && (
        <EmptyState icon={CalendarClock} title="Ton emploi du temps vient de Google Agenda">
          <p>
            Connecte Google Agenda dans Paramètres : l’agenda de ton emploi du temps (celui de l’intranet, relié par son lien iCal) est
            reconnu tout seul, et tes cours s’affichent ici.
          </p>
        </EmptyState>
      )}
      {/* On peut prendre un élément et le déposer sur un autre jour (ou créneau) pour changer sa date. */}
      <CalendarDnd today={today}>
        {view === 'month' ? (
          <MonthView
            anchor={anchor}
            days={days}
            items={visible}
            today={today}
            onOpen={openItem}
            onCreate={(day) => openCreate('event', { eventStart: day })}
            onShowDay={showDay}
          />
        ) : (
          <TimeGridView
            days={days}
            items={visible}
            today={today}
            onOpen={openItem}
            onCreate={(start, allDay) => openCreate('event', { eventStart: start, eventAllDay: allDay })}
            onShowDay={showDay}
          />
        )}
      </CalendarDnd>
      <SchoolCalendarDialog open={periodsOpen} onOpenChange={setPeriodsOpen} />
    </Page>
  );
}
