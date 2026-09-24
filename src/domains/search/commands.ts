import {
  ArrowRightLeft,
  CalendarPlus,
  CircleCheck,
  FolderClosed,
  HandCoins,
  HardDriveDownload,
  Keyboard,
  PanelLeft,
  SquareCheck,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { CreateKind } from '@/app/create-store';
import { mainNav, secondaryNav, type AppPath } from '@/app/navigation';
import { matchesAllTerms } from './model';

export type PaletteAction =
  | { type: 'create'; kind: CreateKind }
  | { type: 'go'; to: AppPath }
  | { type: 'receive' }
  | { type: 'shortcuts' }
  | { type: 'sidebar' }
  | { type: 'backup' };

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

const CREATE_COMMANDS: PaletteCommand[] = [
  { kind: 'task', label: 'Nouvelle tâche', icon: SquareCheck, shortcut: 'N', suggested: true },
  { kind: 'event', label: 'Nouvel événement', icon: CalendarPlus, keywords: 'rendez-vous réunion', suggested: true },
  { kind: 'project', label: 'Nouveau projet', icon: FolderClosed, suggested: true },
  { kind: 'client', label: 'Nouveau client', icon: User, keywords: 'organisation' },
  { kind: 'payment', label: 'Nouvel encaissement', icon: HandCoins, keywords: 'paiement facture argent' },
  { kind: 'transaction', label: 'Nouvelle transaction', icon: ArrowRightLeft, keywords: 'dépense revenu virement' },
].map(({ kind, ...command }) => ({
  ...command,
  id: `create-${kind}`,
  group: 'create' as const,
  keywords: `créer ajouter ${command.keywords ?? ''}`,
  action: { type: 'create' as const, kind: kind as CreateKind },
}));

const GO_COMMANDS: PaletteCommand[] = [...mainNav, ...secondaryNav].map((item) => ({
  id: `go-${item.to}`,
  group: 'go',
  label: item.label,
  keywords: 'aller ouvrir page',
  icon: item.icon,
  shortcut: item.shortcut ? `Ctrl ${item.shortcut}` : undefined,
  action: { type: 'go', to: item.to },
  suggested: true,
}));

/**
 * Toutes les commandes de la palette. Certaines dépendent du contexte :
 * la sauvegarde n'existe que dans l'application desktop, la barre latérale se réduit ou se déplie.
 */
export function paletteCommands(context: { desktop: boolean; sidebarCollapsed: boolean }): PaletteCommand[] {
  const actions: PaletteCommand[] = [
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
  }
  return [...CREATE_COMMANDS, ...actions, ...GO_COMMANDS];
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
