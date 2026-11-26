import { Plus } from 'lucide-react';
import { useCreateStore } from '@/app/create-store';
import { useToday } from '@/core/use-today';
import { Button } from '@/ui/primitives/Button';
import { useExamEditor } from '../exams/components/ExamDialog';
import { ExamRow } from '../exams/components/ExamRow';
import { useExams } from '../exams/hooks';
import { examsToGrade, splitExams } from '../exams/model';

/** Fiche d'une matière : ses examens à venir, et les passés dont la note manque. */
export function SubjectExams({ subjectId }: { subjectId: string }) {
  const today = useToday();
  const openCreate = useCreateStore((state) => state.openCreate);
  const openExam = useExamEditor((state) => state.openExam);
  const { data: exams = [] } = useExams({ subjectId });
  const { upcoming } = splitExams(exams, today);
  const toGrade = examsToGrade(exams, today);
  const shown = [...upcoming, ...toGrade];

  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <h2 className="font-semibold">Examens</h2>
        <Button variant="ghost" icon={Plus} className="ml-auto" onClick={() => openCreate('exam', { subjectId })}>
          Ajouter
        </Button>
      </div>
      {shown.length === 0 ? (
        <p className="py-2 text-ink-3">Aucun examen à venir.</p>
      ) : (
        <ul>
          {shown.map((exam) => (
            <ExamRow key={exam.id} exam={exam} today={today} onOpen={() => openExam(exam.id)} showSubject={false} />
          ))}
        </ul>
      )}
    </section>
  );
}
