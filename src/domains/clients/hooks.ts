import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import { normalizeClient, type ClientInput } from './model';
import { insertClientStatement, listClients, updateClient } from './repository';
import { buildRestoreClientBatch, deleteClient } from './service';

export function useClients() {
  return useQuery({ queryKey: queryKeys.clients.list, queryFn: () => listClients(db) });
}

function useInvalidateClients() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    // Le nom d'un client titre ses encaissements sans projet (calendrier, page Finances).
    void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
  };
}

export function useCreateClient() {
  const onSuccess = useInvalidateClients();
  return useMutation({
    mutationFn: async (input: ClientInput) => {
      const id = newId();
      await db.batch([insertClientStatement(id, normalizeClient(input), nowTimestamp())]);
      return id;
    },
    onSuccess,
  });
}

export function useUpdateClient() {
  const onSuccess = useInvalidateClients();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClientInput }) =>
      updateClient(db, id, normalizeClient(input), nowTimestamp()),
    onSuccess,
  });
}

/** Suppression avec « Annuler » : le client revient, rattaché à ses projets et encaissements. */
export function useDeleteClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (id: string) => deleteClient(db, id),
    onSuccess: (snapshot) => {
      invalidate();
      if (!snapshot) return;
      toast(`Client « ${snapshot.client.name} » supprimé.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => void db.batch(buildRestoreClientBatch(snapshot, nowTimestamp())).then(invalidate),
        },
      });
    },
  });
}
