import type { JSONContent } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { db } from '@/core/db';
import { humanizeError } from '@/core/db/errors';
import { useCreateTask, useDeleteTask } from '@/domains/tasks/hooks';
import { getTask } from '@/domains/tasks/repository';
import { shorten } from '@/core/text';
import { toast } from '@/ui/overlays/toast';
import { saveAttachment, useCreatePage, useSavePageContent } from '../hooks';
import { attachmentSrc, parseDoc, type Page, type PageItem } from '../model';
import { CheckboxToTask } from './checkbox-to-task';
import { contentExtensions } from './extensions';
import { isImageFile, shrinkImage } from './images';
import { SlashCommand } from './slash-command';

/** Enregistrement automatique : quelques instants après la dernière frappe. */
const SAVE_DELAY_MS = 600;

/**
 * L'éditeur d'une page (TipTap) : blocs, « / » pour en insérer, « [[ » pour citer une page, images
 * collées ou déposées (réduites, gardées dans la base), raccourcis Markdown (# titre, - liste, [ ] case…).
 * Tout s'enregistre seul ; un changement de page enregistre d'abord ce qui attendait.
 */
export function PageEditor({ page, pages, onFocusTitle }: { page: Page; pages: PageItem[]; onFocusTitle?: () => void }) {
  const save = useSavePageContent();
  const createPage = useCreatePage();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<JSONContent | null>(null);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) save.mutate({ id: page.id, doc: pending.current });
    pending.current = null;
  };

  const insertImages = async (files: File[], at?: number) => {
    for (const file of files.filter(isImageFile)) {
      try {
        const { mime, data } = await shrinkImage(file);
        const id = await saveAttachment(page.id, mime, data);
        const chain = editor?.chain().focus();
        if (!chain) return;
        (at === undefined ? chain : chain.setTextSelection(at)).setImage({ src: attachmentSrc(id), alt: file.name }).run();
      } catch (error) {
        toast(humanizeError(error), { tone: 'danger' });
      }
    }
  };

  // Ce qui est rattaché à la page (projet, matière) l'est aussi à la tâche née d'une case.
  const taskAttachment = {
    projectId: page.entityType === 'project' ? page.entityId : null,
    subjectId: page.entityType === 'subject' ? page.entityId : null,
  };

  const editor = useEditor(
    {
      extensions: [
        ...contentExtensions({
          getPages: () => pagesRef.current,
          createPage: (title) => createPage.mutateAsync({ title, parentId: page.id }),
          currentPageId: page.id,
        }),
        Placeholder.configure({
          placeholder: ({ node }) => (node.type.name === 'heading' ? 'Titre' : 'Écris, ou tape / pour insérer un bloc…'),
        }),
        SlashCommand.configure({
          pickImage: () => fileInput.current?.click(),
          createSubpage: async () => ({ id: await createPage.mutateAsync({ parentId: page.id, title: 'Nouvelle page' }), title: 'Nouvelle page' }),
        }),
        CheckboxToTask.configure({
          createTask: async (title) => {
            const id = await createTask.mutateAsync({
              title,
              ...taskAttachment,
              scheduledDate: null,
              dueDate: null,
              priority: 1,
              estimateMin: null,
              notes: null,
            });
            toast(`Devenue une tâche : ${shorten(title)}`, {
              action: {
                label: 'Annuler',
                undo: true,
                onClick: () => {
                  void getTask(db, id).then((task) => task && deleteTask.mutate(task));
                  editor?.commands.undo();
                },
              },
            });
          },
        }),
      ],
      content: parseDoc(page.content),
      editorProps: {
        attributes: { class: 'page-editor', 'aria-label': 'Contenu de la page' },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])].filter(isImageFile);
          if (files.length === 0) return false;
          event.preventDefault();
          void insertImages(files);
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          const files = [...(event.dataTransfer?.files ?? [])].filter(isImageFile);
          if (moved || files.length === 0) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          void insertImages(files, pos);
          return true;
        },
        handleKeyDown: (view, event) => {
          // Flèche haut au tout début : retour au titre.
          if (event.key === 'ArrowUp' && view.state.selection.from <= 1 && onFocusTitle) {
            onFocusTitle();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: current }) => {
        pending.current = current.getJSON();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_DELAY_MS);
      },
    },
    [page.id],
  );

  // Quitter la page (ou en ouvrir une autre) enregistre ce qui attendait.
  useEffect(() => () => flush(), [page.id]);

  return (
    <>
      <EditorContent editor={editor} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          void insertImages([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
    </>
  );
}

