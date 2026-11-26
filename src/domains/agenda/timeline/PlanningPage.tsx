import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ChartGantt, ChevronLeft, ChevronRight, Plus, Timer } from 'lucide-react';
import { Fragment, useMemo } from 'react';
import { useCreateStore } from '@/app/create-store';
import { usePageShortcuts } from '@/app/shortcuts';
import { useUiStore } from '@/app/ui-store';
import { addDaysISO } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { useWeekStartsOn } from '@/core/week-start';
import { useBlocks } from '@/domains/day/hooks';
import { formatMinutes } from '@/domains/day/model';
import { useOpenPayments, useReceivedPayments } from '@/domains/finance/payments/hooks';
import { useProjects } from '@/domains/projects/hooks';
import { useOpenTasks } from '@/domains/tasks/hooks';
import { useWorkPlanDialog } from '@/domains/tasks/work-plan-store';
import type { ProjectStatus } from '@/domains/projects/model';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { SegmentedTabs } from '@/ui/primitives/SegmentedTabs';
import {
  PLANNING_ZOOMS,
  PLANNING_ZOOM_LABELS,
  isInPeriod,
  periodEnd,
  planningRows,
  planningTitle,
  planningPeriod,
  shiftPlanningAnchor,
} from './model';
import { Timeline } from './Timeline';
import { displayMinutes, projectWeekMinutes, spreadTasks, weeklyWorkload } from './workload';

/** Projets du planning : en cours ou à venir (un projet à venir passe en cours à sa date de début). */
const PLANNED_STATUSES: ProjectStatus[] = ['active', 'planned'];

const ZOOM_KEYS = { month: 'M', quarter: 'R' } as const;

/**
 * Planning : il dit si tu auras le temps. En haut, la charge de chaque semaine (le travail à finir avant
 * les deadlines) face au temps posé dans la Journée ; dessous, une ligne par projet en cours ou à venir,
 * une barre du début à la deadline, ses heures par semaine, la ligne « aujourd'hui » et les encaissements
 * en losanges. Zoom mois (6 semaines) ou trimestre (13 semaines).
 */
