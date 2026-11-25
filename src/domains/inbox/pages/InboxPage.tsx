import { CalendarPlus, Inbox, Lightbulb, SquareCheck, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useCreateStore } from '@/app/create-store';
import { useMinutesOfDay, useToday } from '@/core/use-today';
import { useProjects } from '@/domains/projects';
import { OPEN_STATUSES } from '@/domains/projects/model';
import { ColorDot } from '@/ui/data/ColorDot';
import { handleRowKeyDown } from '@/ui/data/row-keys';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/ui/overlays/Menu';
import { Input } from '@/ui/primitives/Input';
import { useCaptureInbox, useDeleteInboxItem, useEditInboxText, useInboxItems, useInboxToIdea } from '../hooks';
import { capturedLabel, cleanInboxText, inboxCountLabel, type InboxItem } from '../model';

const rowClass =
  '-mx-2.5 grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-start gap-6 rounded-md px-2.5 py-[11px] outline-none ' +
  'transition-colors duration-[120ms] ease-soft';

const actionClass =
  'flex h-[22px] items-center gap-1.5 rounded-md text-meta text-ink-2 outline-none transition-colors duration-[120ms] ease-soft ' +
  'hover:text-ink focus-visible:text-ink';

/** Champ du haut : on note, Entrée, et on peut enchaîner. */
function CaptureField() {
  const [draft, setDraft] = useState('');
  const capture = useCaptureInbox();
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const text = cleanInboxText(draft);
        if (!text) return;
        capture.mutate(text);
        setDraft('');
      }}
      placeholder="Noter quelque chose, puis Entrée"
      aria-label="Noter dans la boîte de réception"
      className="h-10 text-[15px]"
    />
  );
}

/** Reformuler une capture : Entrée valide, Échap abandonne, quitter le champ valide aussi. */
function EditField({ item, onClose }: { item: InboxItem; onClose: (byKeyboard: boolean) => void }) {
  const [draft, setDraft] = useState(item.text);
  const edit = useEditInboxText();
  // Après Échap (ou Entrée), la perte du focus qui suit ne doit rien enregistrer.
  const closed = useRef(false);
  const save = () => {
    const text = cleanInboxText(draft);
    if (!closed.current && text && text !== item.text) edit.mutate({ id: item.id, text });
  };
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
          closed.current = true;
          onClose(true);
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          closed.current = true;
          onClose(true);
        }
      }}
      onBlur={() => {
        save();
        if (!closed.current) onClose(false);
      }}
      aria-label="Reformuler la capture"
      className="h-[22px] w-full min-w-0 bg-transparent outline-none"
    />
  );
}

type RowProps = {
  item: InboxItem;
  now: Date;
  today: string;
  /** Appelé avant chaque tri : la page rend ensuite le focus à la ligne qui prend la place. */
  onLeaving: () => void;
};

/**
 * Une capture. Un clic (ou Entrée) pour la reformuler ; au survol ou au clavier, la trier :
 * T en fait une tâche, I une idée de projet, E un événement, Suppr la supprime (avec « Annuler »).
 */
