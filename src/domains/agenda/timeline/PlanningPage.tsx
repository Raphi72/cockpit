import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ChartGantt, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Fragment, useMemo } from 'react';
import { useCreateStore } from '@/app/create-store';
import { usePageShortcuts } from '@/app/shortcuts';
import { useUiStore } from '@/app/ui-store';
import { useToday } from '@/core/use-today';
import { useWeekStartsOn } from '@/core/week-start';
import { useOpenPayments, useReceivedPayments } from '@/domains/finance/payments/hooks';
import { useProjects } from '@/domains/projects/hooks';
import type { ProjectStatus } from '@/domains/projects/model';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { SegmentedTabs } from '@/ui/primitives/SegmentedTabs';
import {
  PLANNING_ZOOMS,
  PLANNING_ZOOM_LABELS,
  isInPeriod,
  planningRows,
  planningTitle,
  planningPeriod,
  shiftPlanningAnchor,
  weeklyLoad,
} from './model';
import { Timeline } from './Timeline';

/** Projets du planning : en cours ou à venir (un projet à venir passe en cours à sa date de début). */
const PLANNED_STATUSES: ProjectStatus[] = ['active', 'planned'];

const ZOOM_KEYS = { month: 'M', quarter: 'R' } as const;

/**
 * Planning : une ligne par projet en cours ou à venir, une barre du début à la deadline, la ligne
 * « aujourd'hui », les encaissements en losanges, et en haut la bande qui montre combien de projets
 * se chevauchent chaque semaine. Zoom mois (6 semaines) ou trimestre (13 semaines).
 */
export function PlanningPage() {
  const today = useToday();
  const search = useSearch({ from: '/planning' });
  const navigate = useNavigate({ from: '/planning' });
  const zoom = useUiStore((state) => state.planningZoom);
  const setZoom = useUiStore((state) => state.setPlanningZoom);
  const openCreate = useCreateStore((state) => state.openCreate);
  const { data: projects } = useProjects({ statuses: PLANNED_STATUSES });
  const { data: open } = useOpenPayments();
  const { data: received } = useReceivedPayments();

  const anchor = search.date ?? today;
  const weekStartsOn = useWeekStartsOn();
  const period = useMemo(() => planningPeriod(zoom, anchor, weekStartsOn), [zoom, anchor, weekStartsOn]);
  const goTo = (date: string) => void navigate({ search: date === today ? {} : { date } });

  usePageShortcuts({
    arrowleft: () => goTo(shiftPlanningAnchor(zoom, anchor, -1)),
    arrowright: () => goTo(shiftPlanningAnchor(zoom, anchor, 1)),
    t: () => goTo(today),
    m: () => setZoom('month'),
    r: () => setZoom('quarter'),
  });

  if (!projects || !open || !received) return null;

  const { rows, undated } = planningRows(projects, [...open, ...received], today);
  const visible = rows.filter((row) => isInPeriod(row, period));
  const hidden = rows.length - visible.length;
  const unit = zoom === 'month' ? '4 semaines' : '12 semaines';

  return (
    <Page
      title="Planning"
      subtitle={planningTitle(period, today)}
      actions={
        <>
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
      {projects.length === 0 ? (
        <EmptyState icon={ChartGantt} title="Aucun projet en cours ou à venir">
          <p>Donne une date de début et une deadline à tes projets : ils s’aligneront ici, et tu verras ce qui se chevauche.</p>
          <Button variant="primary" icon={Plus} className="mt-4" onClick={() => openCreate('project')}>
            Créer un projet
          </Button>
        </EmptyState>
      ) : (
        <>
          <Timeline rows={visible} load={weeklyLoad(visible, period)} period={period} today={today} detailed={zoom === 'month'} />
          {visible.length === 0 && <p className="mt-4 text-ink-3">Aucun projet sur cette période.</p>}

          <div className="mt-8 space-y-1.5 text-meta text-ink-3">
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
