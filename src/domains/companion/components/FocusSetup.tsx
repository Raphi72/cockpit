import { ListChecks, Play, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useUiStore } from '@/app/ui-store';
import { useMinutesOfDay, useToday } from '@/core/use-today';
import { currentBlock } from '@/domains/day/model';
import { useSaveSetting, useSetting } from '@/domains/settings/hooks';
import { SETTINGS } from '@/domains/settings/model';
import { useOpenTasks } from '@/domains/tasks/hooks';
import { selectToday, taskContext, tasksOfMode, type TaskItem } from '@/domains/tasks/model';
import { ColorDot, type AppColor } from '@/ui/data/ColorDot';
import { Button } from '@/ui/primitives/Button';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { Input } from '@/ui/primitives/Input';
import { useCompanionSettings, useTodayBlocks } from '../hooks';
import {
  FOCUS_DURATIONS,
  POMODORO_BREAK_CHOICES,
  POMODORO_ROUND_CHOICES,
  POMODORO_WORK_CHOICES,
  formatFocusDuration,
  pomodoroTotalMs,
  type FocusItem,
  type FocusPomodoro,
} from '../model';

/** Ce qu'il faut pour lancer une séance. */
export type FocusStart = {
  items: FocusItem[];
  /** Les tâches de Cockpit de la liste, pour les cocher pour de bon. */
  tasks: Map<string, TaskItem>;
  totalMs: number;
  pomodoro: FocusPomodoro | null;
  /** Le bloc en cours, ou le mode : le nom de la séance. */
  label: string;
};

const taskKey = (task: TaskItem) => `task:${task.id}`;
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-meta font-medium text-ink-2">{title}</h2>
      {children}
    </section>
  );
}

const NO_CONTEXT = 'Sans projet';

type TaskGroup = { name: string; color: AppColor | null; tasks: TaskItem[] };

/**
 * Les tâches à faire rangées par projet (ou par matière pour un devoir), les projets par ordre
 * alphabétique, les tâches libres à la fin. Le filtre porte sur le titre de la tâche ou le nom du projet.
 */
