import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Ellipsis, Trash2 } from 'lucide-react';
import { useToday } from '@/core/use-today';
import { PageContainer } from '@/ui/layout/Page';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/ui/overlays/Menu';
import { Button } from '@/ui/primitives/Button';
import { InlineText, InlineTextarea } from '@/ui/primitives/InlineFields';
import { ProjectFinance } from '../components/ProjectFinance';
import { ProjectPlan } from '../components/ProjectPlan';
import { ProjectProperties } from '../components/ProjectProperties';
import { useDeleteProject, useProject, useUpdateProject } from '../hooks';

function SideHeading({ children }: { children: string }) {
  return <h2 className="mb-2 text-meta font-medium text-ink-2">{children}</h2>;
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ from: '/projects/$projectId' });
  const { data: project, isPending } = useProject(projectId);
  const update = useUpdateProject(projectId);
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();
  const today = useToday();

  if (isPending) return null;
  if (!project) {
    return (
      <PageContainer>
        <p className="text-ink-2">Ce projet n’existe plus.</p>
        <Link to="/projects" className="mt-3 inline-block text-accent">
          Retour aux projets
        </Link>
      </PageContainer>
    );
  }

  // « Annuler » est dans le toast : pas de confirmation.
  const remove = () =>
    deleteProject.mutate(project.id, {
      onSuccess: (result) => {
        if (result.status === 'deleted') void navigate({ to: '/projects' });
      },
    });

  return (
    <PageContainer>
      <div className="-mt-4 mb-8 flex items-center justify-between">
        <Link
          to="/projects"
          className="-ml-2 flex h-8 items-center gap-1.5 rounded-md px-2 text-meta text-ink-2 hover:bg-hover hover:text-ink"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2} />
          Projets
        </Link>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" icon={Ellipsis} aria-label="Actions du projet" />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={Trash2} tone="danger" onSelect={remove}>
              Supprimer le projet
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-16">
        <div className="min-w-0">
          <InlineText
            value={project.name}
            onSave={(name) => update.mutate({ name })}
            required
            className="h-11 text-title font-semibold tracking-tight"
            aria-label="Nom du projet"
          />
          <InlineTextarea
            value={project.description}
            onSave={(description) => update.mutate({ description })}
            placeholder="Ajouter une description…"
            className="mt-1 text-ink-2"
            aria-label="Description"
          />

          <div className="mt-14">
            <ProjectPlan projectId={project.id} today={today} />
          </div>

          <section className="mt-14">
            <h2 className="mb-2 font-semibold">Notes</h2>
            <InlineTextarea
              value={project.notes}
              onSave={(notes) => update.mutate({ notes })}
              placeholder="Contacts, liens, décisions…"
              className="min-h-24"
              aria-label="Notes"
            />
          </section>
        </div>

        <aside className="border-l border-line pl-8">
          <SideHeading>Propriétés</SideHeading>
          <ProjectProperties project={project} today={today} />
          <div className="mt-8">
            <SideHeading>Finances</SideHeading>
            <ProjectFinance project={project} today={today} />
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}
