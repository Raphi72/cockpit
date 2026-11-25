import '@fontsource-variable/inter';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { disableBrowserContextMenu } from './core/platform';
import { QuickCapture } from './domains/inbox/components/QuickCapture';

/**
 * Entrée de la petite fenêtre de capture rapide (capture.html), ouverte par le raccourci global.
 * Volontairement minuscule : ni routeur, ni cache de requêtes, pour s'ouvrir tout de suite.
 */
const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

createRoot(root).render(
  <StrictMode>
    <QuickCapture />
  </StrictMode>,
);
disableBrowserContextMenu();
