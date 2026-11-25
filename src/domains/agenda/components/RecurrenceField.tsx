import { useWeekStartsOn } from '@/core/week-start';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/ui/overlays/Menu';
import { DateField } from '@/ui/primitives/DateField';
import { InlineDate } from '@/ui/primitives/InlineFields';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import {
  REPEAT_PRESETS,
  REPEAT_PRESET_LABELS,
  applyPreset,
  normalizeRecurrence,
  presetOf,
  toggleWeekday,
  weekdayChoices,
  weekdayOf,
  type Recurrence,
  type RepeatPreset,
} from '../recurrence';

type RecurrenceFieldProps = {
  value: Recurrence | null;
  /** Premier jour de l'événement : en hebdomadaire, son jour de la semaine reste toujours coché. */
  start: string;
  onChange: (rule: Recurrence | null) => void;
  /** `field` : dans un formulaire (création). `inline` : dans un panneau, où tout s'enregistre sur place. */
  variant?: 'field' | 'inline';
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Répétition d'un événement : un choix tout fait (jamais, chaque jour, chaque semaine…), puis, en
 * hebdomadaire, les jours de la semaine, et une fin facultative.
 */
export function RecurrenceField({ value, start, onChange, variant = 'field' }: RecurrenceFieldProps) {
  const weekStartsOn = useWeekStartsOn();
  const rule = value ? normalizeRecurrence(value, start) : null;
  const startWeekday = weekdayOf(start);

  return (
    <div className="flex flex-col gap-2">
      <Menu>
        <MenuTrigger asChild>
          <PropertyButton variant={variant} aria-label="Répéter" className={variant === 'field' ? 'max-w-[240px]' : ''}>
            {rule ? REPEAT_PRESET_LABELS[presetOf(rule)] : <span className="text-ink-3">{REPEAT_PRESET_LABELS.none}</span>}
          </PropertyButton>
        </MenuTrigger>
        <MenuContent>
          <MenuRadioGroup value={presetOf(rule)} onValueChange={(preset) => onChange(applyPreset(preset as RepeatPreset, rule, start))}>
            {REPEAT_PRESETS.map((preset) => (
              <MenuRadioItem key={preset} value={preset}>
                {REPEAT_PRESET_LABELS[preset]}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>

      {rule?.freq === 'weekly' && (
        <div role="group" aria-label="Jours de la semaine" className="flex gap-1">
          {weekdayChoices(weekStartsOn).map(({ weekday, letter, name }) => {
            const selected = rule.weekdays.includes(weekday);
            const locked = weekday === startWeekday;
            return (
              <button
                key={weekday}
                type="button"
                aria-pressed={selected}
                aria-label={capitalize(name)}
                title={locked ? `${capitalize(name)} : le jour du premier événement` : capitalize(name)}
                disabled={locked}
                onClick={() => onChange(toggleWeekday(rule, weekday, start))}
                className={
                  'size-8 rounded-full border text-meta transition-colors duration-[120ms] ease-soft outline-none ' +
                  'focus-visible:ring-2 focus-visible:ring-accent-soft ' +
                  (selected ? 'border-line-strong bg-active font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink')
                }
              >
                {letter}
              </button>
            );
          })}
        </div>
      )}

      {rule && (
        <div className="flex items-center gap-2">
          <span className={`shrink-0 text-meta ${variant === 'field' ? 'text-ink-2' : 'text-ink-3'}`}>Jusqu’au</span>
          {variant === 'field' ? (
            <DateField
              value={rule.until}
              onChange={(until) => onChange({ ...rule, until })}
              placeholder="Sans fin"
              aria-label="Fin de la répétition (facultative)"
            />
          ) : (
            <div className="min-w-0 flex-1 pl-2">
              <InlineDate
                value={rule.until}
                onSave={(until) => onChange({ ...rule, until })}
                placeholder="Sans fin"
                aria-label="Fin de la répétition (facultative)"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
