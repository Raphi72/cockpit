import { describe, expect, it } from 'vitest';
import { APP_MODES, modeOfPath, otherMode } from '@/app/modes';
import { NAV, allNavItems, shortcutTarget } from '@/app/navigation';
import { filterCommands, paletteCommands } from '@/domains/search/commands';

describe('modes Travail et Cours', () => {
  it('rattache chaque page à son mode, les pages communes à aucun', () => {
    expect(modeOfPath('/projects')).toBe('work');
    expect(modeOfPath('/projects/abc')).toBe('work');
    expect(modeOfPath('/finances')).toBe('work');
    expect(modeOfPath('/subjects/abc')).toBe('school');
    expect(modeOfPath('/homework')).toBe('school');
    expect(modeOfPath('/')).toBeNull();
    expect(modeOfPath('/calendar')).toBeNull();
    expect(modeOfPath('/pages')).toBeNull();
    expect(modeOfPath('/settings')).toBeNull();
    // Un préfixe seul ne suffit pas.
    expect(modeOfPath('/projectsx')).toBeNull();
    expect(otherMode('work')).toBe('school');
  });

  it('ne montre dans chaque barre latérale que les pages du mode et les pages communes', () => {
    for (const mode of APP_MODES) {
      const items = [...NAV[mode].main, ...NAV[mode].secondary];
      for (const item of items) expect([mode, null]).toContain(modeOfPath(item.to));
      const digits = NAV[mode].main.flatMap((item) => (item.shortcut ? [item.shortcut] : []));
      expect(new Set(digits).size).toBe(digits.length);
    }
    expect(shortcutTarget('work', '2')?.to).toBe('/projects');
    // En mode Cours, le calendrier (et son emploi du temps) vient juste après les devoirs.
    expect(shortcutTarget('school', '3')?.to).toBe('/calendar');
    expect(shortcutTarget('school', '4')?.to).toBe('/exams');
    expect(shortcutTarget('work', '4')?.to).toBe('/calendar');
    // Chaque page une seule fois dans la palette.
    const paths = allNavItems().map((item) => item.to);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('propose de changer de mode, et suggère les pages du mode en cours', () => {
    const work = paletteCommands({ desktop: false, sidebarCollapsed: false, mode: 'work' });
    expect(work.find((c) => c.id === 'mode')?.label).toBe('Passer en mode Cours');
    const school = paletteCommands({ desktop: false, sidebarCollapsed: false, mode: 'school' });
    expect(school.find((c) => c.id === 'mode')?.label).toBe('Passer en mode Travail');
    const suggested = filterCommands(school, '').map((c) => c.id);
    expect(suggested).not.toContain('go-/projects');
    // En tapant, les pages de l'autre mode se trouvent quand même.
    expect(filterCommands(school, 'projets').map((c) => c.id)).toContain('go-/projects');
  });
});
