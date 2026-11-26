import { daysBetween } from '@/core/dates';
import { ColorDot } from '@/ui/data/ColorDot';
import { formatDecimal } from '../../subjects/model';
import { examCountdown, examWhen, type Exam } from '../model';

/** Un examen proche se voit : le jour même en rouge, dans les 3 jours en orange. */
export function countdownTone(exam: Pick<Exam, 'date'>, today: string): string {
  const diff = daysBetween(today, exam.date);
  if (diff < 0) return 'text-ink-3';
  if (diff === 0) return 'text-danger';
  if (diff <= 3) return 'text-warning';
  return 'text-ink-2';
}

/** Ligne d'un examen : quand, quoi, la matière ; un examen passé montre sa note (ou qu'elle manque). */
export function ExamRow({ exam, today, onOpen, showSubject = true }: { exam: Exam; today: string; onOpen: () => void; showSubject?: boolean }) {
  const past = exam.date < today;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="-mx-2.5 grid min-h-11 w-[calc(100%+20px)] grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-4 rounded-md px-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover"
      >
        <span className={`tnum text-meta ${countdownTone(exam, today)}`}>{examCountdown(exam, today)}</span>
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="truncate">{exam.title}</span>
          {showSubject && (
            <span className="flex min-w-0 shrink items-center gap-1.5 text-meta text-ink-3">
              <ColorDot color={exam.subjectColor} />
              <span className="truncate">{exam.subjectName}</span>
            </span>
          )}
        </span>
        <span className="tnum text-meta text-ink-3">
          {past ? (
            exam.gradeScore !== null && exam.gradeOutOf !== null ? (
              <span className="text-ink">
                {formatDecimal(exam.gradeScore)}/{formatDecimal(exam.gradeOutOf)}
              </span>
            ) : (
              'Note à saisir'
            )
          ) : (
            examWhen(exam)
          )}
        </span>
      </button>
    </li>
  );
}
