import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ColorDot, paletteKeys, type PaletteKey } from '@/ui/data/ColorDot';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/ui/overlays/Menu';
import { Button } from '@/ui/primitives/Button';
import { InlineText } from '@/ui/primitives/InlineFields';
import { Input } from '@/ui/primitives/Input';
import {
  useCreateProjectType,
  useDeleteProjectType,
  useProjectTypesWithUsage,
  useUpdateProjectType,
} from '../hooks';

const COLOR_NAMES: Record<PaletteKey, string> = {
  slate: 'Ardoise',
  blue: 'Bleu',
  violet: 'Violet',
  pink: 'Rose',
  red: 'Rouge',
  orange: 'Orange',
  amber: 'Ambre',
  green: 'Vert',
  teal: 'Turquoise',
};

/** Types de projet : renommer, recolorer, ajouter ; supprimer seulement s'ils ne servent pas. */
export function ProjectTypesEditor() {
  const { data: types = [] } = useProjectTypesWithUsage();
  const createType = useCreateProjectType();
  const updateType = useUpdateProjectType();
  const deleteType = useDeleteProjectType();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const add = () => {
    const name = newName.trim();
    if (!name) return setAdding(false);
    const color = paletteKeys[types.length % paletteKeys.length] ?? 'slate';
    const sortOrder = Math.max(0, ...types.map((t) => t.sortOrder)) + 1;
    createType.mutate({ name, color, sortOrder }, { onSuccess: () => setNewName('') });
  };

  return (
    <div>
      <ul>
        {types.map((type) => (
          <li key={type.id} className="group grid min-h-11 grid-cols-[28px_minmax(0,1fr)_auto_32px] items-center gap-2">
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Couleur de ${type.name}`}
                  className="grid size-7 place-items-center rounded-md hover:bg-hover"
                >
                  <ColorDot color={type.color} />
                </button>
              </MenuTrigger>
              <MenuContent>
                <MenuRadioGroup
                  value={type.color}
                  onValueChange={(color) => updateType.mutate({ id: type.id, color: color as PaletteKey })}
                >
                  {paletteKeys.map((key) => (
                    <MenuRadioItem key={key} value={key} leading={<ColorDot color={key} />}>
                      {COLOR_NAMES[key]}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
            <InlineText
              value={type.name}
              onSave={(name) => updateType.mutate({ id: type.id, name })}
              required
              aria-label={`Nom du type ${type.name}`}
            />
            <span className="tnum text-meta text-ink-3">
              {type.projectCount === 0 ? '' : `${type.projectCount} projet${type.projectCount > 1 ? 's' : ''}`}
            </span>
            {/* Un type utilisé par des projets ne peut pas être supprimé : pas de bouton. */}
            {type.projectCount === 0 ? (
              <Button
                variant="ghost"
                icon={Trash2}
                aria-label={`Supprimer le type ${type.name}`}
                title="Supprimer"
                onClick={() => deleteType.mutate(type)}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              />
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => !newName.trim() && setAdding(false)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
            placeholder="Nom du type (ex. Entrepreneuriat)"
            aria-label="Nom du nouveau type"
            className="max-w-xs"
          />
          <Button type="submit" variant="secondary">
            Ajouter
          </Button>
        </form>
      ) : (
        <Button variant="ghost" icon={Plus} className="mt-2 -ml-3" onClick={() => setAdding(true)}>
          Ajouter un type
        </Button>
      )}
    </div>
  );
}
