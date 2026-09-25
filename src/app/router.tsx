import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router';
import { validateCalendarSearch } from '@/domains/agenda/search';
import { validatePlanningSearch } from '@/domains/agenda/timeline/search';
import { DashboardPage } from '@/domains/dashboard/pages/DashboardPage';
import { validateDashboardSearch } from '@/domains/dashboard/search';
import { validateFinancesSearch } from '@/domains/finance/search';
import { validateProjectsSearch } from '@/domains/projects/search';
import { validateTasksSearch } from '@/domains/tasks/search';
import { AppShell } from './shell/AppShell';
import { ErrorScreen } from './shell/ErrorScreen';

const rootRoute = createRootRoute({ component: AppShell });

// Le dashboard est chargé immédiatement ; les autres pages à la demande.
const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/', validateSearch: validateDashboardSearch, component: DashboardPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/projects',
    validateSearch: validateProjectsSearch,
    component: lazyRouteComponent(() => import('@/domains/projects/pages/ProjectsPage'), 'ProjectsPage'),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/projects/$projectId',
    component: lazyRouteComponent(() => import('@/domains/projects/pages/ProjectDetailPage'), 'ProjectDetailPage'),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/tasks',
    validateSearch: validateTasksSearch,
    component: lazyRouteComponent(() => import('@/domains/tasks/pages/TasksPage'), 'TasksPage'),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/calendar',
    validateSearch: validateCalendarSearch,
    component: lazyRouteComponent(() => import('@/domains/agenda/calendar/CalendarPage'), 'CalendarPage'),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/planning',
    validateSearch: validatePlanningSearch,
    component: lazyRouteComponent(() => import('@/domains/agenda/timeline/PlanningPage'), 'PlanningPage'),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/finances',
    validateSearch: validateFinancesSearch,
    component: lazyRouteComponent(() => import('@/domains/finance/pages/FinancesPage'), 'FinancesPage'),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/clients',
    component: lazyRouteComponent(() => import('@/domains/clients/pages/ClientsPage'), 'ClientsPage'),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: lazyRouteComponent(() => import('@/domains/settings/pages/SettingsPage'), 'SettingsPage'),
  }),
] as const;

export const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  // Une app desktop n'a pas d'URL visible : l'historique par hash évite toute dépendance au serveur.
  history: createHashHistory(),
  defaultPreload: 'intent',
  defaultErrorComponent: ErrorScreen,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
