import { Pause, Play, Square } from 'lucide-react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useUiStore } from '@/app/ui-store';
import { COMPLETE_IN_PANEL_DELAY_MS } from '@/domains/tasks/completion-store';
import { useToggleTask } from '@/domains/tasks/hooks';
import { transitionFor } from '@/ui/motion/presets';
import { useCompanionSettings } from '../hooks';
import {
  FOCUS_EXTRA_MS,
  allFocusDone,
  clockElapsed,
  extendClock,
  formatCountdown,
  formatFocusDuration,
  isClockPaused,
  pauseClock,
  pomodoroPhaseAt,
  pomodoroTotalMs,
  resumeClock,
  startClock,
  type FocusItem,
} from '../model';
import { keepScreenOn, setFullscreen } from '../native';
import { playChime } from '../sounds';
import { useCompanion } from '../store';
import { FOCUS_COLORS, FocusBurst, FocusList, FocusRing } from './FocusParts';
import { FocusSetup, type FocusStart } from './FocusSetup';

type Ending = 'done' | 'timeup' | null;

function NightButton({ onClick, children, title, round = false }: { onClick: () => void; children: ReactNode; title?: string; round?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={
        'flex h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 text-white/85 ' +
        'transition-colors duration-[120ms] hover:border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white/40 ' +
        (round ? 'w-11' : 'px-5')
      }
    >
      {children}
    </button>
  );
}

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Une séance : fond de nuit, l'anneau qui se vide, la liste à cocher en bas à droite. Tout cocher avant
 * la fin déclenche la fin en fête ; sinon le temps s'écoule jusqu'au bout, puis un écran de fin calme
 * propose « +10 min ». Espace : pause ; Échap ou ■ : arrêter quand on veut.
 */
