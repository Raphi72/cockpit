import { Link } from '@tanstack/react-router';
import { BookOpen, Plus } from 'lucide-react';
import { useCreateStore } from '@/app/create-store';
import { ColorDot } from '@/ui/data/ColorDot';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { useSubjects } from '../subjects/hooks';
import { subjectDetails, type SubjectListItem } from '../subjects/model';

function SubjectRow({ subject }: { subject: SubjectListItem }) {
  return (
    <li>
      <Link
        to="/subjects/$subjectId"
        params={{ subjectId: subject.id }}
        className="-mx-2.5 grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-6 rounded-md px-2.5 transition-colors duration-[120ms] ease-soft hover:bg-hover"
      >
        <span className="flex min-w-0 items-center gap-3">
          <ColorDot color={subject.color} />
          <span className="truncate">{subject.name}</span>
          <span className="truncate text-meta text-ink-3">{subjectDetails(subject)}</span>
        </span>
        <span className="text-meta text-ink-3">
          {subject.openHomework > 0 && `${subject.openHomework} devoir${subject.openHomework > 1 ? 's' : ''} à rendre`}
        </span>
      </Link>
    </li>
  );
}

export function SubjectsPage() {
  const { data: subjects } = useSubjects();
  const openCreate = useCreateStore((state) => state.openCreate);
  if (!subjects) return null;

  return (
    <Page
      title="Matières"
      subtitle={subjects.length > 0 ? `${subjects.length} matière${subjects.length > 1 ? 's' : ''}` : undefined}
      actions={
        <Button variant="secondary" icon={Plus} onClick={() => openCreate('subject')}>
          Nouvelle matière
        </Button>
      }
    >
      {subjects.length === 0 ? (
        <EmptyState icon={BookOpen} title="Aucune matière pour l’instant">
          <p>Commence par tes matières : leurs devoirs, leurs cours, leurs examens et leurs notes s’y rattachent.</p>
          <div className="mt-4">
            <Button variant="primary" icon={Plus} onClick={() => openCreate('subject')}>
              Ajouter une matière
            </Button>
          </div>
        </EmptyState>
      ) : (
        <ul>
          {subjects.map((subject) => (
            <SubjectRow key={subject.id} subject={subject} />
          ))}
        </ul>
      )}
    </Page>
  );
}