export function PlanningPage() {
  const today = useToday();
  const search = useSearch({ from: '/planning' });
  const navigate = useNavigate({ from: '/planning' });
  const zoom = useUiStore((state) => state.planningZoom);
  const setZoom = useUiStore((state) => state.setPlanningZoom);
  const openCreate = useCreateStore((state) => state.openCreate);
  const openPlan = useWorkPlanDialog((state) => state.openPlan);
  const { data: projects } = useProjects({ statuses: PLANNED_STATUSES });
  const { data: open } = useOpenPayments();
  const { data: received } = useReceivedPayments();
  const { data: tasks } = useOpenTasks();

  const anchor = search.date ?? today;
  const weekStartsOn = useWeekStartsOn();
  const period = useMemo(() => planningPeriod(zoom, anchor, weekStartsOn), [zoom, anchor, weekStartsOn]);
  const range = useMemo(() => ({ from: period.start, to: addDaysISO(periodEnd(period), 1) }), [period]);
  const { data: blocks } = useBlocks(range);
  const goTo = (date: string) => void navigate({ search: date === today ? {} : { date } });

  usePageShortcuts({
    arrowleft: () => goTo(shiftPlanningAnchor(zoom, anchor, -1)),
    arrowright: () => goTo(shiftPlanningAnchor(zoom, anchor, 1)),
    t: () => goTo(today),
    m: () => setZoom('month'),
    r: () => setZoom('quarter'),
    p: openPlan,
  });

  if (!projects || !open || !received || !tasks || !blocks) return null;

  const { rows, undated } = planningRows(projects, [...open, ...received], today);
  const visible = rows.filter((row) => isInPeriod(row, period));
  const hidden = rows.length - visible.length;
  const unit = zoom === 'month' ? '4 semaines' : '12 semaines';
  const work = spreadTasks(tasks, projects, today);
  const load = weeklyWorkload(work.spreads, blocks, period, today);
  // Du travail à faire, et aucun bloc posé d'ici la fin de la période : on dit où le poser.
  const nothingPlanned = load.some((w) => w.todoMin > 0) && load.every((w) => w.plannedMin === 0);

  return (
    <Page
      title="Planning"
      subtitle={planningTitle(period, today)}
      actions={
        <>
          <Button variant="ghost" icon={Timer} shortcut="P" onClick={openPlan} className="mr-2" title="Composer le programme d’aujourd’hui">
            Je veux travailler…
          </Button>
          <SegmentedTabs
            tabs={PLANNING_ZOOMS.map((z) => ({ value: z, label: PLANNING_ZOOM_LABELS[z], title: `${PLANNING_ZOOM_LABELS[z]} · ${ZOOM_KEYS[z]}` }))}
            value={zoom}
            onChange={setZoom}
          />
          <div className="ml-2 flex items-center gap-1">
            <Button
              variant="ghost"
              icon={ChevronLeft}
              aria-label={`${unit} plus tôt`}
              title="Plus tôt · ←"
              onClick={() => goTo(shiftPlanningAnchor(zoom, anchor, -1))}
            />
            <Button variant="secondary" shortcut="T" onClick={() => goTo(today)}>
              Aujourd’hui
            </Button>
            <Button
              variant="ghost"
              icon={ChevronRight}
              aria-label={`${unit} plus tard`}
              title="Plus tard · →"
              onClick={() => goTo(shiftPlanningAnchor(zoom, anchor, 1))}
            />
          </div>
        </>
      }
    >
      {projects.length === 0 && work.spreads.length === 0 ? (
        <EmptyState icon={ChartGantt} title="Aucun projet en cours ou à venir">
          <p>
            Donne une deadline à tes projets et une durée à leurs tâches : tu verras ici, semaine par semaine, le travail à
            faire face au temps posé dans ta Journée.
          </p>
          <Button variant="primary" icon={Plus} className="mt-4" onClick={() => openCreate('project')}>
            Créer un projet
          </Button>
        </EmptyState>
      ) : (
        <>
          <Timeline
            rows={visible}
            load={load}
            period={period}
            today={today}
            detailed={zoom === 'month'}
            weeklyOf={(projectId) => projectWeekMinutes(load, projectId)}
            remaining={work.remaining}
          />
          {visible.length === 0 && <p className="mt-4 text-ink-3">Aucun projet sur cette période.</p>}

          <div className="mt-8 space-y-1.5 text-meta text-ink-3">
            {nothingPlanned && (
              <p>
                Aucun bloc de travail posé sur cette période : clique sur une semaine pour l’ouvrir dans la Journée et y poser
                du temps.
              </p>
            )}
            {work.undated.length > 0 && (
              <p>
                Sans deadline, pas dans la charge :{' '}
                {work.undated.map((share, index) => (
                  <Fragment key={share.projectId ?? ''}>
                    {index > 0 && ', '}
                    {share.projectId ? (
                      <Link to="/projects/$projectId" params={{ projectId: share.projectId }} className="text-ink-2 hover:text-ink">
                        {share.name}
                      </Link>
                    ) : (
                      `${share.count} tâche${share.count > 1 ? 's' : ''} sans projet`
                    )}{' '}
                    ({formatMinutes(displayMinutes(share.minutes))})
                  </Fragment>
                ))}
                .{' '}
                {work.undated.some((share) => share.projectId)
                  ? 'Une deadline sur le projet suffit : ses tâches s’y répartissent.'
                  : 'Donne-leur une deadline, ou range-les dans un bloc de la Journée.'}
              </p>
            )}
            {hidden > 0 && (
              <p>
                {hidden} autre{hidden > 1 ? 's' : ''} projet{hidden > 1 ? 's' : ''} hors de cette période : ← → pour les voir.
              </p>
            )}
            {undated.length > 0 && (
              <p>
                Sans dates :{' '}
                {undated.map((project, index) => (
                  <Fragment key={project.id}>
                    {index > 0 && ', '}
                    <Link to="/projects/$projectId" params={{ projectId: project.id }} className="text-ink-2 hover:text-ink">
                      {project.name}
                    </Link>
                  </Fragment>
                ))}
                . Ajoute un début ou une deadline pour les voir ici.
              </p>
            )}
          </div>
        </>
      )}
    </Page>
  );
}
