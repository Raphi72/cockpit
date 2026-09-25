import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AgendaSource, CalendarView } from '@/domains/agenda/model';
import type { PlanningZoom } from '@/domains/agenda/timeline/model';

/**
 * État d'interface uniquement (jamais de données métier ici).
 * Les composants lisent avec des sélecteurs fins : changer un champ ne re-rend que ses lecteurs.
 */
type UiState = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  newMenuOpen: boolean;
  setNewMenuOpen: (open: boolean) => void;
  /** Palette Ctrl+K : recherche et commandes. */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** Aide des raccourcis (touche ?). */
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  /** Dernier type choisi à la création d'un projet, proposé par défaut la fois suivante. */
  lastProjectTypeId: string | null;
  setLastProjectTypeId: (id: string) => void;
  /** Affichage des tâches d'un projet : liste (par défaut) ou kanban. */
  projectTasksMode: 'list' | 'board';
  setProjectTasksMode: (mode: 'list' | 'board') => void;
  /** Dernier compte choisi pour une transaction, proposé par défaut la fois suivante. */
  lastAccountId: string | null;
  setLastAccountId: (id: string) => void;
  /** Vue du calendrier, retrouvée à la visite suivante. */
  calendarView: CalendarView;
  setCalendarView: (view: CalendarView) => void;
  /** Sources masquées par les filtres du calendrier. */
  calendarHidden: AgendaSource[];
  toggleCalendarSource: (source: AgendaSource) => void;
  /** Calendrier : montrer aussi les tâches ordinaires, qui n'ont qu'un début (désactivé par défaut). */
  calendarPlainTasks: boolean;
  toggleCalendarPlainTasks: () => void;
  /** Zoom du planning (mois ou trimestre), retrouvé à la visite suivante. */
  planningZoom: PlanningZoom;
  setPlanningZoom: (zoom: PlanningZoom) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      newMenuOpen: false,
      setNewMenuOpen: (open) => set({ newMenuOpen: open }),
      paletteOpen: false,
      setPaletteOpen: (open) => set({ paletteOpen: open }),
      shortcutsOpen: false,
      setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
      lastProjectTypeId: null,
      setLastProjectTypeId: (id) => set({ lastProjectTypeId: id }),
      projectTasksMode: 'list',
      setProjectTasksMode: (mode) => set({ projectTasksMode: mode }),
      lastAccountId: null,
      setLastAccountId: (id) => set({ lastAccountId: id }),
      calendarView: 'month',
      setCalendarView: (view) => set({ calendarView: view }),
      calendarHidden: [],
      toggleCalendarSource: (source) =>
        set((state) => ({
          calendarHidden: state.calendarHidden.includes(source)
            ? state.calendarHidden.filter((s) => s !== source)
            : [...state.calendarHidden, source],
        })),
      calendarPlainTasks: false,
      toggleCalendarPlainTasks: () => set((state) => ({ calendarPlainTasks: !state.calendarPlainTasks })),
      planningZoom: 'month',
      setPlanningZoom: (zoom) => set({ planningZoom: zoom }),
    }),
    {
      name: 'cockpit-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        lastProjectTypeId: state.lastProjectTypeId,
        projectTasksMode: state.projectTasksMode,
        lastAccountId: state.lastAccountId,
        calendarView: state.calendarView,
        calendarHidden: state.calendarHidden,
        calendarPlainTasks: state.calendarPlainTasks,
        planningZoom: state.planningZoom,
      }),
    },
  ),
);
