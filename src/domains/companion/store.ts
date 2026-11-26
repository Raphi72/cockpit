import { create } from 'zustand';

/** Les écrans du compagnon ouverts : l'écran du matin et le mode focus (état d'interface seulement). */
type CompanionState = {
  morningOpen: boolean;
  setMorningOpen: (open: boolean) => void;
  focusOpen: boolean;
  setFocusOpen: (open: boolean) => void;
};

export const useCompanion = create<CompanionState>()((set) => ({
  morningOpen: false,
  setMorningOpen: (open) => set({ morningOpen: open }),
  focusOpen: false,
  setFocusOpen: (open) => set({ focusOpen: open }),
}));
