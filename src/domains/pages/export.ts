import { db } from '@/core/db';
import { todayISO } from '@/core/dates';
import { saveExportFile } from '@/domains/data/hooks';
import { markdownManager } from './editor/markdown';
import { ATTACHMENT_PREFIX, attachmentIdsOf, pageTitle, parseDoc, slugify, type Page } from './model';
import { listAttachmentData } from './repository';

/** « cockpit-export-page-fiche-de-cours-2026-11-26.md » (le motif des exports, ignoré par Git). */
export function pageExportName(page: Pick<Page, 'title'>, today: string): string {
  return `cockpit-export-page-${slugify(pageTitle(page))}-${today}.md`;
}

/**
 * Une page en Markdown : son titre, puis son contenu ; les liens entre pages deviennent [[Titre]], et
 * les images sont incluses dans le fichier (data URL), qui se suffit à lui-même.
 */
export async function pageToMarkdown(page: Page): Promise<string> {
  const doc = parseDoc(page.content);
  const images = await listAttachmentData(db, attachmentIdsOf(doc));
  let body = markdownManager().serialize(doc);
  for (const [id, data] of images) body = body.split(`${ATTACHMENT_PREFIX}${id}`).join(data);
  return `# ${pageTitle(page)}\n\n${body.trim()}\n`;
}

export async function exportPage(page: Page): Promise<string | null> {
  return saveExportFile(pageExportName(page, todayISO()), await pageToMarkdown(page), 'text/markdown');
}
