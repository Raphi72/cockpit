/**
 * Aide des raccourcis (touche ?). Chaque entrée décrit un raccourci réellement branché :
 * ceux de partout dans shortcuts.ts, ceux des listes dans ui/data/row-keys.ts,
 * ceux de la boîte de réception dans InboxPage (sur la ligne qui a le focus),
 * ceux du dashboard et du calendrier dans DashboardPage et CalendarPage (usePageShortcuts).
 */
export type ShortcutEntry = {
  /** Une touche ou une combinaison par pastille ; plusieurs pastilles = plusieurs touches possibles. */
  keys: string[];
  label: string;
};

export type ShortcutSection = { title: string; entries: ShortcutEntry[] };

/** Nombre de sections de la colonne de gauche (Partout, Fenêtres, Boîte de réception) ; les autres vont à droite. */
export const LEFT_COLUMN_SECTIONS = 3;

export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Partout',
    entries: [
      { keys: ['Ctrl K'], label: 'Rechercher ou lancer une commande' },
      { keys: ['N', 'Ctrl N'], label: 'Nouvelle tâche (un devoir en mode Cours)' },
      { keys: ['Ctrl Maj Espace'], label: 'Capture rapide, même hors de Cockpit (réglable)' },
      { keys: ['C'], label: 'Nouveau…, puis la lettre du menu (T, E, P… ; en Cours : D, X, N…)' },
      { keys: ['Ctrl 1 … 6'], label: 'Aller aux pages principales du mode' },
      { keys: ['Ctrl M'], label: 'Passer du mode Travail au mode Cours, et inversement' },
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
      { keys: ['Suppr'], label: 'Supprimer (panneau de tâche ou d’événement, fiche projet)' },
    ],
  },
  {
    title: 'Boîte de réception',
    entries: [
      { keys: ['T'], label: 'En faire une tâche' },
      { keys: ['I'], label: 'En faire une idée de projet' },
      { keys: ['E'], label: 'En faire un événement' },
      { keys: ['D'], label: 'En faire un devoir' },
      { keys: ['Entrée'], label: 'Reformuler' },
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
      { keys: ['Alt ↑', 'Alt ↓'], label: 'Déplacer la tâche (fiche projet)' },
      { keys: ['Alt →', 'Alt ←'], label: 'En faire une sous-tâche, ou l’en sortir' },
    ],
  },
  {
    title: 'Tableau de bord',
    entries: [
      { keys: ['←', '→'], label: 'Jour précédent ou suivant' },
      { keys: ['D'], label: 'Choisir un jour dans le calendrier' },
      { keys: ['T'], label: 'Revenir à aujourd’hui' },
      { keys: ['P'], label: 'Je veux travailler… (programme du jour)' },
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
    title: 'Pages',
    entries: [
      { keys: ['/'], label: 'Insérer un bloc (titre, liste, cases, tableau, image…)' },
      { keys: ['[['], label: 'Lien vers une page (ou une nouvelle)' },
      { keys: ['# ', '- ', '[ ] '], label: 'Titre, liste ou case, en tapant' },
      { keys: ['Ctrl Entrée'], label: 'Faire d’une case une vraie tâche' },
    ],
  },
  {
    title: 'Révision',
    entries: [
      { keys: ['Espace'], label: 'Voir la réponse' },
      { keys: ['1', '2', '3', '4'], label: 'À revoir, difficile, bien, facile' },
    ],
  },
  {
    title: 'Journée',
    entries: [
      { keys: ['←', '→'], label: 'Jour (ou semaine) précédent ou suivant' },
      { keys: ['T'], label: 'Revenir à aujourd’hui' },
      { keys: ['J', 'S'], label: 'Vue jour ou semaine' },
      { keys: ['D'], label: 'Choisir un jour dans le calendrier' },
    ],
  },
  {
    title: 'Planning',
    entries: [
      { keys: ['←', '→'], label: 'Période précédente ou suivante' },
      { keys: ['T'], label: 'Revenir à aujourd’hui' },
      { keys: ['M', 'R'], label: 'Zoom mois ou trimestre' },
      { keys: ['P'], label: 'Je veux travailler… (programme du jour)' },
    ],
  },
];
