import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { normalizeClient, type ClientInput } from './model';
import { deleteClient, insertClientStatement, listClients, updateClient } from './repository';

export function useClients() {
  return useQuery({ queryKey: queryKeys.clients.list, queryFn: () => listClients(db) });
}

function useInvalidateClients() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
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

export function useDeleteClient() {
  const onSuccess = useInvalidateClients();
  return useMutation({ mutationFn: (id: string) => deleteClient(db, id), onSuccess });
}