export function groupByContext(tasks: TaskItem[], query: string): TaskGroup[] {
  const wanted = fold(query.trim());
  const groups = new Map<string, TaskGroup>();
  for (const task of tasks) {
    const context = taskContext(task);
    const name = context?.name ?? NO_CONTEXT;
    if (wanted && !fold(task.title).includes(wanted) && !fold(name).includes(wanted) && !fold(task.parentTitle ?? '').includes(wanted)) continue;
    const group = groups.get(name) ?? { name, color: context?.color ?? null, tasks: [] };
    group.tasks.push(task);
    groups.set(name, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.name === NO_CONTEXT ? 1 : b.name === NO_CONTEXT ? -1 : a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
  );
}

function toItem(task: TaskItem): FocusItem {
  return { key: taskKey(task), title: task.title, taskId: task.id, tag: taskContext(task)?.name ?? null };
}

/**
 * Le lancement d'une séance : la durée (toute faite, au choix, jusqu'à la fin du bloc, ou un Pomodoro),
 * et ce qu'on veut faire pendant. Les tâches du jour du mode sont proposées cochées, celles de l'autre
 * mode (tâches ou devoirs) aussi, décochées ; on peut en chercher d'autres, ou écrire « autre chose ».
 */
export function FocusSetup({ onStart, onClose }: { onStart: (start: FocusStart) => void; onClose: () => void }) {
  const today = useToday();
  const minutesNow = useMinutesOfDay();
  const mode = useUiStore((state) => state.mode);
  const { data: open } = useOpenTasks();
  const { blocks = [], tasks: blockTasks = [] } = useTodayBlocks();
  const companion = useCompanionSettings();
  const { data: savedMinutes = SETTINGS.focusMinutes.fallback } = useSetting(SETTINGS.focusMinutes);
  const { data: savedPomodoro = SETTINGS.focusPomodoro.fallback } = useSetting(SETTINGS.focusPomodoro);
  const { data: savedRounds = SETTINGS.pomodoroRounds.fallback } = useSetting(SETTINGS.pomodoroRounds);
  const saveMinutes = useSaveSetting(SETTINGS.focusMinutes);
  const savePomodoro = useSaveSetting(SETTINGS.focusPomodoro);
  const saveRounds = useSaveSetting(SETTINGS.pomodoroRounds);
  const saveWork = useSaveSetting(SETTINGS.pomodoroWork);
  const saveBreak = useSaveSetting(SETTINGS.pomodoroBreak);

  const current = currentBlock(blocks, minutesNow);
  const [duration, setDuration] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [pomodoroOn, setPomodoroOn] = useState<boolean | null>(null);
  const [added, setAdded] = useState<TaskItem[]>([]);
  const [free, setFree] = useState<FocusItem[]>([]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [freeText, setFreeText] = useState('');

  // Les tâches proposées : celles du bloc en cours, puis celles du jour (du mode, puis de l'autre mode).
  const currentId = current?.block.id ?? null;
  const { candidates, preselected } = useMemo(() => {
    const groups = selectToday(open ?? [], today);
    const forToday = [...groups.overdue, ...groups.today];
    const other = mode === 'school' ? 'work' : 'school';
    const inBlock = currentId ? blockTasks.filter((t) => t.blockId === currentId && t.status !== 'done') : [];
    const ordered = [...inBlock, ...tasksOfMode(forToday, mode), ...tasksOfMode(forToday, other)];
    const seen = new Set<string>();
    const unique = ordered.filter((task) => !seen.has(task.id) && seen.add(task.id));
    const pre = new Set([...inBlock, ...tasksOfMode(forToday, mode)].map(taskKey));
    return { candidates: unique, preselected: pre };
  }, [open, today, mode, currentId, blockTasks]);

  useEffect(() => {
    if (picked === null && open) setPicked(new Set(preselected));
  }, [picked, open, preselected]);

  const chosen = picked ?? preselected;
  const listed = [...candidates, ...added.filter((task) => !candidates.some((c) => c.id === task.id))];
  // Toutes les tâches à faire, rangées par projet (ou matière), filtrées sur la tâche ou le projet.
  const groups = useMemo(() => groupByContext(open ?? [], query), [open, query]);
  const toggleTask = (task: TaskItem, on: boolean) => {
    if (on && !listed.some((l) => l.id === task.id)) setAdded((tasks) => [...tasks, task]);
    toggle(taskKey(task), on);
  };

  const pomodoro = pomodoroOn ?? savedPomodoro;
  const choice = duration ?? (FOCUS_DURATIONS.some((d) => d === savedMinutes) ? String(savedMinutes) : 'custom');
  const customMinutes = Number.parseInt(custom || (choice === 'custom' ? String(savedMinutes) : ''), 10);
  const simpleMinutes = choice === 'block' && current ? current.remaining : choice === 'custom' ? customMinutes : Number(choice);
  const plan: FocusPomodoro = { workMin: companion.pomodoroWork, breakMin: companion.pomodoroBreak, rounds: savedRounds };
  const totalMs = pomodoro ? pomodoroTotalMs(plan) : simpleMinutes * 60_000;
  const valid = Number.isFinite(totalMs) && totalMs >= 60_000 && totalMs <= 8 * 3_600_000;

  const toggle = (key: string, on: boolean) =>
    setPicked((previous) => {
      const next = new Set(previous ?? preselected);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const addFree = () => {
    const title = freeText.trim();
    if (!title) return;
    const item: FocusItem = { key: `free:${Date.now()}`, title, taskId: null, tag: null };
    setFree((items) => [...items, item]);
    toggle(item.key, true);
    setFreeText('');
  };

  const start = () => {
    if (!valid) return;
    const tasks = listed.filter((task) => chosen.has(taskKey(task)));
    if (pomodoro) saveRounds.mutate(plan.rounds);
    else if (choice !== 'block') saveMinutes.mutate(simpleMinutes);
    savePomodoro.mutate(pomodoro);
    onStart({
      items: [...tasks.map(toItem), ...free.filter((item) => chosen.has(item.key))],
      tasks: new Map(tasks.map((task) => [task.id, task])),
      totalMs,
      pomodoro: pomodoro ? plan : null,
      label: current?.block.title ?? (mode === 'school' ? 'Cours' : 'Travail'),
    });
  };

  const durationOptions = [
    ...FOCUS_DURATIONS.map((d) => ({ value: String(d), label: `${d} min` })),
    ...(current ? [{ value: 'block', label: `Fin du bloc · ${current.block.endsAt === '24:00' ? 'minuit' : current.block.endsAt}` }] : []),
    { value: 'custom', label: 'Autre' },
  ];

  return (
    <div
      className="flex h-full justify-center overflow-y-auto px-8 py-16"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.ctrlKey) {
          event.preventDefault();
          start();
        }
      }}
    >
      <div className="w-full max-w-[560px]">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Mode focus</h1>
            <p className="mt-1 text-ink-3">Un temps, une liste, rien d’autre à l’écran.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer · Échap"
            className="grid size-9 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        <Section title="Durée">
          <ChoiceChips
            label="Minuteur"
            options={[
              { value: 'simple', label: 'Minuteur' },
              { value: 'pomodoro', label: 'Pomodoro' },
            ]}
            value={pomodoro ? 'pomodoro' : 'simple'}
            onChange={(v) => setPomodoroOn(v === 'pomodoro')}
          />
          <div className="mt-3">
            {pomodoro ? (
              <div className="flex flex-col gap-2.5 text-meta text-ink-3">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="w-14">Travail</span>
                  <ChoiceChips label="Durée de travail" options={POMODORO_WORK_CHOICES.map((n) => ({ value: String(n), label: `${n} min` }))} value={String(plan.workMin)} onChange={(v) => saveWork.mutate(Number(v))} />
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="w-14">Pause</span>
                  <ChoiceChips label="Durée de pause" options={POMODORO_BREAK_CHOICES.map((n) => ({ value: String(n), label: `${n} min` }))} value={String(plan.breakMin)} onChange={(v) => saveBreak.mutate(Number(v))} />
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="w-14">Tours</span>
                  <ChoiceChips label="Nombre de tours" options={POMODORO_ROUND_CHOICES.map((n) => ({ value: String(n), label: String(n) }))} value={String(plan.rounds)} onChange={(v) => saveRounds.mutate(Number(v))} />
                  <span className="ml-1">soit {formatFocusDuration(pomodoroTotalMs(plan))}</span>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <ChoiceChips label="Durée" options={durationOptions} value={choice} onChange={setDuration} />
                {choice === 'custom' && (
                  <span className="flex items-center gap-2 text-meta text-ink-3">
                    <Input
                      type="number"
                      min={1}
                      max={480}
                      value={custom || String(savedMinutes)}
                      onChange={(e) => setCustom(e.target.value)}
                      aria-label="Durée en minutes"
                      className="h-8 w-20"
                    />
                    min
                  </span>
                )}
              </div>
            )}
          </div>
        </Section>

        <Section title="Pendant la séance">
          {listed.length === 0 && free.length === 0 ? (
            <p className="text-ink-3">Rien de prévu aujourd’hui : choisis dans tes tâches, ou écris ce que tu vas faire.</p>
          ) : (
            <ul className="flex max-h-[38vh] flex-col gap-2 overflow-y-auto pr-2">
              {listed.map((task) => (
                <li key={task.id}>
                  <Checkbox checked={chosen.has(taskKey(task))} onChange={(on) => toggle(taskKey(task), on)}>
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {taskContext(task) && <span className="max-w-[40%] shrink-0 truncate text-meta text-ink-3">{taskContext(task)!.name}</span>}
                  </Checkbox>
                </li>
              ))}
              {free.map((item) => (
                <li key={item.key}>
                  <Checkbox checked={chosen.has(item.key)} onChange={(on) => toggle(item.key, on)}>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="shrink-0 text-meta text-ink-3">autre</span>
                  </Checkbox>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              icon={ListChecks}
              onClick={() => setBrowsing((open) => !open)}
              aria-expanded={browsing}
              className="justify-start"
            >
              {browsing ? 'Masquer mes tâches' : 'Ajouter une tâche'}
            </Button>
            <div className="relative">
              <Plus className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" strokeWidth={1.75} />
              <Input
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.ctrlKey) {
                    e.preventDefault();
                    addFree();
                  }
                }}
                placeholder="Autre chose… (Entrée)"
                aria-label="Ajouter autre chose à faire pendant la séance"
                className="pl-8"
              />
            </div>
          </div>

          {browsing && (
            <div className="mt-3 overflow-hidden rounded-lg border border-line bg-elevated">
              <div className="flex items-center gap-2 border-b border-line px-3">
                <Search className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filtrer par tâche ou par projet…"
                  aria-label="Filtrer mes tâches"
                  className="h-10 min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
                />
              </div>
              <div className="max-h-[40vh] overflow-y-auto px-3 py-2">
                {groups.length === 0 && <p className="py-2 text-meta text-ink-3">Aucune tâche ne correspond.</p>}
                {groups.map((group) => (
                  <section key={group.name} className="mb-3 last:mb-0">
                    <p className="sticky top-0 z-[1] flex items-center gap-2 bg-elevated py-1.5 text-meta font-medium text-ink-2">
                      <ColorDot color={group.color ?? 'slate'} />
                      <span className="truncate">{group.name}</span>
                      <span className="tnum font-normal text-ink-3">{group.tasks.length}</span>
                    </p>
                    <ul className="flex flex-col gap-1.5 pl-1">
                      {group.tasks.map((task) => (
                        <li key={task.id}>
                          <Checkbox checked={chosen.has(taskKey(task))} onChange={(on) => toggleTask(task, on)}>
                            <span className="min-w-0 flex-1 truncate">
                              {task.parentTitle && <span className="text-ink-3">{task.parentTitle} › </span>}
                              {task.title}
                            </span>
                          </Checkbox>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          )}
        </Section>

        <div className="mt-10 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" icon={Play} shortcut="Ctrl ↵" onClick={start} disabled={!valid}>
            Lancer · {valid ? formatFocusDuration(totalMs) : '—'}
          </Button>
        </div>
      </div>
    </div>
  );
}
