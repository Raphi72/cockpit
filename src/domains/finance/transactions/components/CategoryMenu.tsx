import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useCategories } from '../hooks';
import type { CategoryKind } from '../model';

type CategoryMenuProps = {
  kind: CategoryKind;
  value: string | null;
  onChange: (id: string | null) => void;
};

/** Catégorie d'un revenu ou d'une dépense (seules celles du bon type sont proposées). */
export function CategoryMenu({ kind, value, onChange }: CategoryMenuProps) {
  const { data: categories = [] } = useCategories();
  const options = categories.filter((c) => c.kind === kind);
  const selected = options.find((c) => c.id === value);

  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton variant="field" aria-label="Catégorie">
          {selected ? <span className="truncate">{selected.name}</span> : <span className="text-ink-3">Sans catégorie</span>}
        </PropertyButton>
      </MenuTrigger>
      <MenuContent className="max-h-80 overflow-y-auto">
        <MenuRadioGroup value={value ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
          <MenuRadioItem value="none">Sans catégorie</MenuRadioItem>
          {options.length > 0 && <MenuSeparator />}
          {options.map((category) => (
            <MenuRadioItem key={category.id} value={category.id}>
              {category.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
