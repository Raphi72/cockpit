import { useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { useCreateStore, type CreateDefaults, type CreatedFromLine } from '@/app/create-store';
import { db } from '@/core/db';
import { humanizeError } from '@/core/db/errors';
import { useToday } from '@/core/use-today';
import { useCreateTask, useDeleteTask } from '@/domains/tasks/hooks';
import { getTask } from '@/domains/tasks/repository';
import { shorten } from '@/core/text';
import { toast } from '@/ui/overlays/toast';
import { saveAttachment, useCreatePage, useSavePageContent } from '../hooks';
import { attachmentSrc, parseDoc, type Page, type PageItem } from '../model';
import { CheckboxToTask } from './checkbox-to-task';
import { contentExtensions } from './extensions';
import { isImageFile, shrinkImage } from './images';
import { BlockGutter } from './BlockGutter';
import { undoLineCreation, useLineToIdea } from './line-actions';
import { LineMenu, type LineChoice } from './LineMenu';
import { deleteLine, findLine, lineAt, restoreLine, type LineRemoval, type PageLine } from './page-lines';
import { SlashCommand } from './slash-command';

/** Enregistrement automatique : quelques instants après la dernière frappe. */
const SAVE_DELAY_MS = 600;

/** Le menu du clic droit : où il s'ouvre, et la ligne visée. */
type LineMenuState = { x: number; y: number; line: PageLine };

/**
 * L'éditeur d'une page (TipTap) : blocs, « / » pour en insérer, « [[ » pour citer une page, images
 * collées ou déposées (réduites, gardées dans la base), raccourcis Markdown (# titre, - liste, [ ] case…).
 * Un clic droit sur une ligne en fait une tâche, un devoir, un événement, une idée ou un projet ; à gauche
 * de chaque bloc, au survol, « + » en ajoute un dessous et « ⠿ » le déplace ou ouvre ses actions.
 * Tout s'enregistre seul ; un changement de page enregistre d'abord ce qui attendait.
 */
export function PageEditor({ page, pages, onFocusTitle }: { page: Page; pages: PageItem[]; onFocusTitle?: () => void }) {
  const save = useSavePageContent();
  const createPage = useCreatePage();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const queryClient = useQueryClient();
  const openCreate = useCreateStore((state) => state.openCreate);
  const toIdea = useLineToIdea();
  const today = useToday();
  const [lineMenu, setLineMenu] = useState<LineMenuState | null>(null);
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
        handleDOMEvents: {
          // Clic droit sur une ligne (ou touche Menu) : nos actions. Sur une sélection, une ligne vide, du
          // code ou un tableau, le menu habituel (copier, coller…).
          contextmenu: (view, event) => {
            if (!view.editable || page.isTemplate) return false;
            const pointer = event.clientX !== 0 || event.clientY !== 0;
            const pos = pointer ? view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos : view.state.selection.from;
            if (pos === undefined) return false;
            const { from, to, empty } = view.state.selection;
            if (!empty && pos >= from && pos <= to) return false;
            const line = lineAt(view.state.doc, pos);
            if (!line) return false;
            event.preventDefault();
            const caret = pointer ? null : view.coordsAtPos(line.pos);
            setLineMenu({ x: caret ? caret.left : event.clientX, y: caret ? caret.bottom : event.clientY, line });
            return true;
          },
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

  /**
   * La ligne est devenue autre chose : elle quitte la page (hors de l'historique de l'éditeur, seul
   * « Annuler » la remet), et le toast l'annonce. « Annuler » retire ce qui a été créé et remet la ligne,
   * dans l'éditeur s'il est encore ouvert, sinon dans la page enregistrée.
   */
  const lineBecame = (current: Editor | null, line: PageLine, created: CreatedFromLine) => {
    let removal: LineRemoval | null = null;
    const found = current && !current.isDestroyed ? findLine(current.state.doc, line) : null;
    if (current && found) {
      const tr = current.state.tr.setMeta('addToHistory', false);
      const removed = deleteLine(tr, found);
      current.view.dispatch(tr);
      removal = { ...removed, after: current.state.doc };
    }
    const pageId = page.id;
    toast(created.message, {
      action: {
        label: 'Annuler',
        undo: true,
        onClick: () => {
          const open = current !== null && !current.isDestroyed;
          if (open && removal) {
            const tr = current.state.tr.setMeta('addToHistory', false);
            restoreLine(tr, removal);
            current.view.dispatch(tr);
          }
          void undoLineCreation(queryClient, created, !open && removal ? { pageId, removal } : undefined).catch((error: unknown) =>
            toast(humanizeError(error), { tone: 'danger' }),
          );
        },
      },
    });
  };

  const chooseForLine = (line: PageLine, choice: LineChoice) => {
    const current = editor;
    const fromLine: CreateDefaults['fromLine'] = { text: line.text, onCreated: (created) => lineBecame(current, line, created) };
    // Ce qui est rattaché à la page (projet, matière) l'est aussi à ce qu'on crée.
    const { projectId, subjectId } = taskAttachment;
    switch (choice.kind) {
      case 'task':
        openCreate('task', { projectId, scheduledDate: projectId ? null : today, fromLine });
        return;
      case 'homework':
        openCreate('homework', { subjectId, fromLine });
        return;
      case 'event':
        openCreate('event', { projectId, fromLine });
        return;
      case 'project':
        openCreate('project', { fromLine });
        return;
      case 'idea':
        toIdea.mutate(
          { text: line.text, projectId: choice.projectId },
          { onSuccess: (id) => lineBecame(current, line, { kind: 'idea', id, message: `Idée ajoutée à ${shorten(choice.projectName)}.` }) },
        );
    }
  };

  return (
    <>
      <BlockGutter
        editor={editor}
        pageId={page.id}
        pageProjectId={taskAttachment.projectId}
        onLineChoice={page.isTemplate ? undefined : chooseForLine}
      >
        <EditorContent editor={editor} />
      </BlockGutter>
      <LineMenu
        at={lineMenu}
        pageProjectId={taskAttachment.projectId}
        onChoose={(choice) => lineMenu && chooseForLine(lineMenu.line, choice)}
        onClose={(chose) => {
          setLineMenu(null);
          // Rien de choisi, ou une idée (sans fenêtre) : on reprend l'écriture dans la page.
          if (!chose || chose.kind === 'idea') editor?.commands.focus();
        }}
      />
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

