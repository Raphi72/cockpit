import { addDays, parseISO } from 'date-fns';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useCreateStore, type CreateDefaults } from '@/app/create-store';
import { addDaysISO, formatDateField, toISODate, todayISO } from '@/core/dates';
import { CoursePicker } from '@/domains/google/components/CoursePicker';
import { useCourse, useCoursesBetween, useHasSchoolCalendar } from '@/domains/google/hooks';
import { ProjectMenu } from '@/domains/projects/components/ProjectMenu';
import { PRIORITY_LABELS, type Priority } from '@/domains/projects/model';
import { SubjectMenu } from '@/domains/school/subjects/components/SubjectMenu';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { DateField } from '@/ui/primitives/DateField';
import { Input, Textarea } from '@/ui/primitives/Input';
import { useCreateTask } from '../hooks';
import { validateNewTask } from '../model';
import { TaskEstimateMenu } from './TaskFields';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

type WhenChoice = 'today' | 'tomorrow' | 'none' | 'custom';

/** Un jour : quelques choix tout faits, ou une autre date. */
function DayChoice(props: {
  label: string;
  value: string | null;
  onChange: (day: string | null) => void;
  options: { value: string | null; label: string }[];
}) {
  const known = props.options.some((option) => option.value === props.value);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ChoiceChips
        label={props.label}
        options={props.options.map((option) => ({ value: option.value ?? 'none', label: option.label }))}
        value={known ? (props.value ?? 'none') : null}
        onChange={(v) => props.onChange(v === 'none' ? null : v)}
      />
      <DateField
        value={known ? null : props.value}
        onChange={props.onChange}
        placeholder="Autre date…"
        aria-label={`${props.label} : autre date`}
        className="w-[170px]"
      />
    </div>
  );
}

/**
 * Nouvelle tâche, ou nouveau devoir (`homework`, P14) : un devoir a une matière à la place du projet,
 * et sa date principale est le jour où il est à rendre (la deadline). Avec un agenda des cours, il est à
 * rendre pour un cours précis : le cours donne sa matière et son jour. Sans cours précis (ou sans
 * Google), on choisit la matière et la date comme avant.
 */
