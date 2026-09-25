import { useRouterState } from '@tanstack/react-router';
import { CalendarClock, Check, Flag, Trash2, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { addDaysISO, nextMondayISO } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { PRIORITY_LABELS, type Priority } from '@/domains/projects/model';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/ui/overlays/Menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/overlays/Popover';
import { DateField } from '@/ui/primitives/DateField';
import { useBulkDeleteTasks, useBulkUpdateTasks } from '../hooks';
import type { TaskPatch } from '../model';
import { useTaskSelection } from '../selection-store';

const barButton =
  'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-ink-2 transition-colors duration-[120ms] ease-soft ' +
  'hover:bg-hover hover:text-ink data-[state=open]:bg-hover data-[state=open]:text-ink';

const choiceClass =
  'flex h-8 w-full items-center rounded-[6px] px-2 text-left outline-none hover:bg-hover focus-visible:bg-hover';

/** Début ou deadline pour toute la sélection : raccourcis, une date au choix, ou retirer la date. */
function DateChoice({ label, icon: Icon, onPick }: { label: string; icon: LucideIcon; onPick: (date: string | null) => void }) {
  const today = useToday();
  const [open, setOpen] = useState(false);
  const pick = (date: string | null) => {
    setOpen(false);
    onPick(date);
  };
  const choices = [
    { label: 'Aujourd’hui', date: today },
    { label: 'Demain', date: addDaysISO(today, 1) },
    { label: 'Lundi prochain', date: nextMondayISO(today) },
    { label: 'Dans une semaine', date: addDaysISO(today, 7) },
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={barButton}>
        <Icon className="size-4" strokeWidth={1.75} />
        {label}
      </PopoverTrigger>
      <PopoverContent side="top">
        {choices.map((choice) => (
          <button key={choice.label} type="button" onClick={() => pick(choice.date)} className={choiceClass}>
            {choice.label}
          </button>
        ))}
        <div className="my-1 h-px bg-line" />
        <div className="px-2 py-1.5">
          <DateField value={null} onChange={(date) => date && pick(date)} aria-label={`${label} : autre date`} className="w-full" />
        </div>
        <button type="button" onClick={() => pick(null)} className={`${choiceClass} text-ink-3`}>
          Retirer la date
        </button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Barre d'actions groupées, en bas de l'écran dès qu'une tâche est sélectionnée (Ctrl+clic, Maj+clic) :
 * même début, même deadline ou même priorité pour toutes, les terminer ou les supprimer.
 * Échap vide la sélection ; Suppr supprime les tâches sélectionnées. Chaque action a « Annuler ».
 */
export function SelectionBar() {
  const ids = useTaskSelection((state) => state.ids);
  const clear = useTaskSelection((state) => state.clear);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const bulkUpdate = useBulkUpdateTasks();
  const bulkDelete = useBulkDeleteTasks();
  const count = ids.length;

  // Changer de page vide la sélection : elle ne vaut que pour les lignes affichées.
  useEffect(() => clear(), [pathname, clear]);

  const apply = (patch: TaskPatch) => {
    bulkUpdate.mutate({ ids, patch });
    clear();
  };
  const remove = () => {
    bulkDelete.mutate(ids);
    clear();
  };

  useEffect(() => {
    if (count === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const busy =
        (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) ||
        document.querySelector('[role="dialog"], [role="menu"]');
      if (busy || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        clear();
      } else if (event.key === 'Delete') {
        event.preventDefault();
        event.stopPropagation();
        remove();
      }
    };
    // Phase de capture : passe avant le Suppr de la ligne qui a le focus.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  });

  if (count === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Actions sur les tâches sélectionnées"
      className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-elevated py-1.5 pr-1.5 pl-4 shadow-overlay animate-pop"
    >
      <span className="mr-2 font-medium tnum">
        {count} tâche{count > 1 ? 's' : ''}
      </span>
      <DateChoice label="Début" icon={CalendarClock} onPick={(scheduledDate) => apply({ scheduledDate })} />
      <DateChoice label="Deadline" icon={Flag} onPick={(dueDate) => apply({ dueDate })} />
      <Menu>
        <MenuTrigger className={barButton}>
          <span className="size-1.5 rounded-full bg-warning" />
          Priorité
        </MenuTrigger>
        <MenuContent side="top">
          {([3, 2, 1, 0] as Priority[]).map((priority) => (
            <MenuItem key={priority} onSelect={() => apply({ priority })}>
              {PRIORITY_LABELS[priority]}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <button type="button" onClick={() => apply({ status: 'done' })} className={barButton}>
        <Check className="size-4" strokeWidth={1.75} />
        Terminer
      </button>
      <button type="button" onClick={remove} className={`${barButton} hover:!text-danger`} title="Supprimer · Suppr">
        <Trash2 className="size-4" strokeWidth={1.75} />
        Supprimer
      </button>
      <span className="mx-1 h-5 w-px bg-line" />
      <button
        type="button"
        onClick={clear}
        aria-label="Vider la sélection"
        title="Vider la sélection · Échap"
        className="grid size-8 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
      >
        <X className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
