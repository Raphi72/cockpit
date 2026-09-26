import { describe, expect, it } from 'vitest';
import {
  dayOffset,
  isInPeriod,
  monthMarks,
  planningRows,
  planningTitle,
  planningPeriod,
  shiftPlanningAnchor,
  weeklyLoad,
} from '@/domains/agenda/timeline/model';
import type { PaymentListItem } from '@/domains/finance/payments/model';
import type { ProjectListItem } from '@/domains/projects/model';

const TODAY = '2026-09-25'; // un vendredi

const project = (id: string, overrides: Partial<ProjectListItem> = {}): ProjectListItem => ({
  id,
  name: id,
  status: 'active',
  savedStatus: 'active',
  priority: 1,
  startDate: null,
  deadline: null,
  budgetCents: null,
  typeId: 'type-freelance',
  typeName: 'Freelance',
  typeColor: 'blue',
  clientId: null,
  clientName: null,
  tasksTotal: 0,
  tasksDone: 0,
  receivedCents: 0,
  scheduledCents: 0,
  completedAt: null,
  ...overrides,
});

const payment = (id: string, projectId: string, overrides: Partial<PaymentListItem> = {}): PaymentListItem => ({
  id,
  projectId,
  clientId: null,
  label: 'Acompte',
  amountCents: 50000,
  dueDate: null,
  status: 'planned',
  receivedDate: null,
  invoiceRef: null,
  notes: null,
  projectName: null,
  projectColor: null,
  clientName: null,
  transactionId: null,
  transactionAccountName: null,
  ...overrides,
});

describe('période du planning', () => {
  it('commence le lundi de la semaine d’avant ; 6 semaines en mois, 13 en trimestre', () => {
    const month = planningPeriod('month', TODAY);
    expect(month.start).toBe('2026-09-14');
    expect(month.days).toBe(42);
    expect(month.weeks).toEqual(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(planningPeriod('quarter', TODAY).weeks).toHaveLength(13);
    expect(planningTitle(month, TODAY)).toBe('14 sept. – 25 oct.');
  });

  it('suit le premier jour de la semaine choisi', () => {
    const month = planningPeriod('month', TODAY, 0);
    expect(month.start).toBe('2026-09-13');
    expect(month.weeks[1]).toBe('2026-09-20');
    expect(month.days).toBe(42);
  });

  it('avance de 4 semaines en mois, de 12 en trimestre', () => {
    expect(shiftPlanningAnchor('month', TODAY, 1)).toBe('2026-10-23');
    expect(shiftPlanningAnchor('quarter', TODAY, -1)).toBe('2026-07-03');
    expect(planningTitle(planningPeriod('quarter', '2026-12-20'), TODAY)).toBe('7 déc. – 7 mars 2027');
  });

  it('place les jours et les débuts de mois', () => {
    const month = planningPeriod('month', TODAY);
    expect(dayOffset(month, '2026-09-14')).toBe(0);
    expect(dayOffset(month, '2026-10-26')).toBe(1);
    expect(monthMarks(month).map((m) => [m.label, m.day])).toEqual([
      ['Septembre', '2026-09-14'],
      ['Octobre', '2026-10-01'],
    ]);
  });
});

describe('lignes du planning', () => {
  const projects = [
    project('site', { startDate: '2026-09-10', deadline: '2026-10-02' }),
    project('logo', { startDate: '2026-09-01', deadline: '2026-09-20' }), // en retard
    project('memoire', { deadline: '2026-11-15' }), // en cours, sans début
    project('bde', { status: 'planned', savedStatus: 'planned', deadline: '2026-10-31' }), // à venir, sans début
    project('appli', { startDate: '2026-10-05' }), // sans deadline
    project('portfolio'), // sans dates
  ];
  const payments = [
    payment('a', 'site', { dueDate: '2026-09-10', status: 'received', receivedDate: '2026-09-12' }),
    payment('b', 'site', { dueDate: '2026-10-02' }),
    payment('c', 'logo', { dueDate: '2026-09-20', status: 'pending' }),
    payment('d', 'appli'),
  ];

  it('une barre du début à la deadline, une queue rouge en cas de retard, les encaissements en losanges', () => {
    const { rows, undated } = planningRows(projects, payments, TODAY);
    expect(undated.map((p) => p.id)).toEqual(['portfolio']);
    expect(rows.map((r) => [r.project.id, r.from, r.to, r.bar, r.lateUntil])).toEqual([
      ['memoire', null, '2026-11-15', true, null],
      ['logo', '2026-09-01', '2026-09-20', true, TODAY],
      ['site', '2026-09-10', '2026-10-02', true, null],
      ['appli', '2026-10-05', null, true, null],
      ['bde', null, '2026-10-31', false, null],
    ]);
    const site = rows.find((r) => r.project.id === 'site')!;
    expect(site.payments.map((p) => [p.day, p.received, p.late])).toEqual([
      ['2026-09-12', true, false],
      ['2026-10-02', false, false],
    ]);
    expect(rows.find((r) => r.project.id === 'logo')!.payments[0]).toMatchObject({ late: true });
    // Sans date prévue, pas de losange.
    expect(rows.find((r) => r.project.id === 'appli')!.payments).toEqual([]);
  });

  it('ne garde que ce qui touche la période', () => {
    const { rows } = planningRows(projects, payments, TODAY);
    const later = planningPeriod('month', '2026-12-10'); // 30 nov. – 10 janv.
    expect(rows.filter((r) => isInPeriod(r, later)).map((r) => r.project.id)).toEqual(['appli']);
    // La deadline de « bde » (31 oct.) tombe après la période du zoom mois ; le trimestre la montre.
    const now = planningPeriod('month', TODAY);
    expect(rows.filter((r) => isInPeriod(r, now)).map((r) => r.project.id)).toEqual(['memoire', 'logo', 'site', 'appli']);
    expect(rows.filter((r) => isInPeriod(r, planningPeriod('quarter', TODAY))).map((r) => r.project.id)).toContain('bde');
  });

  it('compte les projets menés en même temps, semaine par semaine', () => {
    const { rows } = planningRows(projects, payments, TODAY);
    const load = weeklyLoad(rows, planningPeriod('month', TODAY));
    expect(load.map((w) => [w.week, w.projects.map((p) => p.id)])).toEqual([
      ['2026-09-14', ['memoire', 'logo', 'site']],
      ['2026-09-21', ['memoire', 'logo', 'site']], // logo est en retard : il compte jusqu'à aujourd'hui
      ['2026-09-28', ['memoire', 'site']],
      ['2026-10-05', ['memoire', 'appli']],
      ['2026-10-12', ['memoire', 'appli']],
      ['2026-10-19', ['memoire', 'appli']],
    ]);
  });
});
