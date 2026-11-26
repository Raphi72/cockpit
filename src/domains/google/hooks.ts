import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import { db } from '@/core/db';
import { nowTimestamp, todayISO } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { humanizeError } from '@/core/db/errors';
import type { AppColor } from '@/ui/data/ColorDot';
import { toast } from '@/ui/overlays/toast';
import { GOOGLE_SYNC_MINUTES, splitGoogleItemId, type GoogleStatus } from './model';
import {
  connectGoogle,
  disconnectGoogle,
  fetchCalendars,
  fetchEvents,
  forgetGoogle,
  googleAvailable,
  readGoogleStatus,
  saveGoogleClient,
} from './native';
import {
  clearCalendarEventsStatement,
  clearGoogleStatement,
  getGoogleEvent,
  homeworkDueOn,
  listCoursesOn,
  listGoogleCalendars,
  nextCourseDay,
  setCalendarColorStatement,
  setCalendarSchoolStatement,
  setCalendarShownStatement,
  setCourseLinkStatement,
} from './repository';
import { syncGoogle } from './service';

/** Les erreurs de la connexion Google arrivent déjà rédigées (texte du natif) : telles quelles. */
export function googleError(error: unknown): string {
  return typeof error === 'string' ? error : humanizeError(error);
}

/** Après une relecture ou un réglage : les agendas, tout ce qui montre l'agenda, et les matières (créées par les cours). */
function refresh(queryClient: QueryClient): void {
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
  running ??= syncGoogle(
    db,
    { calendars: fetchCalendars, events: fetchEvents },
    todayISO(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    nowTimestamp(),
  ).finally(() => {
    running = null;
  });
  return running;
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
    /** L'agenda des cours : ses événements deviennent des cours, les matières se créent à la relecture. */
    setSchool: async (id: string, school: boolean) => {
      await db.batch([setCalendarSchoolStatement(id, school, nowTimestamp())]);
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

/**
 * Pour un cours ouvert : le jour du cours suivant de sa matière (un devoir s'y rend par défaut) et les
 * devoirs déjà attendus pour ce cours-ci.
 */
export function useCourseContext(itemId: string | null, subjectId: string | null, day: string | null) {
  return useQuery({
    queryKey: [...queryKeys.google.course(itemId ?? ''), subjectId, day],
    enabled: itemId !== null && subjectId !== null && day !== null,
    queryFn: async () => ({
      nextDay: await nextCourseDay(db, subjectId!, day!),
      homework: await homeworkDueOn(db, subjectId!, day!),
    }),
  });
}

/** Relier un intitulé de cours à une matière (ou « pas un cours »), ou créer sa matière. */
export function useLinkCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ course, subjectId, newSubject }: { course: string; subjectId: string | null; newSubject?: { name: string; color: string } }) => {
      const now = nowTimestamp();
      if (newSubject) {
        const id = newId();
        await db.batch([
          {
            sql: `INSERT INTO subjects (id, name, color, teacher, room, coefficient, sort_order, created_at, updated_at)
                  VALUES (?, ?, ?, NULL, NULL, 1, COALESCE((SELECT MAX(sort_order) FROM subjects), 0) + 1, ?, ?)`,
            params: [id, newSubject.name, newSubject.color, now, now],
          },
          setCourseLinkStatement(course, id, now),
        ]);
        return;
      }
      await db.batch([setCourseLinkStatement(course, subjectId, now)]);
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
