import { useState, type FormEvent, type ReactNode } from 'react';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { ColorChoice } from '@/ui/primitives/ColorChoice';
import { Input } from '@/ui/primitives/Input';
import { useDeleteModule, useSaveModule } from '../hooks';
import { MODULE_ICONS } from '../icons';
import { BLOCK_MODE_LABELS, ICON_KEYS, formatMinutes, validateModule, type BlockMode, type Module, type ModuleInput } from '../model';

const DURATIONS = [30, 45, 60, 90, 120, 180, 240];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

function ModuleForm({ module, defaultMode, onDone }: { module?: Module; defaultMode: BlockMode; onDone: () => void }) {
  const [input, setInput] = useState<ModuleInput>(
    module
      ? { name: module.name, icon: module.icon, color: module.color, durationMin: module.durationMin, mode: module.mode }
      : { name: '', icon: 'sparkles', color: 'teal', durationMin: 60, mode: defaultMode },
  );
  const [submitted, setSubmitted] = useState(false);
  const save = useSaveModule();
  const remove = useDeleteModule();
  const errors = validateModule(input);
  const set = <K extends keyof ModuleInput>(key: K, value: ModuleInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    save.mutate({ id: module?.id, input }, { onSuccess: onDone });
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
          <Input autoFocus value={input.name} onChange={(e) => set('name', e.target.value)} placeholder="Sport, Lecture, Admin…" aria-label="Nom du module" />
          {submitted && errors.name && <p className="mt-1.5 text-meta text-danger">{errors.name}</p>}
        </Row>
        <Row label="Durée">
          <ChoiceChips
            label="Durée"
            options={DURATIONS.map((minutes) => ({ value: String(minutes), label: formatMinutes(minutes) }))}
            value={DURATIONS.includes(input.durationMin) ? String(input.durationMin) : null}
            onChange={(v) => set('durationMin', Number(v))}
          />
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
                  className={`grid size-8 place-items-center rounded-md transition-colors duration-[120ms] ease-soft ${selected ? 'bg-active text-ink' : 'text-ink-3 hover:bg-hover hover:text-ink'}`}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </Row>
        <Row label="Couleur">
          <ColorChoice value={input.color} onChange={(color) => set('color', color)} label="Couleur" />
        </Row>
        <Row label="Mode">
          <ChoiceChips
            label="Mode"
            options={(['work', 'school', 'both'] as BlockMode[]).map((mode) => ({ value: mode, label: BLOCK_MODE_LABELS[mode] }))}
            value={input.mode}
            onChange={(mode) => set('mode', mode)}
          />
          <p className="mt-1.5 text-meta text-ink-3">Le mode où le module est proposé. La journée, elle, montre tout.</p>
        </Row>
      </div>
      <DialogFooter>
        {module && (
          <Button variant="ghost" className="mr-auto !text-danger" onClick={() => remove.mutate(module.id, { onSuccess: onDone })}>
            Supprimer
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={save.isPending}>
          {module ? 'Enregistrer' : 'Créer le module'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ModuleDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; module?: Module; defaultMode: BlockMode }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title={props.module ? props.module.name : 'Nouveau module'} restoreFocus={Boolean(props.module)}>
      {props.open && (
        <ModuleForm
          key={props.module?.id ?? 'new'}
          module={props.module}
          defaultMode={props.defaultMode}
          onDone={() => props.onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}