function FocusSession({ start, onClose }: { start: FocusStart; onClose: () => void }) {
  const reduced = useReducedMotion();
  const mode = useUiStore((state) => state.mode);
  const { sounds } = useCompanionSettings();
  const toggleTask = useToggleTask();
  const [clock, setClock] = useState(() => startClock(start.totalMs, Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [ending, setEnding] = useState<Ending>(null);
  const lastPhase = useRef<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  // Sur le téléphone, l'écran reste allumé pendant la séance.
  useEffect(() => {
    keepScreenOn(true);
    return () => keepScreenOn(false);
  }, []);

  const elapsed = clockElapsed(clock, now);
  const remaining = clock.totalMs - elapsed;
  const paused = isClockPaused(clock);
  const pomodoro = start.pomodoro;
  const phase = pomodoro ? pomodoroPhaseAt(pomodoro, elapsed) : null;
  const allDone = allFocusDone(start.items, checked);
  const base = mode === 'school' ? FOCUS_COLORS.school : FOCUS_COLORS.work;
  const color = phase?.phase === 'break' && !ending ? FOCUS_COLORS.rest : base;

  // Pomodoro : ce qui reste de la phase, et sa part sur l'anneau. Le dernier tour finit avec la séance
  // (et s'allonge avec « +10 min »).
  const lastWorkStart = pomodoro ? pomodoroTotalMs(pomodoro) - pomodoro.workMin * 60_000 : 0;
  const isLastRound = pomodoro !== null && phase?.phase === 'work' && phase.round === pomodoro.rounds;
  const phaseEnd = phase ? (isLastRound ? clock.totalMs : phase.phaseEndsAtMs) : clock.totalMs;
  const phaseLength = phase && pomodoro ? (isLastRound ? clock.totalMs - lastWorkStart : (phase.phase === 'work' ? pomodoro.workMin : pomodoro.breakMin) * 60_000) : clock.totalMs;
  const shown = phaseEnd - elapsed;
  const progress = ending === 'done' ? 1 : phaseLength > 0 ? shown / phaseLength : 0;

  // Le temps est écoulé : écran de fin calme (sauf si tout vient d'être fait).
  useEffect(() => {
    if (ending || paused || remaining > 0) return;
    setClock((c) => pauseClock(c, Date.now()));
    setEnding('timeup');
    if (sounds) playChime('block');
  }, [ending, paused, remaining, sounds]);

  // Un tour de Pomodoro ou une pause se termine : un son, s'ils sont activés.
  const phaseId = phase ? `${phase.phase}:${phase.round}` : null;
  useEffect(() => {
    if (phaseId && lastPhase.current && lastPhase.current !== phaseId && sounds && !ending) playChime(phaseId.startsWith('break') ? 'pomodoro' : 'break');
    lastPhase.current = phaseId;
  }, [phaseId, sounds, ending]);

  // Tout est coché : la fin en fête, après le temps de voir la dernière case se cocher.
  useEffect(() => {
    if (!allDone || ending === 'done') return;
    const timer = setTimeout(() => {
      setClock((c) => pauseClock(c, Date.now()));
      setEnding('done');
      if (sounds) playChime('success');
    }, 700);
    return () => clearTimeout(timer);
  }, [allDone, ending, sounds]);

  const togglePause = () => setClock((c) => (isClockPaused(c) ? resumeClock(c, Date.now()) : pauseClock(c, Date.now())));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || ending || (event.target instanceof HTMLElement && event.target.closest('input, textarea'))) return;
      event.preventDefault();
      togglePause();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ending]);

  const toggleItem = (item: FocusItem) => {
    const wasChecked = checked.has(item.key);
    setChecked((previous) => {
      const next = new Set(previous);
      if (wasChecked) next.delete(item.key);
      else next.add(item.key);
      return next;
    });
    const task = item.taskId ? start.tasks.get(item.taskId) : undefined;
    // Cocher termine la tâche pour de bon ; décocher la rouvre (ou annule si elle se termine encore).
    if (task) toggleTask({ ...task, status: wasChecked ? 'done' : 'todo' }, COMPLETE_IN_PANEL_DELAY_MS);
  };

  const doneCount = start.items.filter((item) => checked.has(item.key)).length;

  return (
    <div
      className="relative h-full overflow-hidden text-white"
      style={{
        background: `radial-gradient(110% 85% at 50% 40%, ${color}26 0%, #05060a 58%)`,
        transition: 'background 600ms ease',
      }}
    >
      <p className="absolute top-8 left-10 flex items-center gap-2 text-sm text-white/45 phone:top-[calc(env(safe-area-inset-top)+20px)] phone:left-5">
        <span className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        {start.label}
      </p>

      <div className="flex h-full items-center justify-center pb-10 phone:items-start phone:pt-[calc(env(safe-area-inset-top)+76px)] phone:pb-0">
        <div className="relative">
          {ending === 'done' && <FocusBurst color={color} />}
          <FocusRing progress={progress} color={color} running={!paused && !ending}>
            {ending === 'done' ? (
              <m.div initial={reduced ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={transitionFor('screen', reduced)}>
                <p className="text-5xl font-extralight tracking-tight text-white/95 phone:text-4xl">Tout est fait</p>
                <p className="mt-4 text-white/55">
                  {doneCount} {doneCount > 1 ? 'choses faites' : 'chose faite'} en {formatFocusDuration(elapsed)}
                  {remaining >= 60_000 && ` · ${formatFocusDuration(remaining)} d’avance`}
                </p>
              </m.div>
            ) : ending === 'timeup' ? (
              <>
                <p className="text-5xl font-extralight tracking-tight text-white/90 phone:text-4xl">Temps écoulé</p>
                <p className="mt-4 text-white/55">
                  {start.items.length > 0 ? `${doneCount} sur ${start.items.length} faites` : formatFocusDuration(clock.totalMs) + ' de concentration'}
                </p>
              </>
            ) : (
              <>
                <p className="tnum text-[clamp(64px,13vh,116px)] leading-none font-extralight tracking-tight text-white/95 phone:text-[60px]">{formatCountdown(shown)}</p>
                <p className="mt-4 text-white/45">
                  {paused
                    ? 'En pause'
                    : phase && pomodoro
                      ? `${phase.phase === 'work' ? 'Travail' : 'Pause'} · tour ${phase.round} / ${pomodoro.rounds}`
                      : `jusqu’à ${clockTime(now + remaining)}`}
                </p>
              </>
            )}
          </FocusRing>
        </div>
      </div>

      {ending ? (
        <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-3 phone:bottom-[calc(env(safe-area-inset-bottom)+24px)]">
          {ending === 'timeup' && (
            <NightButton
              onClick={() => {
                setClock((c) => extendClock(c, FOCUS_EXTRA_MS, Date.now()));
                setEnding(null);
              }}
            >
              +10 min
            </NightButton>
          )}
          <NightButton onClick={onClose}>Terminer</NightButton>
        </div>
      ) : (
        <div className="absolute bottom-10 left-10 flex items-center gap-3 phone:bottom-[calc(env(safe-area-inset-bottom)+24px)] phone:left-1/2 phone:-translate-x-1/2">
          <NightButton round onClick={togglePause} title={paused ? 'Reprendre · Espace' : 'Pause · Espace'}>
            {paused ? <Play className="size-[18px]" strokeWidth={1.75} /> : <Pause className="size-[18px]" strokeWidth={1.75} />}
          </NightButton>
          <NightButton round onClick={onClose} title="Arrêter la séance · Échap">
            <Square className="size-4" strokeWidth={1.75} />
          </NightButton>
        </div>
      )}

      <div className="absolute right-10 bottom-10 phone:right-5 phone:bottom-[calc(env(safe-area-inset-bottom)+92px)] phone:left-5">
        <FocusList items={start.items} checked={checked} color={color} onToggle={toggleItem} />
      </div>
    </div>
  );
}

/**
 * Le mode focus (F, ou le bouton de la Journée), dans les deux modes : on choisit un temps et ce qu'on
 * va faire, puis la séance occupe tout l'écran (la fenêtre aussi). Échap le quitte à tout moment.
 */
export function FocusMode() {
  const open = useCompanion((state) => state.focusOpen);
  const setOpen = useCompanion((state) => state.setFocusOpen);
  const reduced = useReducedMotion();
  const [session, setSession] = useState<FocusStart | null>(null);

  useEffect(() => {
    if (!open) {
      setSession(null);
      return;
    }
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
          className={`fixed inset-0 z-[70] ${session ? 'bg-[#05060a]' : 'bg-canvas'}`}
        >
          {session ? (
            <FocusSession start={session} onClose={() => setOpen(false)} />
          ) : (
            <FocusSetup onStart={setSession} onClose={() => setOpen(false)} />
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
