import { Pause, Play, X } from 'lucide-react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useState } from 'react';
import { moduleIcon } from '@/domains/day/icons';
import { currentBlock, nextBlock } from '@/domains/day/model';
import { TaskCheckbox } from '@/domains/tasks/components/TaskCheckbox';
import { useCompletingTasks } from '@/domains/tasks/completion-store';
import { useToggleTask } from '@/domains/tasks/hooks';
import type { TaskItem } from '@/domains/tasks/model';
import { useSaveSetting } from '@/domains/settings/hooks';
import { SETTINGS } from '@/domains/settings/model';
import { transitionFor } from '@/ui/motion/presets';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { useCompanionSettings, useTodayBlocks } from '../hooks';
import { POMODORO_BREAK_CHOICES, POMODORO_WORK_CHOICES, formatCountdown, msUntil, nextPhase, startPomodoro, type Pomodoro } from '../model';
import { setFullscreen } from '../native';
import { playChime } from '../sounds';
import { useCompanion } from '../store';
import { colorVar } from '@/ui/data/ColorDot';

function FocusTask({ task, main }: { task: TaskItem; main: boolean }) {
  const toggle = useToggleTask();
  const checking = useCompletingTasks((state) => state.ids.includes(task.id));
  return (
    <li className={`flex items-center gap-3 ${main ? 'text-lg' : 'text-ink-2'}`}>
      <TaskCheckbox status={task.status} checking={checking} onToggle={() => toggle(task)} />
      <span className={checking ? 'text-ink-3 line-through' : ''}>{task.title}</span>
    </li>
  );
}

/** Réglage des durées du Pomodoro, avant de le lancer. */
function PomodoroDurations({ work, rest }: { work: number; rest: number }) {
  const saveWork = useSaveSetting(SETTINGS.pomodoroWork);
  const saveBreak = useSaveSetting(SETTINGS.pomodoroBreak);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-meta text-ink-3">
      <span className="flex items-center gap-2">
        Travail
        <ChoiceChips label="Durée de travail" options={POMODORO_WORK_CHOICES.map((n) => ({ value: String(n), label: `${n} min` }))} value={String(work)} onChange={(v) => saveWork.mutate(Number(v))} />
      </span>
      <span className="flex items-center gap-2">
        Pause
        <ChoiceChips label="Durée de pause" options={POMODORO_BREAK_CHOICES.map((n) => ({ value: String(n), label: `${n} min` }))} value={String(rest)} onChange={(v) => saveBreak.mutate(Number(v))} />
      </span>
    </div>
  );
}

/**
 * Le contenu du mode focus : le bloc en cours et le temps qui lui reste (ou un tour de Pomodoro),
 * la tâche à faire maintenant, et rien d'autre. Le Pomodoro vit le temps du mode focus.
 */
function FocusContent({ onClose }: { onClose: () => void }) {
  const { blocks = [], tasks = [] } = useTodayBlocks();
  const settings = useCompanionSettings();
  const [now, setNow] = useState(() => Date.now());
  const [pomodoro, setPomodoro] = useState<Pomodoro | null>(null);
  const [showDurations, setShowDurations] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fin d'une phase : la suivante commence d'elle-même (le son, s'il est activé, le signale).
  useEffect(() => {
    if (!pomodoro || now < pomodoro.endsAt) return;
    if (settings.sounds) playChime(pomodoro.phase === 'work' ? 'pomodoro' : 'break');
    setPomodoro(nextPhase(pomodoro, now, settings.pomodoroWork, settings.pomodoroBreak));
  }, [now, pomodoro, settings.sounds, settings.pomodoroWork, settings.pomodoroBreak]);

  const date = new Date(now);
  const minutes = date.getHours() * 60 + date.getMinutes();
  const current = currentBlock(blocks, minutes);
  const upcoming = nextBlock(blocks, minutes);
  const blockTasks = current ? tasks.filter((t) => t.blockId === current.block.id && t.status !== 'done') : [];
  const Icon = current ? moduleIcon(current.block.icon) : null;
  const remaining = pomodoro ? pomodoro.endsAt - now : current ? msUntil(current.block.endsAt, date) : null;

  const caption = pomodoro
    ? `${pomodoro.phase === 'work' ? 'Travail' : 'Pause'} · tour ${pomodoro.round}`
    : current
      ? `jusqu’à ${current.block.endsAt === '24:00' ? 'minuit' : current.block.endsAt}, fin du bloc`
      : null;

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-8 text-center">
      <button
        type="button"
        onClick={onClose}
        aria-label="Quitter le mode focus"
        title="Quitter le mode focus · Échap"
        className="absolute top-6 right-6 grid size-9 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
      >
        <X className="size-5" strokeWidth={1.75} />
      </button>

      {current ? (
        <p className="flex items-center gap-2.5 text-lg text-ink-2">
          {Icon && <Icon className="size-5" strokeWidth={1.75} style={{ color: colorVar(current.block.color) }} />}
          {current.block.title}
        </p>
      ) : (
        <p className="text-lg text-ink-2">
          Pas de bloc en cours
          {upcoming && (
            <span className="text-ink-3">
              {' '}
              · ensuite {upcoming.title} à {upcoming.startsAt}
            </span>
          )}
        </p>
      )}

      {remaining !== null ? (
        <>
          <p className={`tnum mt-4 text-[112px] leading-none font-light tracking-tight ${pomodoro?.phase === 'break' ? 'text-success' : ''}`}>
            {formatCountdown(remaining)}
          </p>
          {caption && <p className="mt-3 text-ink-3">{caption}</p>}
        </>
      ) : (
        <p className="mt-6 max-w-sm text-ink-3">Lance un Pomodoro pour te concentrer quand même, ou pose un bloc dans la Journée.</p>
      )}

      {blockTasks.length > 0 && (
        <ul className="mt-12 flex flex-col items-start gap-3">
          {blockTasks.slice(0, 4).map((task, index) => (
            <FocusTask key={task.id} task={task} main={index === 0} />
          ))}
        </ul>
      )}

      <div className="mt-14 flex flex-col items-center gap-4">
        {pomodoro ? (
          <Button variant="secondary" icon={Pause} onClick={() => setPomodoro(null)}>
            Arrêter le Pomodoro
          </Button>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Button variant="secondary" icon={Play} onClick={() => {
                  const start = Date.now();
                  setNow(start);
                  setPomodoro(startPomodoro(start, settings.pomodoroWork));
                }}>
                Pomodoro {settings.pomodoroWork} / {settings.pomodoroBreak} min
              </Button>
              <button type="button" onClick={() => setShowDurations((v) => !v)} className="text-meta text-ink-3 transition-colors hover:text-ink">
                Durées…
              </button>
            </div>
            {showDurations && <PomodoroDurations work={settings.pomodoroWork} rest={settings.pomodoroBreak} />}
          </>
        )}
      </div>
    </div>
  );
}

/** Le mode focus : plein écran (dans l'app, la fenêtre aussi), Échap pour en sortir. */
export function FocusMode() {
  const open = useCompanion((state) => state.focusOpen);
  const setOpen = useCompanion((state) => state.setFocusOpen);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    void setFullscreen(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      void setFullscreen(false);
    };
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          role="dialog"
          aria-modal="true"
          aria-label="Mode focus"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transitionFor('screen', reduced)}
          className="fixed inset-0 z-[70] bg-canvas"
        >
          <FocusContent onClose={() => setOpen(false)} />
        </m.div>
      )}
    </AnimatePresence>
  );
}
