import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db, type Statement } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { reinsertRowStatement } from '@/core/db/rows';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { shorten } from '@/core/text';
import { toast } from '@/ui/overlays/toast';
import {
  blocksFromWeekTemplate,
  weekTemplateFromBlocks,
  type BlockInput,
  type BlockStatus,
  type DayBlock,
  type ModuleInput,
} from './model';
import {
  clearWeekTemplateBlocksStatement,
  deleteBlockStatement,
  deleteModuleStatement,
  deleteWeekTemplateStatement,
  getBlock,
  insertBlockStatement,
  insertModuleStatement,
  insertWeekTemplateBlockStatement,
  insertWeekTemplateStatement,
  listBlockTaskIds,
  listBlocks,
  listModules,
  listWeekTemplateBlocks,
  listWeekTemplates,
  rawRows,
  renameWeekTemplateStatement,
  setTasksBlockStatement,
  updateBlockStatement,
  updateModuleStatement,
  type BlockPatch,
} from './repository';

/** Les blocs bougent aussi les tâches qu'ils contiennent (leur jour) et le calendrier. */
export function invalidateDay(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.day.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
}

/** Toast d'une écriture annulable : « Annuler » rejoue le lot inverse. */
function announce(queryClient: QueryClient, message: string, undo: Statement[]) {
  toast(message, {
    action: {
      label: 'Annuler',
      undo: true,
      onClick: () => void db.batch(undo).then(() => invalidateDay(queryClient)),
    },
  });
}

// ─── Lectures ───────────────────────────────────────────────────────────────

export function useModules() {
  return useQuery({ queryKey: queryKeys.day.modules, queryFn: () => listModules(db) });
}

/** Les blocs de [from, to[. */
export function useBlocks(range: { from: string; to: string }) {
  return useQuery({ queryKey: queryKeys.day.blocks(range.from, range.to), queryFn: () => listBlocks(db, range.from, range.to) });
}

export function useWeekTemplates() {
  return useQuery({ queryKey: queryKeys.day.weekTemplates, queryFn: () => listWeekTemplates(db) });
}

// ─── Modules ────────────────────────────────────────────────────────────────

export function useSaveModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ModuleInput }) =>
      db.batch([id ? updateModuleStatement(id, input, nowTimestamp()) : insertModuleStatement(newId(), input, nowTimestamp())]),
    onSuccess: () => invalidateDay(queryClient),
  });
}

/** Supprimer un module ne touche pas les blocs déjà posés (P16) ; « Annuler » le remet. */
export function useDeleteModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const [row] = await rawRows(db, 'block_templates', 'id', id);
      const linked = await db.query<{ id: string }>('SELECT id FROM day_blocks WHERE template_id = ?', [id]);
      await db.batch([deleteModuleStatement(id)]);
      return { row, linked: linked.map((b) => b.id) };
    },
    onSuccess: ({ row, linked }) => {
      invalidateDay(queryClient);
      if (!row) return;
      const relink: Statement[] = linked.length
        ? [{ sql: `UPDATE day_blocks SET template_id = ? WHERE id IN (${linked.map(() => '?').join(', ')})`, params: [row.id as string, ...linked] }]
        : [];
      announce(queryClient, `Module « ${shorten(String(row.name))} » supprimé.`, [reinsertRowStatement('block_templates', row), ...relink]);
    },
  });
}

// ─── Blocs ──────────────────────────────────────────────────────────────────

/** Pose un bloc (d'un module ou libre). « Annuler » le retire. */
export function useCreateBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: BlockInput) => {
      const id = newId();
      await db.batch([insertBlockStatement(id, input, nowTimestamp())]);
      return id;
    },
    onSuccess: (id, input) => {
      invalidateDay(queryClient);
      announce(queryClient, `« ${shorten(input.title)} » posé à ${input.startsAt}.`, [deleteBlockStatement(id)]);
    },
  });
}

/**
 * Modifie un bloc (déplacé, étiré, renommé, marqué fait…). Il bouge tout de suite à l'écran ;
 * `undoable` : le toast propose de revenir en arrière (déplacer, étirer).
 */
export function useUpdateBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ block, patch }: { block: DayBlock; patch: BlockPatch; undoable?: string }) => {
      await db.batch([updateBlockStatement(block.id, patch, nowTimestamp())]);
    },
    onMutate: async ({ block, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.day.all });
      queryClient.setQueriesData<DayBlock[]>({ queryKey: [...queryKeys.day.all, 'blocks'] }, (blocks) =>
        blocks?.map((b) => (b.id === block.id ? { ...b, ...patch } : b)),
      );
    },
    onSettled: () => invalidateDay(queryClient),
    onSuccess: (_, { block, patch, undoable }) => {
      if (!undoable) return;
      const before = Object.fromEntries(Object.keys(patch).map((key) => [key, block[key as keyof BlockPatch]])) as BlockPatch;
      announce(queryClient, undoable, [updateBlockStatement(block.id, before, nowTimestamp())]);
    },
  });
}

/** Supprime un bloc : ses tâches en sortent (elles retrouvent leur place). « Annuler » remet tout. */
export function useDeleteBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const block = await getBlock(db, id);
      const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM day_blocks WHERE id = ?', [id]);
      const taskIds = await listBlockTaskIds(db, id);
      await db.batch([deleteBlockStatement(id)]);
      return { block, row, taskIds };
    },
    onSuccess: ({ block, row, taskIds }) => {
      invalidateDay(queryClient);
      if (!block || !row) return;
      const undo = [reinsertRowStatement('day_blocks', row), ...(taskIds.length ? [setTasksBlockStatement(taskIds, block.id, nowTimestamp())] : [])];
      announce(queryClient, `Bloc « ${shorten(block.title)} » retiré${taskIds.length ? ', ses tâches retrouvent leur place' : ''}.`, undo);
    },
  });
}

