import { ColorDot } from '@/ui/data/ColorDot';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/ui/overlays/Menu';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useSubjects } from '../hooks';

type SubjectMenuProps = {
  value: string | null;
  onChange: (id: string) => void;
  variant?: 'field' | 'inline';
  /** Texte tant qu'aucune matière n'est choisie. */
  placeholder?: string;
};

/** Choisir la matière d'un devoir, d'un cours, d'un examen ou d'une note. */
export function SubjectMenu({ value, onChange, variant, placeholder = 'Choisir une matière' }: SubjectMenuProps) {
  const { data: subjects = [] } = useSubjects();
  const selected = subjects.find((s) => s.id === value);

  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton variant={variant} aria-label="Matière">
          {selected ? (
            <>
              <ColorDot color={selected.color} />
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-ink-3">{subjects.length === 0 ? 'Aucune matière pour l’instant' : placeholder}</span>
          )}
        </PropertyButton>
      </MenuTrigger>
      <MenuContent className="max-h-80 overflow-y-auto">
        {subjects.length === 0 ? (
          <p className="px-2.5 py-2 text-meta text-ink-3">Ajoute d’abord une matière (page Matières).</p>
        ) : (
          <MenuRadioGroup value={value ?? ''} onValueChange={onChange}>
            {subjects.map((subject) => (
              <MenuRadioItem key={subject.id} value={subject.id} leading={<ColorDot color={subject.color} />}>
                {subject.name}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        )}
      </MenuContent>
    </Menu>
  );
}
