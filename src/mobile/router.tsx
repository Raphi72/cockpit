import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { MobileShell } from './MobileShell';
import { DayScreen } from './screens/DayScreen';
import { HabitsScreen } from './screens/HabitsScreen';
import { PageScreen } from './screens/PageScreen';
import { PagesScreen } from './screens/PagesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';

/**
 * Les écrans du téléphone. Mêmes chemins que sur le PC quand l'écran existe des deux côtés : un lien
 * `[[…]]` dans une page mène à `/pages/$pageId` sur l'un comme sur l'autre.
 */
const root = createRootRoute({ component: MobileShell });

export const mobileRouter = createRouter({
  routeTree: root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/', component: TodayScreen }),
    createRoute({ getParentRoute: () => root, path: '/day', component: DayScreen }),
    createRoute({ getParentRoute: () => root, path: '/habits', component: HabitsScreen }),
    createRoute({ getParentRoute: () => root, path: '/pages', component: PagesScreen }),
    createRoute({ getParentRoute: () => root, path: '/pages/$pageId', component: PageScreen }),
    createRoute({ getParentRoute: () => root, path: '/settings', component: SettingsScreen }),
  ]),
  history: createHashHistory(),
});
