import '@fontsource-variable/inter';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { disableBrowserContextMenu, revealWindow } from './core/platform';

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

disableBrowserContextMenu();
revealWindow();
