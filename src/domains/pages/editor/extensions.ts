import type { AnyExtension } from '@tiptap/core';
import { AttachmentImage } from './attachment-image';
import { schemaExtensions } from './nodes';
import { PageMention, type PageMentionOptions } from './page-mention';

/**
 * Les blocs d'une page dans l'éditeur : le schéma (editor/nodes.ts), avec les vues React des liens
 * entre pages (titre à jour, clic pour ouvrir, « [[ » pour en insérer) et des images (lues dans la base).
 */
export function contentExtensions(mention?: PageMentionOptions): AnyExtension[] {
  return schemaExtensions({ mention: mention ? PageMention.configure(mention) : PageMention, image: AttachmentImage });
}
