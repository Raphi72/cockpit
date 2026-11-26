import { CalendarPlus, FolderPlus, Lightbulb, NotebookPen, SquareCheck } from 'lucide-react';
import { useRef } from 'react';
import { useProjects } from '@/domains/projects';
import { OPEN_STATUSES } from '@/domains/projects/model';
import { ColorDot } from '@/ui/data/ColorDot';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from '@/ui/overlays/Menu';

export type LineChoice =
  | { kind: 'task' | 'homework' | 'event' | 'project' }
  | { kind: 'idea'; projectId: string; projectName: string };

type LineMenuProps = {
  /** Où le menu s'ouvre (le point du clic droit) ; `null` : fermé. */
  at: { x: number; y: number } | null;
  /** Le projet de la page, proposé en premier pour une idée. */
  pageProjectId: string | null;
  onChoose: (choice: LineChoice) => void;
  /** Fermé sans rien choisir, ou après un choix : `chose` dit lequel. */
  onClose: (chose: LineChoice | null) => void;
};

/**
 * Ce qu'une ligne peut devenir : une tâche, un devoir, un événement, une idée de projet (les projets en
 * cours, celui de la page en premier) ou un projet. Dans le menu du clic droit et sous « En faire » de la
 * poignée ⠿.
 */
export function LineChoiceItems({ pageProjectId, onChoose }: { pageProjectId: string | null; onChoose: (choice: LineChoice) => void }) {
  const { data: projects = [] } = useProjects({ statuses: OPEN_STATUSES });
  const ordered = [...projects].sort((a, b) => Number(b.id === pageProjectId) - Number(a.id === pageProjectId));
  return (
    <>
      <MenuItem icon={SquareCheck} onSelect={() => onChoose({ kind: 'task' })}>
        Une tâche
      </MenuItem>
      <MenuItem icon={NotebookPen} onSelect={() => onChoose({ kind: 'homework' })}>
        Un devoir
      </MenuItem>
      <MenuItem icon={CalendarPlus} onSelect={() => onChoose({ kind: 'event' })}>
        Un événement
      </MenuItem>
      <MenuSeparator />
      <MenuSub>
        <MenuSubTrigger icon={Lightbulb}>Une idée de projet</MenuSubTrigger>
        <MenuSubContent className="max-h-80 overflow-y-auto">
          {ordered.length === 0 && <MenuItem disabled>Aucun projet en cours</MenuItem>}
          {ordered.map((project) => (
            <MenuItem
              key={project.id}
              leading={<ColorDot color={project.typeColor} />}
              onSelect={() => onChoose({ kind: 'idea', projectId: project.id, projectName: project.name })}
            >
              {project.name}
            </MenuItem>
          ))}
        </MenuSubContent>
      </MenuSub>
      <MenuItem icon={FolderPlus} onSelect={() => onChoose({ kind: 'project' })}>
        Un projet
      </MenuItem>
    </>
  );
}

/**
 * Le clic droit sur une ligne de page : en faire une tâche, un devoir, un événement, une idée de projet
 * ou un projet. Ce que faisait la boîte de réception, dans n'importe quelle page.
 */
export function LineMenu({ at, pageProjectId, onChoose, onClose }: LineMenuProps) {
  /** Le choix fait avant que le menu se referme (rien : Échap, ou un clic ailleurs). */
  const chosen = useRef<LineChoice | null>(null);
  const choose = (choice: LineChoice) => {
    chosen.current = choice;
    onChoose(choice);
  };

  return (
    <Menu
      open={at !== null}
      onOpenChange={(open) => {
        if (open) return;
        onClose(chosen.current);
        chosen.current = null;
      }}
    >
      <MenuTrigger asChild>
        {/* Rien à cliquer : le point d'ancrage du menu, là où on a fait le clic droit. */}
        <span aria-hidden tabIndex={-1} className="pointer-events-none fixed size-0" style={{ left: at?.x ?? 0, top: at?.y ?? 0 }} />
      </MenuTrigger>
      <MenuContent
        sideOffset={2}
        // Le focus ne revient pas au point d'ancrage : la page (ou la fenêtre de création) le reprend.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <MenuLabel>En faire</MenuLabel>
        <LineChoiceItems pageProjectId={pageProjectId} onChoose={choose} />
      </MenuContent>
    </Menu>
  );
}
