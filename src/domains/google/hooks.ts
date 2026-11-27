import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import { db } from '@/core/db';
import { nowTimestamp, todayISO } from '@/core/dates';
import { queryKeys } from '@/core/query-keys';
import { humanizeError } from '@/core/db/errors';
import type { AppColor } from '@/ui/data/ColorDot';
import { toast } from '@/ui/overlays/toast';
import { setSettingStatement } from '@/domains/settings/repository';
import { setSubjectColorStatement } from '@/domains/school/subjects/repository';
import { GOOGLE_SYNC_MINUTES, SCHOOL_MANUAL_SETTING, splitGoogleItemId, type GoogleStatus } from './model';
import {
  connectGoogle,
  disconnectGoogle,
  fetchCalendars,
  fetchEvents,
  forgetGoogle,
  googleAvailable,
  googleWriter,
  readGoogleStatus,
  saveGoogleClient,
} from './native';
import {
  clearCalendarEventsStatement,
  autoSubjectStatements,
  clearGoogleStatement,
  deleteCourseLinkStatement,
  getCourse,
  getGoogleEvent,
  hasSchoolCalendar,
  homeworkForCourse,
  listCoursesBetween,
  listCoursesOn,
  listGoogleCalendars,
  nextCourseOccurrence,
  setCalendarColorStatement,
  setCalendarSchoolStatement,
  setCalendarShownStatement,
  setCourseLinkStatement,
} from './repository';
import { pushEdits } from './edits/service';
import { syncGoogle } from './service';

/** Les erreurs de la connexion Google arrivent déjà rédigées (texte du natif) : telles quelles. */
export function googleError(error: unknown): string {
  return typeof error === 'string' ? error : humanizeError(error);
}

/** Après une relecture ou un réglage : les agendas, tout ce qui montre l'agenda, et les matières (créées par les cours). */
export function refresh(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.google.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.school.all });
}

export function useGoogleStatus() {
  return useQuery({ queryKey: queryKeys.google.status, queryFn: readGoogleStatus });
}

export function useGoogleCalendars() {
  return useQuery({ queryKey: queryKeys.google.calendars, queryFn: () => listGoogleCalendars(db) });
}

/** Une relecture à la fois : les suivantes attendent la même. */
let running: Promise<number> | null = null;

function runSync(): Promise<number> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  running ??= (async () => {
    // D'abord les modifications faites dans Cockpit (hors ligne ou sans le droit : elles attendent).
    // Pas dans le navigateur de développement : Google n'y existe pas.
    if (googleAvailable()) await pushEdits(db, googleWriter, timeZone, nowTimestamp()).catch(() => undefined);
    return syncGoogle(db, { calendars: fetchCalendars, events: fetchEvents }, todayISO(), timeZone, nowTimestamp());
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Après une modification faite dans Cockpit : l'envoyer et relire, en arrière-plan, sans rien dire en cas
 * d'échec (hors ligne, droit à donner) : elle attend, et la copie locale la montre déjà.
 */
export function syncGoogleInBackground(queryClient: QueryClient): void {
  void runSync()
    .catch(() => undefined)
    .finally(() => refresh(queryClient));
}

/** Relire Google Agenda maintenant. Une erreur (réseau, connexion coupée) est dite, la copie d'avant reste. */
export function useSyncGoogle(options: { quiet?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runSync,
    onSettled: () => refresh(queryClient),
    onError: (error) => {
      // La connexion a pu être coupée côté Google : l'état le dira dans Paramètres.
      void queryClient.invalidateQueries({ queryKey: queryKeys.google.status });
      if (!options.quiet) toast(googleError(error), { tone: 'danger' });
    },
  });
}

/** Au lancement puis toutes les 15 minutes, tant que Google est connecté (monté dans la coquille). */
export function useGoogleAutoSync(): void {
  const { data: status } = useGoogleStatus();
  const sync = useSyncGoogle({ quiet: true });
  const connected = status?.connected ?? false;
  const { mutate } = sync;
  useEffect(() => {
    if (!connected) return;
    mutate();
    const timer = setInterval(() => mutate(), GOOGLE_SYNC_MINUTES * 60_000);
    return () => clearInterval(timer);
  }, [connected, mutate]);
}

function useStatusMutation<T>(run: (input: T) => Promise<GoogleStatus>, after?: (status: GoogleStatus, queryClient: QueryClient) => Promise<void> | void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (status) => {
      queryClient.setQueryData(queryKeys.google.status, status);
      await after?.(status, queryClient);
    },
  });
}

export function useSaveGoogleClient() {
  // Un autre client oublie la connexion d'avant : la copie locale part avec elle.
  return useStatusMutation(
    ({ clientId, clientSecret }: { clientId: string; clientSecret: string }) => saveGoogleClient(clientId, clientSecret),
    async (_, queryClient) => {
      await db.batch([clearGoogleStatement()]);
      refresh(queryClient);
    },
  );
}

/** Se connecter : le navigateur s'ouvre ; une fois autorisé, une première relecture. */
export function useConnectGoogle() {
  return useStatusMutation(
    () => connectGoogle(),
    async (status, queryClient) => {
      if (!status.connected) return;
      toast('Cockpit est connecté à Google Agenda.');
      await runSync().catch(() => undefined);
      refresh(queryClient);
    },
  );
}

