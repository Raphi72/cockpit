import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/core';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { reinsertRowStatement } from '@/core/db/rows';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { shorten } from '@/core/text';
import { toast } from '@/ui/overlays/toast';
import { EMPTY_DOC, journalTitle, linksOf, pageTitle, parseDoc, plainTextOf, type EntityType } from './model';
import {
  deletePageStatement,
  getAttachmentData,
  getJournalPageId,
  getPage,
  insertAttachmentStatement,
  insertPageStatement,
  listBacklinks,
  listPages,
  movePageStatement,
  readPageSnapshot,
  saveContentStatements,
  updatePageStatement,
  type PagePatch,
} from './repository';

export function invalidatePages(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.pages.all });
}

export function usePages() {
  return useQuery({ queryKey: queryKeys.pages.list, queryFn: () => listPages(db) });
}

export function usePage(id: string) {
  return useQuery({ queryKey: queryKeys.pages.detail(id), queryFn: async () => (await getPage(db, id)) ?? null });
}

export function useBacklinks(id: string) {
  return useQuery({ queryKey: queryKeys.pages.backlinks(id), queryFn: () => listBacklinks(db, id) });
}

/** Une image d'une page (data URL), gardée en cache : elle ne change jamais. */
export function useAttachment(id: string | null) {
  return useQuery({
    queryKey: queryKeys.pages.attachment(id ?? ''),
    queryFn: () => (id ? getAttachmentData(db, id) : null),
    enabled: id !== null,
  });
}

export type CreatePageInput = {
  parentId?: string | null;
  title?: string;
  /** Contenu de départ (un modèle) ; une page vierge sinon. */
  doc?: JSONContent;
  entityType?: EntityType | null;
  entityId?: string | null;
  isTemplate?: boolean;
};

/** Nouvelle page (vierge, d'un modèle, sous-page, rattachée…). Renvoie son identifiant. */
export function useCreatePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePageInput) => {
      const id = newId();
      const doc = input.doc ?? EMPTY_DOC;
      await db.batch([
        insertPageStatement(
          id,
          {
            parentId: input.parentId ?? null,
            title: input.title ?? '',
            content: JSON.stringify(doc),
            plainText: plainTextOf(doc),
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            isTemplate: input.isTemplate,
          },
          nowTimestamp(),
        ),
      ]);
      return id;
    },
    onSuccess: () => invalidatePages(queryClient),
  });
}

/** Le journal d'un jour : la page existante, ou une nouvelle. Renvoie son identifiant. */
export function useOpenJournal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (day: string) => {
      const existing = await getJournalPageId(db, day);
      if (existing) return existing.id;
      const id = newId();
      await db.batch([
        insertPageStatement(
          id,
          { parentId: null, title: journalTitle(day), content: JSON.stringify(EMPTY_DOC), plainText: '', entityType: null, entityId: null, journalDate: day },
          nowTimestamp(),
        ),
      ]);
      return id;
    },
    onSuccess: () => invalidatePages(queryClient),
  });
}

/**
 * Enregistre le contenu d'une page (appelé quelques instants après la dernière frappe), avec son texte
 * brut et ses liens. La liste n'est pas relue à chaque fois : seulement les liens entrants.
 */
export function useSavePageContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, doc }: { id: string; doc: JSONContent }) =>
      db.batch(saveContentStatements(id, JSON.stringify(doc), plainTextOf(doc), linksOf(doc), nowTimestamp())),
    onSuccess: (_, { id, doc }) => {
      queryClient.setQueryData(queryKeys.pages.detail(id), (page: { content: string } | null | undefined) =>
        page ? { ...page, content: JSON.stringify(doc) } : page,
      );
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.pages.all, 'backlinks'] });
    },
  });
}

export function useUpdatePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PagePatch }) => db.batch([updatePageStatement(id, patch, nowTimestamp())]),
    onSuccess: () => invalidatePages(queryClient),
  });
}

/** Range une page dans une autre, ou au premier niveau. « Annuler » la remet où elle était. */
export function useMovePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null; previous: string | null; title: string }) =>
      db.batch([movePageStatement(id, parentId, nowTimestamp())]),
    onSuccess: (_, { id, previous, title }) => {
      invalidatePages(queryClient);
      toast(`« ${shorten(title)} » déplacée.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => void db.batch([movePageStatement(id, previous, nowTimestamp())]).then(() => invalidatePages(queryClient)),
        },
      });
    },
  });
}

/** Supprimer une page emporte ses sous-pages ; « Annuler » remet tout, liens et images compris. */
export function useDeletePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const snapshot = await readPageSnapshot(db, id);
      await db.batch([deletePageStatement(id)]);
      return snapshot;
    },
    onSuccess: (snapshot) => {
      invalidatePages(queryClient);
      if (!snapshot) return;
      const [first] = snapshot.pages;
      const sub = snapshot.pages.length - 1;
      const name = pageTitle({ title: String(first?.title ?? '') });
      toast(sub > 0 ? `« ${shorten(name)} » supprimée, avec ${sub} sous-page${sub > 1 ? 's' : ''}.` : `« ${shorten(name)} » supprimée.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () =>
            void db
              .batch([
                ...snapshot.pages.map((row) => reinsertRowStatement('pages', row)),
                ...snapshot.attachments.map((row) => reinsertRowStatement('attachments', row)),
                ...snapshot.links.map((row) => {
                  const statement = reinsertRowStatement('page_links', row);
                  return { ...statement, sql: statement.sql.replace('INSERT', 'INSERT OR IGNORE') };
                }),
              ])
              .then(() => invalidatePages(queryClient)),
        },
      });
    },
  });
}

/** « Enregistrer comme modèle » : une copie de la page (titre et contenu) parmi les modèles. */
export function useSaveAsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }) => {
      const doc = parseDoc(content);
      await db.batch([
        insertPageStatement(
          newId(),
          { parentId: null, title, content, plainText: plainTextOf(doc), entityType: null, entityId: null, isTemplate: true },
          nowTimestamp(),
        ),
      ]);
    },
    onSuccess: (_, { title }) => {
      invalidatePages(queryClient);
      toast(`Modèle « ${shorten(title)} » enregistré.`);
    },
  });
}

/** Une image collée ou déposée : enregistrée (déjà réduite), renvoie son identifiant. */
export async function saveAttachment(pageId: string, mime: string, data: string): Promise<string> {
  const id = newId();
  await db.batch([insertAttachmentStatement(id, pageId, mime, data, nowTimestamp())]);
  return id;
}
