import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { batchContext } from '@/core/batch';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { invalidateMoney } from '@/domains/finance/hooks';
import type { PaletteKey } from '@/ui/data/ColorDot';
import { toast } from '@/ui/overlays/toast';
import type { ClientChoice, NewProjectInput, ProjectDetail, ProjectPatch, ProjectType } from './model';
import {
  deleteProjectType,
  getProject,
  insertProjectType,
  listProjects,
  listProjectTypes,
  listProjectTypesWithUsage,
  updateProjectStatement,
  updateProjectType,
  type ProjectFilter,
} from './repository';
import { buildCreateProjectBatch, buildRestoreProjectBatch, buildSetClientBatch, deleteProject } from './service';

// ─── Lectures ───────────────────────────────────────────────────────────────

export function useProjectTypes() {
  return useQuery({ queryKey: queryKeys.projectTypes, queryFn: () => listProjectTypes(db) });
}

export function useProjectTypesWithUsage() {
  return useQuery({
    queryKey: [...queryKeys.projectTypes, 'usage'],
    queryFn: () => listProjectTypesWithUsage(db),
  });
}

export function useProjects(filter: ProjectFilter) {
  return useQuery({ queryKey: queryKeys.projects.list(filter), queryFn: () => listProjects(db, filter) });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.projects.detail(id),
    queryFn: async () => (await getProject(db, id)) ?? null,
  });
}

// ─── Écritures ──────────────────────────────────────────────────────────────

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewProjectInput) => {
      const { projectId, statements } = buildCreateProjectBatch(input, batchContext());
      await db.batch(statements);
      return projectId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
    },
  });
}

/** Édition sur place : la fiche est mise à jour immédiatement, puis relue depuis la base. */
export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  const detailKey = queryKeys.projects.detail(id);
  return useMutation({
    mutationFn: (patch: ProjectPatch) => db.batch([updateProjectStatement(id, patch, nowTimestamp())]),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData<ProjectDetail | null>(detailKey);
      if (previous) queryClient.setQueryData(detailKey, { ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
    },
    onSettled: (_result, _error, patch) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
      // Une proposition signée (ou redevenue proposition) change ce qui est « à recevoir ».
      if (patch.status !== undefined) invalidateMoney(queryClient);
    },
  });
}

export function useSetProjectClient(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (choice: ClientChoice) => db.batch(buildSetClientBatch(id, choice, batchContext())),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients.all });
    },
  });
}

/**
 * Suppression avec « Annuler » : le projet revient avec ses tâches, ses idées, ses échéances non reçues,
 * ses événements et ses dépenses. Un projet qui a déjà reçu de l'argent ne se supprime pas.
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    // Ses tâches et idées (cascade), ses échéances, ses événements et dépenses détachés, le compteur de son type.
    invalidateMoney(queryClient);
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.ideas.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes });
  };
  return useMutation({
    mutationFn: (id: string) => deleteProject(db, id),
    onSuccess: (result) => {
      invalidate();
      if (result.status === 'has-received-payments') {
        toast('Ce projet a déjà reçu des paiements : passe-le plutôt en Terminé ou Annulé.', { tone: 'danger' });
        return;
      }
      if (result.status !== 'deleted') return;
      const { snapshot } = result;
      toast(`Projet « ${snapshot.project.name} » supprimé.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => void db.batch(buildRestoreProjectBatch(snapshot, nowTimestamp())).then(invalidate),
        },
      });
    },
  });
}

// ─── Types de projet ────────────────────────────────────────────────────────

function useInvalidateTypes() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes });
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
  };
}

export function useCreateProjectType() {
  const onSuccess = useInvalidateTypes();
  return useMutation({
    mutationFn: (input: { name: string; color: PaletteKey; sortOrder: number }) =>
      insertProjectType(db, { id: newId(), ...input }),
    onSuccess,
  });
}

export function useUpdateProjectType() {
  const onSuccess = useInvalidateTypes();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; color?: PaletteKey }) =>
      updateProjectType(db, id, patch),
    onSuccess,
  });
}

/** Seul un type inutilisé se supprime : « Annuler » le remet tel quel. */
export function useDeleteProjectType() {
  const invalidate = useInvalidateTypes();
  return useMutation({
    mutationFn: (type: ProjectType) => deleteProjectType(db, type.id),
    onSuccess: (_result, type) => {
      invalidate();
      toast(`Type « ${type.name} » supprimé.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => void insertProjectType(db, type).then(invalidate),
        },
      });
    },
  });
}