function InboxRow({ item, now, today, onLeaving }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [ideaMenu, setIdeaMenu] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  /** Reformulée au clavier (Entrée ou Échap) : la ligne reprend le focus, pour continuer sans la souris. */
  const refocus = useRef(false);
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    row.current?.focus();
  }, [editing]);
  const openCreate = useCreateStore((state) => state.openCreate);
  const remove = useDeleteInboxItem();
  const toIdea = useInboxToIdea();
  const { data: projects = [] } = useProjects({ statuses: OPEN_STATUSES });

  const toTask = () => {
    onLeaving();
    openCreate('task', { projectId: null, scheduledDate: today, inboxItem: item });
  };
  const toEvent = () => {
    onLeaving();
    openCreate('event', { inboxItem: item });
  };
  const setIdeaMenuOpen = (open: boolean) => {
    if (open) onLeaving();
    setIdeaMenu(open);
  };
  const removeItem = () => {
    onLeaving();
    remove.mutate(item);
  };

  if (editing) {
    return (
      <div className={`${rowClass} bg-elevated ring-2 ring-accent-soft`}>
        <EditField
          item={item}
          onClose={(byKeyboard) => {
            refocus.current = byKeyboard;
            setEditing(false);
          }}
        />
      </div>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
      const actions: Record<string, (() => void) | undefined> = { t: toTask, i: () => setIdeaMenuOpen(true), e: toEvent };
      const action = actions[event.key.toLowerCase()];
      if (action) {
        event.preventDefault();
        action();
        return;
      }
    }
    handleRowKeyDown(event, { open: () => setEditing(true), remove: removeItem });
  };

  return (
    <div
      ref={row}
      role="button"
      tabIndex={0}
      data-row
      data-inbox-id={item.id}
      onClick={() => setEditing(true)}
      onKeyDown={onKeyDown}
      className={`group ${rowClass} cursor-default hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-soft`}
    >
      <span className="leading-[22px] [overflow-wrap:anywhere]">{item.text}</span>

      {/* Depuis quand elle attend ; au survol ou au clavier, les actions prennent sa place. */}
      <span className="grid justify-items-end">
        <span
          className={`tnum col-start-1 row-start-1 text-meta leading-[22px] text-ink-3 transition-opacity duration-[120ms] ease-soft group-focus-within:opacity-0 group-hover:opacity-0 ${ideaMenu ? 'opacity-0' : ''}`}
        >
          {capturedLabel(item.createdAt, now)}
        </span>
        <span
          className={`col-start-1 row-start-1 flex items-center gap-4 transition-opacity duration-[120ms] ease-soft group-focus-within:opacity-100 group-hover:opacity-100 ${ideaMenu ? '' : 'opacity-0'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={toTask} title="En faire une tâche · T" className={actionClass}>
            <SquareCheck className="size-3.5" strokeWidth={1.75} />
            Tâche
          </button>
          <Menu open={ideaMenu} onOpenChange={setIdeaMenuOpen}>
            <MenuTrigger asChild>
              <button type="button" title="En faire une idée de projet · I" className={actionClass}>
                <Lightbulb className="size-3.5" strokeWidth={1.75} />
                Idée
              </button>
            </MenuTrigger>
            <MenuContent
              align="end"
              className="max-h-80 overflow-y-auto"
              // Menu refermé : le focus revient à la ligne (pas au bouton « Idée »), où T, I, E et Suppr marchent.
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                row.current?.focus();
              }}
            >
              <MenuLabel>Idée du projet…</MenuLabel>
              {projects.length === 0 && <MenuItem disabled>Aucun projet en cours</MenuItem>}
              {projects.map((project) => (
                <MenuItem
                  key={project.id}
                  leading={<ColorDot color={project.typeColor} />}
                  onSelect={() => toIdea.mutate({ item, projectId: project.id, projectName: project.name })}
                >
                  {project.name}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <button type="button" onClick={toEvent} title="En faire un événement · E" className={actionClass}>
            <CalendarPlus className="size-3.5" strokeWidth={1.75} />
            Événement
          </button>
          <button
            type="button"
            onClick={removeItem}
            aria-label="Supprimer la capture"
            title="Supprimer · Suppr"
            className={`${actionClass} hover:!text-danger focus-visible:!text-danger`}
          >
            <Trash2 className="size-3.5" strokeWidth={1.75} />
          </button>
        </span>
      </span>
    </div>
  );
}

/**
 * Boîte de réception : tout ce qui a été noté vite, à trier plus tard. Une capture triée ou supprimée
 * quitte la liste ; le focus passe alors à celle qui prend sa place, pour enchaîner au clavier.
 */
export function InboxPage() {
  const today = useToday();
  const { data: items } = useInboxItems();
  const createOpen = useCreateStore((state) => state.open !== null);
  const list = useRef<HTMLDivElement>(null);
  /** Ligne en cours de tri : son identifiant et sa place dans la liste. */
  const leaving = useRef<{ id: string; index: number } | null>(null);

  const wasCreating = useRef(false);
  // « il y a 12 min » avance tout seul.
  useMinutesOfDay();

  useEffect(() => {
    const closed = wasCreating.current && !createOpen;
    wasCreating.current = createOpen;
    const pending = leaving.current;
    if (!pending || createOpen || !items) return;
    const rows = Array.from(list.current?.querySelectorAll<HTMLElement>('[data-row]') ?? []);
    const still = rows.find((row) => row.dataset.inboxId === pending.id);
    // Partie : la ligne suivante a pris sa place. Toujours là alors que la fenêtre de création vient de
    // se fermer (annulée, ou la liste n'est pas encore relue) : elle reprend le focus.
    const target = still ? (closed ? still : undefined) : rows[Math.min(pending.index, rows.length - 1)];
    if (!still) leaving.current = null;
    // Seulement si le focus s'est perdu : jamais pendant qu'on tape ailleurs.
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (target && lost) target.focus();
  }, [items, createOpen]);

  if (!items) return <Page title="Boîte de réception" />;
  const now = new Date();

  return (
    <Page title="Boîte de réception" subtitle={inboxCountLabel(items.length) ?? undefined}>
      <div className="max-w-[760px]">
        <CaptureField />
        {items.length === 0 ? (
          <div className="mt-6">
            <EmptyState icon={Inbox} title="Rien à trier.">
              Note ici ce qui te passe par la tête : tu le rangeras plus tard, en tâche, en idée de projet ou en
              événement.
            </EmptyState>
          </div>
        ) : (
          <div ref={list} className="mt-6">
            {items.map((item, index) => (
              <InboxRow
                key={item.id}
                item={item}
                now={now}
                today={today}
                onLeaving={() => {
                  leaving.current = { id: item.id, index };
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
