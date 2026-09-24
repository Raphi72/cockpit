import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import {
  insertPaymentStatement,
  listOverduePayments,
  listProjectPayments,
  setPaymentReceived,
} from './repository';

export function useProjectPayments(projectId: string) {
  return useQuery({
    queryKey: queryKeys.payments.byProject(projectId),
    queryFn: () => listProjectPayments(db, projectId),
  });
}

export function useOverduePayments(today: string) {
  return useQuery({ queryKey: queryKeys.payments.overdue(today), queryFn: () => listOverduePayments(db, today) });
}

function useInvalidatePayments() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
  };
}

export function useSetPaymentReceived() {
  const onSuccess = useInvalidatePayments();
  return useMutation({
    mutationFn: ({ id, receivedDate }: { id: string; receivedDate: string | null }) =>
      setPaymentReceived(db, id, receivedDate, nowTimestamp()),
    onSuccess,
  });
}

export function useCreatePayment() {
  const onSuccess = useInvalidatePayments();
  return useMutation({
    mutationFn: (payment: { projectId: string; label: string; amountCents: number; dueDate: string | null }) =>
      db.batch([insertPaymentStatement({ id: newId(), ...payment }, nowTimestamp())]),
    onSuccess,
  });
}
