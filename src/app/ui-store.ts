import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * État d'interface uniquement (jamais de données métier ici).
 * Les composants lisent avec des sélecteurs fins : changer un champ ne re-rend que ses lecteurs.
 */
type UiState = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  newMenuOpen: boolean;
  setNewMenuOpen: (open: boolean) => void;
  /** Dernier type choisi à la création d'un projet, proposé par défaut la fois suivante. */
  lastProjectTypeId: string | null;
  setLastProjectTypeId: (id: string) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      newMenuOpen: false,
      setNewMenuOpen: (open) => set({ newMenuOpen: open }),
      lastProjectTypeId: null,
      setLastProjectTypeId: (id) => set({ lastProjectTypeId: id }),
    }),
    {
      name: 'cockpit-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        lastProjectTypeId: state.lastProjectTypeId,
      }),
    },
  ),
);
