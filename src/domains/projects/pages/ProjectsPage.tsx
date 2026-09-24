import { useNavigate, useSearch } from '@tanstack/react-router';
import { FolderClosed, ListFilter, Plus } from 'lucide-react';
import { useCreateStore } from '@/app/create-store';
import { useToday } from '@/core/use-today';
import { ColorDot } from '@/ui/data/ColorDot';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Button } from '@/ui/primitives/Button';
import { SegmentedTabs } from '@/ui/primitives/SegmentedTabs';
import { ProjectRow } from '../components/ProjectRow';
import { StatusIcon } from '../components/StatusIcon';
import { useProjects, useProjectTypes } from '../hooks';
import { CLOSED_STATUSES, OPEN_STATUSES, STATUS_LABELS, type ProjectListItem, type ProjectStatus } from '../model';

function summary(projects: ProjectListItem[]): string {
  const count = (status: ProjectStatus) => projects.filter((p) => p.status === status).length;
  const parts = [
    [count('active'), 'en cours'],
    [count('planned'), 'à venir'],
    [count('proposal'), count('proposal') > 1 ? 'propositions' : 'proposition'],
    [count('on_hold'), 'en pause'],
  ] as const;
  return parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(' · ');
}

function TypeFilter({ typeId, onChange }: { typeId?: string; onChange: (typeId?: string) => void }) {
  const { data: types = [] } = useProjectTypes();
  const selected = types.find((t) => t.id === typeId);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" className={selected ? 'text-ink' : ''}>
          {selected ? <ColorDot color={selected.color} /> : <ListFilter className="size-4" strokeWidth={1.75} />}
          {selected ? selected.name : 'Tous les types'}
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuRadioGroup value={typeId ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? undefined : v)}>
          <MenuRadioItem value="all">Tous les types</MenuRadioItem>
          <MenuSeparator />
          {types.map((type) => (
            <MenuRadioItem key={type.id} value={type.id} leading={<ColorDot color={type.color} />}>
              {type.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

export function ProjectsPage() {
  const search = useSearch({ from: '/projects' });
  const navigate = useNavigate({ from: '/projects' });
  const openCreate = useCreateStore((state) => state.openCreate);
  const today = useToday();

  const open = useProjects({ statuses: OPEN_STATUSES, typeId: search.type });
  const closed = useProjects({ statuses: CLOSED_STATUSES, typeId: search.type });
  const current = search.view === 'closed' ? closed : open;
  const statuses = search.view === 'closed' ? CLOSED_STATUSES : OPEN_STATUSES;
  const projects = current.data ?? [];
  const groups = statuses
    .map((status) => ({ status, items: projects.filter((p) => p.status === status) }))
    .filter((group) => group.items.length > 0);

  const nothingAtAll = !search.type && open.data?.length === 0 && closed.data?.length === 0;

  return (
    <Page
      title="Projets"
      subtitle={open.data && open.data.length > 0 ? summary(open.data) : undefined}
      actions={
        <Button variant="secondary" icon={Plus} onClick={() => openCreate('project')}>
          Nouveau projet
        </Button>
      }
    >
      {nothingAtAll ? (
        <EmptyState icon={FolderClosed} title="Aucun projet pour l’instant">
          <p>Freelance, mission, projet d’école ou perso : tout se range ici.</p>
          <Button variant="primary" icon={Plus} className="mt-4" onClick={() => openCreate('project')}>
            Créer un projet
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="mb-8 flex items-center justify-between gap-4">
            <SegmentedTabs
              tabs={[
                { value: 'open', label: 'Actifs', count: open.data?.length },
                { value: 'closed', label: 'Terminés', count: closed.data?.length },
              ]}
              value={search.view ?? 'open'}
              onChange={(view) =>
                void navigate({ search: (prev) => ({ ...prev, view: view === 'closed' ? 'closed' : undefined }) })
              }
            />
            <TypeFilter typeId={search.type} onChange={(type) => void navigate({ search: (prev) => ({ ...prev, type }) })} />
          </div>

          {current.data && groups.length === 0 && (
            <p className="py-6 text-ink-3">
              {search.view === 'closed' ? 'Aucun projet terminé.' : 'Aucun projet actif.'}
            </p>
          )}

          {groups.map((group) => (
            <section key={group.status} className="mb-12">
              <h2 className="mb-2 flex items-center gap-2 text-meta font-medium text-ink-2">
                <StatusIcon status={group.status} />
                {STATUS_LABELS[group.status]}
                <span className="tnum text-ink-3">{group.items.length}</span>
              </h2>
              {group.items.map((project) => (
                <ProjectRow key={project.id} project={project} today={today} />
              ))}
            </section>
          ))}
        </>
      )}
    </Page>
  );
}
