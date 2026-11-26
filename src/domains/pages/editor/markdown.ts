import { MarkdownManager } from '@tiptap/markdown';
import { schemaExtensions } from './nodes';

let manager: MarkdownManager | null = null;

/** Markdown ↔ contenu d'une page (import Notion, export d'une page), avec le schéma des pages. */
export function markdownManager(): MarkdownManager {
  manager ??= new MarkdownManager({ extensions: schemaExtensions() });
  return manager;
}
