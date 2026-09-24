import { describe, expect, it } from 'vitest';
import type { AgendaItem } from '@/domains/agenda';
import { dashboardSummary, nextTimedEvent } from '@/domains/dashboard/model';

const TODAY = '2026-09-24';

const event = (overrides: Partial<AgendaItem>): AgendaItem => ({
  key: 'k',
  source: 'event',
  id: 'e1',
  kind: 'appointment',
  title: 'Point visio',
  detail: null,
  start: `${TODAY}T14:00`,
  end: null,
  allDay: false,
  projectId: null,
  color: null,
  amountCents: null,
  ...overrides,
});

describe('synthèse du dashboard', () => {
  it('annonce le prochain rendez-vous de la journée, pas encore commencé', () => {
    const items = [
      event({ key: 'matin', start: `${TODAY}T09:00` }),
      event({ key: 'réunion', kind: 'meeting', start: `${TODAY}T18:30` }),
      event({ key: 'rdv', start: `${TODAY}T14:00` }),
      event({ key: 'journée', allDay: true, start: TODAY }),
      event({ key: 'demain', start: '2026-09-25T08:00' }),
      event({ key: 'deadline', source: 'project', kind: 'project_deadline', allDay: true, start: TODAY }),
    ];
    expect(nextTimedEvent(items, TODAY, 10 * 60)?.key).toBe('rdv');
    expect(nextTimedEvent(items, TODAY, 14 * 60)?.key).toBe('rdv'); // commence maintenant
    expect(nextTimedEvent(items, TODAY, 15 * 60)?.key).toBe('réunion');
    expect(nextTimedEvent(items, TODAY, 19 * 60)).toBeNull();
  });

  it('résume les tâches du jour et le prochain rendez-vous', () => {
    expect(dashboardSummary({ todayCount: 5, overdueCount: 1, nextEvent: event({}) })).toBe(
      '5 tâches aujourd’hui, dont 1 en retard · rendez-vous à 14:00',
    );
    expect(dashboardSummary({ todayCount: 1, overdueCount: 0, nextEvent: null })).toBe('1 tâche aujourd’hui');
    expect(dashboardSummary({ todayCount: 0, overdueCount: 0, nextEvent: event({ kind: 'meeting' }) })).toBe(
      'réunion à 14:00',
    );
    expect(dashboardSummary({ todayCount: 0, overdueCount: 0, nextEvent: event({ kind: 'personal' }) })).toBe(
      'événement à 14:00',
    );
    expect(dashboardSummary({ todayCount: 0, overdueCount: 0, nextEvent: null })).toBe('Rien de prévu aujourd’hui.');
  });
});
