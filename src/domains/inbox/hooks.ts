import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { batchContext } from '@/core/batch';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import type { NewEventInput } from '@/domains/agenda/model';
import type { NewTaskInput } from '@/domains/tasks/model';
import { toast } from '@/ui/overlays/toast';
import type { InboxItem } from './model';
import {
  deleteInboxItemStatement,
  insertInboxItemStatement,
  listInboxItems,
  restoreInboxItemStatement,
  updateInboxTextStatement,
} from './repository';
import {
  buildInboxToEventBatch,
  buildInboxToIdeaBatch,
  buildInboxToTaskBatch,
  buildUndoTriageBatch,
  type TriageResult,
} from './service';

// ─── Lectures ───────────────────────────────────────────────────────────────

export function useInboxItems() {
  return useQuery({ queryKey: queryKeys.inbox.list, queryFn: () => listInboxItems(db) });
}

/** Nombre de captures à trier (compteur de la barre latérale). */
export function useInboxCount(): number {
  const { data } = useQuery({
    queryKey: queryKeys.inbox.list,
    queryFn: () => listInboxItems(db),
    select: (items) => items.length,
  });
  return data ?? 0;
}

// ─── Écritures ──────────────────────────────────────────────────────────────

function invalidateInbox(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all });
}

/** Noter quelque chose dans la boîte de réception. */
export function useCaptureInbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => db.batch([insertInboxItemStatement({ id: newId(), text }, nowTimestamp())]),
    onSuccess: () => invalidateInbox(queryClient),
  });
}

export function useEditInboxText() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => db.batch([updateInboxTextStatement(id, text, nowTimestamp())]),
    onSuccess: () => invalidateInbox(queryClient),
  });
}

/** Suppression avec « Annuler » : la capture revient à sa place. */
export function useDeleteInboxItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: InboxItem) => db.batch([deleteInboxItemStatement(item.id)]),
    onSuccess: (_result, item) => {
      invalidateInbox(queryClient);
      toast('Capture supprimée.', {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => {
            void db.batch([restoreInboxItemStatement(item, nowTimestamp())]).then(() => invalidateInbox(queryClient));
          },
        },
      });
    },
  });
}

/** Un tri touche la boîte et ce que la capture devient : tâches (et progression, calendrier), idées ou agenda. */
function invalidateAfterTriage(queryClient: QueryClient, kind: TriageResult['kind']) {
  invalidateInbox(queryClient);
  const roots = {
    task: [queryKeys.tasks.all, queryKeys.projects.all, queryKeys.agenda.all],
    idea: [queryKeys.ideas.all],
    event: [queryKeys.agenda.all],
  }[kind];
  for (const queryKey of roots) void queryClient.invalidateQueries({ queryKey });
}

/** Toast d'un tri réussi ; « Annuler » retire ce qui a été créé et remet la capture dans la boîte. */
function announceTriage(queryClient: QueryClient, message: string, item: InboxItem, created: TriageResult) {
  invalidateAfterTriage(queryClient, created.kind);
  toast(message, {
    action: {
      label: 'Annuler',
      undo: true,
      onClick: () => {
        void db
          .batch(buildUndoTriageBatch(item, created, nowTimestamp()))
          .then(() => invalidateAfterTriage(queryClient, created.kind));
      },
    },
  });
}

/** La capture devient une tâche (fenêtre « Nouvelle tâche », pré-remplie avec son texte). */
export function useInboxToTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, input }: { item: InboxItem; input: NewTaskInput }) => {
      const ctx = batchContext();
      const { taskId, statements } = buildInboxToTaskBatch(item, input, ctx);
      await db.batch(statements);
      return { taskId, today: ctx.today };
    },
    onSuccess: ({ taskId, today }, { item, input }) => {
      const message = input.scheduledDate === today ? 'Tâche ajoutée à aujourd’hui.' : 'Tâche ajoutée.';
      announceTriage(queryClient, message, item, { kind: 'task', id: taskId });
    },
  });
}

/** La capture devient une idée du projet choisi. */
export function useInboxToIdea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, projectId }: { item: InboxItem; projectId: string; projectName: string }) => {
      const { ideaId, statements } = buildInboxToIdeaBatch(item, projectId, batchContext());
      await db.batch(statements);
      return ideaId;
    },
    onSuccess: (ideaId, { item, projectName }) => {
      announceTriage(queryClient, `Idée ajoutée à ${projectName}.`, item, { kind: 'idea', id: ideaId });
    },
  });
}

/** La capture devient un événement (fenêtre « Nouvel événement », pré-remplie avec son texte). */
export function useInboxToEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, input }: { item: InboxItem; input: NewEventInput }) => {
      const { eventId, statements } = buildInboxToEventBatch(item, input, batchContext());
      await db.batch(statements);
      return eventId;
    },
    onSuccess: (eventId, { item }) => {
      announceTriage(queryClient, 'Événement ajouté.', item, { kind: 'event', id: eventId });
    },
  });
}
