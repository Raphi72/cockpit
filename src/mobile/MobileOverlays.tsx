import { CreateEventDialog } from '@/domains/agenda/components/CreateEventDialog';
import { EventSheet } from '@/domains/agenda/components/EventSheet';
import { ClientEditorDialog, CreateClientDialog } from '@/domains/clients/components/ClientDialog';
import { FocusMode } from '@/domains/companion/components/FocusMode';
import { RecoveryNotice } from '@/domains/data/components/RecoveryNotice';
import { GoogleEventDialog } from '@/domains/google/components/GoogleEventDialog';
import { WorkoutDialog } from '@/domains/habits/components/WorkoutDialog';
import { CreatePageOnDemand } from '@/domains/pages/components/CreatePageOnDemand';
import { CreateProjectDialog } from '@/domains/projects/components/CreateProjectDialog';
import { CreateExamDialog, ExamEditorDialog } from '@/domains/school/exams/components/ExamDialog';
import { RevisionPlanDialog } from '@/domains/school/exams/components/RevisionPlanDialog';
import { CreateGradeDialog, GradeEditorDialog } from '@/domains/school/grades/components/GradeDialog';
import { CreateSubjectDialog } from '@/domains/school/subjects/components/SubjectDialog';
import { CreateTaskDialog } from '@/domains/tasks/components/CreateTaskDialog';
import { TaskSheet } from '@/domains/tasks/components/TaskSheet';
import { WorkPlanDialog } from '@/domains/tasks/components/WorkPlanDialog';

/**
 * Les fenêtres des pages reprises du PC (créer, fiche d'une tâche, d'un événement, d'un examen, focus).
 * Pas celles de l'argent (seulement en lecture, dans « À surveiller »), ni la recherche, les raccourcis,
 * la sélection multiple ou l'écran du matin, faits pour le clavier et le grand écran.
 */
export function MobileOverlays() {
  return (
    <>
      <CreateTaskDialog />
      <CreateEventDialog />
      <CreateProjectDialog />
      <CreateClientDialog />
      <ClientEditorDialog />
      <CreateSubjectDialog />
      <CreateExamDialog />
      <ExamEditorDialog />
      <CreateGradeDialog />
      <GradeEditorDialog />
      <RevisionPlanDialog />
      <CreatePageOnDemand />
      <WorkoutDialog />
      <WorkPlanDialog />
      <TaskSheet />
      <EventSheet />
      <GoogleEventDialog />
      <FocusMode />
      <RecoveryNotice />
    </>
  );
}
