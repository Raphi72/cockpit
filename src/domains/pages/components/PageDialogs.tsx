import { useState } from 'react';
import { useClients } from '@/domains/clients/hooks';
import { useProjects } from '@/domains/projects/hooks';
import { OPEN_STATUSES } from '@/domains/projects/model';
import { useSubjects } from '@/domains/school/subjects/hooks';
import { matchesAllTerms } from '@/domains/search/model';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { Input } from '@/ui/primitives/Input';
import { useMovePage, usePages, useUpdatePage } from '../hooks';
import { ENTITY_LABELS, pageTitle, subtreeIds, type EntityType, type Page } from '../model';

type Choice = { id: string; label: string };

function ChoiceList({ choices, onPick, empty }: { choices: Choice[]; onPick: (choice: Choice) => void; empty: string }) {
  const [query, setQuery] = useState('');
  const shown = choices.filter((c) => matchesAllTerms(c.label, query)).slice(0, 50);
  return (
    <div className="mt-4">
      <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher…" aria-label="Chercher" />
      <ul className="mt-2 max-h-72 overflow-y-auto">
        {shown.length === 0 && <li className="py-2 text-meta text-ink-3">{empty}</li>}
        {shown.map((choice) => (
          <li key={choice.id}>
            <button type="button" onClick={() => onPick(choice)} className="-mx-2 flex h-9 w-[calc(100%+16px)] items-center rounded-md px-2 text-left hover:bg-hover">
              <span className="truncate">{choice.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ATTACHABLE: Exclude<EntityType, 'event'>[] = ['project', 'client', 'subject'];

/** Rattacher la page à un projet, un client ou une matière (elle apparaît dans sa fiche), ou la détacher. */
export function AttachDialog({ page, open, onOpenChange }: { page: Page; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [type, setType] = useState<Exclude<EntityType, 'event'>>(page.entityType && page.entityType !== 'event' ? page.entityType : 'project');
  const update = useUpdatePage();
  const { data: projects = [] } = useProjects({ statuses: OPEN_STATUSES });
  const { data: clients = [] } = useClients();
  const { data: subjects = [] } = useSubjects();
  const choices: Record<typeof type, Choice[]> = {
    project: projects.map((p) => ({ id: p.id, label: p.name })),
    client: clients.filter((c) => c.archivedAt === null).map((c) => ({ id: c.id, label: c.name })),
    subject: subjects.map((s) => ({ id: s.id, label: s.name })),
  };
  const attach = (entityType: EntityType | null, entityId: string | null) =>
    update.mutate({ id: page.id, patch: { entityType, entityId } }, { onSuccess: () => onOpenChange(false) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Rattacher la page" description="Elle apparaîtra aussi dans la fiche choisie.">
      {open && (
        <>
          <div className="mt-4">
            <ChoiceChips
              label="Rattacher à"
              options={ATTACHABLE.map((t) => ({ value: t, label: ENTITY_LABELS[t] }))}
              value={type}
              onChange={setType}
            />
          </div>
          <ChoiceList key={type} choices={choices[type]} onPick={(choice) => attach(type, choice.id)} empty="Rien à proposer." />
          <DialogFooter>
            {page.entityType && (
              <Button variant="ghost" className="mr-auto" onClick={() => attach(null, null)}>
                Détacher
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}

/** Ranger la page dans une autre (jamais dans l'une de ses propres sous-pages), ou au premier niveau. */
export function MoveDialog({ page, open, onOpenChange }: { page: Page; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: pages = [] } = usePages();
  const move = useMovePage();
  const excluded = subtreeIds(pages, page.id);
  const choices: Choice[] = [
    ...(page.parentId ? [{ id: '', label: 'Premier niveau (aucune page parente)' }] : []),
    ...pages
      .filter((p) => !excluded.has(p.id) && !p.isTemplate && p.journalDate === null && p.id !== page.parentId)
      .map((p) => ({ id: p.id, label: pageTitle(p) })),
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Déplacer la page">
      {open && (
        <>
          <ChoiceList
            choices={choices}
            empty="Aucune autre page."
            onPick={(choice) =>
              move.mutate(
                { id: page.id, parentId: choice.id || null, previous: page.parentId, title: pageTitle(page) },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
