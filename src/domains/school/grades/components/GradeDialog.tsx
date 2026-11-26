import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { create } from 'zustand';
import { useCreateStore } from '@/app/create-store';
import { useToday } from '@/core/use-today';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { DateField } from '@/ui/primitives/DateField';
import { Input } from '@/ui/primitives/Input';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useExams } from '../../exams/hooks';
import { SubjectMenu } from '../../subjects/components/SubjectMenu';
import { useDeleteGrade, useGrades, useSaveGrade } from '../hooks';
import { gradeToInput, validateGrade, type Grade, type GradeInput } from '../model';

/** Note ouverte par son identifiant (fenêtre d'un examen, fiche d'une matière, page Notes). */
type GradeEditorState = { gradeId: string | null; openGrade: (id: string) => void; close: () => void };

export const useGradeEditor = create<GradeEditorState>()((set) => ({
  gradeId: null,
  openGrade: (id) => set({ gradeId: id }),
  close: () => set({ gradeId: null }),
}));

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

/** L'examen dont vient la note (facultatif) : ceux de la matière, les plus récents d'abord. */
function ExamMenu({ subjectId, value, onChange }: { subjectId: string | null; value: string | null; onChange: (id: string | null) => void }) {
  const { data: exams = [] } = useExams(subjectId ? { subjectId } : {});
  const choices = subjectId ? [...exams].sort((a, b) => b.date.localeCompare(a.date)) : [];
  const selected = choices.find((e) => e.id === value);
  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton variant="field" aria-label="Examen">
          {selected ? <span className="truncate">{selected.title}</span> : <span className="text-ink-3">Aucun</span>}
        </PropertyButton>
      </MenuTrigger>
      <MenuContent className="max-h-80 overflow-y-auto">
        <MenuRadioGroup value={value ?? ''} onValueChange={(v) => onChange(v === '' ? null : v)}>
          <MenuRadioItem value="">Aucun</MenuRadioItem>
          {choices.length > 0 && <MenuSeparator />}
          {choices.map((exam) => (
            <MenuRadioItem key={exam.id} value={exam.id}>
              {exam.title}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function GradeForm({ grade, defaults, onDone }: { grade?: Grade; defaults?: Partial<GradeInput>; onDone: () => void }) {
  const today = useToday();
  const [input, setInput] = useState<GradeInput>(() =>
    grade
      ? gradeToInput(grade)
      : {
          subjectId: defaults?.subjectId ?? null,
          examId: defaults?.examId ?? null,
          title: defaults?.title ?? '',
          score: '',
          outOf: '20',
          coefficient: '1',
          date: defaults?.date ?? today,
        },
  );
  const [submitted, setSubmitted] = useState(false);
  const save = useSaveGrade();
  const remove = useDeleteGrade();
  const errors = validateGrade(input);
  const set = <K extends keyof GradeInput>(key: K, value: GradeInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const error = (key: keyof typeof errors) => submitted && errors[key] && <p className="mt-1.5 text-meta text-danger">{errors[key]}</p>;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    save.mutate(
      { id: grade?.id, input },
      {
        onSuccess: () => {
          if (!grade) toast('Note ajoutée.');
          onDone();
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
      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <Row label="Matière">
          <SubjectMenu
            variant="field"
            value={input.subjectId}
            onChange={(id) => setInput((prev) => ({ ...prev, subjectId: id, examId: id === prev.subjectId ? prev.examId : null }))}
          />
          {error('subjectId')}
        </Row>
        <Row label="Note">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={input.score}
              onChange={(e) => set('score', e.target.value)}
              inputMode="decimal"
              placeholder="14,5"
              aria-label="Note"
              className="w-20 text-[15px]"
            />
            <span className="text-ink-3">sur</span>
            <Input value={input.outOf} onChange={(e) => set('outOf', e.target.value)} inputMode="decimal" aria-label="Barème" className="w-16" />
          </div>
          {error('score')}
        </Row>
        <Row label="Coefficient">
          <Input value={input.coefficient} onChange={(e) => set('coefficient', e.target.value)} inputMode="decimal" aria-label="Coefficient" className="w-20" />
          {error('coefficient')}
        </Row>
        <Row label="Date">
          <DateField value={input.date} onChange={(day) => set('date', day)} clearable={false} aria-label="Date de la note" />
          {error('date')}
        </Row>
        <Row label="Intitulé">
          <Input value={input.title} onChange={(e) => set('title', e.target.value)} placeholder="DS 2, oral, devoir maison… (facultatif)" aria-label="Intitulé" />
        </Row>
        <Row label="Examen">
          <ExamMenu subjectId={input.subjectId} value={input.examId} onChange={(id) => set('examId', id)} />
        </Row>
      </div>

      <DialogFooter>
        {grade && (
          <Button variant="ghost" className="mr-auto !text-danger" onClick={() => remove.mutate(grade.id, { onSuccess: onDone })}>
            Supprimer
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={save.isPending}>
          {grade ? 'Enregistrer' : 'Ajouter la note'}
        </Button>
      </DialogFooter>
    </form>
  );
}

type GradeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent : nouvelle note (avec `defaults` : la matière, l'examen dont elle vient…). */
  grade?: Grade;
  defaults?: Partial<GradeInput>;
};

export function GradeDialog({ open, onOpenChange, grade, defaults }: GradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={grade ? 'Note' : 'Nouvelle note'} width={500} restoreFocus={Boolean(grade)}>
      {open && <GradeForm key={grade?.id ?? 'new'} grade={grade} defaults={defaults} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function GradeEditor({ gradeId }: { gradeId: string }) {
  const close = useGradeEditor((state) => state.close);
  const { data: grades } = useGrades();
  const grade = grades?.find((g) => g.id === gradeId);
  useEffect(() => {
    if (grades && !grade) close();
  }, [grades, grade, close]);
  return <GradeDialog open={Boolean(grade)} onOpenChange={(next) => !next && close()} grade={grade} />;
}

/** Note ouverte par son identifiant. */
export function GradeEditorDialog() {
  const gradeId = useGradeEditor((state) => state.gradeId);
  return gradeId ? <GradeEditor gradeId={gradeId} /> : null;
}

/** Fenêtre de création globale (menu « Nouveau », palette, examen passé). */
export function CreateGradeDialog() {
  const open = useCreateStore((state) => (state.open?.kind === 'grade' ? state.open : null));
  const close = useCreateStore((state) => state.close);
  return (
    <GradeDialog
      open={open !== null}
      onOpenChange={(next) => !next && close()}
      defaults={{
        subjectId: open?.defaults.subjectId ?? null,
        examId: open?.defaults.examId ?? null,
        date: open?.defaults.gradeDate ?? undefined,
      }}
    />
  );
}
