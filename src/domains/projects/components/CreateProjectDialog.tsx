import { useNavigate } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useCreateStore } from '@/app/create-store';
import { useUiStore } from '@/app/ui-store';
import { DATE_INPUT_BOUNDS, formatShortDate, todayISO } from '@/core/dates';
import { formatMoney, parseMoneyInput } from '@/core/money';
import { ClientPicker } from '@/domains/clients/components/ClientPicker';
import type { ClientChoice } from '@/domains/clients/model';
import { ColorDot } from '@/ui/data/ColorDot';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/ui/overlays/Menu';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { Input, Textarea, fieldClass } from '@/ui/primitives/Input';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useCreateProject, useProjectTypes } from '../hooks';
import {
  PRIORITY_LABELS,
  PROJECT_STATUSES,
  SCHEDULE_PRESET_LABELS,
  STATUS_LABELS,
  buildSchedule,
  validateNewProject,
  type Priority,
  type ProjectStatus,
  type SchedulePreset,
} from '../model';
import { StatusIcon } from './StatusIcon';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-meta text-danger">{message}</p> : null;
}

function CreateProjectForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const { data: types = [] } = useProjectTypes();
  const lastTypeId = useUiStore((state) => state.lastProjectTypeId);
  const setLastTypeId = useUiStore((state) => state.setLastProjectTypeId);
  const createProject = useCreateProject();
  const today = todayISO();

  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState<string | null>(null);
  const [client, setClient] = useState<ClientChoice>({ kind: 'none' });
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [budgetText, setBudgetText] = useState('');
  const [schedule, setSchedule] = useState<SchedulePreset>('single');
  const [moreOptions, setMoreOptions] = useState(false);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>(1);
  const [submitted, setSubmitted] = useState(false);

  const selectedType =
    types.find((t) => t.id === typeId) ?? types.find((t) => t.id === lastTypeId) ?? types[0];
  const budgetCents = parseMoneyInput(budgetText);
  const input = {
    name,
    typeId: selectedType?.id ?? '',
    client,
    status,
    priority,
    startDate: startDate || null,
    deadline: deadline || null,
    budgetCents: budgetCents ?? null,
    schedule,
    description: description || null,
  };
  const errors = {
    ...validateNewProject(input),
    ...(budgetCents === undefined ? { budgetCents: 'Montant invalide : écris par exemple 1500 ou 1 234,50.' } : {}),
  };
  const preview = budgetCents
    ? buildSchedule(schedule, budgetCents, { startDate: input.startDate, deadline: input.deadline, today })
    : [];

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || !selectedType) return;
    createProject.mutate(input, {
      onSuccess: (projectId) => {
        setLastTypeId(selectedType.id);
        onDone();
        toast('Projet créé.');
        void navigate({ to: '/projects/$projectId', params: { projectId } });
      },
    });
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
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom du projet"
        aria-label="Nom du projet"
        className="h-10 text-[15px]"
      />
      <FieldError message={submitted ? errors.name : undefined} />

      <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <Row label="Type">
          <Menu>
            <MenuTrigger asChild>
              <PropertyButton variant="field" aria-label="Type de projet">
                {selectedType && (
                  <>
                    <ColorDot color={selectedType.color} />
                    {selectedType.name}
                  </>
                )}
              </PropertyButton>
            </MenuTrigger>
            <MenuContent>
              <MenuRadioGroup value={selectedType?.id} onValueChange={setTypeId}>
                {types.map((type) => (
                  <MenuRadioItem key={type.id} value={type.id} leading={<ColorDot color={type.color} />}>
                    {type.name}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        </Row>

        <Row label="Client">
          <ClientPicker variant="field" value={client} onChange={setClient} />
        </Row>

        <Row label="Statut">
          <Menu>
            <MenuTrigger asChild>
              <PropertyButton variant="field" aria-label="Statut">
                <StatusIcon status={status} />
                {STATUS_LABELS[status]}
              </PropertyButton>
            </MenuTrigger>
            <MenuContent>
              <MenuRadioGroup value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                {PROJECT_STATUSES.map((s) => (
                  <MenuRadioItem key={s} value={s} leading={<StatusIcon status={s} />}>
                    {STATUS_LABELS[s]}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        </Row>

        <Row label="Dates">
          <div className="flex items-center gap-2">
            <input
              type="date"
              {...DATE_INPUT_BOUNDS}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Date de début"
              className={`tnum h-9 ${fieldClass} ${startDate ? '' : 'text-ink-3'}`}
            />
            <ChevronRight className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
            <input
              type="date"
              {...DATE_INPUT_BOUNDS}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              aria-label="Deadline"
              className={`tnum h-9 ${fieldClass} ${deadline ? '' : 'text-ink-3'}`}
            />
          </div>
          <p className="mt-1.5 text-meta text-ink-3">Début → deadline, facultatifs.</p>
          <FieldError message={submitted ? (errors.startDate ?? errors.deadline) : undefined} />
        </Row>

        <Row label="Budget">
          <div className="relative">
            <Input
              inputMode="decimal"
              value={budgetText}
              onChange={(e) => setBudgetText(e.target.value)}
              placeholder="Facultatif"
              aria-label="Budget"
              className="tnum pr-8"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3">€</span>
          </div>
          <FieldError message={submitted ? errors.budgetCents : undefined} />
        </Row>

        {budgetCents ? (
          <Row label="Paiements">
            <ChoiceChips
              label="Échéancier"
              options={(Object.keys(SCHEDULE_PRESET_LABELS) as SchedulePreset[]).map((value) => ({
                value,
                label: SCHEDULE_PRESET_LABELS[value],
              }))}
              value={schedule}
              onChange={setSchedule}
            />
            <p className="tnum mt-2 text-meta text-ink-2">
              {preview.length === 0
                ? 'Aucune échéance pour l’instant : tu pourras les ajouter depuis la fiche.'
                : preview
                    .map(
                      (p) =>
                        `${p.label} : ${formatMoney(p.amountCents)}, ${p.dueDate ? `le ${formatShortDate(p.dueDate, today)}` : 'date à définir'}`,
                    )
                    .join(' · ')}
            </p>
          </Row>
        ) : null}
      </div>

      {moreOptions ? (
        <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
          <Row label="Priorité">
            <ChoiceChips
              label="Priorité"
              options={([0, 1, 2, 3] as Priority[]).map((p) => ({ value: String(p), label: PRIORITY_LABELS[p] }))}
              value={String(priority)}
              onChange={(v) => setPriority(Number(v) as Priority)}
            />
          </Row>
          <Row label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="En quelques mots…"
              aria-label="Description"
            />
          </Row>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMoreOptions(true)}
          className="mt-4 text-meta text-ink-3 transition-colors hover:text-ink"
        >
          + Priorité et description
        </button>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={createProject.isPending}>
          Créer le projet
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Monté une seule fois dans l'AppShell ; ouvert via le store de création. */
export function CreateProjectDialog() {
  const open = useCreateStore((state) => state.open?.kind === 'project');
  const close = useCreateStore((state) => state.close);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()} title="Nouveau projet" restoreFocus={false}>
      {open && <CreateProjectForm onDone={close} />}
    </Dialog>
  );
}
