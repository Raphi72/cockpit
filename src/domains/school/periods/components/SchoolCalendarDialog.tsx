import { Plus, Trash2 } from 'lucide-react';
import { addDaysISO } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { InlineDate, InlineText } from '@/ui/primitives/InlineFields';
import { useAddPeriods, useDeletePeriod, usePeriods, useUpdatePeriod } from '../hooks';
import {
  holidays,
  semesters,
  suggestedSemesters,
  validatePeriod,
  type PeriodInput,
  type PeriodKind,
  type SchoolPeriod,
} from '../model';

/** Une période : son nom et ses dates se modifient sur place ; une modification refusée est expliquée. */
function PeriodRow({ period, all }: { period: SchoolPeriod; all: SchoolPeriod[] }) {
  const update = useUpdatePeriod();
  const remove = useDeletePeriod();
  const save = (patch: Partial<PeriodInput>) => {
    const input = { ...period, ...patch };
    const problem = validatePeriod(input, all.filter((p) => p.id !== period.id));
    if (problem) return toast(problem, { tone: 'danger' });
    update.mutate({ id: period.id, input });
  };
  return (
    <li className="group grid min-h-11 grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-3">
      <InlineText value={period.name} onSave={(name) => save({ name })} required aria-label="Nom" />
      <span className="flex items-center gap-1 text-ink-2">
        <InlineDate value={period.startsOn} onSave={(day) => day && save({ startsOn: day })} clearable={false} aria-label="Début" />
        <span className="text-ink-3">→</span>
        <InlineDate value={period.endsOn} onSave={(day) => day && save({ endsOn: day })} clearable={false} aria-label="Fin" />
      </span>
      <Button
        variant="ghost"
        icon={Trash2}
        aria-label={`Supprimer « ${period.name} »`}
        className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        onClick={() => remove.mutate(period)}
      />
    </li>
  );
}

function Section(props: { kind: PeriodKind; title: string; periods: SchoolPeriod[]; all: SchoolPeriod[]; empty: string }) {
  const add = useAddPeriods();
  const today = useToday();
  const addOne = () => {
    const last = props.periods.at(-1);
    const startsOn = last ? addDaysISO(last.endsOn, 1) : today;
    const input: PeriodInput =
      props.kind === 'semester'
        ? { kind: 'semester', name: `Semestre ${props.periods.length + 1}`, startsOn, endsOn: addDaysISO(startsOn, 150) }
        : { kind: 'holiday', name: 'Vacances', startsOn: addDaysISO(today, 7), endsOn: addDaysISO(today, 15) };
    const problem = validatePeriod(input, props.all);
    if (problem) return toast(problem, { tone: 'danger' });
    add.mutate([input]);
  };
  return (
    <section className="mt-6 first:mt-2">
      <h3 className="mb-1 text-meta font-medium text-ink-2">{props.title}</h3>
      {props.periods.length === 0 ? (
        <p className="py-2 text-ink-3">{props.empty}</p>
      ) : (
        <ul>
          {props.periods.map((period) => (
            <PeriodRow key={period.id} period={period} all={props.all} />
          ))}
        </ul>
      )}
      <div className="mt-1 flex gap-2">
        {props.kind === 'semester' && props.periods.length === 0 && (
          <Button variant="secondary" onClick={() => add.mutate(suggestedSemesters(today))}>
            Ajouter les deux semestres de l’année
          </Button>
        )}
        <Button variant="ghost" icon={Plus} className="-ml-3" onClick={addOne}>
          {props.kind === 'semester' ? 'Ajouter un semestre' : 'Ajouter des vacances'}
        </Button>
      </div>
    </section>
  );
}

/**
 * Semestres et vacances. Les semestres rangent les notes (une moyenne par semestre) et bornent
 * l'emploi du temps ; pendant les vacances, il n'y a pas de cours.
 */
export function SchoolCalendarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: periods = [] } = usePeriods();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Semestres et vacances"
      description="Les notes se rangent par semestre ; pendant les vacances, pas de cours."
      width={620}
    >
      <Section
        kind="semester"
        title="Semestres"
        periods={semesters(periods)}
        all={periods}
        empty="Aucun semestre : l’emploi du temps vaut toute l’année et les notes font une seule moyenne."
      />
      <Section kind="holiday" title="Vacances" periods={holidays(periods)} all={periods} empty="Aucune période de vacances." />
      <DialogFooter>
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          Fermer
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
