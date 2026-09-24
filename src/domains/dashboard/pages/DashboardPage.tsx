import { Link } from '@tanstack/react-router';
import {
  CircleDashed,
  Euro,
  FolderClosed,
  Hourglass,
  Play,
  Plus,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { formatLongDate } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { useOverduePayments } from '@/domains/finance/payments/hooks';
import { ProjectRow } from '@/domains/projects/components/ProjectRow';
import { useProjects } from '@/domains/projects/hooks';
import { OPEN_STATUSES } from '@/domains/projects/model';
import { TodayTasks, estimateSummary } from '@/domains/tasks/components/TaskGroups';
import { useDoneToday, useOpenTasks } from '@/domains/tasks/hooks';
import { selectToday } from '@/domains/tasks/model';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { buildAlerts, dashboardSummary, type Alert } from '../model';

const ALERT_ICONS: Record<Alert['kind'], LucideIcon> = {
  deadline: TriangleAlert,
  payment: Euro,
  start: Play,
  budget: Wallet,
  noaction: CircleDashed,
};

const TONE_CLASS: Record<Alert['tone'], string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  muted: 'text-ink-3',
};

/** Nombre de points montrés d'emblée : au-delà, on les déplie à la demande. */
const VISIBLE_ALERTS = 3;

function AlertRow({ alert }: { alert: Alert }) {
  const Icon = alert.kind === 'deadline' && alert.tone === 'warning' ? Hourglass : ALERT_ICONS[alert.kind];
  const content = (
    <>
      <Icon className={`mt-0.5 size-4 shrink-0 ${TONE_CLASS[alert.tone]}`} strokeWidth={1.75} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{alert.title}</span>
        <span className={`block text-meta ${alert.tone === 'muted' ? 'text-ink-2' : TONE_CLASS[alert.tone]}`}>
          {alert.reason}
        </span>
      </span>
    </>
  );
  const className = '-mx-2.5 flex items-start gap-3 rounded-md px-2.5 py-3 transition-colors duration-[120ms] ease-soft';

  return alert.projectId ? (
    <Link to="/projects/$projectId" params={{ projectId: alert.projectId }} className={`${className} hover:bg-hover`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function Attention({ alerts }: { alerts: Alert[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? alerts : alerts.slice(0, VISIBLE_ALERTS);
  const hidden = alerts.length - visible.length;

  return (
    <section>
      <h2 className="mb-3.5 font-semibold">À surveiller</h2>
      {alerts.length === 0 ? (
        <p className="text-ink-3">Rien ne dérape pour l’instant.</p>
      ) : (
        <>
          {visible.map((alert) => (
            <AlertRow key={alert.key} alert={alert} />
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2 text-meta text-ink-3 transition-colors hover:text-ink"
            >
              {hidden} autre{hidden > 1 ? 's' : ''} point{hidden > 1 ? 's' : ''}
            </button>
          )}
        </>
      )}
    </section>
  );
}

export function DashboardPage() {
  const today = useToday();
  const openCreate = useCreateStore((state) => state.openCreate);
  const { data: projects } = useProjects({ statuses: OPEN_STATUSES });
  const { data: overduePayments = [] } = useOverduePayments(today);
  const { data: openTasks } = useOpenTasks();
  const { data: doneToday = [] } = useDoneToday(today);

  if (!projects || !openTasks) return null;

  const alerts = buildAlerts({ projects, overduePayments, today });
  const active = projects.filter((p) => p.status === 'active');
  const upcoming = projects.filter((p) => p.status === 'planned' || p.status === 'proposal');
  const todayGroups = selectToday(openTasks, today);
  const todayTasks = [...todayGroups.overdue, ...todayGroups.today];
  const title = formatLongDate(new Date(`${today}T12:00:00`));

  if (projects.length === 0 && openTasks.length === 0 && doneToday.length === 0) {
    return (
      <Page title={title} subtitle="Rien de prévu pour l’instant.">
        <EmptyState icon={FolderClosed} title="Tout commence par tes projets et tes tâches">
          <p>Cette page te montrera ensuite ce que tu as à faire aujourd’hui et ce qui mérite ton attention.</p>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" icon={Plus} onClick={() => openCreate('project')}>
              Créer un projet
            </Button>
            <Button variant="secondary" shortcut="N" onClick={() => openCreate('task', { scheduledDate: today })}>
              Ajouter une tâche
            </Button>
          </div>
        </EmptyState>
      </Page>
    );
  }

  const estimate = estimateSummary(todayTasks);

  return (
    <Page
      title={title}
      subtitle={dashboardSummary({ projects, alerts, todayCount: todayTasks.length, overdueCount: todayGroups.overdue.length })}
    >
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] items-start gap-x-18 gap-y-16">
        <section className="min-w-0">
          <div className="mb-1 flex items-baseline gap-2.5">
            <h2 className="font-semibold">Aujourd’hui</h2>
            {estimate && <span className="text-meta text-ink-3">{estimate}</span>}
            <Link to="/tasks" className="ml-auto text-meta text-ink-3 hover:text-ink">
              Toutes les tâches →
            </Link>
          </div>
          <TodayTasks open={openTasks} doneToday={doneToday} today={today} />
        </section>

        <div className="min-w-0">
          <Attention alerts={alerts} />

          <section className="mt-16">
            <div className="mb-3.5 flex items-baseline gap-2.5">
              <h2 className="font-semibold">Projets en cours</h2>
              <Link to="/projects" className="ml-auto text-meta text-ink-3 hover:text-ink">
                Tous →
              </Link>
            </div>
            {active.length === 0 ? (
              <p className="text-ink-3">Aucun projet en cours.</p>
            ) : (
              active.map((project) => <ProjectRow key={project.id} project={project} today={today} compact />)
            )}
            {upcoming.length > 0 && (
              <>
                <h3 className="pt-5 pb-1.5 text-meta font-medium text-ink-3">À venir</h3>
                {upcoming.map((project) => (
                  <ProjectRow key={project.id} project={project} today={today} compact />
                ))}
              </>
            )}
          </section>
        </div>
      </div>
    </Page>
  );
}
