import { useMutation, useQuery } from '@tanstack/react-query';
import { batchContext } from '@/core/batch';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { formatMoney } from '@/core/money';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import { useInvalidateMoney } from '../hooks';
import type { OpenPaymentStatus, PaymentInput, PaymentListItem, ReceiveInput } from './model';
import { getPayment, listOpenPayments, listOverduePayments, listProjectPayments, listReceivedPayments } from './repository';
import {
  buildCreatePaymentBatch,
  buildDeletePaymentBatch,
  buildReceivePaymentBatch,
  buildRestorePaymentBatch,
  buildRestoreReceptionBatch,
  buildUnreceivePaymentBatch,
  buildUpdatePaymentBatch,
  snapshotPayment,
} from './service';

// ─── Lectures ───────────────────────────────────────────────────────────────

export function useProjectPayments(projectId: string) {
  return useQuery({
    queryKey: queryKeys.payments.byProject(projectId),
    queryFn: () => listProjectPayments(db, projectId),
  });
}

export function useOverduePayments(today: string) {
  return useQuery({ queryKey: queryKeys.payments.overdue(today), queryFn: () => listOverduePayments(db, today) });
}

export function useOpenPayments() {
  return useQuery({ queryKey: queryKeys.payments.open, queryFn: () => listOpenPayments(db) });
}

export function useReceivedPayments() {
  return useQuery({ queryKey: queryKeys.payments.received, queryFn: () => listReceivedPayments(db) });
}

export function usePayment(id: string | null) {
  return useQuery({
    queryKey: queryKeys.payments.detail(id ?? ''),
    queryFn: async () => (id ? ((await getPayment(db, id)) ?? null) : null),
    enabled: id !== null,
  });
}

// ─── Écritures ──────────────────────────────────────────────────────────────

export function useCreatePayment() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (input: PaymentInput) => db.batch(buildCreatePaymentBatch(input, batchContext()).statements),
    onSuccess: invalidate,
  });
}

export function useUpdatePayment() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ existing, input }: { existing: PaymentListItem; input: PaymentInput }) =>
      db.batch(buildUpdatePaymentBatch(existing, input, batchContext())),
    onSuccess: invalidate,
  });
}

/** Suppression avec « Annuler » : l'encaissement et son éventuelle transaction reviennent à l'identique. */
export function useDeletePayment() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (payment: PaymentListItem) => {
      const snapshot = await snapshotPayment(db, payment.id);
      await db.batch(buildDeletePaymentBatch(payment.id));
      return snapshot;
    },
    onSuccess: (snapshot) => {
      invalidate();
      toast('Encaissement supprimé.', {
        action: snapshot
          ? {
              label: 'Annuler',
              onClick: () => void db.batch(buildRestorePaymentBatch(snapshot, nowTimestamp())).then(invalidate),
            }
          : undefined,
      });
    },
  });
}

/** « Marquer reçu » (P4) : réception et transaction liée dans le même lot, annulable. */
export function useReceivePayment() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ payment, input }: { payment: PaymentListItem; input: ReceiveInput; accountName: string | null }) =>
      db.batch(buildReceivePaymentBatch(payment, input, batchContext()).statements),
    onSuccess: (_result, { payment, accountName }) => {
      invalidate();
      const previous: OpenPaymentStatus = payment.status === 'pending' ? 'pending' : 'planned';
      toast(
        accountName
          ? `Reçu : ${formatMoney(payment.amountCents)} sur ${accountName}.`
          : `${payment.label} marqué comme reçu.`,
        {
          action: {
            label: 'Annuler',
            onClick: () => void db.batch(buildUnreceivePaymentBatch(payment.id, batchContext(), previous)).then(invalidate),
          },
        },
      );
    },
  });
}

/** Annuler la réception supprime la transaction liée ; « Annuler » dans le toast remet les deux. */
export function useUnreceivePayment() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (payment: PaymentListItem) => {
      const snapshot = await snapshotPayment(db, payment.id);
      await db.batch(buildUnreceivePaymentBatch(payment.id, batchContext()));
      return snapshot;
    },
    onSuccess: (snapshot) => {
      invalidate();
      toast('Réception annulée.', {
        action: snapshot
          ? {
              label: 'Annuler',
              onClick: () => void db.batch(buildRestoreReceptionBatch(snapshot, nowTimestamp())).then(invalidate),
            }
          : undefined,
      });
    },
  });
}