/** Range des tâches dans un bloc, ou les en sort (`blockId: null`). « Annuler » remet chacune où elle était. */
export function useMoveTasksToBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskIds, blockId }: { taskIds: string[]; blockId: string | null; message?: string }) => {
      const before = await db.query<{ id: string; blockId: string | null }>(
        `SELECT id, block_id FROM tasks WHERE id IN (${taskIds.map(() => '?').join(', ')})`,
        taskIds,
      );
      await db.batch([setTasksBlockStatement(taskIds, blockId, nowTimestamp())]);
      return before;
    },
    onSuccess: (before, { message }) => {
      invalidateDay(queryClient);
      if (!message) return;
      const now = nowTimestamp();
      announce(queryClient, message, before.map((t) => setTasksBlockStatement([t.id], t.blockId, now)));
    },
  });
}

/**
 * Bilan du soir : fait, raté (le bloc reste à sa place, marqué) ou décalé à demain, à la même heure
 * (ses tâches le suivent). Chaque choix se change en recliquant ; « Décaler » propose « Annuler ».
 */
export function useReviewBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ block, verdict, tomorrow }: { block: DayBlock; verdict: BlockStatus | 'tomorrow'; tomorrow: string }) => {
      const patch: BlockPatch = verdict === 'tomorrow' ? { date: tomorrow, status: 'planned' } : { status: verdict };
      return db.batch([updateBlockStatement(block.id, patch, nowTimestamp())]);
    },
    onSuccess: (_, { block, verdict }) => {
      invalidateDay(queryClient);
      if (verdict !== 'tomorrow') return;
      announce(queryClient, `« ${shorten(block.title)} » décalé à demain.`, [
        updateBlockStatement(block.id, { date: block.date, status: block.status }, nowTimestamp()),
      ]);
    },
  });
}

// ─── Semaines types ─────────────────────────────────────────────────────────

/** Enregistre les blocs d'une semaine comme nouvelle semaine type, ou à la place d'une existante. */
export function useSaveWeekTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ blocks, name, replaceId }: { blocks: DayBlock[]; name?: string; replaceId?: string }) => {
      const now = nowTimestamp();
      const id = replaceId ?? newId();
      const statements: Statement[] = replaceId
        ? [clearWeekTemplateBlocksStatement(replaceId)]
        : [insertWeekTemplateStatement(id, name ?? 'Semaine type', now)];
      for (const block of weekTemplateFromBlocks(blocks)) statements.push(insertWeekTemplateBlockStatement(newId(), id, block, now));
      await db.batch(statements);
      return id;
    },
    onSuccess: (_, { blocks, replaceId, name }) => {
      invalidateDay(queryClient);
      toast(`${replaceId ? 'Semaine type remplacée' : `Semaine type « ${shorten(name ?? '')} » enregistrée`} : ${blocks.length} bloc${blocks.length > 1 ? 's' : ''}.`);
    },
  });
}

/** Applique une semaine type aux jours affichés : des blocs ordinaires, modifiables un par un. « Annuler » les retire. */
export function useApplyWeekTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ weekTemplateId, days }: { weekTemplateId: string; days: string[]; name: string }) => {
      const templateBlocks = await listWeekTemplateBlocks(db, weekTemplateId);
      const now = nowTimestamp();
      const created = blocksFromWeekTemplate(templateBlocks, days).map((input) => ({ id: newId(), input }));
      await db.batch(created.map(({ id, input }) => insertBlockStatement(id, input, now)));
      return created.map((c) => c.id);
    },
    onSuccess: (ids, { name }) => {
      invalidateDay(queryClient);
      announce(queryClient, `« ${shorten(name)} » appliquée : ${ids.length} bloc${ids.length > 1 ? 's' : ''} posé${ids.length > 1 ? 's' : ''}.`, ids.map(deleteBlockStatement));
    },
  });
}

export function useRenameWeekTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => db.batch([renameWeekTemplateStatement(id, name, nowTimestamp())]),
    onSuccess: () => invalidateDay(queryClient),
  });
}

export function useDeleteWeekTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const [template] = await rawRows(db, 'week_templates', 'id', id);
      const blocks = await rawRows(db, 'week_template_blocks', 'week_template_id', id);
      await db.batch([deleteWeekTemplateStatement(id)]);
      return { template, blocks };
    },
    onSuccess: ({ template, blocks }) => {
      invalidateDay(queryClient);
      if (!template) return;
      announce(queryClient, `Semaine type « ${shorten(String(template.name))} » supprimée.`, [
        reinsertRowStatement('week_templates', template),
        ...blocks.map((row) => reinsertRowStatement('week_template_blocks', row)),
      ]);
    },
  });
}

/** Pose les blocs proposés par « Remplir les trous », avec leurs tâches, en un lot. « Annuler » retire tout. */
export function useApplyFill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proposals: { input: BlockInput; taskIds: string[] }[]) => {
      const now = nowTimestamp();
      const created = proposals.map((p) => ({ ...p, id: newId() }));
      await db.batch(
        created.flatMap(({ id, input, taskIds }) => [insertBlockStatement(id, input, now), ...(taskIds.length ? [setTasksBlockStatement(taskIds, id, now)] : [])]),
      );
      return created;
    },
    onSuccess: (created) => {
      invalidateDay(queryClient);
      const now = nowTimestamp();
      announce(
        queryClient,
        `${created.length} bloc${created.length > 1 ? 's' : ''} posé${created.length > 1 ? 's' : ''} dans les trous.`,
        created.flatMap(({ id, taskIds }) => [...(taskIds.length ? [setTasksBlockStatement(taskIds, null, now)] : []), deleteBlockStatement(id)]),
      );
    },
  });
}
