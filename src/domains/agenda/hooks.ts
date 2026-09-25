import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { parseISO } from 'date-fns';
import { db, type Statement } from '@/core/db';
import { addDaysISO, formatLongDate, nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { invalidateMoney } from '@/domains/finance/hooks';
import { getProjectRow } from '@/domains/projects/repository';
import { toast } from '@/ui/overlays/toast';
import {
  isRetimed,
  movedAgendaItem,
  projectMoveProblem,
  type AgendaEvent,
  type AgendaItem,
  type EventPatch,
  type NewEventInput,
} from './model';
import {
  deleteEventStatement,
  getEvent,
  insertEventStatement,
  listAgenda,
  restoreEventStatement,
  updateEventStatement,
} from './repository';
import { buildRetimeEventBatch, buildShiftBatch } from './service';

// ─── Lectures ───────────────────────────────────────────────────────────────

/**
 * Toutes les dates de [from, to[ ; la période précédente reste affichée pendant le chargement.
 * `plainTasks` : avec les tâches ordinaires qui n'ont qu'un début (option du calendrier).
 */
export function useAgenda(range: { from: string; to: string }, options: { plainTasks?: boolean } = {}) {
  const plainTasks = options.plainTasks ?? false;
  return useQuery({
    queryKey: [...queryKeys.agenda.range(range.from, range.to), { plainTasks }],
    queryFn: () => listAgenda(db, range.from, range.to, { plainTasks }),
    placeholderData: keepPreviousData,
  });
}

export function useEvent(id: string | null) {
  return useQuery({
    queryKey: queryKeys.agenda.event(id ?? ''),
    queryFn: async () => (id ? ((await getEvent(db, id)) ?? null) : null),
    enabled: id !== null,
  });
}

// ─── Écritures ──────────────────────────────────────────────────────────────

function invalidateAgenda(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewEventInput) => {
      const id = newId();
      await db.batch([insertEventStatement(id, input, nowTimestamp())]);
      return id;
    },
    onSuccess: () => invalidateAgenda(queryClient),
  });
}

/** Édition sur place : le panneau est mis à jour immédiatement, puis relu depuis la base. */
export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EventPatch }) =>
      db.batch([updateEventStatement(id, patch, nowTimestamp())]),
    onMutate: async ({ id, patch }) => {
      const key = queryKeys.agenda.event(id);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<AgendaEvent | null>(key, (event) => (event ? { ...event, ...patch } : event));
    },
    onSettled: () => invalidateAgenda(queryClient),
  });
}

type MoveResult = { status: 'moved'; undo: Statement[] } | { status: 'refused'; message: string } | { status: 'unchanged' };

type MoveInput = {
  item: AgendaItem;
  /** Jours entre le jour où l'élément a été pris et celui où il est déposé. */
  days: number;
  /** Créneau de la grille horaire (un événement à heure fixe y prend cette heure). */
  time: string | null;
  /** Jour de dépôt, pour le message. */
  dropDay: string;
};

/**
 * Glisser un élément du calendrier sur un autre jour (ou un autre créneau) : sa date change là où
 * elle est stockée. Il s'affiche tout de suite à sa nouvelle place ; « Annuler » le remet.
 * Un début de projet ne passe pas après sa deadline, ni l'inverse.
 */
export function useMoveAgendaItem() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    invalidateAgenda(queryClient);
    // Les dates bougent aussi dans les listes de tâches, les projets et les montants attendus.
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    invalidateMoney(queryClient);
  };
  return useMutation({
    mutationFn: async ({ item, days, time }: MoveInput): Promise<MoveResult> => {
      const now = nowTimestamp();
      if (isRetimed(item, { day: '', time })) {
        const event = await getEvent(db, item.id);
        if (!event || (days === 0 && event.startsAt.slice(11, 16) === time)) return { status: 'unchanged' };
        const batch = buildRetimeEventBatch(event, addDaysISO(event.startsAt.slice(0, 10), days), time!, now);
        await db.batch(batch.statements);
        return { status: 'moved', undo: batch.undo };
      }
      if (days === 0) return { status: 'unchanged' };
      if (item.source === 'project') {
        const row = await getProjectRow(db, item.id);
        const problem = row && projectMoveProblem(row, item.kind as 'project_start' | 'project_deadline', days);
        if (problem) return { status: 'refused', message: problem };
      }
      const batch = buildShiftBatch(item, days, now);
      await db.batch(batch.statements);
      return { status: 'moved', undo: batch.undo };
    },
    onMutate: async ({ item, days, time }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.agenda.all });
      const moved = movedAgendaItem(item, days, isRetimed(item, { day: '', time }) ? time : null);
      queryClient.setQueriesData<AgendaItem[] | AgendaEvent | null>({ queryKey: queryKeys.agenda.all }, (data) =>
        Array.isArray(data) ? data.map((i) => (i.key === item.key ? moved : i)) : data,
      );
    },
    onSuccess: (result, { item, time, dropDay }) => {
      invalidate();
      if (result.status === 'refused') {
        toast(result.message, { tone: 'danger' });
        return;
      }
      if (result.status !== 'moved') return;
      const when = formatLongDate(parseISO(dropDay)).toLowerCase() + (isRetimed(item, { day: '', time }) ? ` à ${time}` : '');
      toast(`Déplacé au ${when}.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => void db.batch(result.undo).then(invalidate),
        },
      });
    },
    onError: invalidate,
  });
}

/** Suppression avec « Annuler » : l'événement est réinséré à l'identique. */
export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (event: AgendaEvent) => db.batch([deleteEventStatement(event.id)]),
    onSuccess: (_result, event) => {
      invalidateAgenda(queryClient);
      toast('Événement supprimé.', {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => {
            void db.batch([restoreEventStatement(event, nowTimestamp())]).then(() => invalidateAgenda(queryClient));
          },
        },
      });
    },
  });
}
