/**
 * Aide des raccourcis (touche ?). Chaque entrée décrit un raccourci réellement branché :
 * ceux de partout dans shortcuts.ts, ceux des listes dans ui/data/row-keys.ts,
 * ceux du calendrier dans CalendarPage (usePageShortcuts).
 */
export type ShortcutEntry = {
  /** Une touche ou une combinaison par pastille ; plusieurs pastilles = plusieurs touches possibles. */
  keys: string[];
  label: string;
};

export type ShortcutSection = { title: string; entries: ShortcutEntry[] };

export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Partout',
    entries: [
      { keys: ['Ctrl K'], label: 'Rechercher ou lancer une commande' },
      { keys: ['N'], label: 'Nouvelle tâche' },
      { keys: ['C'], label: 'Nouveau…, puis T, E, P, L, R ou D' },
      { keys: ['Ctrl 1 … 6'], label: 'Aller aux pages principales' },
      { keys: ['Ctrl B'], label: 'Réduire ou déplier la barre latérale' },
      { keys: ['Ctrl Z'], label: 'Annuler la dernière action' },
      { keys: ['?'], label: 'Afficher cette aide' },
    ],
  },
  {
    title: 'Listes',
    entries: [
      { keys: ['↑', '↓'], label: 'Passer d’une ligne à l’autre' },
      { keys: ['Entrée'], label: 'Ouvrir' },
      { keys: ['Espace'], label: 'Cocher la tâche' },
      { keys: ['Suppr'], label: 'Supprimer' },
    ],
  },
  {
    title: 'Calendrier',
    entries: [
      { keys: ['←', '→'], label: 'Période précédente ou suivante' },
      { keys: ['T'], label: 'Revenir à aujourd’hui' },
      { keys: ['M', 'S', 'J'], label: 'Vue mois, semaine ou jour' },
    ],
  },
  {
    title: 'Fenêtres',
    entries: [
      { keys: ['Ctrl Entrée'], label: 'Enregistrer' },
      { keys: ['Échap'], label: 'Fermer' },
    ],
  },
];
