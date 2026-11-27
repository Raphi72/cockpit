type Tab<T extends string> = { value: T; label: string; count?: number; title?: string };

type SegmentedTabsProps<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedTabs<T extends string>({ tabs, value, onChange }: SegmentedTabsProps<T>) {
  return (
    // Sur le téléphone, les onglets qui ne tiennent pas défilent de côté (sans barre).
    <div role="tablist" className="flex gap-1 phone:-mx-5 phone:overflow-x-auto phone:px-5 phone:[scrollbar-width:none]">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            title={tab.title}
            onClick={() => onChange(tab.value)}
            className={
              'flex h-8 items-center gap-2 rounded-md px-3 transition-colors duration-[120ms] ease-soft phone:shrink-0 phone:whitespace-nowrap ' +
              (selected ? 'bg-active font-medium text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink')
            }
          >
            {tab.label}
            {tab.count !== undefined && <span className="tnum text-meta text-ink-3">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
