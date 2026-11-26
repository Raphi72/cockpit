import { CreateEventDialog } from '@/domains/agenda/components/CreateEventDialog';
import { EventSheet } from '@/domains/agenda/components/EventSheet';
import { ClientEditorDialog, CreateClientDialog } from '@/domains/clients/components/ClientDialog';
import { Companion } from '@/domains/companion/components/Companion';
import { RecoveryNotice } from '@/domains/data/components/RecoveryNotice';
import { CreatePaymentDialog, PaymentEditorDialog } from '@/domains/finance/payments/components/PaymentDialog';
import { ReceivePaymentDialog } from '@/domains/finance/payments/components/ReceivePaymentDialog';
import { CreateTransactionDialog, TransactionEditorDialog } from '@/domains/finance/transactions/components/TransactionDialog';
import { GoogleEventDialog } from '@/domains/google/components/GoogleEventDialog';
import { WorkoutDialog } from '@/domains/habits/components/WorkoutDialog';
import { CreatePageOnDemand } from '@/domains/pages/components/CreatePageOnDemand';
import { CreateProjectDialog } from '@/domains/projects/components/CreateProjectDialog';
import { CreateExamDialog, ExamEditorDialog } from '@/domains/school/exams/components/ExamDialog';
import { RevisionPlanDialog } from '@/domains/school/exams/components/RevisionPlanDialog';
import { CreateGradeDialog, GradeEditorDialog } from '@/domains/school/grades/components/GradeDialog';
import { CreateSubjectDialog } from '@/domains/school/subjects/components/SubjectDialog';
import { CommandPalette } from '@/domains/search/components/CommandPalette';
import { CreateTaskDialog } from '@/domains/tasks/components/CreateTaskDialog';
import { SelectionBar } from '@/domains/tasks/components/SelectionBar';
import { TaskSheet } from '@/domains/tasks/components/TaskSheet';
import { WorkPlanDialog } from '@/domains/tasks/components/WorkPlanDialog';
import { ShortcutsDialog } from './ShortcutsDialog';

/**
 * Les fenêtres globales, ouvrables depuis n'importe quelle page. Dans un morceau à part, chargé juste
 * après le premier affichage (voir AppShell) : la page s'affiche sans attendre ces ~25 fenêtres, et
 * elles sont prêtes une fraction de seconde plus tard, bien avant qu'on en ouvre une.
 */
export function Overlays() {
  return (
    <>
      <CreateTaskDialog />
      <CreateEventDialog />
      <CreateProjectDialog />
      <CreateClientDialog />
      <CreateSubjectDialog />
      <CreateExamDialog />
      <ExamEditorDialog />
      <CreateGradeDialog />
      <GradeEditorDialog />
      <CreatePageOnDemand />
      <RevisionPlanDialog />
      <WorkoutDialog />
      <CreatePaymentDialog />
      <CreateTransactionDialog />
      <ReceivePaymentDialog />
      <PaymentEditorDialog />
      <ClientEditorDialog />
      <TransactionEditorDialog />
      <WorkPlanDialog />
      <TaskSheet />
      <EventSheet />
      <GoogleEventDialog />
      <SelectionBar />
      <CommandPalette />
      <ShortcutsDialog />
      {/* Le compagnon : écran du matin, mode focus, célébrations, sons. */}
      <Companion />
      {/* Une base abîmée reprise au démarrage : ce qui a été fait, une seule fois. */}
      <RecoveryNotice />
    </>
  );
}
