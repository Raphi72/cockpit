import { addDaysISO } from '@/core/dates';
import type { AgendaItem } from '@/domains/agenda/model';
import { isHomework, selectPlannedOn, selectToday, type TaskItem } from '@/domains/tasks/model';
import { planCandidates, rankForPlan } from '@/domains/tasks/work-plan';
import {
  FILL_WINDOW,
  SNAP_MIN,
  blockInterval,
  freeSlots,
  fromMinutes,
  proposeFill,
  toMinutes,
  type BlockInput,
  type BusyItem,
  type DayBlock,
  type Module,
} from './model';

/** « À caser » regarde les échéances des deux semaines qui suivent le jour affiché. */
export const TO_PLACE_DEADLINE_DAYS = 14;

/**
 * « À caser » d'un jour : d'abord ce qui est prévu ce jour-là (aujourd'hui : le retard compris), puis ce
 * qui a une échéance dans les deux semaines (un devoir pour lundi, une deadline de tâche) et qu'il faut
 * bien faire un jour : pas encore dans un bloc, ni prévu un jour plus tard. Les plus proches d'abord.
 * Ce sont des tâches, jamais des modules : les modules, eux, se répètent.
 */
export function toPlaceOn(open: TaskItem[], day: string, today: string): { planned: TaskItem[]; deadlines: TaskItem[] } {
  const free = (task: TaskItem) => task.blockId === null && task.subtasksTotal === 0;
  const groups = selectToday(open, today);
  const planned = (day === today ? [...groups.overdue, ...groups.today] : selectPlannedOn(open, day, today)).filter(free);
  const listed = new Set(planned.map((task) => task.id));
  const limit = addDaysISO(day, TO_PLACE_DEADLINE_DAYS);
  const deadlines = open
    .filter(
      (task) =>
        free(task) &&
        !listed.has(task.id) &&
        task.dueDate !== null &&
        task.dueDate >= day &&
        task.dueDate <= limit &&
        (task.scheduledDate === null || task.scheduledDate <= day),
    )
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  return { planned, deadlines };
}

/**
 * Ce qui occupe déjà une journée, à côté des blocs : rendez-vous à heure fixe, cours, examens à heure
 * fixe. Un cours porte les devoirs pas encore faits à rendre pour lui (`openTasks`) : ceux reliés à cette
 * séance, ou, sans séance précise, ceux de sa matière à rendre ce jour-là. Ils restent aussi « à caser ».
 */
export function busyItemsOn(agenda: AgendaItem[], day: string, openTasks: TaskItem[] = []): BusyItem[] {
  return agenda
    .filter((item) => !item.allDay && item.start.slice(0, 10) === day)
    .filter((item) => item.source === 'event' || item.source === 'class' || item.source === 'exam' || item.source === 'google')
    .map((item) => {
      const start = toMinutes(item.start.slice(11, 16));
      const end = item.end && item.end.slice(0, 10) === day ? toMinutes(item.end.slice(11, 16)) : start + 60;
      const isCourse = item.source === 'google' && item.kind === 'class';
      const homework = isCourse
        ? openTasks
            .filter((task) =>
              task.courseEvent ? task.courseEvent === item.id : Boolean(item.subjectId) && task.subjectId === item.subjectId && task.dueDate === day,
            )
            .map((task) => task.title)
        : [];
      return {
        key: item.key,
        title: item.title,
        start,
        end: Math.max(end, start + 15),
        color: item.color,
        googleId: item.source === 'google' ? item.id : null,
        homework,
      };
    });
}

/** Le module dont un bloc proposé prend l'apparence : celui du mode (Devoirs, Deep work), sinon un aspect par défaut. */
function lookFor(modules: Module[], homework: boolean): Pick<BlockInput, 'templateId' | 'title' | 'icon' | 'color' | 'mode'> {
  const mode = homework ? 'school' : 'work';
  const preferred = homework ? 'module-devoirs' : 'module-deepwork';
  const library = modules.filter((m) => !m.oneOff);
  const module = library.find((m) => m.id === preferred) ?? library.find((m) => m.mode === mode);
  if (module) return { templateId: module.id, title: module.name, icon: module.icon, color: module.color, mode: module.mode };
  return homework
    ? { templateId: null, title: 'Devoirs', icon: 'notebook', color: 'blue', mode: 'school' }
    : { templateId: null, title: 'Travail', icon: 'briefcase', color: 'violet', mode: 'work' };
}

export type FillProposal = { input: BlockInput; tasks: TaskItem[] };

/**
 * « Remplir les trous » : dans les créneaux libres du jour (de 8 h à 21 h, et pas avant l'heure qu'il
 * est aujourd'hui), des blocs « Devoirs » ou « Travail » avec les tâches les plus pressantes, dans
 * l'ordre de « Je veux travailler… ». Les tâches déjà dans un bloc, celles des projets en pause et
 * celles qui ont des sous-tâches ne sont pas proposées. Rien n'est posé ici.
 */
export function buildFillProposals(input: {
  day: string;
  today: string;
  now: number;
  blocks: DayBlock[];
  busy: BusyItem[];
  open: TaskItem[];
  pausedProjectIds: ReadonlySet<string>;
  modules: Module[];
}): FillProposal[] {
  const from =
    input.day === input.today ? Math.max(FILL_WINDOW.start, Math.ceil(input.now / SNAP_MIN) * SNAP_MIN) : FILL_WINDOW.start;
  if (input.day < input.today || from >= FILL_WINDOW.end) return [];
  const taken = [...input.blocks.filter((b) => b.date === input.day).map(blockInterval), ...input.busy];
  const slots = freeSlots(taken, from, FILL_WINDOW.end, 30);
  const ranked = rankForPlan(
    planCandidates(input.open, input.pausedProjectIds).filter((t) => t.blockId === null),
    input.today,
  );
  const byId = new Map(ranked.map((t) => [t.id, t]));
  return proposeFill(
    slots,
    ranked.map((t) => ({ id: t.id, homework: isHomework(t), estimateMin: t.estimateMin })),
  ).map((proposal) => ({
    input: {
      ...lookFor(input.modules, proposal.homework),
      date: input.day,
      startsAt: fromMinutes(proposal.start),
      endsAt: fromMinutes(proposal.end),
    },
    tasks: proposal.taskIds.map((id) => byId.get(id)!),
  }));
}
