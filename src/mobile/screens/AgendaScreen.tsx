import { useSearch } from '@tanstack/react-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { addDaysISO, isISODate } from '@/core/dates';
import { useMinutesOfDay, useToday } from '@/core/use-today';
import { useWeekStartsOn } from '@/core/week-start';
import { AgendaMarker, useAgenda, useOpenAgendaItem, type AgendaItem } from '@/domains/agenda';
import { deadlineDay, groupByDay, isAgendaItemLate, isDeadlineItem, itemTimeRange, viewDays } from '@/domains/agenda/model';
import { useBlocks, useUpdateBlock } from '@/domains/day/hooks';
import { moduleIcon } from '@/domains/day/icons';
import { BLOCK_STATUS_LABELS, toMinutes, type DayBlock } from '@/domains/day/model';
import { colorVar } from '@/ui/data/ColorDot';
import { Button } from '@/ui/primitives/Button';
import { ScreenHeader, ScreenSection } from './parts';

const longDate = (day: string) => format(new Date(`${day}T12:00:00`), 'EEEE d MMMM', { locale: fr });

/**
 * Ce que l'agenda du téléphone montre : ni les blocs (à part, avec « Fait »), ni l'argent (choix de
 * l'étape 10), ni les simples débuts de tâche (dans Tâches). Une deadline, le jour où elle tombe.
 */
function shownOn(item: AgendaItem, day: string): boolean {
  if (item.source === 'block' || item.source === 'payment' || item.kind === 'task_scheduled') return false;
  return !isDeadlineItem(item) || deadlineDay(item) === day;
}

type Line =
  | { key: string; start: string; end: string; block: DayBlock }
  | { key: string; start: string; end: string; item: AgendaItem };

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

/**
 * L'agenda du téléphone (V2, étape 10) : la semaine, puis le jour choisi. Toute la journée (échéances,
 * examens, événements), puis heure par heure les blocs (à marquer faits), cours, rendez-vous et
 * événements Google. Un élément s'ouvre d'un geste ; « + » ajoute un événement ce jour-là.
 */
export function AgendaScreen() {
  const today = useToday();
  const minutes = useMinutesOfDay();
  const search: { day?: unknown } = useSearch({ strict: false });
  const [day, setDay] = useState(() => (typeof search.day === 'string' && isISODate(search.day) ? search.day : today));
  const weekStartsOn = useWeekStartsOn();
  const week = useMemo(() => viewDays('week', day, weekStartsOn), [day, weekStartsOn]);
  const { data: agenda = [] } = useAgenda(useMemo(() => ({ from: week[0] ?? day, to: addDaysISO(week[6] ?? day, 1) }), [week, day]));
  const { data: blocks = [] } = useBlocks(useMemo(() => ({ from: day, to: addDaysISO(day, 1) }), [day]));
  const update = useUpdateBlock();
  const open = useOpenAgendaItem();
  const openCreate = useCreateStore((state) => state.openCreate);

  const byDay = groupByDay(agenda, week);
  const busy = new Set(week.filter((d) => (byDay.get(d) ?? []).some((item) => shownOn(item, d))));
  const items = (byDay.get(day) ?? []).filter((item) => shownOn(item, day));
  const allDay = items.filter((item) => item.allDay);
  const lines: Line[] = [
    ...blocks.map((block) => ({ key: `block:${block.id}`, start: block.startsAt, end: block.endsAt, block })),
    ...items
      .filter((item) => !item.allDay)
      .map((item) => ({ key: item.key, start: item.start.slice(11, 16), end: item.end?.slice(11, 16) ?? '', item })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const started = (block: DayBlock) => day < today || (day === today && toMinutes(block.startsAt) <= minutes);
  const isNow = (line: Line) => day === today && toMinutes(line.start) <= minutes && line.end !== '' && minutes < toMinutes(line.end);

  return (
    <>
      <ScreenHeader
        title="Agenda"
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
      {!week.includes(today) && (
        <div className="-mt-2 px-5 pb-5">
          <Button variant="secondary" onClick={() => setDay(today)}>
            Revenir à aujourd’hui
          </Button>
        </div>
      )}

      {allDay.length === 0 && lines.length === 0 && <p className="px-5 text-ink-3">Rien de prévu ce jour-là.</p>}

      {allDay.length > 0 && (
        <ScreenSection title="Toute la journée">
          <ul>
            {allDay.map((item) => (
              <li key={item.key}>
                <button type="button" onClick={() => open(item)} className="flex min-h-12 w-full items-center gap-3 border-b border-line/60 py-2 text-left">
                  <AgendaMarker item={item} today={today} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${isAgendaItemLate(item, today) ? 'text-danger' : ''}`}>{item.title}</span>
                    {item.detail && <span className="block truncate text-meta text-ink-3">{item.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ScreenSection>
      )}

      {lines.length > 0 && (
        <ScreenSection title="Dans la journée">
          <ul>
            {lines.map((line) => {
              const now = isNow(line);
              const time = (
                <span className={`tnum w-[92px] shrink-0 text-meta ${now ? 'font-medium text-accent' : 'text-ink-3'}`}>
                  {'block' in line ? `${line.start} – ${line.end}` : (itemTimeRange(line.item) ?? line.start)}
                </span>
              );
              if ('block' in line) {
                const { block } = line;
                const Icon = moduleIcon(block.icon);
                return (
                  <li key={line.key} className={`flex min-h-14 items-center gap-3 border-b border-line/60 py-2 ${block.status === 'done' ? 'text-ink-3' : ''}`}>
                    {time}
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} style={{ color: colorVar(block.color) }} />
                      <span className="truncate">{block.title}</span>
                    </span>
                    {block.status !== 'planned' && <span className="text-meta text-ink-3">{BLOCK_STATUS_LABELS[block.status]}</span>}
                    {block.status === 'planned' && started(block) && (
                      <Button variant="secondary" icon={Check} onClick={() => update.mutate({ block, patch: { status: 'done' } })}>
                        Fait
                      </Button>
                    )}
                  </li>
                );
              }
              return (
                <li key={line.key}>
                  <button type="button" onClick={() => open(line.item)} className="flex min-h-14 w-full items-center gap-3 border-b border-line/60 py-2 text-left">
                    {time}
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <AgendaMarker item={line.item} today={today} />
                      <span className="min-w-0">
                        <span className="block truncate">{line.item.title}</span>
                        {line.item.detail && <span className="block truncate text-meta text-ink-3">{line.item.detail}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScreenSection>
      )}
    </>
  );
}
