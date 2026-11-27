import { useNavigate, useSearch } from '@tanstack/react-router';
import { BookText, ChevronLeft, ChevronRight, Moon, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePageShortcuts } from '@/app/shortcuts';
import { useUiStore } from '@/app/ui-store';
import { addDaysISO, formatLongDate } from '@/core/dates';
import { isMobileApp } from '@/core/platform';
import { useMinutesOfDay, useToday } from '@/core/use-today';
import { useWeekStartsOn } from '@/core/week-start';
import { useAgenda } from '@/domains/agenda';
import { viewTitle, weekdayShort } from '@/domains/agenda/model';
import { DayTitle } from '@/domains/dashboard/components/DayTitle';
import { useOpenJournal } from '@/domains/pages/hooks';
import { useProjects } from '@/domains/projects/hooks';
import { useSetting } from '@/domains/settings/hooks';
import { SETTINGS, resolveDayHours } from '@/domains/settings/model';
import { useCompanion } from '@/domains/companion/store';
import { useOpenTasks, useTasksInBlocks } from '@/domains/tasks/hooks';
import type { TaskItem } from '@/domains/tasks/model';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { SegmentedTabs } from '@/ui/primitives/SegmentedTabs';
import { parseISO } from 'date-fns';
import { BlockDialog, type BlockDialogState } from '../components/BlockDialog';
import { DayColumn } from '../components/DayColumn';
import { DayDnd } from '../components/DayDnd';
import { FillGapsDialog } from '../components/FillGapsDialog';
import { ReviewDialog } from '../components/ReviewDialog';
import { SidePanel } from '../components/SidePanel';
import { WeekTemplatesMenu } from '../components/WeekTemplatesMenu';
import { useBlocks, useModules } from '../hooks';
import {
  blocksToReview,
  currentBlock,
  formatMinutes,
  isReviewTime,
  nextBlock,
  toMinutes,
  weekDays,
  type DayBlock,
} from '../model';
import type { DayView } from '../search';
import { buildFillProposals, busyItemsOn, toPlaceOn, type FillProposal } from '../service';

const HOUR_HEIGHT = { day: 52, week: 40 };

