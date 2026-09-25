import { Lightbulb, ListPlus, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { handleRowKeyDown } from '@/ui/data/row-keys';
import { useCreateIdea, useDeleteIdea, useIdeaToTask, useProjectIdeas, useRenameIdea } from '../hooks';
import { cleanIdeaTitle, type Idea } from '../model';

const rowClass =
  '-mx-2.5 grid min-h-11 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-md px-2.5 outline-none ' +
  'transition-colors duration-[120ms] ease-soft';

const actionClass =
  'flex h-7 items-center gap-1.5 rounded-md text-meta text-ink-2 transition-colors duration-[120ms] ease-soft hover:text-ink';

/** Champ de saisie d'une idée : Entrée valide, Échap abandonne, quitter le champ valide aussi. */
function IdeaInput(props: {
  initial: string;
  placeholder: string;
  label: string;
  onSubmit: (title: string) => void;
  onClose: () => void;
  /** Vrai : le champ reste ouvert après Entrée, pour enchaîner (ajout). */
  keepOpen?: boolean;
}) {
  const [draft, setDraft] = useState(props.initial);
  // Après Échap (ou Entrée qui ferme), la perte du focus qui suit ne doit rien enregistrer.
  const cancelled = useRef(false);
  const submit = () => {
    const title = cleanIdeaTitle(draft);
    if (!cancelled.current && title && title !== props.initial) props.onSubmit(title);
  };
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
          if (props.keepOpen) {
            setDraft('');
          } else {
            cancelled.current = true;
            props.onClose();
          }
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          cancelled.current = true;
          props.onClose();
        }
      }}
      onBlur={() => {
        submit();
        props.onClose();
      }}
      placeholder={props.placeholder}
      aria-label={props.label}
      className="h-9 min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
    />
  );
}

/**
 * Une idée : un clic (ou Entrée) pour la reformuler. Au survol : « En faire une tâche » et supprimer.
 * Suppr supprime aussi, avec « Annuler » dans le toast.
 */
function IdeaRow({ idea }: { idea: Idea }) {
  const [editing, setEditing] = useState(false);
  const rename = useRenameIdea();
  const remove = useDeleteIdea();
  const toTask = useIdeaToTask();

  if (editing) {
    return (
      <div className={`${rowClass} bg-elevated ring-2 ring-accent-soft`}>
        <Lightbulb className="size-4 justify-self-center text-ink-3" strokeWidth={1.75} />
        <IdeaInput
          initial={idea.title}
          placeholder="Idée"
          label="Reformuler l’idée"
          onSubmit={(title) => rename.mutate({ id: idea.id, title })}
          onClose={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-row
      onClick={() => setEditing(true)}
      onKeyDown={(event) => handleRowKeyDown(event, { open: () => setEditing(true), remove: () => remove.mutate(idea) })}
      className={`group ${rowClass} cursor-default hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-soft`}
    >
      <Lightbulb className="size-4 justify-self-center text-ink-3" strokeWidth={1.75} />
      <span className="truncate">{idea.title}</span>
      <span className="flex items-center gap-3 opacity-0 transition-opacity duration-[120ms] ease-soft group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toTask.mutate(idea);
          }}
          className={actionClass}
        >
          <ListPlus className="size-3.5" strokeWidth={1.75} />
          En faire une tâche
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            remove.mutate(idea);
          }}
          aria-label="Supprimer l’idée"
          title="Supprimer · Suppr"
          className={`${actionClass} hover:!text-danger`}
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </button>
      </span>
    </div>
  );
}

function InlineAddIdea({ projectId }: { projectId: string }) {
  const [editing, setEditing] = useState(false);
  const create = useCreateIdea();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="-mx-2.5 flex min-h-11 w-[calc(100%+20px)] items-center gap-3.5 rounded-md px-2.5 text-ink-3 transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink-2"
      >
        <Plus className="size-[18px]" strokeWidth={1.75} />
        Noter une idée
      </button>
    );
  }

  return (
    <div className="-mx-2.5 flex min-h-11 items-center gap-3.5 px-2.5">
      <Lightbulb className="size-[18px] shrink-0 text-ink-3" strokeWidth={1.75} />
      <IdeaInput
        initial=""
        placeholder="Une idée pour plus tard, puis Entrée"
        label="Nouvelle idée"
        onSubmit={(title) => create.mutate({ projectId, title })}
        onClose={() => setEditing(false)}
        keepOpen
      />
    </div>
  );
}

/**
 * Idées d'un projet : ce qu'on fera peut-être, plus tard. Elles ne comptent ni dans la progression
 * ni dans les vues de tâches ; « En faire une tâche » les fait passer dans la liste des tâches.
 */
export function ProjectIdeas({ projectId }: { projectId: string }) {
  const { data: ideas = [] } = useProjectIdeas(projectId);
  return (
    <section>
      <div className="mb-2 flex items-center gap-2.5">
        <h2 className="font-semibold">Idées</h2>
        {ideas.length > 0 && <span className="tnum text-meta text-ink-3">{ideas.length}</span>}
      </div>
      {ideas.map((idea) => (
        <IdeaRow key={idea.id} idea={idea} />
      ))}
      <InlineAddIdea projectId={projectId} />
    </section>
  );
}
