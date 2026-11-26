import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CreatedFromLine } from '@/app/create-store';
import { batchContext } from '@/core/batch';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { queryKeys } from '@/core/query-keys';
import { invalidatePages } from '../hooks';
import { linksOf, parseDoc, plainTextOf } from '../model';
import { getPage, saveContentStatements } from '../repository';
import { buildLineToIdeaBatch, undoCreationStatements } from '../service';
import { restoreLineInContent, type LineRemoval } from './page-lines';

/*
 * Les lignes transformées de l'éditeur (clic droit). À part des hooks des pages : ce module tire le
 * schéma de l'éditeur, qui n'a rien à faire dans la barre latérale.
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

/**
 * « Annuler » une ligne transformée : ce qu'elle est devenue disparaît. Si l'éditeur de sa page est
 * encore ouvert, c'est lui qui remet la ligne ; sinon elle revient dans la page enregistrée, dans le même lot.
 */
export async function undoLineCreation(
  queryClient: QueryClient,
  created: Pick<CreatedFromLine, 'kind' | 'id'>,
  restoreInPage?: { pageId: string; removal: LineRemoval },
): Promise<void> {
  const statements = undoCreationStatements(created);
  const page = restoreInPage ? await getPage(db, restoreInPage.pageId) : undefined;
  const content = page && restoreInPage ? JSON.stringify(restoreLineInContent(parseDoc(page.content), restoreInPage.removal)) : null;
  if (page && content) {
    const doc = parseDoc(content);
    statements.push(...saveContentStatements(page.id, content, plainTextOf(doc), linksOf(doc), nowTimestamp()));
  }
  await db.batch(statements);
  invalidateAfterCreation(queryClient, created.kind);
  if (page && content) {
    // L'éditeur part de la page gardée en cache quand on la rouvre : elle doit déjà avoir la ligne.
    queryClient.setQueryData(queryKeys.pages.detail(page.id), (cached: { content: string } | null | undefined) =>
      cached ? { ...cached, content } : cached,
    );
    invalidatePages(queryClient);
  }
}
