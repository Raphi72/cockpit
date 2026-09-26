import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, ListFilter } from 'lucide-react';
import { useMemo } from 'react';
import { useCreateStore } from '@/app/create-store';
import { usePageShortcuts } from '@/app/shortcuts';
import { useUiStore } from '@/app/ui-store';
import { useToday } from '@/core/use-today';
import { useWeekStartsOn } from '@/core/week-start';
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
  type AgendaSource,
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

export function CalendarPage() {
  const today = useToday();
  const search = useSearch({ from: '/calendar' });
  const navigate = useNavigate({ from: '/calendar' });
  const view = useUiStore((state) => state.calendarView);
  const setView = useUiStore((state) => state.setCalendarView);
  const hidden = useUiStore((state) => state.calendarHidden);
  const plainTasks = useUiStore((state) => state.calendarPlainTasks);
  const openCreate = useCreateStore((state) => state.openCreate);
  const openItem = useOpenAgendaItem();

  const anchor = search.date ?? today;
  const weekStartsOn = useWeekStartsOn();
  const days = useMemo(() => viewDays(view, anchor, weekStartsOn), [view, anchor, weekStartsOn]);
  const { data: items } = useAgenda(viewRange(days), { plainTasks });
  const visible = useMemo(() => (items ?? []).filter((item) => !hidden.includes(item.source)), [items, hidden]);
  const empty = items !== undefined && visible.length === 0;

  const goTo = (date: string) => void navigate({ search: date === today ? {} : { date } });
  const showDay = (day: string) => {
    setView('day');
    goTo(day);
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

  return (
    <Page
      title={viewTitle(view, anchor, today, weekStartsOn)}
      subtitle={
        empty
          ? `${hidden.length > 0 ? 'Rien à afficher avec ces filtres.' : 'Aucune date sur cette période.'} Clique sur un jour pour ajouter un événement.`
          : undefined
      }
      fill={view === 'month'}
      actions={
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

    </Page>
  );
}
