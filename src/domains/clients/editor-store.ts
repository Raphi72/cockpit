import { create } from 'zustand';

/** Client ouvert par son identifiant, depuis la recherche (fenêtre montée dans l'AppShell). */
type ClientEditorState = {
  clientId: string | null;
  openClient: (id: string) => void;
  close: () => void;
};

export const useClientEditor = create<ClientEditorState>()((set) => ({
  clientId: null,
  openClient: (id) => set({ clientId: id }),
  close: () => set({ clientId: null }),
}));
