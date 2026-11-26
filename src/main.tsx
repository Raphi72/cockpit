import '@fontsource-variable/inter';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadPreferences } from './app/preferences';
import { disableBrowserContextMenu, isMobileApp, revealWindow } from './core/platform';

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

// Le PC ou le téléphone : chacun son appli (le téléphone dans un morceau à part, jamais chargé sur le PC).
const loadApp = () =>
  isMobileApp() ? import('./mobile/MobileApp').then((m) => m.MobileApp) : import('./app/App').then((m) => m.App);

// Thème et premier jour de la semaine d'abord : la fenêtre s'affiche directement comme il faut.
void Promise.all([loadApp(), loadPreferences().catch(() => undefined)]).then(([Root]) => {
  createRoot(root).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
  disableBrowserContextMenu();
  revealWindow();
});