/** Se déconnecter (ou tout oublier) : la copie locale des agendas part aussi. */
export function useDisconnectGoogle(forget = false) {
  return useStatusMutation(
    () => (forget ? forgetGoogle() : disconnectGoogle()),
    async (_, queryClient) => {
      await db.batch([clearGoogleStatement()]);
      refresh(queryClient);
    },
  );
}

/** Afficher ou masquer un agenda, changer sa couleur. Réafficher relit ses événements. */
export function useCalendarActions() {
  const queryClient = useQueryClient();
  return {
    setShown: async (id: string, shown: boolean) => {
      await db.batch([setCalendarShownStatement(id, shown, nowTimestamp()), ...(shown ? [] : [clearCalendarEventsStatement(id)])]);
      refresh(queryClient);
      if (shown) await runSync().catch((error: unknown) => toast(googleError(error), { tone: 'danger' }));
      refresh(queryClient);
    },
    setColor: async (id: string, color: AppColor) => {
      await db.batch([setCalendarColorStatement(id, color, nowTimestamp())]);
      refresh(queryClient);
    },
    /**
     * L'agenda des cours : ses événements deviennent des cours, les matières se créent à la relecture.
     * Choisi à la main, il ne se reconnaît plus tout seul.
     */
    setSchool: async (id: string, school: boolean) => {
      await db.batch([setCalendarSchoolStatement(id, school, nowTimestamp()), setSettingStatement(SCHOOL_MANUAL_SETTING, true)]);
      refresh(queryClient);
      await runSync().catch((error: unknown) => toast(googleError(error), { tone: 'danger' }));
      refresh(queryClient);
    },
  };
}

// ─── Cours ──────────────────────────────────────────────────────────────────

/** Les cours d'un jour venant de l'agenda des cours (Aujourd'hui en mode Cours). */
export function useGoogleCourses(day: string) {
  return useQuery({ queryKey: queryKeys.google.courses(day), queryFn: () => listCoursesOn(db, day) });
}

/** Les cours de [from, to[ avec le nombre de devoirs à rendre pour chacun (Emploi du temps, choix d'un cours). */
export function useCoursesBetween(from: string, to: string) {
  return useQuery({ queryKey: queryKeys.agenda.courses(from, to), queryFn: () => listCoursesBetween(db, from, to) });
}

/** Un cours précis (celui d'un devoir), `null` s'il n'est plus dans la copie locale. */
export function useCourse(itemId: string | null) {
  return useQuery({
    queryKey: queryKeys.agenda.course(itemId ?? ''),
    enabled: itemId !== null,
    queryFn: async () => (await getCourse(db, itemId!)) ?? null,
  });
}

/** Y a-t-il un agenda des cours ? Sans lui, un devoir se rattache à une matière et une date, comme avant. */
export function useHasSchoolCalendar() {
  return useQuery({ queryKey: queryKeys.agenda.hasSchoolCalendar, queryFn: () => hasSchoolCalendar(db) });
}

/**
 * Pour un cours ouvert : les devoirs à rendre pour lui, et l'occurrence suivante du même cours (un
 * nouveau devoir s'y rend par défaut).
 */
export function useCourseHomework(itemId: string | null, course: string | null, subjectId: string | null, startsAt: string | null) {
  return useQuery({
    queryKey: [...queryKeys.agenda.courseHomework(itemId ?? ''), course, subjectId, startsAt],
    enabled: itemId !== null && startsAt !== null,
    queryFn: async () => ({
      next: course ? ((await nextCourseOccurrence(db, course, startsAt!)) ?? null) : null,
      homework: await homeworkForCourse(db, itemId!, subjectId, startsAt!.slice(0, 10)),
    }),
  });
}

/** La couleur d'un cours : celle de sa matière (créée toute seule), partout où il s'affiche. */
export function useSetCourseColor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subjectId, color }: { subjectId: string; color: AppColor }) =>
      db.batch([setSubjectColorStatement(subjectId, color, nowTimestamp())]),
    onSuccess: () => {
      refresh(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

/**
 * « Ce n'est pas un cours » : l'intitulé est ignoré pour de bon (`ignored`), ou redevient un cours, avec
 * sa matière retrouvée ou recréée toute seule.
 */
export function useIgnoreCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ course, ignored }: { course: string; ignored: boolean }) => {
      const now = nowTimestamp();
      if (ignored) {
        await db.batch([setCourseLinkStatement(course, null, now)]);
        return;
      }
      await db.batch([deleteCourseLinkStatement(course)]);
      const subjects = await autoSubjectStatements(db, now);
      if (subjects.statements.length) await db.batch(subjects.statements);
    },
    onSuccess: () => refresh(queryClient),
  });
}

// ─── Détail d'un événement ──────────────────────────────────────────────────

/** L'événement Google ouvert depuis l'agenda (identifiant `agenda|événement`), en lecture seule. */
export const useGoogleEventSheet = create<{ itemId: string | null; open: (itemId: string) => void; close: () => void }>()((set) => ({
  itemId: null,
  open: (itemId) => set({ itemId }),
  close: () => set({ itemId: null }),
}));

export function useGoogleEvent(itemId: string | null) {
  return useQuery({
    queryKey: queryKeys.google.event(itemId ?? ''),
    enabled: itemId !== null,
    queryFn: async () => {
      const { calendarId, eventId } = splitGoogleItemId(itemId!);
      return (await getGoogleEvent(db, calendarId, eventId)) ?? null;
    },
  });
}

export { googleAvailable };
