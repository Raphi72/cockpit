import { describe, expect, it } from 'vitest';
import {
  closureStep,
  formatCountdown,
  isStreakMilestone,
  morningSentence,
  msUntil,
  newlyAchieved,
  nextPhase,
  shouldShowMorning,
  startPomodoro,
  type ClosureState,
} from '@/domains/companion/model';
import { eveningReviewNotice, examNotices, homeworkNotices } from '@/domains/notifications/model';

const TODAY = '2026-11-26';

describe('compagnon : écran du matin', () => {
  it('ne se montre qu’une fois par jour, avant midi, s’il est activé', () => {
    const base = { enabled: true, lastShown: '2026-11-25', today: TODAY, minutes: 8 * 60 };
    expect(shouldShowMorning(base)).toBe(true);
    expect(shouldShowMorning({ ...base, lastShown: TODAY })).toBe(false);
    expect(shouldShowMorning({ ...base, minutes: 12 * 60 })).toBe(false);
    expect(shouldShowMorning({ ...base, enabled: false })).toBe(false);
    expect(shouldShowMorning({ ...base, lastShown: null })).toBe(true);
  });

  it('dit la journée en une phrase', () => {
    expect(morningSentence({ blocks: 3, classes: 2, events: 0, tasks: 4 })).toBe('3 blocs, 2 cours et 4 tâches aujourd’hui.');
    expect(morningSentence({ blocks: 1, classes: 0, events: 1, tasks: 0 })).toBe('1 bloc et 1 rendez-vous aujourd’hui.');
    expect(morningSentence({ blocks: 0, classes: 0, events: 0, tasks: 1 })).toBe('1 tâche aujourd’hui.');
    expect(morningSentence({ blocks: 0, classes: 0, events: 0, tasks: 0 })).toMatch(/^Rien de prévu/);
  });
});

describe('compagnon : mode focus', () => {
  it('enchaîne travail et pause', () => {
    const start = startPomodoro(0, 25);
    expect(start).toEqual({ phase: 'work', endsAt: 25 * 60_000, round: 1 });
    const pause = nextPhase(start, start.endsAt, 25, 5);
    expect(pause).toEqual({ phase: 'break', endsAt: 30 * 60_000, round: 1 });
    expect(nextPhase(pause, pause.endsAt, 25, 5)).toEqual({ phase: 'work', endsAt: 55 * 60_000, round: 2 });
  });

  it('affiche le temps qui reste', () => {
    expect(formatCountdown(25 * 60_000)).toBe('25:00');
    expect(formatCountdown(61_500)).toBe('1:02');
    expect(formatCountdown(3_723_000)).toBe('1:02:03');
    expect(formatCountdown(-5)).toBe('0:00');
    const now = new Date(2026, 10, 26, 17, 30, 15);
    expect(msUntil('18:30', now)).toBe(59 * 60_000 + 45_000);
    expect(msUntil('24:00', now)).toBe(6 * 3_600_000 + 29 * 60_000 + 45_000);
    expect(msUntil('09:00', now)).toBe(0);
  });
});

describe('compagnon : célébrations', () => {
  it('fête la journée bouclée une fois, même si les listes se relisent l’une après l’autre', () => {
    let state: ClosureState = { previous: null, pending: false };
    const step = (open: number, done: number) => {
      const result = closureStep(state, open, done);
      state = result.state;
      return result.celebrate;
    };
    // Au lancement, déjà tout fait : rien.
    expect(step(0, 2)).toBe(false);
    expect(step(1, 2)).toBe(false);
    // La dernière tâche est cochée, mais « faites aujourd'hui » n'est pas encore relue.
    state = { previous: 1, pending: false };
    expect(step(0, 0)).toBe(false);
    expect(step(0, 1)).toBe(true);
    expect(step(0, 1)).toBe(false);
    // Une nouvelle tâche pour aujourd'hui annule une fin en attente.
    state = { previous: 1, pending: false };
    expect(step(0, 0)).toBe(false);
    expect(step(1, 0)).toBe(false);
    expect(step(1, 1)).toBe(false);
  });

  it('salue les séries à certains paliers et les objectifs nouvellement atteints', () => {
    expect(isStreakMilestone({ count: 3, unit: 'jour' })).toBe(true);
    expect(isStreakMilestone({ count: 4, unit: 'jour' })).toBe(false);
    expect(isStreakMilestone({ count: 2, unit: 'semaine' })).toBe(true);
    expect(isStreakMilestone({ count: 1, unit: 'jour' })).toBe(false);
    expect(newlyAchieved(null, new Set(['a']))).toEqual([]);
    expect(newlyAchieved(new Set(['a']), new Set(['a', 'b']))).toEqual(['b']);
  });
});

describe('compagnon : notifications', () => {
  it('rappelle les devoirs la veille et les examens à J-3', () => {
    const homework = [
      { id: 'h1', title: 'Exercices p. 42', subjectName: 'Maths', dueDate: '2026-11-27' },
      { id: 'h2', title: 'Rédaction', subjectName: 'Français', dueDate: '2026-11-28' },
    ];
    expect(homeworkNotices(homework, TODAY)).toEqual([{ key: 'homework:h1:2026-11-27', title: 'À rendre demain : Exercices p. 42', body: 'Maths' }]);
    const exams = [
      { id: 'e1', title: 'Contrôle', subjectName: 'Maths', date: '2026-11-29', startsAt: '10:00' },
      { id: 'e2', title: 'Oral', subjectName: 'Anglais', date: '2026-11-30', startsAt: null },
    ];
    expect(examNotices(exams, TODAY)).toEqual([{ key: 'exam:e1:2026-11-29', title: 'Examen dans 3 jours : Maths', body: 'Contrôle, dimanche 29 novembre à 10:00' }]);
  });

  it('annonce le bilan du soir', () => {
    expect(eveningReviewNotice(2, { today: TODAY, time: '19:59' })).toBeNull();
    expect(eveningReviewNotice(2, { today: TODAY, time: '20:05' })).toMatchObject({ key: 'evening-review:2026-11-26', title: 'Bilan du soir' });
    expect(eveningReviewNotice(0, { today: TODAY, time: '20:05' })).toBeNull();
    expect(eveningReviewNotice(1, { today: TODAY, time: '20:30' })).toBeNull();
  });
});
