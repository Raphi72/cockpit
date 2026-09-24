import { create } from 'zustand';

/** Tâche ouverte dans le panneau latéral (un seul à la fois, monté dans l'AppShell). */
type TaskSheetState = {
  taskId: string | null;
  openTask: (id: string) => void;
  close: () => void;
};

export const useTaskSheet = create<TaskSheetState>()((set) => ({
  taskId: null,
  openTask: (id) => set({ taskId: id }),
  close: () => set({ taskId: null }),
}));
