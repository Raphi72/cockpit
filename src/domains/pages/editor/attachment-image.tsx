import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useAttachment } from '../hooks';
import { attachmentIdOf } from '../model';
import { PageImageNode } from './nodes';

/** Une image de page : sa pièce jointe (`attachment:<id>`), lue dans la base ; une adresse web reste telle quelle. */
function ImageView({ node, selected }: ReactNodeViewProps) {
  const src = String(node.attrs.src ?? '');
  const id = attachmentIdOf(src);
  const { data } = useAttachment(id);
  const resolved = id ? data : src;
  return (
    <NodeViewWrapper className={`page-image ${selected ? 'is-selected' : ''}`} data-drag-handle>
      {resolved ? (
        <img src={resolved} alt={String(node.attrs.alt ?? '')} draggable={false} />
      ) : (
        <span className="page-image-missing">{id && data === null ? 'Image introuvable' : 'Chargement de l’image…'}</span>
      )}
    </NodeViewWrapper>
  );
}

/** L'image de TipTap, dessinée depuis les pièces jointes de la page. */
export const AttachmentImage = PageImageNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
