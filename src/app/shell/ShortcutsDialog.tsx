import { Dialog } from '@/ui/overlays/Dialog';
import { Kbd } from '@/ui/primitives/Kbd';
import { LEFT_COLUMN_SECTIONS, SHORTCUT_SECTIONS, type ShortcutSection } from '../shortcut-list';
import { useUiStore } from '../ui-store';

function Section({ section }: { section: ShortcutSection }) {
  return (
    <section>
      <h3 className="mb-1 text-meta font-medium text-ink-3">{section.title}</h3>
      <ul>
        {section.entries.map((entry) => (
          <li key={entry.label} className="flex min-h-8 items-center justify-between gap-4">
            <span className="text-ink-2">{entry.label}</span>
            <span className="flex shrink-0 gap-1">
              {entry.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Aide des raccourcis, ouverte par la touche ? ou depuis la palette. */
export function ShortcutsDialog() {
  const open = useUiStore((state) => state.shortcutsOpen);
  const setOpen = useUiStore((state) => state.setShortcutsOpen);
  const columns = [SHORTCUT_SECTIONS.slice(0, LEFT_COLUMN_SECTIONS), SHORTCUT_SECTIONS.slice(LEFT_COLUMN_SECTIONS)];

  return (
    <Dialog open={open} onOpenChange={setOpen} title="Raccourcis clavier" width={760}>
      <div className="mt-6 grid grid-cols-2 gap-x-12">
        {columns.map((sections, index) => (
          <div key={index} className="flex flex-col gap-6">
            {sections.map((section) => (
              <Section key={section.title} section={section} />
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
