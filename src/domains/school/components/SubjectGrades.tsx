import { Plus } from 'lucide-react';
import { useCreateStore } from '@/app/create-store';
import { useToday } from '@/core/use-today';
import { Button } from '@/ui/primitives/Button';
import { useGradeEditor } from '../grades/components/GradeDialog';
import { useGrades } from '../grades/hooks';
import { formatAverage, gradeLabel, gradeTitle, subjectAverage } from '../grades/model';
import { usePeriods } from '../periods/hooks';
import { semesterOn } from '../periods/model';

/** Fiche d'une matière : sa moyenne du semestre en cours, et ses notes (les plus récentes d'abord). */
export function SubjectGrades({ subjectId }: { subjectId: string }) {
  const today = useToday();
  const openCreate = useCreateStore((state) => state.openCreate);
  const openGrade = useGradeEditor((state) => state.openGrade);
  const { data: grades = [] } = useGrades();
  const { data: periods = [] } = usePeriods();
  const semester = semesterOn(periods, today);
  const mine = grades
    .filter((g) => g.subjectId === subjectId && (!semester || (g.date >= semester.startsOn && g.date <= semester.endsOn)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const average = subjectAverage(mine);

  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <h2 className="font-semibold">Notes</h2>
        {mine.length > 0 && (
          <span className="tnum text-meta text-ink-2">
            Moyenne {formatAverage(average)}
            {semester && <span className="text-ink-3"> · {semester.name}</span>}
          </span>
        )}
        <Button variant="ghost" icon={Plus} className="ml-auto" onClick={() => openCreate('grade', { subjectId })}>
          Ajouter
        </Button>
      </div>
      {mine.length === 0 ? (
        <p className="py-2 text-ink-3">{semester ? `Pas encore de note ce semestre.` : 'Pas encore de note.'}</p>
      ) : (
        <ul>
          {mine.map((grade) => (
            <li key={grade.id}>
              <button
                type="button"
                onClick={() => openGrade(grade.id)}
                className="-mx-2.5 grid min-h-10 w-[calc(100%+20px)] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md px-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover"
              >
                <span className="truncate">{gradeTitle(grade)}</span>
                <span className="tnum font-medium">{gradeLabel(grade)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
