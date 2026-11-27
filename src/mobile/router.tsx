import { createHashHistory, createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router';
import { ErrorScreen } from '@/app/shell/ErrorScreen';
import { DashboardPage } from '@/domains/dashboard/pages/DashboardPage';
import { validateDashboardSearch } from '@/domains/dashboard/search';
import { validateDaySearch } from '@/domains/day/search';
import { validateHabitsSearch } from '@/domains/habits/search';
import { validateProjectsSearch } from '@/domains/projects/search';
import { validateHomeworkSearch } from '@/domains/school/homework/model';
import { validateTasksSearch } from '@/domains/tasks/search';
import { MobileShell } from './MobileShell';
import { AgendaScreen } from './screens/AgendaScreen';
import { HabitsScreen } from './screens/HabitsScreen';
import { PageScreen } from './screens/PageScreen';
import { PagesScreen } from './screens/PagesScreen';
import { SettingsScreen } from './screens/SettingsScreen';

/**
 * Les écrans du téléphone. Mêmes chemins que sur le PC : les pages reprises du PC (Aujourd'hui, Tâches,
 * Projets, Devoirs, Examens, une matière, Journée) y trouvent les liens qu'elles connaissent. Le PC a son
 * calendrier et son emploi du temps ; le téléphone, un seul Agenda pour les deux.
 */
const root = createRootRoute({ component: MobileShell });

const route = (path: string, component: Parameters<typeof createRoute>[0]['component'], validateSearch?: (search: Record<string, unknown>) => object) =>
  createRoute({ getParentRoute: () => root, path, component, validateSearch });

export const mobileRouter = createRouter({
  routeTree: root.addChildren([
    route('/', DashboardPage, validateDashboardSearch),
    route('/tasks', lazyRouteComponent(() => import('@/domains/tasks/pages/TasksPage'), 'TasksPage'), validateTasksSearch),
    route('/projects', lazyRouteComponent(() => import('@/domains/projects/pages/ProjectsPage'), 'ProjectsPage'), validateProjectsSearch),
    route('/projects/$projectId', lazyRouteComponent(() => import('@/domains/projects/pages/ProjectDetailPage'), 'ProjectDetailPage')),
    route('/homework', lazyRouteComponent(() => import('@/domains/school/pages/HomeworkPage'), 'HomeworkPage'), validateHomeworkSearch),
    route('/exams', lazyRouteComponent(() => import('@/domains/school/pages/ExamsPage'), 'ExamsPage')),
    route('/subjects', lazyRouteComponent(() => import('@/domains/school/pages/SubjectsPage'), 'SubjectsPage')),
    route('/subjects/$subjectId', lazyRouteComponent(() => import('@/domains/school/pages/SubjectDetailPage'), 'SubjectDetailPage')),
    route('/day', lazyRouteComponent(() => import('@/domains/day/pages/DayPage'), 'DayPage'), validateDaySearch),
    route('/calendar', AgendaScreen, validateDaySearch),
    route('/timetable', AgendaScreen, validateDaySearch),
    route('/habits', HabitsScreen, validateHabitsSearch),
    route('/pages', PagesScreen),
    route('/pages/$pageId', PageScreen),
    route('/settings', SettingsScreen),
  ]),
  history: createHashHistory(),
  defaultErrorComponent: ErrorScreen,
});
