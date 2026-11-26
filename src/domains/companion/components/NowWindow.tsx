import { invoke, isTauri } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { db } from '@/core/db';
import { addDaysISO, nowTimestamp, todayISO } from '@/core/dates';
import { moduleIcon } from '@/domains/day/icons';
import { currentBlock, nextBlock, toMinutes, type DayBlock } from '@/domains/day/model';
import { listBlocks } from '@/domains/day/repository';
import { SETTINGS, resolveTheme } from '@/domains/settings/model';
import { getSetting } from '@/domains/settings/repository';
import { TaskCheckbox } from '@/domains/tasks/components/TaskCheckbox';
import type { TaskItem } from '@/domains/tasks/model';
import { listTasksInBlocks, updateTaskStatements } from '@/domains/tasks/repository';
import { formatCountdown, msUntil } from '../model';
import { colorVar } from '@/ui/data/ColorDot';

/** Relecture de la base : assez souvent pour suivre la fenêtre principale, sans la charger. */
const REFRESH_MS = 15_000;

async function applySavedTheme(): Promise<void> {
  const theme = resolveTheme(await getSetting(db, SETTINGS.theme.key).catch(() => null));
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

function hide(): void {
  if (isTauri()) void invoke('now_toggle');
  else window.close();
}

/**
 * La mini-fenêtre « En ce moment » : le bloc en cours, le temps qui reste, la tâche à faire (cochable).
 * Sans bloc en cours, le prochain. On la déplace en la faisant glisser.
 */
export function NowWindow() {
  const [data, setData] = useState<{ blocks: DayBlock[]; tasks: TaskItem[] } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);
    const [blocks, tasks] = await Promise.all([listBlocks(db, today, tomorrow), listTasksInBlocks(db, today, tomorrow)]);
    setData({ blocks, tasks });
  }, []);

  useEffect(() => {
    void applySavedTheme();
    void load();
    const refresh = setInterval(() => void load(), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const complete = async (task: TaskItem) => {
    await db.batch(updateTaskStatements(task.id, { status: 'done' }, nowTimestamp()));
    if (isTauri()) void invoke('now_changed');
    await load();
  };

  const date = new Date(now);
  const minutes = date.getHours() * 60 + date.getMinutes();
  const current = data ? currentBlock(data.blocks, minutes) : null;
  const upcoming = data ? nextBlock(data.blocks, minutes) : null;
  const task = current ? data?.tasks.find((t) => t.blockId === current.block.id && t.status !== 'done') : undefined;
  const Icon = current ? moduleIcon(current.block.icon) : null;
  const elapsed = current
    ? (minutes - toMinutes(current.block.startsAt)) / Math.max(1, toMinutes(current.block.endsAt) - toMinutes(current.block.startsAt))
    : 0;

  return (
    <div data-tauri-drag-region className="relative flex h-screen flex-col gap-1.5 overflow-hidden bg-elevated px-4 pt-3 pb-3.5 select-none">
      <div data-tauri-drag-region className="flex items-center gap-2 text-meta text-ink-3">
        <span data-tauri-drag-region className="flex-1 truncate">
          En ce moment
        </span>
        <button type="button" onClick={hide} aria-label="Fermer la mini-fenêtre" className="-mr-1.5 grid size-6 place-items-center rounded hover:bg-hover hover:text-ink">
          <X className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
      {!data ? null : current ? (
        <>
          <div data-tauri-drag-region className="flex items-baseline gap-2.5">
            {Icon && <Icon className="size-4 shrink-0 translate-y-0.5" strokeWidth={1.75} style={{ color: colorVar(current.block.color) }} />}
            <span data-tauri-drag-region className="min-w-0 flex-1 truncate font-medium">
              {current.block.title}
            </span>
            <span data-tauri-drag-region className="tnum text-[22px] leading-none font-light">
              {formatCountdown(msUntil(current.block.endsAt, date))}
            </span>
          </div>
          {task ? (
            <div className="flex min-w-0 items-center gap-2">
              <TaskCheckbox status={task.status} onToggle={() => void complete(task)} />
              <span className="truncate text-ink-2">{task.title}</span>
            </div>
          ) : (
            <p data-tauri-drag-region className="text-meta text-ink-3">
              jusqu’à {current.block.endsAt === '24:00' ? 'minuit' : current.block.endsAt}
            </p>
          )}
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-active">
            <span className="block h-full" style={{ width: `${Math.min(100, elapsed * 100)}%`, backgroundColor: colorVar(current.block.color) }} />
          </span>
        </>
      ) : (
        <>
          <p data-tauri-drag-region className="font-medium">
            Pas de bloc en cours
          </p>
          <p data-tauri-drag-region className="text-meta text-ink-3">
            {upcoming ? `Ensuite : ${upcoming.title} à ${upcoming.startsAt}` : 'Plus rien de prévu aujourd’hui.'}
          </p>
        </>
      )}
    </div>
  );
}
