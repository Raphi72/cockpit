import '@fontsource-variable/inter';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { disableBrowserContextMenu } from './core/platform';
import { NowWindow } from './domains/companion/components/NowWindow';

/**
 * Entrée de la mini-fenêtre « En ce moment » (now.html), toujours au-dessus des autres.
 * Comme la capture rapide : ni routeur, ni cache de requêtes ; elle relit la base toute seule.
 */
const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

createRoot(root).render(
  <StrictMode>
    <NowWindow />
  </StrictMode>,
);
disableBrowserContextMenu();