/** Sous la date : le bloc en cours et le suivant, ou de quoi commencer. */
function daySubtitle(blocks: DayBlock[], isToday: boolean, now: number): string {
  if (blocks.length === 0)
    return isMobileApp()
      ? 'Aucun bloc : touche une heure pour y poser un module.'
      : 'Aucun bloc : glisse un module sur la journée, ou clique sur une heure.';
  const total = blocks.reduce((sum, b) => sum + toMinutes(b.endsAt) - toMinutes(b.startsAt), 0);
  const summary = `${blocks.length} bloc${blocks.length > 1 ? 's' : ''} · ${formatMinutes(total)}`;
  if (!isToday) return summary;
  const current = currentBlock(blocks, now);
  const next = nextBlock(blocks, now);
  const parts = [
    current ? `${current.block.title} en cours, encore ${formatMinutes(current.remaining)}` : null,
    next ? `${current ? 'ensuite' : 'prochain :'} ${next.title} à ${next.startsAt}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : summary;
}

/**
 * Journée (V2, étape 3) : la journée en blocs, de 6 h à 24 h (réglable). Les cours, rendez-vous et
 * examens sont dessinés dessous ; on pose des modules, on déplace et on étire les blocs, on y range les
 * tâches. Vue jour (avec « À caser ») ou semaine. Commune aux deux modes : elle montre tout.
 */
export function DayPage() {
  const today = useToday();
  const search = useSearch({ from: '/day' });
  const navigate = useNavigate({ from: '/day' });
  const day = search.day ?? today;
  // Sur le téléphone, la vue jour seulement : sept colonnes n'y tiennent pas.
  const phone = isMobileApp();
  const view: DayView = phone ? 'day' : (search.view ?? 'day');
  const mode = useUiStore((state) => state.mode);
  const weekStartsOn = useWeekStartsOn();
  const now = useMinutesOfDay();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dialog, setDialog] = useState<BlockDialogState>(null);
  const setFocusOpen = useCompanion((state) => state.setFocusOpen);
  // Propositions figées à l'ouverture : elles ne bougent pas pendant qu'on les coche.
  const [fill, setFill] = useState<FillProposal[] | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const openJournal = useOpenJournal();

  const week = useMemo(() => weekDays(day, weekStartsOn), [day, weekStartsOn]);
  const range = useMemo(() => ({ from: week[0]!, to: addDaysISO(week[6]!, 1) }), [week]);
  const { data: blocks } = useBlocks(range);
  const { data: modules } = useModules();
  const { data: agenda } = useAgenda(range);
  const { data: inBlocks } = useTasksInBlocks(range);
  const { data: open } = useOpenTasks();
  const { data: paused } = useProjects({ statuses: ['on_hold'] });
  const { data: startHour } = useSetting(SETTINGS.dayStartHour);
  const { data: endHour } = useSetting(SETTINGS.dayEndHour);

  const go = (next: { day?: string; view?: DayView }) => {
    const nextDay = next.day ?? day;
    const nextView = next.view ?? view;
    void navigate({ search: { day: nextDay === today ? undefined : nextDay, view: nextView === 'week' ? 'week' : undefined } });
  };
  const step = view === 'week' ? 7 : 1;
  usePageShortcuts({
    arrowleft: () => go({ day: addDaysISO(day, -step) }),
    arrowright: () => go({ day: addDaysISO(day, step) }),
    t: () => go({ day: today }),
    j: () => go({ view: 'day' }),
    s: () => go({ view: 'week' }),
    d: () => setPickerOpen(true),
  });

  if (!blocks || !modules || !agenda || !inBlocks || !open || !paused || startHour === undefined || endHour === undefined) return null;

  const hours = resolveDayHours(startHour, endHour);
  // La bibliothèque d'un côté, les modules « pour une fois » (à caser) de l'autre.
  const library = modules.filter((m) => !m.oneOff);
  const oneOffs = modules.filter((m) => m.oneOff);
  const days = view === 'week' ? week : [day];
  const tasksByBlock = new Map<string, TaskItem[]>();
  for (const task of inBlocks) tasksByBlock.set(task.blockId!, [...(tasksByBlock.get(task.blockId!) ?? []), task]);
  const blocksOn = (d: string) => blocks.filter((b) => b.date === d);
  const todayBlocks = blocksOn(today);
  const current = currentBlock(todayBlocks, now);
  const reviewDue = isReviewTime(todayBlocks, now);
  // « À caser » : ce qui est prévu ce jour-là, puis les échéances des deux semaines à venir.
  const toPlace = view === 'day' && day >= today ? toPlaceOn(open, day, today) : null;
  const openFill = () =>
    setFill(
      buildFillProposals({
        day,
        today,
        now,
        blocks,
        busy: busyItemsOn(agenda, day, open),
        open,
        pausedProjectIds: new Set(paused.map((p) => p.id)),
        modules: library,
      }),
    );
  const weekBlocks = blocks;

  const title =
    view === 'week' ? (
      <span className="-ml-10 flex items-center gap-2">
        <Button variant="ghost" icon={ChevronLeft} aria-label="Semaine précédente" onClick={() => go({ day: addDaysISO(day, -7) })} />
        <span className="min-w-[232px]">{viewTitle('week', day, today, weekStartsOn)}</span>
        <Button variant="ghost" icon={ChevronRight} aria-label="Semaine suivante" onClick={() => go({ day: addDaysISO(day, 7) })} />
      </span>
    ) : (
      <DayTitle
        day={day}
        today={today}
        marks={new Map()}
        onGo={(next) => go({ day: next })}
        pickerOpen={pickerOpen}
        onPickerOpenChange={setPickerOpen}
      />
    );
  const text =
    view === 'week'
      ? `${weekBlocks.length} bloc${weekBlocks.length > 1 ? 's' : ''} cette semaine`
      : daySubtitle(blocksOn(day), day === today, now);
  // Un bloc en cours : le mode focus est à un clic (ou F).
  const subtitle =
    view === 'day' && day === today && currentBlock(blocksOn(day), now) ? (
      <>
        {text}
        <button type="button" onClick={() => setFocusOpen(true)} title="Mode focus · F" className="ml-2 text-ink-3 transition-colors hover:text-ink">
          · Focus →
        </button>
      </>
    ) : (
      text
    );

  return (
    <Page
      title={title}
      subtitle={subtitle}
      actions={
        <>
          {view === 'day' && day >= today && (
            <Button variant="ghost" icon={Sparkles} onClick={openFill} title="Proposer des blocs dans les créneaux libres">
              Remplir les trous
            </Button>
          )}
          {view === 'day' && (
            <Button
              variant="ghost"
              icon={BookText}
              title="La page de ce jour (créée au premier clic)"
              onClick={() => openJournal.mutate(day, { onSuccess: (id) => void navigate({ to: '/pages/$pageId', params: { pageId: id } }) })}
            >
              Journal
            </Button>
          )}
          <WeekTemplatesMenu weekDays={week} weekBlocks={weekBlocks} />
          {!phone && (
            <SegmentedTabs
              tabs={[
                { value: 'day', label: 'Jour', title: 'Jour · J' },
                { value: 'week', label: 'Semaine', title: 'Semaine · S' },
              ]}
              value={view}
              onChange={(next) => go({ view: next })}
            />
          )}
          {day !== today && (
            <Button variant="secondary" shortcut="T" onClick={() => go({ day: today })}>
              Aujourd’hui
            </Button>
          )}
        </>
      }
    >
      {reviewDue && (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-accent-soft px-4 py-3">
          <Moon className="size-4 shrink-0 text-accent" strokeWidth={1.75} />
          <span className="flex-1">
            Bilan du soir : {blocksToReview(todayBlocks, now).length} bloc{blocksToReview(todayBlocks, now).length > 1 ? 's' : ''} à marquer.
          </span>
          <Button variant="secondary" onClick={() => setReviewOpen(true)}>
            Faire le bilan
          </Button>
        </div>
      )}

      <DayDnd today={today}>
        {/* Sur le téléphone, les modules et « À caser » sous la journée. */}
        <div className="grid grid-cols-[minmax(0,1fr)_240px] items-start gap-x-12 phone:grid-cols-1 phone:gap-y-10">
          <div className="min-w-0">
            {view === 'week' && (
              <div className="grid" style={{ gridTemplateColumns: `44px repeat(7, minmax(0, 1fr))` }}>
                <span />
                {week.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => go({ day: d, view: 'day' })}
                    title={`Voir la journée · ${formatLongDate(parseISO(d))}`}
                    className={`pb-2 text-meta transition-colors hover:text-ink ${d === today ? 'font-semibold text-accent' : 'text-ink-2'}`}
                  >
                    {weekdayShort(d)} {Number(d.slice(8))}
                  </button>
                ))}
              </div>
            )}
            <div className="grid" style={{ gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="relative" style={{ height: (hours.last - hours.first) * HOUR_HEIGHT[view] }}>
                {Array.from({ length: hours.last - hours.first }, (_, index) => (
                  <span
                    key={index}
                    className="tnum absolute right-2 -translate-y-1/2 text-meta text-ink-3"
                    style={{ top: index * HOUR_HEIGHT[view] }}
                  >
                    {index > 0 && `${hours.first + index} h`}
                  </span>
                ))}
              </div>
              {days.map((d) => (
                <DayColumn
                  key={d}
                  day={d}
                  hours={hours}
                  hourHeight={HOUR_HEIGHT[view]}
                  blocks={blocksOn(d)}
                  busy={busyItemsOn(agenda, d, open)}
                  tasksByBlock={tasksByBlock}
                  now={d === today ? now : null}
                  currentBlockId={d === today ? (current?.block.id ?? null) : null}
                  compact={view === 'week'}
                  scrollToNow={d === today}
                  onOpenBlock={(block) => setDialog({ kind: 'edit', block })}
                  onCreateAt={(dd, minutes) => setDialog({ kind: 'create', day: dd, minutes })}
                />
              ))}
            </div>
          </div>
          <SidePanel modules={library} oneOffs={oneOffs} mode={mode} toPlace={toPlace?.planned ?? null} deadlines={toPlace?.deadlines ?? []} />
        </div>
      </DayDnd>

      <BlockDialog state={dialog} onClose={() => setDialog(null)} modules={library} mode={mode} tasksByBlock={tasksByBlock} />
      <FillGapsDialog open={fill !== null} onOpenChange={(next) => !next && setFill(null)} proposals={fill ?? []} />
      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        blocks={todayBlocks.filter((b) => toMinutes(b.endsAt) <= now)}
        today={today}
      />
    </Page>
  );
}
