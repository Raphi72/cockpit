import { daysBetween } from '@/core/dates';

/** Encaissement : argent attendu d'un client (échéance), puis reçu. */
export type PaymentStatus = 'planned' | 'pending' | 'received';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  planned: 'Prévu',
  pending: 'En attente',
  received: 'Reçu',
};

export type Payment = {
  id: string;
  projectId: string | null;
  label: string;
  amountCents: number;
  dueDate: string | null;
  status: PaymentStatus;
  receivedDate: string | null;
  invoiceRef: string | null;
};

export type OverduePayment = Payment & { projectName: string | null; clientName: string | null };

/** « En retard » n'est jamais stocké : non reçu et date prévue dépassée. */
export function isPaymentLate(payment: Pick<Payment, 'status' | 'dueDate'>, today: string): boolean {
  return payment.status !== 'received' && payment.dueDate !== null && daysBetween(today, payment.dueDate) < 0;
}
