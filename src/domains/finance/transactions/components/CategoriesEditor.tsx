import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { InlineText } from '@/ui/primitives/InlineFields';
import { Input } from '@/ui/primitives/Input';
import { useCategoriesWithUsage, useCreateCategory, useDeleteCategory, useRenameCategory } from '../hooks';
import type { CategoryKind, CategoryWithUsage } from '../model';

const KIND_TITLES: Record<CategoryKind, string> = { expense: 'Dépenses', income: 'Revenus' };

function CategoryList({ kind, categories }: { kind: CategoryKind; categories: CategoryWithUsage[] }) {
  const createCategory = useCreateCategory();
  const renameCategory = useRenameCategory();
  const deleteCategory = useDeleteCategory();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const add = () => {
    const name = newName.trim();
    if (!name) return setAdding(false);
    createCategory.mutate({ name, kind }, { onSuccess: () => setNewName('') });
  };

  return (
    <div className="min-w-0">
      <h3 className="mb-1 text-meta font-medium text-ink-2">{KIND_TITLES[kind]}</h3>
      <ul>
        {categories.map((category) => (
          <li key={category.id} className="group grid min-h-10 grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-2">
            <InlineText
              value={category.name}
              onSave={(name) => renameCategory.mutate({ id: category.id, name })}
              required
              aria-label={`Nom de la catégorie ${category.name}`}
            />
            <span className="tnum text-meta text-ink-3">
              {category.transactionCount === 0
                ? ''
                : `${category.transactionCount} transaction${category.transactionCount > 1 ? 's' : ''}`}
            </span>
            {/* Une catégorie utilisée ne se supprime pas : ses transactions perdraient leur classement. */}
            {category.transactionCount === 0 ? (
              <Button
                variant="ghost"
                icon={Trash2}
                aria-label={`Supprimer la catégorie ${category.name}`}
                title="Supprimer"
                onClick={() => deleteCategory.mutate(category.id)}
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
            placeholder="Nom de la catégorie"
            aria-label={`Nouvelle catégorie de ${KIND_TITLES[kind].toLowerCase()}`}
          />
          <Button type="submit" variant="secondary">
            Ajouter
          </Button>
        </form>
      ) : (
        <Button variant="ghost" icon={Plus} className="mt-1 -ml-3" onClick={() => setAdding(true)}>
          Ajouter
        </Button>
      )}
    </div>
  );
}

/** Catégories de transactions, éditables comme les types de projet. */
export function CategoriesEditor() {
  const { data: categories = [] } = useCategoriesWithUsage();
  return (
    <div className="grid grid-cols-2 gap-12">
      {(['expense', 'income'] as CategoryKind[]).map((kind) => (
        <CategoryList key={kind} kind={kind} categories={categories.filter((c) => c.kind === kind)} />
      ))}
    </div>
  );
}
