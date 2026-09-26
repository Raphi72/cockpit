import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import { normalizeClient, type ClientInput, type ClientListItem } from './model';
import { insertClientStatement, listClients, setClientArchivedStatement, updateClient } from './repository';
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

/**
 * Archiver un client qu'on ne suit plus : il sort de la liste et des formulaires, ses projets et ses
 * paiements restent. « Annuler » dans le toast ; « Réactiver » depuis sa fiche.
 */
export function useArchiveClient() {
  const invalidate = useInvalidateClients();
  const setArchived = (id: string, archivedAt: string | null) =>
    db.batch([setClientArchivedStatement(id, archivedAt, nowTimestamp())]).then(invalidate);
  return useMutation({
    mutationFn: ({ client, archived }: { client: ClientListItem; archived: boolean }) =>
      setArchived(client.id, archived ? nowTimestamp() : null),
    onSuccess: (_, { client, archived }) => {
      if (!archived) return toast(`Client « ${client.name} » réactivé.`);
      toast(`Client « ${client.name} » archivé.`, {
        action: { label: 'Annuler', undo: true, onClick: () => void setArchived(client.id, null) },
      });
    },
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
