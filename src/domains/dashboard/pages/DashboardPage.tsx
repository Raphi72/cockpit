import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Euro,
  FolderClosed,
  Play,
  Plus,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { usePageShortcuts } from '@/app/shortcuts';
import { addDaysISO, daysBetween } from '@/core/dates';
import { useMinutesOfDay, useToday } from '@/core/use-today';
import { UPCOMING_AGENDA_DAYS, useAgenda, type AgendaItem } from '@/domains/agenda';
import { FinanceFigures } from '@/domains/finance/components/FinanceFigures';
import { useSetting } from '@/domains/settings/hooks';
import { SETTINGS } from '@/domains/settings/model';
import { useFinanceSummary } from '@/domains/finance/hooks';
import { useOverduePayments } from '@/domains/finance/payments/hooks';
import { useReceiveDialog } from '@/domains/finance/payments/receive-store';
import { ProjectRow } from '@/domains/projects/components/ProjectRow';
import { useProjects } from '@/domains/projects/hooks';
import { CONFIRMED_STATUSES, statusOn } from '@/domains/projects/model';
import { FutureDayTasks, PastDayTasks, TodayTasks, estimateSummary } from '@/domains/tasks/components/TaskGroups';
import { useDoneOn, useDoneToday, useOpenTasks } from '@/domains/tasks/hooks';
import { selectPlannedOn, selectToday, type TaskItem } from '@/domains/tasks/model';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { DatePicker, type DayMark } from '@/ui/primitives/DatePicker';
import { Deadlines } from '../components/Deadlines';
import { UpcomingDays } from '../components/UpcomingDays';
import {
  DEADLINE_DAYS,
  buildAlerts,
  dashboardSummary,
  dashboardTitle,
  dayMarks,
  dayTasksHeading,
  nextTimedEvent,
  otherDaySummary,
  selectDeadlines,
  upcomingWithTasks,
  type Alert,
  type AlertAction,
} from '../model';

