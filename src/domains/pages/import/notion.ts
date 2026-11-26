import type { JSONContent } from '@tiptap/core';
import { attachmentSrc } from '../model';

/**
 * Import d'un export Notion au format Markdown (décompressé). Notion écrit une page par fichier
 * `Titre 0123…cdef.md` (l'identifiant de 32 caractères après le titre), et ses sous-pages dans un
 * dossier du même nom. Les images sont à côté, référencées par des chemins relatifs encodés.
 */

export type ExportFile = { path: string; text: string | null; data: string | null; mime: string | null };

export type NotionExport = { root: string; files: ExportFile[]; skipped: number };

const NOTION_ID = /\s+[0-9a-f]{32}$/i;

/** « Cours 0123…cdef.md » → « Cours » */
export function cleanName(fileName: string): string {
  return fileName.replace(/\.[^./]+$/, '').replace(NOTION_ID, '').trim();
}

const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/** La page parente d'une page : le fichier `.md` qui porte le nom de son dossier, s'il existe. */
export function parentPathOf(mdPath: string): string | null {
  const dir = dirOf(mdPath);
  return dir === '' ? null : `${dir}.md`;
}

/** Un lien relatif (encodé) vu depuis une page, ramené à un chemin de l'export. */
export function resolvePath(fromPath: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(href.split('#')[0]!.split('?')[0]!);
  } catch {
    decoded = href;
  }
  const parts = [...(dirOf(fromPath) ? dirOf(fromPath).split('/') : []), ...decoded.split('/')];
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

export type PlannedPage = { key: string; parentKey: string | null; title: string; markdown: string };

/**
 * Les pages de l'export, les parentes avant leurs sous-pages. Le titre est le premier titre `# …`
 * (retiré du contenu), sinon le nom du fichier. Une page dont la parente manque remonte d'un cran.
 */
export function planPages(files: ExportFile[]): PlannedPage[] {
  const pages = files.filter((f) => f.text !== null && f.path.toLowerCase().endsWith('.md'));
  const keys = new Set(pages.map((p) => p.path));
  const nearestParent = (path: string): string | null => {
    let candidate = parentPathOf(path);
    while (candidate && !keys.has(candidate)) candidate = parentPathOf(candidate);
    return candidate;
  };
  return pages
    .map((file) => {
      const text = (file.text ?? '').replace(/^﻿/, '');
      const heading = /^#\s+(.+)\n?/.exec(text);
      const name = file.path.split('/').pop() ?? file.path;
      return {
        key: file.path,
        parentKey: nearestParent(file.path),
        title: heading ? heading[1]!.trim() : cleanName(name),
        markdown: heading ? text.slice(heading[0].length).replace(/^\s*\n/, '') : text,
      };
    })
    .sort((a, b) => a.key.split('/').length - b.key.split('/').length || a.key.localeCompare(b.key));
}

/** Les images d'une page pointent vers leurs pièces jointes : `![…](attachment:<id>)`. */
export function rewriteImages(markdown: string, fromPath: string, images: Map<string, string>): { markdown: string; used: string[] } {
  const used: string[] = [];
  const result = markdown.replace(/!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (match, alt: string, href: string) => {
    const path = resolvePath(fromPath, href);
    const id = path ? images.get(path) : undefined;
    if (!id) return match;
    used.push(id);
    return `![${alt}](${attachmentSrc(id)})`;
  });
  return { markdown: result, used };
}

/**
 * Les liens d'une page vers une autre page de l'export deviennent des liens entre pages Cockpit
 * (le texte lié est remplacé par le lien vers la page).
 */
export function convertPageLinks(doc: JSONContent, fromPath: string, pages: Map<string, { id: string; title: string }>): JSONContent {
  const convert = (node: JSONContent): JSONContent => {
    if (node.type === 'text') {
      const link = node.marks?.find((mark) => mark.type === 'link');
      const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : null;
      const target = href ? pages.get(resolvePath(fromPath, href) ?? '') : undefined;
      if (target) return { type: 'pageMention', attrs: { pageId: target.id, title: target.title } };
      return node;
    }
    return node.content ? { ...node, content: node.content.map(convert) } : node;
  };
  return convert(doc);
}
