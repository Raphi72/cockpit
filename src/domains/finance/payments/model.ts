import { daysBetween, isISODate } from '@/core/dates';
import type { ClientChoice } from '@/domains/clients/model';
import type { PaletteKey } from '@/ui/data/ColorDot';

/** Encaissement : argent attendu d'un client (échéance), puis reçu. */
export type PaymentStatus = 'planned' | 'pending' | 'received';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  planned: 'Prévu',
  pending: 'En attente',
  received: 'Reçu',
};

/** Statuts saisissables : « Reçu » passe toujours par « Marquer reçu ». */
export type OpenPaymentStatus = Exclude<PaymentStatus, 'received'>;

export type Payment = {
  id: string;
  projectId: string | null;
  /** Client direct, seulement pour un encaissement sans projet. */
  clientId: string | null;
  label: string;
  amountCents: number;
  dueDate: string | null;
  status: PaymentStatus;
  receivedDate: string | null;
  invoiceRef: string | null;
  notes: string | null;
};

export type PaymentListItem = Payment & {
  projectName: string | null;
  projectColor: PaletteKey | null;
  /** Client du projet, ou client direct. */
  clientName: string | null;
  /** Transaction de revenu créée à la réception, s'il y en a une. */
  transactionId: string | null;
  transactionAccountName: string | null;
};

/** Ligne brute, pour réinsérer un encaissement supprimé (annulation). */
export type PaymentRow = Payment & { createdAt: string };

/** « En retard » n'est jamais stocké : non reçu et date prévue dépassée. */
export function isPaymentLate(payment: Pick<Payment, 'status' | 'dueDate'>, today: string): boolean {
  return payment.status !== 'received' && payment.dueDate !== null && daysBetween(today, payment.dueDate) < 0;
}

/** Pour qui : le projet, sinon le client. */
export function paymentContext(payment: Pick<PaymentListItem, 'projectName' | 'clientName'>): string | null {
  return payment.projectName ?? payment.clientName;
}

/**
 * Libellé de la transaction créée à la réception. Le projet y est déjà rattaché (et affiché) :
 * seul un encaissement sans projet porte le nom de son client, « Facture 12 · Studio Lumen ».
 */
export function incomeLabel(payment: Pick<PaymentListItem, 'label' | 'projectName' | 'clientName'>): string {
  if (payment.projectName || !payment.clientName) return payment.label;
  return `${payment.label} · ${payment.clientName}`;
}

// ─── Saisie ─────────────────────────────────────────────────────────────────

export type PaymentInput = {
  label: string;
  amountCents: number | null;
  dueDate: string | null;
  status: OpenPaymentStatus;
  /** Un encaissement est rattaché à un projet… */
  projectId: string | null;
  /** …ou, sans projet, directement à un client. */
  client: ClientChoice;
  invoiceRef: string | null;
  notes: string | null;
  /** Modification d'un encaissement déjà reçu uniquement. */
  receivedDate?: string | null;
};

export function validatePayment(input: PaymentInput): Partial<Record<keyof PaymentInput, string>> {
  const errors: Partial<Record<keyof PaymentInput, string>> = {};
  if (input.label.trim() === '') errors.label = 'Donne un libellé (acompte, solde, facture…).';
  if (input.amountCents === null || input.amountCents <= 0) errors.amountCents = 'Indique un montant.';
  if (input.dueDate && !isISODate(input.dueDate)) errors.dueDate = 'Date invalide.';
  if (input.receivedDate !== undefined && (!input.receivedDate || !isISODate(input.receivedDate))) {
    errors.receivedDate = 'Date de réception invalide.';
  }
  if (input.projectId === null && input.client.kind === 'new' && input.client.name.trim() === '') {
    errors.client = 'Nom du client vide.';
  }
  return errors;
}

/** Réception : date, et compte crédité si la transaction est créée (`null` sinon). */
export type ReceiveInput = { receivedDate: string; accountId: string | null };

export function validateReceive(input: ReceiveInput): Partial<Record<keyof ReceiveInput, string>> {
  return isISODate(input.receivedDate) ? {} : { receivedDate: 'Date de réception invalide.' };
}
