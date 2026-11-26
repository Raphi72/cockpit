import { useState, type FormEvent, type ReactNode } from 'react';
import { useCreateStore } from '@/app/create-store';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { ColorChoice } from '@/ui/primitives/ColorChoice';
import { Input } from '@/ui/primitives/Input';
import { useCreateSubject, useDeleteSubject, useSubjects, useUpdateSubject } from '../hooks';
import { nextSubjectColor, subjectToInput, validateSubject, type Subject, type SubjectInput } from '../model';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pt-2 text-ink-2">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}

type FormProps = { subject?: Subject; onDone: () => void; onCreated?: (id: string) => void; onDeleted?: () => void };

function SubjectForm({ subject, onDone, onCreated, onDeleted }: FormProps) {
  const { data: subjects = [] } = useSubjects();
  const [input, setInput] = useState<SubjectInput>(() =>
    subject
      ? subjectToInput(subject)
      : { name: '', color: nextSubjectColor(subjects.map((s) => s.color)), teacher: '', room: '', coefficient: '1' },
  );
  const [submitted, setSubmitted] = useState(false);
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();
  const errors = validateSubject(input);
  const set = <K extends keyof SubjectInput>(key: K) => (value: SubjectInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    if (subject) {
      updateSubject.mutate({ id: subject.id, input }, { onSuccess: onDone });
      return;
    }
    createSubject.mutate(input, {
      onSuccess: (id) => {
        toast(`Matière « ${input.name.trim()} » créée.`);
        onDone();
        onCreated?.(id);
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
      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <Row label="Nom">
          <Input
            autoFocus
            value={input.name}
            onChange={(e) => set('name')(e.target.value)}
            placeholder="Mathématiques, Histoire…"
            aria-label="Nom"
          />
          {submitted && errors.name && <p className="mt-1.5 text-meta text-danger">{errors.name}</p>}
        </Row>
        <Row label="Couleur">
          <ColorChoice value={input.color} onChange={set('color')} label="Couleur" />
        </Row>
        <Row label="Prof">
          <Input value={input.teacher} onChange={(e) => set('teacher')(e.target.value)} placeholder="Facultatif" aria-label="Prof" />
        </Row>
        <Row label="Salle">
          <Input value={input.room} onChange={(e) => set('room')(e.target.value)} placeholder="Facultatif" aria-label="Salle" />
        </Row>
        <Row label="Coefficient">
          <Input
            value={input.coefficient}
            onChange={(e) => set('coefficient')(e.target.value)}
            inputMode="decimal"
            aria-label="Coefficient"
            className="w-24"
          />
          {submitted && errors.coefficient ? (
            <p className="mt-1.5 text-meta text-danger">{errors.coefficient}</p>
          ) : (
            <p className="mt-1.5 text-meta text-ink-3">Son poids dans la moyenne générale.</p>
          )}
        </Row>
      </div>

      <DialogFooter>
        {subject && (
          <Button
            variant="ghost"
            className="mr-auto !text-danger"
            onClick={() =>
              deleteSubject.mutate(subject, {
                onSuccess: () => {
                  onDone();
                  onDeleted?.();
                },
              })
            }
          >
            Supprimer
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={createSubject.isPending || updateSubject.isPending}>
          {subject ? 'Enregistrer' : 'Créer la matière'}
        </Button>
      </DialogFooter>
    </form>
  );
}

type SubjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent : création. Présent : modification. */
  subject?: Subject;
  onCreated?: (id: string) => void;
  /** Après une suppression depuis la fenêtre (la fiche de la matière revient à la liste). */
  onDeleted?: () => void;
};

export function SubjectDialog({ open, onOpenChange, subject, onCreated, onDeleted }: SubjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={subject ? subject.name : 'Nouvelle matière'} restoreFocus={Boolean(subject)}>
      {open && <SubjectForm subject={subject} onDone={() => onOpenChange(false)} onCreated={onCreated} onDeleted={onDeleted} />}
    </Dialog>
  );
}

/** Fenêtre de création globale (menu « Nouveau », palette). */
export function CreateSubjectDialog() {
  const open = useCreateStore((state) => state.open?.kind === 'subject');
  const close = useCreateStore((state) => state.close);
  return <SubjectDialog open={open} onOpenChange={(next) => !next && close()} />;
}
