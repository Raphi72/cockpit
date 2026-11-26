import type { LucideIcon } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export type SuggestionItem = { key: string; label: string; hint?: string; icon?: LucideIcon };

export type SuggestionListProps = {
  items: SuggestionItem[];
  /** Texte quand rien ne correspond. */
  empty: string;
  onSelect: (item: SuggestionItem) => void;
};

export type SuggestionListHandle = { onKeyDown: (event: KeyboardEvent) => boolean };

/** La petite liste qui suit le curseur (commande « / », lien « [[ ») : flèches, Entrée, clic. */
export const SuggestionList = forwardRef<SuggestionListHandle, SuggestionListProps>(function SuggestionList({ items, empty, onSelect }, ref) {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') {
        setSelected((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setSelected((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[selected];
        if (item) onSelect(item);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="max-h-80 min-w-[260px] overflow-y-auto rounded-lg bg-elevated p-1 text-body shadow-overlay">
      {items.length === 0 && <p className="px-2.5 py-2 text-meta text-ink-3">{empty}</p>}
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(item)}
            onMouseEnter={() => setSelected(index)}
            className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left ${index === selected ? 'bg-hover' : ''}`}
          >
            {Icon && <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.hint && <span className="shrink-0 text-meta text-ink-3">{item.hint}</span>}
          </button>
        );
      })}
    </div>
  );
});
