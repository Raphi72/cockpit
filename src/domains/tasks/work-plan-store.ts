import { create } from 'zustand';

/** Fenêtre « Je veux travailler… » (une seule, montée dans l'AppShell). */
type WorkPlanDialogState = {
  open: boolean;
  openPlan: () => void;
  close: () => void;
};

export const useWorkPlanDialog = create<WorkPlanDialogState>()((set) => ({
  open: false,
  openPlan: () => set({ open: true }),
  close: () => set({ open: false }),
}));