function CreateTaskForm({ defaults, homework, onDone }: { defaults: CreateDefaults; homework: boolean; onDone: () => void }) {
  const createTask = useCreateTask();
  const today = todayISO();
  const tomorrow = toISODate(addDays(parseISO(today), 1));

  const [title, setTitle] = useState(defaults.fromLine?.text ?? '');
  const [projectId, setProjectId] = useState<string | null>(defaults.projectId ?? null);
  const [subjectId, setSubjectId] = useState<string | null>(defaults.subjectId ?? null);
  const [courseEvent, setCourseEvent] = useState<string | null>(homework ? (defaults.courseEvent ?? null) : null);
  const { data: hasSchoolCalendar = false } = useHasSchoolCalendar();
  // Devoir ajouté depuis un cours : ce cours-là, ou le suivant du même nom, en un clic.
  const { data: anchor } = useCourse(homework ? (defaults.courseEvent ?? null) : null);
  const { data: upcoming = [] } = useCoursesBetween(today, addDaysISO(today, 120));
  const following = anchor ? upcoming.find((c) => c.course === anchor.course && c.startsAt > anchor.startsAt) : undefined;
  // « Sans cours précis » : on repasse à une matière et une date, comme sans Google.
  const [withoutCourse, setWithoutCourse] = useState(false);
  const byCourse = homework && !withoutCourse && (hasSchoolCalendar || courseEvent !== null);
  const [scheduledDate, setScheduledDate] = useState<string | null>(homework ? null : (defaults.scheduledDate ?? null));
  const [dueDate, setDueDate] = useState<string | null>(defaults.dueDate ?? null);
  const [moreOptions, setMoreOptions] = useState(false);
  const [priority, setPriority] = useState<Priority>(1);
  const [estimateMin, setEstimateMin] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const when: WhenChoice =
    scheduledDate === null ? 'none' : scheduledDate === today ? 'today' : scheduledDate === tomorrow ? 'tomorrow' : 'custom';
  const input = {
    title,
    projectId: homework ? null : projectId,
    subjectId: homework ? subjectId : null,
    courseEvent: homework ? courseEvent : null,
    scheduledDate,
    dueDate,
    priority,
    estimateMin,
    notes: notes || null,
  };
  const errors: Record<string, string | undefined> = { ...validateNewTask(input) };
  if (homework && !subjectId) errors.subjectId = byCourse && !courseEvent ? 'Choisis le cours du devoir.' : 'Choisis la matière du devoir.';
  const hasErrors = Object.values(errors).some(Boolean);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;
    createTask.mutate(input, {
      onSuccess: (taskId) => {
        const message = homework ? 'Devoir ajouté.' : scheduledDate === today ? 'Tâche ajoutée à aujourd’hui.' : 'Tâche ajoutée.';
        // Née d'une ligne de page : la page la retire et l'annonce, avec « Annuler ».
        if (defaults.fromLine) defaults.fromLine.onCreated({ kind: 'task', id: taskId, message });
        else toast(message);
        onDone();
      },
    });
  };

  const error = (key: string) => submitted && errors[key] && <p className="mt-1.5 text-meta text-danger">{errors[key]}</p>;

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
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={homework ? 'Titre du devoir' : 'Titre de la tâche'}
        aria-label={homework ? 'Titre du devoir' : 'Titre de la tâche'}
        className="h-10 text-[15px]"
      />
      {error('title')}

      <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        {homework ? (
          <>
            {byCourse ? (
              <>
                <Row label="Pour le cours">
                  <CoursePicker
                    variant="field"
                    value={courseEvent}
                    onChange={(course) => {
                      setCourseEvent(course?.itemId ?? null);
                      if (!course) {
                        setWithoutCourse(true);
                        return;
                      }
                      setSubjectId(course.subjectId);
                      setDueDate(course.startsAt.slice(0, 10));
                    }}
                  />
                  {error('subjectId')}
                </Row>
                {courseEvent && dueDate && (
                  <Row label="À rendre">
                    {anchor && following ? (
                      <ChoiceChips
                        label="À rendre"
                        options={[
                          { value: anchor.itemId, label: `Pour ce cours · ${formatDateField(anchor.startsAt.slice(0, 10), today)}` },
                          { value: following.itemId, label: `Au cours suivant · ${formatDateField(following.startsAt.slice(0, 10), today)}` },
                        ]}
                        value={courseEvent === anchor.itemId || courseEvent === following.itemId ? courseEvent : null}
                        onChange={(id) => {
                          const chosen = id === anchor.itemId ? anchor : following;
                          setCourseEvent(chosen.itemId);
                          setSubjectId(chosen.subjectId);
                          setDueDate(chosen.startsAt.slice(0, 10));
                        }}
                      />
                    ) : (
                      <p className="pt-2 first-letter:uppercase">{formatDateField(dueDate, today)}, le jour du cours</p>
                    )}
                    <p className="mt-1.5 text-meta text-ink-3">Pour un autre cours, choisis-le juste au-dessus.</p>
                  </Row>
                )}
              </>
            ) : (
              <>
                <Row label="Matière">
                  <SubjectMenu variant="field" value={subjectId} onChange={setSubjectId} />
                  {error('subjectId')}
                  {withoutCourse && hasSchoolCalendar && (
                    <button
                      type="button"
                      onClick={() => setWithoutCourse(false)}
                      className="mt-1.5 text-meta text-ink-3 transition-colors hover:text-ink"
                    >
                      Relier plutôt à un cours
                    </button>
                  )}
                </Row>
                <Row label="À rendre">
                  <DayChoice
                    label="À rendre"
                    value={dueDate}
                    onChange={setDueDate}
                    options={[
                      { value: tomorrow, label: 'Demain' },
                      { value: addDaysISO(today, 7), label: 'Dans une semaine' },
                    ]}
                  />
                  {error('dueDate')}
                </Row>
              </>
            )}
            <Row label="À faire le">
              <DayChoice
                label="À faire le"
                value={scheduledDate}
                onChange={setScheduledDate}
                options={[
                  { value: today, label: 'Aujourd’hui' },
                  { value: tomorrow, label: 'Demain' },
                  { value: null, label: 'Plus tard' },
                ]}
              />
              {error('scheduledDate')}
            </Row>
          </>
        ) : (
          <>
            <Row label="Projet">
              <ProjectMenu variant="field" value={projectId} onChange={setProjectId} />
            </Row>

            <Row label="Début">
              <div className="flex flex-wrap items-center gap-1.5">
                <ChoiceChips
                  label="Début"
                  options={[
                    { value: 'today', label: 'Aujourd’hui' },
                    { value: 'tomorrow', label: 'Demain' },
                    { value: 'none', label: 'Sans date' },
                  ]}
                  value={when === 'custom' ? null : when}
                  onChange={(v) => setScheduledDate(v === 'today' ? today : v === 'tomorrow' ? tomorrow : null)}
                />
                <DateField
                  value={when === 'custom' ? scheduledDate : null}
                  onChange={setScheduledDate}
                  placeholder="Autre date…"
                  aria-label="Autre date de début"
                  className="w-[170px]"
                />
              </div>
              {error('scheduledDate')}
            </Row>

            <Row label="Deadline">
              <DateField value={dueDate} onChange={setDueDate} placeholder="Aucune" aria-label="Deadline" />
              {error('dueDate')}
            </Row>
          </>
        )}
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
          <Row label="Estimation">
            <TaskEstimateMenu variant="field" value={estimateMin} onChange={setEstimateMin} />
          </Row>
          <Row label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Détails, liens…" aria-label="Notes" />
          </Row>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMoreOptions(true)}
          className="mt-4 text-meta text-ink-3 transition-colors hover:text-ink"
        >
          + Priorité, estimation et notes
        </button>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={createTask.isPending}>
          {homework ? 'Ajouter le devoir' : 'Ajouter la tâche'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Monté une seule fois dans l'AppShell ; ouvert par N (Ctrl+N), le menu « Nouveau » ou la palette. */
export function CreateTaskDialog() {
  const open = useCreateStore((state) => (state.open?.kind === 'task' || state.open?.kind === 'homework' ? state.open : null));
  const close = useCreateStore((state) => state.close);
  const homework = open?.kind === 'homework';
  return (
    <Dialog
      open={open !== null}
      onOpenChange={(next) => !next && close()}
      title={homework ? 'Nouveau devoir' : 'Nouvelle tâche'}
      restoreFocus={false}
    >
      {open && <CreateTaskForm key={open.kind} defaults={open.defaults} homework={homework} onDone={close} />}
    </Dialog>
  );
}
