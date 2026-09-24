import { create } from 'zustand';

/** Encaissement ouvert par son identifiant, depuis le calendrier (fenêtre montée dans l'AppShell). */
type PaymentEditorState = {
  paymentId: string | null;
  openPayment: (id: string) => void;
  close: () => void;
};

export const usePaymentEditor = create<PaymentEditorState>()((set) => ({
  paymentId: null,
  openPayment: (id) => set({ paymentId: id }),
  close: () => set({ paymentId: null }),
}));
