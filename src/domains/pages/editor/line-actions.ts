import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CreatedFromLine } from '@/app/create-store';
import { batchContext } from '@/core/batch';
import { db, type Statement } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { queryKeys } from '@/core/query-keys';
import { invalidatePages } from '../hooks';
import { linksOf, parseDoc, plainTextOf } from '../model';
import { getPage, saveContentStatements } from '../repository';
import { buildLineToIdeaBatch, undoCreationStatements } from '../service';
import { restoreLineInContent, type LineRemoval, type RestoreOptions } from './page-lines';

/*
 * Les lignes transformées (clic droit) et les blocs supprimés (poignée ⠿) de l'éditeur. À part des hooks
 * des pages : ce module tire le schéma de l'éditeur, qui n'a rien à faire dans la barre latérale.
 */

/** Ce qu'une création née d'une ligne touche : tâches (et projets, calendrier), agenda, idées ou projets. */
const CREATION_ROOTS: Record<CreatedFromLine['kind'], readonly (readonly string[])[]> = {
  task: [queryKeys.tasks.all, queryKeys.projects.all, queryKeys.agenda.all],
  event: [queryKeys.agenda.all],
  idea: [queryKeys.ideas.all],
  project: [queryKeys.projects.all, queryKeys.payments.all, queryKeys.agenda.all, queryKeys.tasks.all],
};

function invalidateAfterCreation(queryClient: QueryClient, kind: CreatedFromLine['kind']): void {
  for (const queryKey of CREATION_ROOTS[kind]) void queryClient.invalidateQueries({ queryKey });
}

/** La ligne devient une idée du projet choisi, sans fenêtre. Renvoie son identifiant. */
export function useLineToIdea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ text, projectId }: { text: string; projectId: string }) => {
      const { ideaId, statements } = buildLineToIdeaBatch(text, projectId, batchContext());
      await db.batch(statements);
      return ideaId;
    },
    onSuccess: () => invalidateAfterCreation(queryClient, 'idea'),
  });
}

export type RestoreInPage = { pageId: string; removal: LineRemoval; options?: RestoreOptions };

/**
 * Remet ce qui a quitté une page dont l'éditeur n'est plus ouvert : `statements` d'abord, puis la page
 * enregistrée, dans le même lot ; le cache de la page aussi, car l'éditeur part de lui quand on la rouvre.
 */
async function batchWithPageRestore(queryClient: QueryClient, statements: Statement[], restore?: RestoreInPage): Promise<void> {
  const page = restore ? await getPage(db, restore.pageId) : undefined;
  const content = page && restore ? JSON.stringify(restoreLineInContent(parseDoc(page.content), restore.removal, restore.options)) : null;
  if (page && content) {
    const doc = parseDoc(content);
    statements.push(...saveContentStatements(page.id, content, plainTextOf(doc), linksOf(doc), nowTimestamp()));
  }
  await db.batch(statements);
  if (page && content) {
    queryClient.setQueryData(queryKeys.pages.detail(page.id), (cached: { content: string } | null | undefined) =>
      cached ? { ...cached, content } : cached,
    );
    invalidatePages(queryClient);
  }
}

/**
 * « Annuler » une ligne transformée : ce qu'elle est devenue disparaît. Si l'éditeur de sa page est
 * encore ouvert, c'est lui qui remet la ligne ; sinon elle revient dans la page enregistrée.
 */
export async function undoLineCreation(
  queryClient: QueryClient,
  created: Pick<CreatedFromLine, 'kind' | 'id'>,
  restoreInPage?: RestoreInPage,
): Promise<void> {
  await batchWithPageRestore(queryClient, undoCreationStatements(created), restoreInPage);
  invalidateAfterCreation(queryClient, created.kind);
}

/** « Annuler » un bloc supprimé à la poignée, quand l'éditeur de sa page n'est plus ouvert. */
export function restoreBlockInPage(queryClient: QueryClient, restore: RestoreInPage): Promise<void> {
  return batchWithPageRestore(queryClient, [], restore);
}
