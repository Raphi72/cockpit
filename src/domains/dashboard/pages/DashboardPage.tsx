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
import { useMemo, useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { addDaysISO, formatLongDate } from '@/core/dates';
import { useMinutesOfDay, useToday } from '@/core/use-today';
import { UPCOMING_AGENDA_DAYS, UpcomingAgenda, useAgenda, type AgendaItem } from '@/domains/agenda';
import { FinanceFigures } from '@/domains/finance/components/FinanceFigures';
import { useSetting } from '@/domains/settings/hooks';
import { SETTINGS } from '@/domains/settings/model';
import { useFinanceSummary } from '@/domains/finance/hooks';
import { useOverduePayments } from '@/domains/finance/payments/hooks';
import { useReceiveDialog } from '@/domains/finance/payments/receive-store';
import { ProjectRow } from '@/domains/projects/components/ProjectRow';
import { useProjects } from '@/domains/projects/hooks';
import { OPEN_STATUSES } from '@/domains/projects/model';
import { TodayTasks, estimateSummary } from '@/domains/tasks/components/TaskGroups';
import { useDoneToday, useOpenTasks } from '@/domains/tasks/hooks';
import { selectToday } from '@/domains/tasks/model';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { buildAlerts, dashboardSummary, nextTimedEvent, type Alert, type AlertAction } from '../model';

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

const ACTION_LABELS: Record<AlertAction['kind'], string> = {
  receive: 'Marquer reçu…',
  'add-task': 'Ajouter une tâche',
};

/** Action directe, visible au survol de la ligne (ou au clavier) : elle recouvre la fin du texte sans le décaler. */
function AlertActionButton({ action }: { action: AlertAction }) {
  const openReceive = useReceiveDialog((state) => state.openReceive);
  const openCreate = useCreateStore((state) => state.openCreate);
  return (
    <button
      type="button"
      onClick={() => {
        if (action.kind === 'receive') openReceive(action.payment);
        else openCreate('task', { projectId: action.projectId, scheduledDate: null });
      }}
      className={
        'absolute top-1/2 right-2.5 z-10 h-7 -translate-y-1/2 rounded-md border border-line bg-elevated px-2.5 text-meta text-ink-2 ' +
        'opacity-0 transition-opacity duration-[120ms] ease-soft group-focus-within:opacity-100 group-hover:opacity-100 hover:text-ink'
      }
    >
      {ACTION_LABELS[action.kind]}
    </button>
  );
}

/** Le titre ouvre le projet (ou, pour un encaissement sans projet, Finances › En retard) ; son lien couvre toute la ligne. */
function AlertTitle({ alert }: { alert: Alert }) {
  const className =
    'block truncate font-medium outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-accent-soft';
  if (alert.projectId) {
    return (
      <Link to="/projects/$projectId" params={{ projectId: alert.projectId }} className={className}>
        {alert.title}
      </Link>
    );
  }
  if (alert.kind === 'payment') {
    return (
      <Link to="/finances" search={{ view: 'late' }} className={className}>
        {alert.title}
      </Link>
    );
  }
  return <span className="block truncate font-medium">{alert.title}</span>;
}

function AlertRow({ alert }: { alert: Alert }) {
  const Icon = alert.kind === 'deadline' && alert.tone === 'warning' ? Hourglass : ALERT_ICONS[alert.kind];
  return (
    <div className="group relative -mx-2.5 flex items-start gap-3 rounded-md px-2.5 py-3 transition-colors duration-[120ms] ease-soft hover:bg-hover">
      <Icon className={`mt-0.5 size-4 shrink-0 ${TONE_CLASS[alert.tone]}`} strokeWidth={1.75} />
      <span className="min-w-0">
        <AlertTitle alert={alert} />
        <span className={`block text-meta ${alert.tone === 'muted' ? 'text-ink-2' : TONE_CLASS[alert.tone]}`}>
          {alert.reason}
        </span>
      </span>
      {alert.action && <AlertActionButton action={alert.action} />}
    </div>
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

/** Synthèse sous la date. Le prochain rendez-vous suit l'heure : ce composant seul est redessiné chaque minute. */
function DaySummary(props: { todayCount: number; overdueCount: number; agenda: AgendaItem[]; today: string }) {
  const minutes = useMinutesOfDay();
  const nextEvent = nextTimedEvent(props.agenda, props.today, minutes);
  return dashboardSummary({ todayCount: props.todayCount, overdueCount: props.overdueCount, nextEvent });
}

export function DashboardPage() {
  const today = useToday();
  const openCreate = useCreateStore((state) => state.openCreate);
  const agendaRange = useMemo(() => ({ from: today, to: addDaysISO(today, UPCOMING_AGENDA_DAYS) }), [today]);
  const { data: projects } = useProjects({ statuses: OPEN_STATUSES });
  const { data: overduePayments = [] } = useOverduePayments(today);
  const { data: openTasks } = useOpenTasks();
  const { data: doneToday = [] } = useDoneToday(today);
  const { data: finance } = useFinanceSummary(today);
  const { data: agenda } = useAgenda(agendaRange);
  const { data: showFigures } = useSetting(SETTINGS.dashboardShowFigures);

  if (!projects || !openTasks || !finance || !agenda || showFigures === undefined) return null;

  const alerts = buildAlerts({ projects, overduePayments, today });
  const active = projects.filter((p) => p.status === 'active');
  const upcoming = projects.filter((p) => p.status === 'planned' || p.status === 'proposal');
  const todayGroups = selectToday(openTasks, today);
  const todayTasks = [...todayGroups.overdue, ...todayGroups.today];
  const title = formatLongDate(new Date(`${today}T12:00:00`));

  const nothingYet =
    projects.length === 0 &&
    openTasks.length === 0 &&
    doneToday.length === 0 &&
    overduePayments.length === 0 &&
    agenda.length === 0;
  if (nothingYet) {
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
      subtitle={
        <DaySummary
          todayCount={todayTasks.length}
          overdueCount={todayGroups.overdue.length}
          agenda={agenda}
          today={today}
        />
      }
    >
      {showFigures && <FinanceFigures summary={finance} today={today} className="mb-12" />}

      {/*
        Deux colonnes indépendantes. « Prochains jours » est sous « À surveiller » (3 points au plus) :
        il reste visible sans défiler, quel que soit le nombre de tâches du jour.
      */}
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] items-start gap-x-18">
        <div className="min-w-0">
          <section>
            <div className="mb-1 flex items-baseline gap-2.5">
              <h2 className="font-semibold">Aujourd’hui</h2>
              {estimate && <span className="text-meta text-ink-3">{estimate}</span>}
              <Link to="/tasks" className="ml-auto text-meta text-ink-3 hover:text-ink">
                Toutes les tâches →
              </Link>
            </div>
            <TodayTasks open={openTasks} doneToday={doneToday} today={today} />
          </section>

          <section className="mt-14">
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

        <div className="min-w-0">
          <Attention alerts={alerts} />

          <div className="mt-14">
            <UpcomingAgenda items={agenda} today={today} />
          </div>
        </div>
      </div>
    </Page>
  );
}
