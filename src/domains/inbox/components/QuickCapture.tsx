import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Inbox } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { db } from '@/core/db';
import { humanizeError } from '@/core/db/errors';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { SETTINGS, resolveTheme } from '@/domains/settings/model';
import { getSetting } from '@/domains/settings/repository';
import { Kbd } from '@/ui/primitives/Kbd';
import { cleanInboxText } from '../model';
import { insertInboxItemStatement } from '../repository';

/** Événement natif : la fenêtre vient d'être montrée (src-tauri/src/capture.rs). */
const OPEN_EVENT = 'cockpit:capture-open';

/** Le thème choisi dans Paramètres, relu à chaque ouverture : il a pu changer entre-temps. */
async function applySavedTheme(): Promise<void> {
  const theme = resolveTheme(await getSetting(db, SETTINGS.theme.key).catch(() => null));
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/** Fin d'une capture, côté natif : la fenêtre principale relit la boîte, la petite fenêtre se cache. */
function finish(options: { saved: boolean; keepOpen: boolean }): Promise<void> {
  return isTauri() ? invoke('capture_done', options) : Promise.resolve();
}

/**
 * Capture rapide : une seule ligne. Entrée note dans la boîte de réception et referme ;
 * Ctrl+Entrée note et garde la fenêtre pour enchaîner ; Échap abandonne.
 * Un brouillon survit si la fenêtre se cache parce qu'on a cliqué ailleurs.
 */
export function QuickCapture() {
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = () => {
      setStatus(null);
      void applySavedTheme();
      input.current?.focus();
    };
    onOpen();
    if (!isTauri()) return;
    const unlisten = listen(OPEN_EVENT, onOpen);
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  const save = async (keepOpen: boolean) => {
    const text = cleanInboxText(draft);
    if (!text) return;
    try {
      await db.batch([insertInboxItemStatement({ id: newId(), text }, nowTimestamp())]);
    } catch (error) {
      // Le texte reste dans le champ : rien n'est perdu.
      setStatus({ tone: 'error', text: humanizeError(error) });
      return;
    }
    setDraft('');
    // Dans le navigateur de développement, la fenêtre ne se ferme pas : on confirme à la place.
    setStatus(keepOpen || !isTauri() ? { tone: 'ok', text: 'Noté' } : null);
    await finish({ saved: true, keepOpen });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void save(event.ctrlKey);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft('');
      setStatus(null);
      void finish({ saved: false, keepOpen: false });
    }
  };

  return (
    <div className="flex h-screen items-center gap-3.5 bg-elevated px-5">
      <Inbox className="size-[18px] shrink-0 text-ink-3" strokeWidth={1.75} />
      <input
        ref={input}
        autoFocus
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setStatus(null);
        }}
        onKeyDown={onKeyDown}
        placeholder="Noter quelque chose…"
        aria-label="Capture rapide"
        spellCheck={false}
        className="h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
      />
      {status ? (
        <span className={`shrink-0 text-meta ${status.tone === 'error' ? 'text-danger' : 'text-ink-2'}`}>{status.text}</span>
      ) : (
        <span className="flex shrink-0 items-center gap-1.5 text-meta text-ink-3 select-none">
          <Kbd>Entrée</Kbd> noter
          <span className="ml-2 flex items-center gap-1.5">
            <Kbd>Échap</Kbd> fermer
          </span>
        </span>
      )}
    </div>
  );
}
