import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { shorten } from '@/core/text';
import { toast } from '@/ui/overlays/toast';
import { refresh, syncGoogleInBackground } from '../hooks';
import { changedFields, editStatusFor, googleEventId, type EditScope, type EventContent, type GoogleEdit } from './model';
import { deleteEditStatement, listEdits } from './repository';
import { recordEdit, undoEdit } from './service';

/** L'événement visé : son agenda (modifiable chez Google ou non) et sa série s'il se répète. */
export type EditTarget = { calendarId: string; eventId: string; seriesId: string | null; writable: boolean };

function editOf(target: EditTarget, op: GoogleEdit['op'], scope: EditScope, now: string): GoogleEdit {
  return {
    id: newId(),
    calendarId: target.calendarId,
    eventId: target.eventId,
    seriesId: target.seriesId,
    op,
    scope: target.seriesId ? scope : 'this',
    fields: [],
    status: editStatusFor(target.writable),
    error: null,
    createdAt: now,
  };
}

/** Ce que dit le message, selon que la modification part chez Google ou reste dans Cockpit. */
const where = (writable: boolean) => (writable ? '' : ' (dans Cockpit seulement)');

/**
 * Enregistrer un événement modifié : seulement ce qui a changé. Pour une série, `all` change toutes ses
 * occurrences (l'heure, pas le jour). La copie locale le montre aussitôt ; l'envoi suit.
 */
export function useSaveGoogleEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { target: EditTarget; before: EventContent; after: EventContent; scope: EditScope }) => {
      const fields = changedFields(input.before, input.after);
      if (fields.length === 0) return false;
      const now = nowTimestamp();
      await recordEdit(db, { ...editOf(input.target, 'patch', input.scope, now), ...input.after, fields }, now);
      return true;
    },
    onSuccess: (changed, { target }) => {
      refresh(queryClient);
      if (!changed) return;
      toast(`Événement modifié${where(target.writable)}.`);
      if (target.writable) syncGoogleInBackground(queryClient);
    },
  });
}

/** Supprimer un événement Google (ou toute sa série), avec « Annuler » (P : jamais de confirmation définitive). */
export function useDeleteGoogleEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { target: EditTarget; scope: EditScope; title: string }) => {
      const now = nowTimestamp();
      return recordEdit(db, editOf(input.target, 'delete', input.scope, now), now);
    },
    onSuccess: (undo, { target, title }) => {
      refresh(queryClient);
      toast(`« ${shorten(title)} » supprimé${where(target.writable)}.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () =>
            void undoEdit(db, undo, nowTimestamp()).then(() => {
              refresh(queryClient);
              if (target.writable) syncGoogleInBackground(queryClient);
            }),
        },
      });
      if (target.writable) syncGoogleInBackground(queryClient);
    },
  });
}

/** Créer un événement dans un agenda Google (choisi dans « Nouvel événement »). */
export function useCreateGoogleEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { calendarId: string; content: EventContent; recurrence: string | null }) => {
      const now = nowTimestamp();
      const id = newId();
      const target: EditTarget = { calendarId: input.calendarId, eventId: googleEventId(id), seriesId: null, writable: true };
      await recordEdit(db, { ...editOf(target, 'insert', 'this', now), id, ...input.content, recurrence: input.recurrence }, now);
      return target.eventId;
    },
    onSuccess: () => {
      refresh(queryClient);
      syncGoogleInBackground(queryClient);
    },
  });
}

/**
 * Déplacer un événement Google dans le calendrier (glisser-déposer) : cette occurrence seulement, avec
 * « Annuler ».
 */
export function useMoveGoogleEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { target: EditTarget; before: EventContent; after: EventContent }) => {
      const now = nowTimestamp();
      const fields = changedFields(input.before, input.after);
      if (fields.length === 0) return null;
      return recordEdit(db, { ...editOf(input.target, 'patch', 'this', now), ...input.after, fields }, now);
    },
    onSuccess: (undo, { target, after }) => {
      refresh(queryClient);
      if (!undo) return;
      toast(`« ${shorten(after.title)} » déplacé${where(target.writable)}.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () =>
            void undoEdit(db, undo, nowTimestamp()).then(() => {
              refresh(queryClient);
              if (target.writable) syncGoogleInBackground(queryClient);
            }),
        },
      });
      if (target.writable) syncGoogleInBackground(queryClient);
    },
  });
}

/**
 * Rétablir un événement d'un agenda en lecture seule (l'intranet) : ses retouches dans Cockpit partent, la
 * relecture suivante le remet comme Google le donne.
 */
export function useRestoreGoogleEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (target: EditTarget) => {
      const edits = await listEdits(db, { statuses: ['local'], calendarId: target.calendarId });
      const mine = edits.filter((e) => e.eventId === target.eventId || (target.seriesId !== null && e.seriesId === target.seriesId && e.scope === 'all'));
      if (mine.length > 0) await db.batch(mine.map((e) => deleteEditStatement(e.id)));
    },
    onSuccess: () => {
      toast('Retouches retirées : l’événement revient comme dans Google Agenda.');
      syncGoogleInBackground(queryClient);
    },
  });
}
