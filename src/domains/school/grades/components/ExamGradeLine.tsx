import { useCreateStore } from '@/app/create-store';
import { Button } from '@/ui/primitives/Button';
import type { Exam } from '../../exams/model';
import { gradeLabel } from '../model';
import { useGradeEditor } from './GradeDialog';

/** Dans la fenêtre d'un examen passé : sa note (un clic pour la modifier), ou de quoi l'ajouter. */
export function ExamGradeLine({ exam, onLeave }: { exam: Exam; onLeave: () => void }) {
  const openCreate = useCreateStore((state) => state.openCreate);
  const openGrade = useGradeEditor((state) => state.openGrade);
  if (exam.gradeId && exam.gradeScore !== null && exam.gradeOutOf !== null) {
    const gradeId = exam.gradeId;
    return (
      <Button
        variant="ghost"
        className="-ml-3 tnum font-medium"
        onClick={() => {
          onLeave();
          openGrade(gradeId);
        }}
      >
        {gradeLabel({ score: exam.gradeScore, outOf: exam.gradeOutOf })}
      </Button>
    );
  }
  return (
    <Button
      variant="secondary"
      onClick={() => {
        onLeave();
        openCreate('grade', { subjectId: exam.subjectId, examId: exam.id, gradeDate: exam.date });
      }}
    >
      Ajouter la note
    </Button>
  );
}
