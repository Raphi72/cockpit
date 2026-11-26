import { ChevronRight, FileCheck, Plus } from 'lucide-react';
import { useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { useToday } from '@/core/use-today';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { useExamEditor } from '../exams/components/ExamDialog';
import { ExamRow } from '../exams/components/ExamRow';
import { useExams } from '../exams/hooks';
import { examCountdown, examsToGrade, splitExams } from '../exams/model';
import { useSubjects } from '../subjects/hooks';

/** Examens : ceux à venir (le plus proche d'abord), puis les passés, avec leur note. */
export function ExamsPage() {
  const today = useToday();
  const openCreate = useCreateStore((state) => state.openCreate);
  const openExam = useExamEditor((state) => state.openExam);
  const { data: subjects } = useSubjects();
  const { data: exams } = useExams();
  const [showPast, setShowPast] = useState(false);
  if (!subjects || !exams) return null;

  const { upcoming, past } = splitExams(exams, today);
  const toGrade = examsToGrade(exams, today);
  const next = upcoming[0];
  const subtitle = next
    ? `Prochain : ${next.title} (${next.subjectName}), ${examCountdown(next, today).toLowerCase()}`
    : 'Aucun examen à venir.';

  return (
    <Page
      title="Examens"
      subtitle={subtitle}
      actions={
        <Button variant="secondary" icon={Plus} onClick={() => openCreate('exam')} disabled={subjects.length === 0}>
          Nouvel examen
        </Button>
      }
    >
      {exams.length === 0 ? (
        <EmptyState icon={FileCheck} title="Aucun examen pour l’instant">
          <p>Note ici tes contrôles, partiels et oraux : le plus proche s’affiche sur Aujourd’hui, en mode Cours.</p>
          {subjects.length === 0 && <p className="mt-1">Ajoute d’abord tes matières.</p>}
        </EmptyState>
      ) : (
        <>
          <section>
            <h2 className="mb-1.5 font-semibold">À venir</h2>
            {upcoming.length === 0 ? (
              <p className="py-2 text-ink-3">Rien de prévu.</p>
            ) : (
              <ul>
                {upcoming.map((exam) => (
                  <ExamRow key={exam.id} exam={exam} today={today} onOpen={() => openExam(exam.id)} />
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section className="mt-10">
              <Button
                variant="ghost"
                icon={ChevronRight}
                aria-expanded={showPast}
                onClick={() => setShowPast((open) => !open)}
                className={`-ml-3 [&>svg]:transition-transform ${showPast ? '[&>svg]:rotate-90' : ''}`}
              >
                {past.length} passé{past.length > 1 ? 's' : ''}
                {toGrade.length > 0 && <span className="ml-1 text-ink-3">· {toGrade.length} note{toGrade.length > 1 ? 's' : ''} à saisir</span>}
              </Button>
              {showPast && (
                <ul className="mt-1">
                  {past.map((exam) => (
                    <ExamRow key={exam.id} exam={exam} today={today} onOpen={() => openExam(exam.id)} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </Page>
  );
}