const ALERT_ICONS: Record<Alert['kind'], LucideIcon> = {
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
  const Icon = ALERT_ICONS[alert.kind];
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

/**
 * Date en titre, entre deux flèches pour passer d'un jour à l'autre (← → au clavier), puis le
 * calendrier pour aller directement à un jour (D) : on y voit les jours qui ont des tâches (point
 * gris) ou une deadline (point rouge). La flèche de gauche déborde dans la marge : la date reste
 * alignée sur le contenu. La date a une largeur minimale pour que la flèche de droite ne bouge pas.
 */
function DayTitle(props: {
  day: string;
  today: string;
  marks: Map<string, DayMark>;
  onGo: (day: string) => void;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
}) {
  const { day, today, onGo } = props;
  const button =
    'grid size-8 shrink-0 place-items-center rounded-md text-ink-3 transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink ' +
    'data-[state=open]:bg-hover data-[state=open]:text-ink';
  return (
    <span className="-ml-10 flex items-center gap-2">
      <button
        type="button"
        onClick={() => onGo(addDaysISO(day, -1))}
        aria-label="Jour précédent"
        title="Jour précédent · ←"
        className={button}
      >
        <ChevronLeft className="size-[18px]" strokeWidth={1.75} />
      </button>
      <span className="min-w-[232px]">{dashboardTitle(day, today)}</span>
      <button type="button" onClick={() => onGo(addDaysISO(day, 1))} aria-label="Jour suivant" title="Jour suivant · →" className={button}>
        <ChevronRight className="size-[18px]" strokeWidth={1.75} />
      </button>
      <DatePicker
        value={day}
        marks={props.marks}
        onPick={(picked) => picked && onGo(picked)}
        open={props.pickerOpen}
        onOpenChange={props.onPickerOpenChange}
      >
        <button type="button" aria-label="Choisir un jour" title="Choisir un jour · D" className={button}>
          <CalendarDays className="size-[18px]" strokeWidth={1.75} />
        </button>
      </DatePicker>
    </span>
  );
}

/** Le bloc de tâches suit le jour choisi : aujourd'hui, un jour à venir ou un jour passé. */
function DayTasksSection(props: { day: string; today: string; openTasks: TaskItem[]; doneToday: TaskItem[] }) {
  const { day, today, openTasks, doneToday } = props;
  const diff = daysBetween(today, day);
  let estimate: string | null = null;
  if (diff === 0) {
    const groups = selectToday(openTasks, today);
    estimate = estimateSummary([...groups.overdue, ...groups.today]);
  } else if (diff > 0) {
    estimate = estimateSummary(selectPlannedOn(openTasks, day, today));
  }

  return (
    <section>
      <div className="mb-1 flex items-baseline gap-2.5">
        <h2 className="font-semibold">{dayTasksHeading(day, today)}</h2>
        {estimate && <span className="text-meta text-ink-3">{estimate}</span>}
        <Link to="/tasks" className="ml-auto text-meta text-ink-3 hover:text-ink">
          Toutes les tâches →
        </Link>
      </div>
      {/* « À prévoir » n'y est pas : ces tâches sont dans le bloc « Deadlines ». */}
      {diff === 0 && <TodayTasks open={openTasks} doneToday={doneToday} today={today} showToPlan={false} />}
      {diff > 0 && (
        <FutureDayTasks
          open={openTasks}
          day={day}
          today={today}
          addLabel={diff === 1 ? 'Ajouter une tâche pour demain' : 'Ajouter une tâche pour ce jour'}
        />
      )}
      {diff < 0 && <PastDayTasks open={openTasks} day={day} today={today} />}
    </section>
  );
}

export function DashboardPage() {
  const today = useToday();
  const search = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  const day = search.day ?? today;
  const openCreate = useCreateStore((state) => state.openCreate);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Prochains jours (7 jours, aujourd'hui compris) et Deadlines (jusqu'à J+7 inclus).
  const agendaRange = useMemo(
    () => ({ from: today, to: addDaysISO(today, Math.max(UPCOMING_AGENDA_DAYS, DEADLINE_DAYS + 1)) }),
    [today],
  );
  const { data: projects } = useProjects({ statuses: CONFIRMED_STATUSES });
  const { data: overduePayments = [] } = useOverduePayments(today);
  const { data: openTasks } = useOpenTasks();
  const { data: doneToday = [] } = useDoneToday(today);
  const { data: doneThatDay = [] } = useDoneOn(day, day < today);
  const { data: finance } = useFinanceSummary(today);
  const { data: agenda } = useAgenda(agendaRange);
  const { data: showAmounts } = useSetting(SETTINGS.dashboardShowAmounts);

  const goTo = (next: string) => void navigate({ search: next === today ? {} : { day: next } });
  usePageShortcuts({
    arrowleft: () => goTo(addDaysISO(day, -1)),
    arrowright: () => goTo(addDaysISO(day, 1)),
    t: () => goTo(today),
    d: () => setPickerOpen(true),
  });

  if (!projects || !openTasks || !finance || !agenda || showAmounts === undefined) return null;

  // Les Propositions (devis pas encore signé) n'y sont pas : elles restent dans la page Projets.
  const alerts = buildAlerts({ projects, overduePayments, today, showAmounts });
  const deadlines = selectDeadlines({ projects, tasks: openTasks, agenda, today });
  // Les projets suivent le jour affiché : un projet « À venir » est « En cours » à partir de sa date de début.
  const active = projects.filter((p) => statusOn(p, day) === 'active');
  const upcoming = projects.filter((p) => statusOn(p, day) === 'planned');
  const todayGroups = selectToday(openTasks, today);
  const todayTasks = [...todayGroups.overdue, ...todayGroups.today];
  const title = (
    <DayTitle
      day={day}
      today={today}
      marks={dayMarks({ projects, tasks: openTasks })}
      onGo={goTo}
      pickerOpen={pickerOpen}
      onPickerOpenChange={setPickerOpen}
    />
  );

  const nothingYet =
    day === today &&
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

  const subtitle =
    day === today ? (
      <DaySummary todayCount={todayTasks.length} overdueCount={todayGroups.overdue.length} agenda={agenda} today={today} />
    ) : (
      otherDaySummary({ day, today, planned: selectPlannedOn(openTasks, day, today).length, done: doneThatDay.length })
    );

  return (
    <Page
      title={title}
      subtitle={subtitle}
      actions={
        day !== today && (
          <Button variant="secondary" shortcut="T" onClick={() => goTo(today)}>
            Aujourd’hui
          </Button>
        )
      }
    >
      {/* Montants masquables (réglage) : le dashboard peut rester à l'écran sans dévoiler l'argent. */}
      {showAmounts && <FinanceFigures summary={finance} today={today} className="mb-12" />}

      {/*
        Deux colonnes indépendantes. À droite, les Deadlines d'abord (4 au plus d'emblée), puis
        « À surveiller » (3 points au plus) et « Prochains jours » : rien ne dépend du nombre de tâches du jour.
      */}
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] items-start gap-x-18">
        <div className="min-w-0">
          <DayTasksSection day={day} today={today} openTasks={openTasks} doneToday={doneToday} />

          <section className="mt-14">
            <div className="mb-3.5 flex items-baseline gap-2.5">
              <h2 className="font-semibold">Projets en cours</h2>
              {day !== today && <span className="text-meta text-ink-3">{dayTasksHeading(day, today).toLowerCase()}</span>}
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
          <Deadlines entries={deadlines} today={today} />

          <div className="mt-12">
            <Attention alerts={alerts} />
          </div>

          <div className="mt-12">
            <UpcomingDays
              days={upcomingWithTasks(agenda, openTasks, today, day)}
              today={today}
              showAmounts={showAmounts}
              onShowDay={goTo}
            />
          </div>
        </div>
      </div>
    </Page>
  );
}
