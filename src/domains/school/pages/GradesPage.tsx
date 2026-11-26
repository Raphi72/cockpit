import { Award, Plus } from 'lucide-react';
import { useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { useToday } from '@/core/use-today';
import { ColorDot } from '@/ui/data/ColorDot';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { SegmentedTabs } from '@/ui/primitives/SegmentedTabs';
import { useGradeEditor } from '../grades/components/GradeDialog';
import { useGrades } from '../grades/hooks';
import { formatAverage, gradeLabel, gradeTitle, periodReport, yearReport, type Report, type SubjectRef, type YearReport } from '../grades/model';
import { usePeriods } from '../periods/hooks';
import { currentSemester, periodRange, semesters } from '../periods/model';
import { useSubjects } from '../subjects/hooks';
import { formatDecimal } from '../subjects/model';

const rowClass = '-mx-2.5 grid min-h-11 items-center gap-6 rounded-md px-2.5';

function SubjectName({ subject }: { subject: SubjectRef }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <ColorDot color={subject.color} />
      <span className="truncate">{subject.name}</span>
      <span className="shrink-0 text-meta text-ink-3">coef. {formatDecimal(subject.coefficient)}</span>
    </span>
  );
}

/** Un semestre (ou toutes les notes) : chaque matière, ses notes (un clic pour les modifier) et sa moyenne. */
function PeriodTable({ report }: { report: Report }) {
  const openGrade = useGradeEditor((state) => state.openGrade);
  return (
    <div>
      <ul>
        {report.lines.map(({ subject, grades, average }) => (
          <li key={subject.id} className={`${rowClass} grid-cols-[minmax(180px,0.8fr)_minmax(0,1.6fr)_64px]`}>
            <SubjectName subject={subject} />
            <span className="flex min-w-0 flex-wrap gap-x-1 text-meta text-ink-2">
              {grades.length === 0 && <span className="text-ink-3">Pas encore de note</span>}
              {grades.map((grade) => (
                <button
                  key={grade.id}
                  type="button"
                  onClick={() => openGrade(grade.id)}
                  title={`${gradeTitle(grade)} · coef. ${formatDecimal(grade.coefficient)}`}
                  className="tnum rounded-md px-1.5 py-0.5 transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink"
                >
                  {gradeLabel(grade, true)}
                </button>
              ))}
            </span>
            <span className={`tnum text-right ${average === null ? 'text-ink-3' : 'font-medium'}`}>{formatAverage(average)}</span>
          </li>
        ))}
      </ul>
      <div className={`${rowClass} mt-2 grid-cols-[minmax(0,1fr)_64px] border-t border-line pt-1`}>
        <span className="font-medium">Moyenne générale</span>
        <span className="tnum text-right text-[15px] font-semibold">{formatAverage(report.general)}</span>
      </div>
    </div>
  );
}

/** L'année : la moyenne de chaque semestre, puis celle de l'année, matière par matière. */
function YearTable({ report }: { report: YearReport }) {
  const columns = `minmax(180px,1fr) repeat(${report.semesters.length}, 88px) 88px`;
  return (
    <div>
      <div className={`${rowClass} min-h-8 text-meta text-ink-3`} style={{ gridTemplateColumns: columns }}>
        <span />
        {report.semesters.map((semester) => (
          <span key={semester.id} className="truncate text-right">
            {semester.name}
          </span>
        ))}
        <span className="text-right">Année</span>
      </div>
      <ul>
        {report.lines.map((line) => (
          <li key={line.subject.id} className={rowClass} style={{ gridTemplateColumns: columns }}>
            <SubjectName subject={line.subject} />
            {line.bySemester.map((average, index) => (
              <span key={index} className={`tnum text-right ${average === null ? 'text-ink-3' : 'text-ink-2'}`}>
                {formatAverage(average)}
              </span>
            ))}
            <span className={`tnum text-right ${line.average === null ? 'text-ink-3' : 'font-medium'}`}>{formatAverage(line.average)}</span>
          </li>
        ))}
      </ul>
      <div className={`${rowClass} mt-2 border-t border-line pt-1`} style={{ gridTemplateColumns: columns }}>
        <span className="font-medium">Moyenne générale</span>
        {report.generalBySemester.map((average, index) => (
          <span key={index} className="tnum text-right text-ink-2">
            {formatAverage(average)}
          </span>
        ))}
        <span className="tnum text-right text-[15px] font-semibold">{formatAverage(report.general)}</span>
      </div>
    </div>
  );
}

/**
 * Notes et moyennes : un onglet par semestre (celui en cours d'abord choisi), et l'année. Sans
 * semestre saisi, une seule moyenne sur toutes les notes.
 */
export function GradesPage() {
  const today = useToday();
  const openCreate = useCreateStore((state) => state.openCreate);
  const { data: subjects } = useSubjects();
  const { data: grades } = useGrades();
  const { data: periods } = usePeriods();
  const [tab, setTab] = useState<string | null>(null);
  if (!subjects || !grades || !periods) return null;

  const list = semesters(periods);
  const refs: SubjectRef[] = subjects.map((s) => ({ id: s.id, name: s.name, color: s.color, coefficient: s.coefficient }));
  const selected = tab ?? currentSemester(periods, today)?.id ?? 'year';
  const semester = list.find((s) => s.id === selected) ?? null;
  const showYear = list.length === 0 || selected === 'year';
  const year = yearReport(grades, refs, periods);
  const report = semester ? periodReport(grades, refs, semester) : null;
  const general = showYear ? year.general : (report?.general ?? null);
  const subtitle =
    grades.length === 0
      ? 'Aucune note pour l’instant.'
      : `Moyenne générale : ${formatAverage(general)}${semester && !showYear ? ` · ${semester.name}, ${periodRange(semester)}` : list.length ? ' · année' : ''}`;

  return (
    <Page
      title="Notes"
      subtitle={subtitle}
      actions={
        <Button variant="secondary" icon={Plus} onClick={() => openCreate('grade')} disabled={subjects.length === 0}>
          Nouvelle note
        </Button>
      }
    >
      {subjects.length === 0 ? (
        <EmptyState icon={Award} title="Commence par tes matières">
          <p>Chaque note appartient à une matière, avec son coefficient : ajoute-les d’abord.</p>
        </EmptyState>
      ) : (
        <>
          {list.length > 0 && (
            <div className="mb-6">
              <SegmentedTabs
                tabs={[...list.map((s) => ({ value: s.id, label: s.name })), { value: 'year', label: 'Année' }]}
                value={showYear ? 'year' : selected}
                onChange={setTab}
              />
            </div>
          )}
          {showYear ? (
            list.length === 0 ? (
              <PeriodTable report={periodReport(grades, refs, null)} />
            ) : (
              <YearTable report={year} />
            )
          ) : (
            report && <PeriodTable report={report} />
          )}
          {list.length === 0 && (
            <p className="mt-8 text-meta text-ink-3">
              Pour une moyenne par semestre, ajoute tes semestres dans Emploi du temps › Semestres et vacances.
            </p>
          )}
        </>
      )}
    </Page>
  );
}
