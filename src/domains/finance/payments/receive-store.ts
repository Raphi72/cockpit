import { create } from 'zustand';
import type { PaymentListItem } from './model';

/** Encaissement en cours de réception (petit dialogue « Marquer reçu », monté dans l'AppShell). */
type ReceiveState = {
  payment: PaymentListItem | null;
  openReceive: (payment: PaymentListItem) => void;
  close: () => void;
};

export const useReceiveDialog = create<ReceiveState>()((set) => ({
  payment: null,
  openReceive: (payment) => set({ payment }),
  close: () => set({ payment: null }),
}));
