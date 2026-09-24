import { ColorDot } from '@/ui/data/ColorDot';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useProjects } from '../hooks';
import { OPEN_STATUSES } from '../model';

type ProjectMenuProps = {
  value: string | null;
  /** Nom du projet actuel, affiché même s'il est clos (il n'est alors plus proposé dans la liste). */
  currentName?: string | null;
  onChange: (id: string | null) => void;
  variant?: 'field' | 'inline';
};

/** Rattacher à un projet (tâche, encaissement, dépense) : les projets actifs, ou aucun. */
export function ProjectMenu({ value, currentName, onChange, variant }: ProjectMenuProps) {
  const { data: projects = [] } = useProjects({ statuses: OPEN_STATUSES });
  const selected = projects.find((p) => p.id === value);
  const label = selected?.name ?? (value ? currentName : null);

  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton variant={variant} aria-label="Projet">
          {label ? (
            <>
              {selected && <ColorDot color={selected.typeColor} />}
              <span className="truncate">{label}</span>
            </>
          ) : (
            <span className="text-ink-3">Sans projet</span>
          )}
        </PropertyButton>
      </MenuTrigger>
      <MenuContent className="max-h-80 overflow-y-auto">
        <MenuRadioGroup value={value ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
          <MenuRadioItem value="none">Sans projet</MenuRadioItem>
          {projects.length > 0 && <MenuSeparator />}
          {projects.map((project) => (
            <MenuRadioItem key={project.id} value={project.id} leading={<ColorDot color={project.typeColor} />}>
              {project.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
