import {
  ArrowRightLeft,
  Award,
  CalendarPlus,
  CircleCheck,
  Dumbbell,
  Focus,
  PictureInPicture2,
  FileCheck,
  FileText,
  FolderClosed,
  HandCoins,
  HardDriveDownload,
  NotebookPen,
  Keyboard,
  PanelLeft,
  Power,
  SquareCheck,
  Timer,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { CreateKind } from '@/app/create-store';
import { MODE_ICONS, MODE_LABELS, MODE_SHORTCUT, otherMode, type AppMode } from '@/app/modes';
import { NAV, NAV_ROW, allNavItems, type AppPath } from '@/app/navigation';
import { matchesAllTerms } from './model';

export type PaletteAction =
  | { type: 'create'; kind: CreateKind }
  | { type: 'go'; to: AppPath }
  | { type: 'receive' }
  | { type: 'work-plan' }
  | { type: 'workout' }
  | { type: 'focus' }
  | { type: 'now-window' }
  | { type: 'shortcuts' }
  | { type: 'sidebar' }
  | { type: 'mode' }
  | { type: 'backup' }
  | { type: 'quit' };

export type CommandGroup = 'create' | 'action' | 'go';

export const COMMAND_GROUP_LABELS: Record<CommandGroup, string> = {
  create: 'Créer',
  action: 'Actions',
  go: 'Aller à',
};

export type PaletteCommand = {
  id: string;
  group: CommandGroup;
  label: string;
  /** Autres mots qui la trouvent (synonymes). */
  keywords?: string;
  icon: LucideIcon;
  shortcut?: string;
  action: PaletteAction;
  /** Montrée avant toute saisie ; les autres n'apparaissent qu'en tapant. */
  suggested?: boolean;
};

type CreateCommand = Omit<PaletteCommand, 'id' | 'group' | 'action' | 'suggested'> & {
  kind: CreateKind;
  /** Mode où elle est suggérée d'emblée ; `both` : les deux. Toutes se trouvent en tapant. */
  suggestedIn?: AppMode | 'both';
};

const CREATE: CreateCommand[] = [
  { kind: 'task', label: 'Nouvelle tâche', icon: SquareCheck, shortcut: 'N', suggestedIn: 'work' },
  { kind: 'page', label: 'Nouvelle page', icon: FileText, keywords: 'note document notion fiche', suggestedIn: 'both' },
  { kind: 'event', label: 'Nouvel événement', icon: CalendarPlus, keywords: 'rendez-vous réunion', suggestedIn: 'both' },
  { kind: 'project', label: 'Nouveau projet', icon: FolderClosed, suggestedIn: 'work' },
  { kind: 'client', label: 'Nouveau client', icon: User, keywords: 'organisation' },
  { kind: 'payment', label: 'Nouvel encaissement', icon: HandCoins, keywords: 'paiement facture argent' },
  { kind: 'transaction', label: 'Nouvelle transaction', icon: ArrowRightLeft, keywords: 'dépense revenu virement' },
  { kind: 'homework', label: 'Nouveau devoir', icon: NotebookPen, keywords: 'exercice rendre cours école', suggestedIn: 'school' },
  { kind: 'exam', label: 'Nouvel examen', icon: FileCheck, keywords: 'contrôle partiel oral interro', suggestedIn: 'school' },
  { kind: 'grade', label: 'Nouvelle note', icon: Award, keywords: 'résultat moyenne bulletin', suggestedIn: 'school' },
];

function createCommands(mode: AppMode): PaletteCommand[] {
  return CREATE.map(({ kind, suggestedIn, ...command }) => ({
    ...command,
    id: `create-${kind}`,
    group: 'create' as const,
    keywords: `créer ajouter ${command.keywords ?? ''}`,
    action: { type: 'create' as const, kind },
    suggested: suggestedIn === 'both' || suggestedIn === mode,
  }));
}

/**
 * Les pages des deux modes : ouvrir une page de l'autre mode y fait passer (useModeFollowsPage).
 * Seules celles du mode en cours sont suggérées avant toute saisie.
 */
function goCommands(mode: AppMode): PaletteCommand[] {
  const current = new Set([...NAV[mode].main, ...NAV_ROW, ...NAV[mode].secondary].map((item) => item.to));
  return allNavItems().map((item) => ({
    id: `go-${item.to}`,
    group: 'go',
    label: item.label,
    keywords: 'aller ouvrir page',
    icon: item.icon,
    shortcut: item.shortcut && current.has(item.to) ? `Ctrl ${item.shortcut}` : undefined,
    action: { type: 'go', to: item.to },
    suggested: current.has(item.to),
  }));
}

/**
 * Toutes les commandes de la palette. Certaines dépendent du contexte :
 * la sauvegarde n'existe que dans l'application desktop, la barre latérale se réduit ou se déplie,
 * le changement de mode mène à l'autre mode.
 */
export function paletteCommands(context: { desktop: boolean; sidebarCollapsed: boolean; mode: AppMode }): PaletteCommand[] {
  const next = otherMode(context.mode);
  const actions: PaletteCommand[] = [
    {
      id: 'mode',
      group: 'action',
      label: `Passer en mode ${MODE_LABELS[next]}`,
      keywords: 'mode travail cours école études basculer changer',
      icon: MODE_ICONS[next],
      shortcut: MODE_SHORTCUT,
      action: { type: 'mode' },
      suggested: true,
    },
    {
      id: 'receive',
      group: 'action',
      label: 'Marquer un encaissement reçu…',
      keywords: 'paiement payé argent reçu',
      icon: CircleCheck,
      action: { type: 'receive' },
      suggested: true,
    },
    {
      id: 'work-plan',
      group: 'action',
      label: 'Je veux travailler…',
      keywords: 'programme planifier journée temps durée heures tâches',
      icon: Timer,
      action: { type: 'work-plan' },
      suggested: true,
    },
    {
      id: 'focus',
      group: 'action',
      label: 'Mode focus',
      keywords: 'concentration plein écran minuteur pomodoro bloc en cours',
      icon: Focus,
      shortcut: 'F',
      action: { type: 'focus' },
      suggested: true,
    },
    {
      id: 'now-window',
      group: 'action',
      label: 'Mini-fenêtre « En ce moment »',
      keywords: 'toujours au-dessus bloc en cours temps restant petite fenêtre',
      icon: PictureInPicture2,
      shortcut: 'Ctrl Maj E',
      action: { type: 'now-window' },
    },
    {
      id: 'workout',
      group: 'action',
      label: 'Noter une séance de sport…',
      keywords: 'sport muscu cardio course entraînement séance carnet',
      icon: Dumbbell,
      action: { type: 'workout' },
    },
    {
      id: 'shortcuts',
      group: 'action',
      label: 'Afficher les raccourcis',
      keywords: 'clavier aide touches',
      icon: Keyboard,
      shortcut: '?',
      action: { type: 'shortcuts' },
    },
    {
      id: 'sidebar',
      group: 'action',
      label: context.sidebarCollapsed ? 'Déplier la barre latérale' : 'Réduire la barre latérale',
      keywords: 'menu navigation',
      icon: PanelLeft,
      shortcut: 'Ctrl B',
      action: { type: 'sidebar' },
    },
  ];
  if (context.desktop) {
    actions.push({
      id: 'backup',
      group: 'action',
      label: 'Sauvegarder maintenant…',
      keywords: 'données copie base',
      icon: HardDriveDownload,
      action: { type: 'backup' },
    });
    // Fermer la fenêtre garde Cockpit dans la zone de notification : ceci le quitte pour de bon.
    actions.push({
      id: 'quit',
      group: 'action',
      label: 'Quitter Cockpit',
      keywords: 'fermer arrêter sortir zone de notification',
      icon: Power,
      action: { type: 'quit' },
    });
  }
  return [...createCommands(context.mode), ...actions, ...goCommands(context.mode)];
}

/** Sans saisie : les suggestions. En tapant : les commandes dont le libellé ou les synonymes contiennent chaque mot. */
export function filterCommands(commands: PaletteCommand[], query: string, limit = 5): PaletteCommand[] {
  if (query.trim() === '') return commands.filter((command) => command.suggested);
  return commands
    .filter((command) =>
      matchesAllTerms(`${command.label} ${command.keywords ?? ''} ${COMMAND_GROUP_LABELS[command.group]}`, query),
    )
    .slice(0, limit);
}
