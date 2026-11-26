import { invoke, isTauri } from '@tauri-apps/api/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { db, type Statement } from '@/core/db';
import { UserError } from '@/core/db/errors';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { toast } from '@/ui/overlays/toast';
import { markdownManager } from '../editor/markdown';
import { shrinkImage } from '../editor/images';
import { invalidatePages } from '../hooks';
import { EMPTY_DOC, linksOf, plainTextOf } from '../model';
import { insertAttachmentStatement, insertPageStatement, saveContentStatements } from '../repository';
import { convertPageLinks, planPages, rewriteImages, type NotionExport } from './notion';

/** Une image de l'export, réduite comme une image collée. */
async function shrinkBase64(data: string, mime: string, name: string) {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return shrinkImage(new File([bytes], name, { type: mime }));
}

/**
 * Importer de Notion : on choisit le dossier d'un export Markdown décompressé ; ses pages, sous-pages
 * et images arrivent sous une page « Import Notion », en un seul lot (tout ou rien). Les liens entre
 * pages de l'export deviennent des liens Cockpit. Les bases de données Notion (CSV) ne sont pas reprises.
 */
export function useNotionImport() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      if (!isTauri()) throw new UserError('L’import Notion se fait dans l’application Cockpit (pas dans le navigateur).');
      const exported = await invoke<NotionExport | null>('notion_import_pick').catch((error: unknown) => {
        throw new UserError(String(error));
      });
      if (!exported) return null;
      const planned = planPages(exported.files);
      if (planned.length === 0) {
        throw new UserError('Aucune page Markdown dans ce dossier. Exporte depuis Notion au format « Markdown & CSV », puis décompresse le fichier.');
      }

      const images = new Map<string, string>();
      const imageData = new Map<string, { mime: string; data: string }>();
      for (const file of exported.files) {
        if (!file.data || !file.mime) continue;
        try {
          const id = newId();
          imageData.set(id, await shrinkBase64(file.data, file.mime, file.path));
          images.set(file.path, id);
        } catch {
          // Image illisible : la page garde son lien d'origine.
        }
      }

      const now = nowTimestamp();
      const rootId = newId();
      const ids = new Map(planned.map((page) => [page.key, { id: newId(), title: page.title }]));
      const statements: Statement[] = [
        insertPageStatement(
          rootId,
          {
            parentId: null,
            title: `Import Notion du ${format(new Date(), 'd MMMM yyyy', { locale: fr })}`,
            content: JSON.stringify(EMPTY_DOC),
            plainText: '',
            entityType: null,
            entityId: null,
          },
          now,
        ),
      ];
      const linkStatements: Statement[] = [];
      let imageCount = 0;
      for (const page of planned) {
        const { id, title } = ids.get(page.key)!;
        const { markdown, used } = rewriteImages(page.markdown, page.key, images);
        const doc = convertPageLinks(markdownManager().parse(markdown), page.key, ids);
        statements.push(
          insertPageStatement(
            id,
            {
              parentId: page.parentKey ? (ids.get(page.parentKey)?.id ?? rootId) : rootId,
              title,
              content: JSON.stringify(doc),
              plainText: plainTextOf(doc),
              entityType: null,
              entityId: null,
            },
            now,
          ),
        );
        for (const attachmentId of new Set(used)) {
          const image = imageData.get(attachmentId);
          if (!image) continue;
          statements.push(insertAttachmentStatement(attachmentId, id, image.mime, image.data, now));
          imageData.delete(attachmentId);
          imageCount += 1;
        }
        linkStatements.push(...saveContentStatements(id, JSON.stringify(doc), plainTextOf(doc), linksOf(doc), now).slice(1));
      }
      await db.batch([...statements, ...linkStatements]);
      return { rootId, pages: planned.length, images: imageCount, skipped: exported.skipped };
    },
    onSuccess: (result) => {
      if (!result) return;
      invalidatePages(queryClient);
      const extra = [result.images > 0 ? `${result.images} image${result.images > 1 ? 's' : ''}` : null, result.skipped > 0 ? `${result.skipped} fichier${result.skipped > 1 ? 's' : ''} laissé${result.skipped > 1 ? 's' : ''} de côté` : null]
        .filter(Boolean)
        .join(', ');
      toast(`${result.pages} page${result.pages > 1 ? 's' : ''} importée${result.pages > 1 ? 's' : ''} de Notion${extra ? ` (${extra})` : ''}.`);
      void navigate({ to: '/pages/$pageId', params: { pageId: result.rootId } });
    },
  });
}
