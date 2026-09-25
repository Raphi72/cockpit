/**
 * Aide des raccourcis (touche ?). Chaque entrée décrit un raccourci réellement branché :
 * ceux de partout dans shortcuts.ts, ceux des listes dans ui/data/row-keys.ts,
 * ceux du dashboard et du calendrier dans DashboardPage et CalendarPage (usePageShortcuts).
 */
export type ShortcutEntry = {
  /** Une touche ou une combinaison par pastille ; plusieurs pastilles = plusieurs touches possibles. */
  keys: string[];
  label: string;
};

export type ShortcutSection = { title: string; entries: ShortcutEntry[] };

/** Nombre de sections de la colonne de gauche (Partout, Fenêtres) ; les autres vont à droite. */
export const LEFT_COLUMN_SECTIONS = 2;

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
    title: 'Fenêtres',
    entries: [
      { keys: ['Ctrl Entrée'], label: 'Enregistrer' },
      { keys: ['Échap'], label: 'Fermer' },
    ],
  },
  {
    title: 'Listes',
    entries: [
      { keys: ['↑', '↓'], label: 'Passer d’une ligne à l’autre' },
      { keys: ['Entrée'], label: 'Ouvrir' },
      { keys: ['Espace'], label: 'Cocher la tâche' },
      { keys: ['Suppr'], label: 'Supprimer' },
      { keys: ['Ctrl clic', 'Maj clic'], label: 'Sélectionner plusieurs tâches' },
    ],
  },
  {
    title: 'Tableau de bord',
    entries: [
      { keys: ['←', '→'], label: 'Jour précédent ou suivant' },
      { keys: ['D'], label: 'Choisir un jour dans le calendrier' },
      { keys: ['T'], label: 'Revenir à aujourd’hui' },
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
];
