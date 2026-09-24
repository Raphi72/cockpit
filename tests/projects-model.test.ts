import { describe, expect, it } from 'vitest';
import { relativeDateLabel } from '@/core/dates';
import { moneyToInput, parseMoneyInput } from '@/core/money';
import { buildAlerts } from '@/domains/dashboard/model';
import {
  buildSchedule,
  deadlineTone,
  projectMoney,
  projectProgress,
  validateNewProject,
  type NewProjectInput,
  type ProjectListItem,
} from '@/domains/projects/model';

const TODAY = '2026-09-24'; // un jeudi

const project = (overrides: Partial<ProjectListItem> = {}): ProjectListItem => ({
  id: 'p1',
  name: 'Site vitrine',
  status: 'active',
  priority: 1,
  startDate: null,
  deadline: null,
  budgetCents: null,
  typeId: 'type-freelance',
  typeName: 'Freelance',
  typeColor: 'blue',
  clientId: null,
  clientName: null,
  // Par défaut, une tâche ouverte : pas d'alerte « aucune prochaine action ».
  tasksTotal: 1,
  tasksDone: 0,
  receivedCents: 0,
  scheduledCents: 0,
  ...overrides,
});

describe('échéancier à la création', () => {
  const dates = { startDate: '2026-09-25', deadline: '2026-10-10', today: TODAY };

  it('acompte 30 % arrondi à l’euro, le solde tombe juste', () => {
    expect(buildSchedule('deposit30', 123456, dates)).toEqual([
      { label: 'Acompte 30 %', amountCents: 37000, dueDate: '2026-09-25' },
      { label: 'Solde', amountCents: 86456, dueDate: '2026-10-10' },
    ]);
  });

  it('50 / 50 et paiement unique', () => {
    expect(buildSchedule('half', 150000, dates).map((p) => p.amountCents)).toEqual([75000, 75000]);
    expect(buildSchedule('single', 150000, dates)).toEqual([
      { label: 'Paiement', amountCents: 150000, dueDate: '2026-10-10' },
    ]);
  });

  it('premier versement aujourd’hui sans date de début ; rien si « plus tard »', () => {
    expect(buildSchedule('half', 20000, { startDate: null, deadline: null, today: TODAY })[0]?.dueDate).toBe(TODAY);
    expect(buildSchedule('later', 150000, dates)).toEqual([]);
  });

  it('un budget trop petit pour être découpé devient un paiement unique', () => {
    expect(buildSchedule('deposit30', 100, dates)).toHaveLength(1);
  });
});

describe('valeurs calculées d’un projet', () => {
  it('progression : null sans tâche, 100 % si terminé', () => {
    expect(projectProgress(project({ tasksTotal: 0 }))).toBeNull();
    expect(projectProgress(project({ tasksTotal: 10, tasksDone: 6 }))).toBe(60);
    expect(projectProgress(project({ status: 'done' }))).toBe(100);
  });

  it('argent : reçu, reste, pourcentage payé, non planifié', () => {
    expect(projectMoney(project({ budgetCents: 200000, receivedCents: 50000, scheduledCents: 175000 }))).toEqual({
      budget: 200000,
      received: 50000,
      remaining: 150000,
      percentPaid: 25,
      unplanned: 25000,
    });
  });

  it('deadline : retard, bientôt, normal ; jamais de retard pour un projet terminé', () => {
    expect(deadlineTone(project({ deadline: '2026-09-22' }), TODAY)).toBe('late');
    expect(deadlineTone(project({ deadline: '2026-09-27' }), TODAY)).toBe('soon');
    expect(deadlineTone(project({ deadline: '2026-10-10' }), TODAY)).toBe('normal');
    expect(deadlineTone(project({ deadline: '2026-09-22', status: 'done' }), TODAY)).toBe('normal');
    expect(deadlineTone(project(), TODAY)).toBeNull();
  });

  it('validation de la création', () => {
    const input: NewProjectInput = {
      name: '  ',
      typeId: 'type-freelance',
      client: { kind: 'none' },
      status: 'active',
      priority: 1,
      startDate: '2026-10-10',
      deadline: '2026-10-01',
      budgetCents: null,
      schedule: 'single',
      description: null,
    };
    expect(Object.keys(validateNewProject(input)).sort()).toEqual(['deadline', 'name']);
  });
});

describe('saisie et affichage', () => {
  it('lit les montants saisis librement', () => {
    expect(parseMoneyInput('2 000')).toBe(200000);
    expect(parseMoneyInput('1234,5')).toBe(123450);
    expect(parseMoneyInput('12.99 €')).toBe(1299);
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('douze')).toBeUndefined();
    expect(moneyToInput(123456)).toBe('1234,56');
  });

  it('une date invalide (année à 6 chiffres) ne fait jamais planter l’affichage', () => {
    expect(relativeDateLabel('102026-10-10', TODAY)).toBe('102026-10-10');
    expect(
      validateNewProject({
        name: 'X',
        typeId: 't',
        client: { kind: 'none' },
        status: 'active',
        priority: 1,
        startDate: null,
        deadline: '102026-10-10',
        budgetCents: null,
        schedule: 'single',
        description: null,
      }).deadline,
    ).toBe('Deadline invalide.');
  });

  it('dates relatives', () => {
    expect(relativeDateLabel('2026-09-24', TODAY)).toBe("aujourd'hui");
    expect(relativeDateLabel('2026-09-25', TODAY)).toBe('demain');
    expect(relativeDateLabel('2026-09-28', TODAY)).toBe('lundi');
    expect(relativeDateLabel('2026-09-21', TODAY)).toBe('il y a 3 j');
    expect(relativeDateLabel('2026-10-10', TODAY)).toBe('10 oct.');
    expect(relativeDateLabel('2027-01-05', TODAY)).toBe('5 janv. 2027');
  });
});

describe('bloc « À surveiller »', () => {
  it('classe les points du plus grave au plus léger', () => {
    const alerts = buildAlerts({
      today: TODAY,
      projects: [
        project({ id: 'soon', name: 'Identité', deadline: '2026-09-27' }),
        project({ id: 'later', name: 'Gala', deadline: '2026-09-28' }),
        project({ id: 'late', name: 'Audit SEO', deadline: '2026-09-22' }),
        project({ id: 'start', name: 'Appli', status: 'planned', startDate: '2026-10-01', tasksTotal: 0 }),
        project({ id: 'budget', name: 'Site', budgetCents: 200000, scheduledCents: 150000 }),
        project({ id: 'idle', name: 'Portfolio', tasksTotal: 3, tasksDone: 3 }),
      ],
      overduePayments: [
        {
          id: 'pay',
          projectId: 'late',
          clientId: null,
          label: 'Facture',
          amountCents: 75000,
          dueDate: '2026-09-13',
          status: 'pending',
          receivedDate: null,
          invoiceRef: null,
          notes: null,
          projectName: 'Audit SEO',
          projectColor: 'blue',
          clientName: 'Agence Nordik',
          transactionId: null,
          transactionAccountName: null,
        },
      ],
    });

    expect(alerts.map((a) => [a.tone, a.reason])).toEqual([
      ['danger', 'Deadline dépassée de 2 j'],
      ['danger', 'En retard de 11 j'],
      ['warning', 'Deadline dimanche'],
      ['muted', 'Commence 1 oct. · aucune tâche créée'],
      ['muted', expect.stringMatching(/^500\s€ du budget sans échéance$/)],
      ['muted', 'Toutes les tâches sont faites : terminer le projet ?'],
    ]);
  });
});
