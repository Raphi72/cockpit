import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check } from 'lucide-react';
import { useMinutesOfDay } from '@/core/use-today';
import { useTodayBlocks } from '@/domains/companion/hooks';
import { useUpdateBlock } from '@/domains/day/hooks';
import { moduleIcon } from '@/domains/day/icons';
import { currentBlock, formatMinutes, nextBlock } from '@/domains/day/model';
import { TodayHabits } from '@/domains/habits/components/TodayHabits';
import { useDoneToday, useOpenTasks } from '@/domains/tasks/hooks';
import { selectToday } from '@/domains/tasks/model';
import { Button } from '@/ui/primitives/Button';
import { ScreenHeader, ScreenSection, TaskLine } from './parts';
import { colorVar } from '@/ui/data/ColorDot';

/** Le bloc en cours, ce qu'il en reste, « Fait » ; puis le suivant. */
function NowCard() {
  const minutes = useMinutesOfDay();
  const { blocks = [] } = useTodayBlocks();
  const update = useUpdateBlock();
  const current = currentBlock(blocks, minutes);
  const upcoming = nextBlock(blocks, minutes);
  if (!current && !upcoming) return null;
  const Icon = current ? moduleIcon(current.block.icon) : null;
  return (
    <section className="mx-5 mb-7 rounded-xl bg-hover px-4 py-4">
      {current ? (
        <>
          <p className="text-meta text-ink-3">En ce moment</p>
          <div className="mt-1 flex items-center gap-2.5">
            {Icon && <Icon className="size-5 shrink-0" strokeWidth={1.75} style={{ color: colorVar(current.block.color) }} />}
            <span className="min-w-0 flex-1 truncate text-[17px] font-medium">{current.block.title}</span>
            {current.block.status === 'planned' && (
              <Button variant="secondary" icon={Check} onClick={() => update.mutate({ block: current.block, patch: { status: 'done' } })}>
                Fait
              </Button>
            )}
          </div>
          <p className="mt-1 text-ink-2">
            encore {formatMinutes(current.remaining)}, jusqu’à {current.block.endsAt === '24:00' ? 'minuit' : current.block.endsAt}
          </p>
        </>
      ) : null}
      {upcoming && (
        <p className={current ? 'mt-3 border-t border-line pt-3 text-ink-2' : 'text-ink-2'}>
          {current ? 'Ensuite' : 'Prochain bloc'} : <span className="text-ink">{upcoming.title}</span> à {upcoming.startsAt}
        </p>
      )}
    </section>
  );
}

/**
 * Aujourd'hui sur le téléphone (choix de l'étape 10) : le bloc en cours, puis tâches et devoirs du jour
 * ensemble (en retard d'abord), et les habitudes du jour à cocher.
 */
export function TodayScreen() {
  const { today } = useTodayBlocks();
  const { data: open } = useOpenTasks();
  const { data: done = [] } = useDoneToday(today);
  if (!open) return null;
  const groups = selectToday(open, today);
  const count = groups.overdue.length + groups.today.length;
  return (
    <>
      <ScreenHeader
        title={format(new Date(`${today}T12:00:00`), 'EEEE d MMMM', { locale: fr })}
        subtitle={count === 0 ? (done.length > 0 ? 'Tout est fait pour aujourd’hui.' : 'Rien de prévu aujourd’hui.') : `${count} à faire${done.length ? ` · ${done.length} fait${done.length > 1 ? 's' : ''}` : ''}`}
      />
      <NowCard />
      <TodayHabits today={today} className="px-5 pb-7" />
      {count > 0 && (
        <ScreenSection title="À faire">
          <ul>
            {groups.overdue.map((task) => (
              <TaskLine key={task.id} task={task} late />
            ))}
            {groups.today.map((task) => (
              <TaskLine key={task.id} task={task} />
            ))}
          </ul>
        </ScreenSection>
      )}
      <div className="h-24" />
    </>
  );
}
