import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { usePaymentEditor } from '@/domains/finance/payments/editor-store';
import { useExamEditor } from '@/domains/school/exams/components/ExamDialog';
import { useTaskSheet } from '@/domains/tasks/sheet-store';
import { useEventSheet } from './event-sheet-store';
import type { AgendaItem } from './model';

/** Un clic sur un élément de l'agenda ouvre sa source : fiche projet, tâche, encaissement, événement, examen ou matière (un cours). */
export function useOpenAgendaItem(): (item: AgendaItem) => void {
  const navigate = useNavigate();
  const openTask = useTaskSheet((state) => state.openTask);
  const openEvent = useEventSheet((state) => state.openEvent);
  const openPayment = usePaymentEditor((state) => state.openPayment);
  const openExam = useExamEditor((state) => state.openExam);

  return useCallback(
    (item: AgendaItem) => {
      switch (item.source) {
        case 'event':
          openEvent(item.id, item.occurrence);
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
        case 'exam':
          openExam(item.id);
          break;
        case 'class':
          if (item.subjectId) void navigate({ to: '/subjects/$subjectId', params: { subjectId: item.subjectId } });
          break;
      }
    },
    [navigate, openTask, openEvent, openPayment, openExam],
  );
}
