import { create } from 'zustand';

/** Événement ouvert dans le panneau latéral (un seul à la fois, monté dans l'AppShell). */
type EventSheetState = {
  eventId: string | null;
  openEvent: (id: string) => void;
  close: () => void;
};

export const useEventSheet = create<EventSheetState>()((set) => ({
  eventId: null,
  openEvent: (id) => set({ eventId: id }),
  close: () => set({ eventId: null }),
}));
