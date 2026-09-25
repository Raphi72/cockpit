import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import type { AgendaEvent, EventPatch, NewEventInput } from './model';
import {
  deleteEventStatement,
  getEvent,
  insertEventStatement,
  listAgenda,
  restoreEventStatement,
  updateEventStatement,
} from './repository';

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
