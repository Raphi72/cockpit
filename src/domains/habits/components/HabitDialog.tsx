import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { monthOf } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { useModules } from '@/domains/day/hooks';
import { MODULE_ICONS } from '@/domains/day/icons';
import { ICON_KEYS } from '@/domains/day/model';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { ColorChoice } from '@/ui/primitives/ColorChoice';
import { Input } from '@/ui/primitives/Input';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { TimeField } from '@/ui/primitives/TimeField';
import { useArchiveHabit, useGoals, useHabitActivity, useSaveHabit } from '../hooks';
import { FREQUENCY_LABELS, doneDays, monthGrid, validateHabit, type Frequency, type Habit, type HabitInput } from '../model';

const WEEKDAY_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const WEEKDAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

/** La grille du mois en cours : un carré par jour, plein quand c'est fait, rouge pâle quand c'est manqué. */
function MonthGrid({ habit }: { habit: Habit }) {
  const today = useToday();
  const month = monthOf(today);
  const range = useMemo(() => ({ from: `${month}-01`, to: `${month}-32` }), [month]);
  const { data } = useHabitActivity(range);
  if (!data) return null;
  const grid = monthGrid(habit, doneDays(habit, data.logs, data.doneBlocks), month, today);
  const offset = (new Date(`${month}-01T12:00:00`).getDay() + 6) % 7;
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-meta font-medium text-ink-2">Ce mois-ci</h3>
      <div className="grid w-fit grid-cols-7 gap-1">
        {WEEKDAY_SHORT.map((letter, i) => (
          <span key={`head-${i}`} className="text-center text-[11px] text-ink-3">
            {letter}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {grid.map(({ day, state }) => (
          <span
            key={day}
            title={`${Number(day.slice(8))} : ${state === 'done' ? 'fait' : state === 'missed' ? 'manqué' : state === 'future' ? 'à venir' : 'pas prévu'}`}
            className={`size-5 rounded-[4px] ${state === 'done' ? '' : state === 'missed' ? 'bg-danger/15' : 'bg-hover'} ${day === today ? 'ring-1 ring-ink-3' : ''}`}
            style={state === 'done' ? { backgroundColor: `var(--p-${habit.color})` } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function HabitForm({ habit, onDone }: { habit?: Habit; onDone: () => void }) {
  const { data: modules = [] } = useModules();
  const { data: goals = [] } = useGoals();
  const save = useSaveHabit();
  const archive = useArchiveHabit();
  const [input, setInput] = useState<HabitInput>(
    habit
      ? { ...habit }
      : { name: '', icon: 'sparkles', color: 'green', frequency: 'daily', timesPerWeek: 3, weekdays: [1, 3, 5], reminderTime: null, moduleId: null, goalId: null },
  );
  const [submitted, setSubmitted] = useState(false);
  const errors = validateHabit(input);
  const set = <K extends keyof HabitInput>(key: K, value: HabitInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const moduleName = modules.find((m) => m.id === input.moduleId)?.name;
  const goalTitle = goals.find((g) => g.id === input.goalId)?.title;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    save.mutate({ id: habit?.id, input }, { onSuccess: onDone });
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          submit();
        }
      }}
      className="mt-5"
    >
      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <Row label="Nom">
          <Input autoFocus value={input.name} onChange={(e) => set('name', e.target.value)} placeholder="Sport, Lire 20 minutes, Méditer…" aria-label="Nom de l’habitude" />
          {submitted && errors.name && <p className="mt-1.5 text-meta text-danger">{errors.name}</p>}
        </Row>
        <Row label="Fréquence">
          <ChoiceChips
            label="Fréquence"
            options={(['daily', 'weekly', 'days'] as Frequency[]).map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))}
            value={input.frequency}
            onChange={(f) => set('frequency', f)}
          />
          {input.frequency === 'weekly' && (
            <div className="mt-2">
              <ChoiceChips
                label="Fois par semaine"
                options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} fois` }))}
                value={String(input.timesPerWeek ?? 3)}
                onChange={(n) => set('timesPerWeek', Number(n))}
              />
            </div>
          )}
          {input.frequency === 'days' && (
            <div className="mt-2 flex gap-1" role="group" aria-label="Jours">
              {WEEKDAY_SHORT.map((letter, index) => {
                const day = index + 1;
                const on = input.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    aria-label={WEEKDAY_NAMES[index]}
                    title={WEEKDAY_NAMES[index]}
                    onClick={() => set('weekdays', on ? input.weekdays.filter((d) => d !== day) : [...input.weekdays, day])}
                    className={`grid size-8 place-items-center rounded-full text-meta transition-colors duration-[120ms] ease-soft ${on ? 'bg-ink font-medium text-canvas' : 'border border-line text-ink-2 hover:bg-hover'}`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          )}
          {submitted && errors.frequency && <p className="mt-1.5 text-meta text-danger">{errors.frequency}</p>}
        </Row>
        <Row label="Icône">
          <div role="radiogroup" aria-label="Icône" className="flex flex-wrap gap-1">
            {ICON_KEYS.map((key) => {
              const Icon = MODULE_ICONS[key];
              const selected = key === input.icon;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={key}
                  onClick={() => set('icon', key)}
                  className={`grid size-8 place-items-center rounded-md ${selected ? 'bg-active text-ink' : 'text-ink-3 hover:bg-hover hover:text-ink'}`}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </Row>
        <Row label="Couleur">
          <ColorChoice value={input.color} onChange={(c) => set('color', c)} label="Couleur" />
        </Row>
        <Row label="Rappel">
          <TimeField value={input.reminderTime} onChange={(t) => set('reminderTime', t)} aria-label="Heure du rappel" />
          <p className="mt-1.5 text-meta text-ink-3">Une notification à cette heure si elle n’est pas encore faite (facultatif).</p>
        </Row>
        <Row label="Module">
          <Menu>
            <MenuTrigger asChild>
              <PropertyButton variant="field" aria-label="Module qui la coche">
                {moduleName ? <span className="truncate">{moduleName}</span> : <span className="text-ink-3">Aucun</span>}
              </PropertyButton>
            </MenuTrigger>
            <MenuContent>
              <MenuRadioGroup value={input.moduleId ?? ''} onValueChange={(v) => set('moduleId', v || null)}>
                <MenuRadioItem value="">Aucun</MenuRadioItem>
                <MenuSeparator />
                {modules.map((m) => (
                  <MenuRadioItem key={m.id} value={m.id}>
                    {m.name}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
          <p className="mt-1.5 text-meta text-ink-3">Un bloc fait de ce module la coche tout seul (Journée).</p>
        </Row>
        <Row label="Objectif">
          <Menu>
            <MenuTrigger asChild>
              <PropertyButton variant="field" aria-label="Objectif servi">
                {goalTitle ? <span className="truncate">{goalTitle}</span> : <span className="text-ink-3">Aucun</span>}
              </PropertyButton>
            </MenuTrigger>
            <MenuContent>
              <MenuRadioGroup value={input.goalId ?? ''} onValueChange={(v) => set('goalId', v || null)}>
                <MenuRadioItem value="">Aucun</MenuRadioItem>
                {goals.length > 0 && <MenuSeparator />}
                {goals.map((g) => (
                  <MenuRadioItem key={g.id} value={g.id}>
                    {g.title}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        </Row>
      </div>
      {habit && <MonthGrid habit={habit} />}
      <DialogFooter>
        {habit && (
          <Button variant="ghost" className="mr-auto !text-danger" onClick={() => archive.mutate({ id: habit.id, name: habit.name }, { onSuccess: onDone })}>
            Arrêter l’habitude
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={save.isPending}>
          {habit ? 'Enregistrer' : 'Créer l’habitude'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function HabitDialog({ open, onOpenChange, habit }: { open: boolean; onOpenChange: (open: boolean) => void; habit?: Habit }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={habit ? habit.name : 'Nouvelle habitude'} width={580}>
      {open && <HabitForm key={habit?.id ?? 'new'} habit={habit} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}
