import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { create } from 'zustand';
import { useCreateStore } from '@/app/create-store';
import { addDaysISO } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { DateField } from '@/ui/primitives/DateField';
import { Input, Textarea } from '@/ui/primitives/Input';
import { TimeField } from '@/ui/primitives/TimeField';
import { ExamGradeLine } from '../../grades/components/ExamGradeLine';
import { SubjectMenu } from '../../subjects/components/SubjectMenu';
import { useSubjects } from '../../subjects/hooks';
import { useRevisionPlan } from './RevisionPlanDialog';
import { useDeleteExam, useExam, useSaveExam } from '../hooks';
import { examCountdown, examToInput, validateExam, type Exam, type ExamInput } from '../model';

/** Examen ouvert par son identifiant (calendrier, recherche, dashboard) : fenêtre montée dans l'AppShell. */
type ExamEditorState = { examId: string | null; openExam: (id: string) => void; close: () => void };

export const useExamEditor = create<ExamEditorState>()((set) => ({
  examId: null,
  openExam: (id) => set({ examId: id }),
  close: () => set({ examId: null }),
}));

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

function ExamForm({ exam, defaults, onDone }: { exam?: Exam; defaults?: Partial<ExamInput>; onDone: () => void }) {
  const today = useToday();
  const [input, setInput] = useState<ExamInput>(() =>
    exam
      ? examToInput(exam)
      : {
          subjectId: defaults?.subjectId ?? null,
          title: defaults?.title ?? '',
          date: defaults?.date ?? null,
          startsAt: null,
          endsAt: null,
          room: '',
          notes: '',
        },
  );
  const [submitted, setSubmitted] = useState(false);
  const save = useSaveExam();
  const remove = useDeleteExam();
  const { data: subjects = [] } = useSubjects();
  const proposeRevisions = useRevisionPlan((state) => state.open);
  const errors = validateExam(input);
  const set = <K extends keyof ExamInput>(key: K, value: ExamInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const error = (key: keyof typeof errors) => submitted && errors[key] && <p className="mt-1.5 text-meta text-danger">{errors[key]}</p>;
  const inAWeek = addDaysISO(today, 7);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    save.mutate(
      { id: exam?.id, input },
      {
        onSuccess: () => {
          if (!exam) toast(`Examen ajouté : ${examCountdown({ date: input.date! }, today).toLowerCase()}.`);
          onDone();
          // Un nouvel examen à venir : proposer ses révisions à rebours (J-7, J-3, J-1).
          if (!exam && input.date! > today) {
            const subjectName = subjects.find((s) => s.id === input.subjectId)?.name ?? '';
            proposeRevisions({ title: input.title.trim(), subjectName, date: input.date! });
          }
        },
      },
    );
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
        autoFocus={!exam}
        value={input.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="Contrôle chapitre 3, partiel, oral…"
        aria-label="Titre de l’examen"
        className="h-10 text-[15px]"
      />
      {error('title')}

      <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <Row label="Matière">
          <SubjectMenu variant="field" value={input.subjectId} onChange={(id) => set('subjectId', id)} />
          {error('subjectId')}
        </Row>
        <Row label="Jour">
          <div className="flex flex-wrap items-center gap-1.5">
            <ChoiceChips
              label="Jour"
              options={[{ value: inAWeek, label: 'Dans une semaine' }]}
              value={input.date === inAWeek ? inAWeek : null}
              onChange={(day) => set('date', day)}
            />
            <DateField value={input.date === inAWeek ? null : input.date} onChange={(day) => set('date', day)} placeholder="Choisir le jour" aria-label="Jour de l’examen" className="w-[190px]" />
          </div>
          {error('date')}
        </Row>
        <Row label="Horaire">
          <div className="flex items-center gap-2">
            <TimeField value={input.startsAt} onChange={(time) => set('startsAt', time)} aria-label="Début" />
            <span className="text-ink-3">–</span>
            <TimeField value={input.endsAt} onChange={(time) => set('endsAt', time)} aria-label="Fin" />
            <span className="text-meta text-ink-3">facultatif</span>
          </div>
          {error('time')}
        </Row>
        <Row label="Salle">
          <Input value={input.room} onChange={(e) => set('room', e.target.value)} placeholder="Facultatif" aria-label="Salle" />
        </Row>
        <Row label="À réviser">
          <Textarea value={input.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Chapitres, consignes, ce qu’il faut apporter…" aria-label="À réviser" />
        </Row>
        {/* Le jour même ou après : la note obtenue. */}
        {exam && exam.date <= today && (
          <Row label="Note">
            <ExamGradeLine exam={exam} onLeave={onDone} />
          </Row>
        )}
      </div>

      <DialogFooter>
        {exam && (
          <Button variant="ghost" className="mr-auto !text-danger" onClick={() => remove.mutate(exam.id, { onSuccess: onDone })}>
            Supprimer
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={save.isPending}>
          {exam ? 'Enregistrer' : 'Ajouter l’examen'}
        </Button>
      </DialogFooter>
    </form>
  );
}

type ExamDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent : nouvel examen (avec `defaults`, par exemple sa matière). */
  exam?: Exam;
  defaults?: Partial<ExamInput>;
};

export function ExamDialog({ open, onOpenChange, exam, defaults }: ExamDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={exam ? exam.title : 'Nouvel examen'} restoreFocus={Boolean(exam)}>
      {open && <ExamForm key={exam?.id ?? 'new'} exam={exam} defaults={defaults} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function ExamEditor({ examId }: { examId: string }) {
  const close = useExamEditor((state) => state.close);
  const { data: exam } = useExam(examId);
  // Examen introuvable (supprimé entre-temps) : rien ne reste en attente d'ouverture.
  useEffect(() => {
    if (exam === null) close();
  }, [exam, close]);
  return <ExamDialog open={Boolean(exam)} onOpenChange={(next) => !next && close()} exam={exam ?? undefined} />;
}

/** Examen ouvert par son identifiant (calendrier, recherche, dashboard). */
export function ExamEditorDialog() {
  const examId = useExamEditor((state) => state.examId);
  return examId ? <ExamEditor examId={examId} /> : null;
}

/** Fenêtre de création globale (menu « Nouveau », palette). */
export function CreateExamDialog() {
  const open = useCreateStore((state) => (state.open?.kind === 'exam' ? state.open : null));
  const close = useCreateStore((state) => state.close);
  return (
    <ExamDialog open={open !== null} onOpenChange={(next) => !next && close()} defaults={{ subjectId: open?.defaults.subjectId ?? null }} />
  );
}
