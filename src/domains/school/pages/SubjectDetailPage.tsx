import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useDeleteShortcut } from '@/app/shortcuts';
import { ColorDot } from '@/ui/data/ColorDot';
import { PageContainer } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { EntityPages } from '@/domains/pages/components/EntityPages';
import { SubjectClasses } from '../components/SubjectClasses';
import { SubjectExams } from '../components/SubjectExams';
import { SubjectGrades } from '../components/SubjectGrades';
import { SubjectHomework } from '../components/SubjectHomework';
import { SubjectDialog } from '../subjects/components/SubjectDialog';
import { useDeleteSubject, useSubject } from '../subjects/hooks';
import { subjectDetails } from '../subjects/model';

/** Fiche d'une matière : ses devoirs, ses cours, ses examens et ses notes. */
export function SubjectDetailPage() {
  const { subjectId } = useParams({ from: '/subjects/$subjectId' });
  const { data: subject, isPending } = useSubject(subjectId);
  const deleteSubject = useDeleteSubject();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  // « Annuler » est dans le toast : pas de confirmation.
  useDeleteShortcut(() => {
    if (subject) deleteSubject.mutate(subject, { onSuccess: () => void navigate({ to: '/subjects' }) });
  });

  if (isPending) return null;
  if (!subject) {
    return (
      <PageContainer>
        <p className="text-ink-2">Cette matière n’existe plus.</p>
        <Link to="/subjects" className="mt-3 inline-block text-accent">
          Retour aux matières
        </Link>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="-mt-4 mb-8 flex items-center justify-between">
        <Link
          to="/subjects"
          className="-ml-2 flex h-8 items-center gap-1.5 rounded-md px-2 text-meta text-ink-2 hover:bg-hover hover:text-ink"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2} />
          Matières
        </Link>
        <Button variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
          Modifier
        </Button>
      </div>

      <header className="mb-10">
        <h1 className="flex items-center gap-3 text-title font-semibold tracking-tight">
          <ColorDot color={subject.color} />
          {subject.name}
        </h1>
        <p className="mt-1.5 text-ink-2">{subjectDetails(subject)}</p>
      </header>

      <SubjectSections subjectId={subject.id} />

      <SubjectDialog
        open={editing}
        onOpenChange={setEditing}
        subject={subject}
        onDeleted={() => void navigate({ to: '/subjects' })}
      />
    </PageContainer>
  );
}

/** Le contenu de la fiche : ses devoirs, ses cours, ses examens et ses notes. */
function SubjectSections({ subjectId }: { subjectId: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)] items-start gap-x-16">
      <div className="min-w-0">
        <SubjectHomework subjectId={subjectId} />
        <div className="mt-14">
          <SubjectGrades subjectId={subjectId} />
        </div>
        <div className="mt-14">
          <EntityPages entityType="subject" entityId={subjectId} title="Fiches et pages" />
        </div>
      </div>
      <div className="min-w-0">
        <SubjectClasses subjectId={subjectId} />
        <div className="mt-12">
          <SubjectExams subjectId={subjectId} />
        </div>
      </div>
    </div>
  );
}
