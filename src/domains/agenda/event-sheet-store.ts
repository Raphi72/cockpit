import { create } from 'zustand';

/** Événement ouvert dans le panneau latéral (un seul à la fois, monté dans l'AppShell). */
type EventSheetState = {
  eventId: string | null;
  /** Événement qui se répète : le jour (prévu par la règle) de l'occurrence sur laquelle on a cliqué. */
  occurrence: string | null;
  openEvent: (id: string, occurrence?: string | null) => void;
  /** La série a changé sous l'occurrence ouverte : son nouveau jour, ou `null` si elle n'existe plus. */
  setOccurrence: (occurrence: string | null) => void;
  close: () => void;
};

export const useEventSheet = create<EventSheetState>()((set) => ({
  eventId: null,
  occurrence: null,
  openEvent: (id, occurrence = null) => set({ eventId: id, occurrence }),
  setOccurrence: (occurrence) => set({ occurrence }),
  close: () => set({ eventId: null, occurrence: null }),
}));
