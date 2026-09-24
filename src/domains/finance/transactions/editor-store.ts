import { create } from 'zustand';

/** Transaction ouverte par son identifiant, depuis la recherche (fenêtre montée dans l'AppShell). */
type TransactionEditorState = {
  transactionId: string | null;
  openTransaction: (id: string) => void;
  close: () => void;
};

export const useTransactionEditor = create<TransactionEditorState>()((set) => ({
  transactionId: null,
  openTransaction: (id) => set({ transactionId: id }),
  close: () => set({ transactionId: null }),
}));
