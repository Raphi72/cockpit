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

/**
 * Le « quand » de la seconde ligne sur le téléphone. Au-delà d'une semaine, le compte à rebours est déjà
 * une date : on ne la répète pas, il reste l'heure et la salle.
 */
function phoneWhen(exam: Exam, today: string): string {
  if (Math.abs(daysBetween(today, exam.date)) <= 7) return examWhen(exam);
  const time = exam.startsAt ? (exam.endsAt ? `${exam.startsAt} – ${exam.endsAt}` : exam.startsAt) : null;
  return [time, exam.room].filter(Boolean).join(' · ');
}

/**
 * Ligne d'un examen : quand, quoi, la matière ; un examen passé montre sa note (ou qu'elle manque).
 * Sur le téléphone, deux lignes : l'intitulé et le compte à rebours, puis la matière et le jour (une fois).
 */
export function ExamRow({ exam, today, onOpen, showSubject = true }: { exam: Exam; today: string; onOpen: () => void; showSubject?: boolean }) {
  const past = exam.date < today;
  const outcome = past ? (
    exam.gradeScore !== null && exam.gradeOutOf !== null ? (
      <span className="text-ink">
        {formatDecimal(exam.gradeScore)}/{formatDecimal(exam.gradeOutOf)}
      </span>
    ) : (
      'Note à saisir'
    )
  ) : (
    examWhen(exam)
  );
  const second = past ? outcome : phoneWhen(exam, today);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={
          '-mx-2.5 grid min-h-11 w-[calc(100%+20px)] grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-4 rounded-md px-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover ' +
          'phone:grid-cols-[minmax(0,1fr)_auto] phone:gap-x-3 phone:gap-y-0.5 phone:py-2.5'
        }
      >
        <span className={`tnum text-meta phone:col-start-2 phone:row-start-1 ${countdownTone(exam, today)}`}>{examCountdown(exam, today)}</span>
        <span className="flex min-w-0 items-center gap-2.5 phone:col-start-1 phone:row-start-1">
          <span className="truncate phone:line-clamp-2 phone:font-medium phone:whitespace-normal">{exam.title}</span>
          {showSubject && (
            <span className="flex min-w-0 shrink items-center gap-1.5 text-meta text-ink-3 phone:hidden">
              <ColorDot color={exam.subjectColor} />
              <span className="truncate">{exam.subjectName}</span>
            </span>
          )}
        </span>
        <span className="tnum text-meta text-ink-3 phone:hidden">{outcome}</span>
        <span className="col-span-2 hidden min-w-0 items-center gap-1.5 text-meta text-ink-3 phone:flex">
          {showSubject && (
            <>
              <ColorDot color={exam.subjectColor} />
              <span className="shrink-0">{exam.subjectName}</span>
            </>
          )}
          {second && (
            <>
              {showSubject && <span>·</span>}
              <span className="truncate">{second}</span>
            </>
          )}
        </span>
      </button>
    </li>
  );
}
