import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { usePaymentEditor } from '@/domains/finance/payments/editor-store';
import { useTaskSheet } from '@/domains/tasks/sheet-store';
import { useEventSheet } from './event-sheet-store';
import type { AgendaItem } from './model';

/** Un clic sur un élément de l'agenda ouvre sa source : fiche projet, tâche, encaissement ou événement. */
export function useOpenAgendaItem(): (item: AgendaItem) => void {
  const navigate = useNavigate();
  const openTask = useTaskSheet((state) => state.openTask);
  const openEvent = useEventSheet((state) => state.openEvent);
  const openPayment = usePaymentEditor((state) => state.openPayment);

  return useCallback(
    (item: AgendaItem) => {
      switch (item.source) {
        case 'event':
          openEvent(item.id);
          break;
        case 'task':
          openTask(item.id);
          break;
        case 'payment':
          openPayment(item.id);
          break;
        case 'project':
          void navigate({ to: '/projects/$projectId', params: { projectId: item.id } });
          break;
      }
    },
    [navigate, openTask, openEvent, openPayment],
  );
}
