import { useState, type FormEvent } from 'react';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { Textarea } from '@/ui/primitives/Input';
import { useDeleteCard, useSaveCard } from '../hooks';
import type { Flashcard } from '../model';

function CardForm({ subjectId, card, onDone }: { subjectId: string; card?: Flashcard; onDone: () => void }) {
  const [front, setFront] = useState(card?.front ?? '');
  const [back, setBack] = useState(card?.back ?? '');
  const save = useSaveCard();
  const remove = useDeleteCard();
  const valid = front.trim() !== '' && back.trim() !== '';

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!valid) return;
    save.mutate(
      { id: card?.id, subjectId, front, back },
      {
        onSuccess: () => {
          if (card) return onDone();
          // Une carte de plus : le formulaire se vide pour enchaîner.
          setFront('');
          setBack('');
        },
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          submit();
        }
      }}
      className="mt-5"
    >
      <label className="block text-meta font-medium text-ink-2" htmlFor="card-front">
        Question (recto)
      </label>
      <Textarea id="card-front" autoFocus value={front} onChange={(e) => setFront(e.target.value)} placeholder="Date de la prise de la Bastille ?" className="mt-1.5 min-h-20" />
      <label className="mt-4 block text-meta font-medium text-ink-2" htmlFor="card-back">
        Réponse (verso)
      </label>
      <Textarea id="card-back" value={back} onChange={(e) => setBack(e.target.value)} placeholder="14 juillet 1789" className="mt-1.5 min-h-20" />
      {card?.pageId && <p className="mt-3 text-meta text-ink-3">Cette carte vient d’une page : sa ligne « question :: réponse » la remet à jour.</p>}
      <DialogFooter>
        {card && (
          <Button variant="ghost" className="mr-auto !text-danger" onClick={() => remove.mutate(card.id, { onSuccess: onDone })}>
            Supprimer
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          {card ? 'Annuler' : 'Fermer'}
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={!valid || save.isPending}>
          {card ? 'Enregistrer' : 'Ajouter la carte'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Ajouter des cartes à une matière (le formulaire se vide après chaque ajout), ou modifier une carte. */
export function CardDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; subjectId: string; card?: Flashcard }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title={props.card ? 'Carte' : 'Nouvelles cartes'}>
      {props.open && <CardForm key={props.card?.id ?? 'new'} subjectId={props.subjectId} card={props.card} onDone={() => props.onOpenChange(false)} />}
    </Dialog>
  );
}
