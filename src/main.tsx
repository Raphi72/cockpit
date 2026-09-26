import '@fontsource-variable/inter';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { loadPreferences } from './app/preferences';
import { disableBrowserContextMenu, revealWindow } from './core/platform';

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

// Thème et premier jour de la semaine d'abord : la fenêtre s'affiche directement comme il faut.
void loadPreferences().finally(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  disableBrowserContextMenu();
  revealWindow();
});
