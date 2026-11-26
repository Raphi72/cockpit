import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDaysISO } from '@/core/dates';
import { useMinutesOfDay, useToday } from '@/core/use-today';
import { useAgenda } from '@/domains/agenda';
import { useBlocks, useUpdateBlock } from '@/domains/day/hooks';
import { moduleIcon } from '@/domains/day/icons';
import { BLOCK_STATUS_LABELS, toMinutes, type DayBlock } from '@/domains/day/model';
import { busyItemsOn } from '@/domains/day/service';
import { Button } from '@/ui/primitives/Button';
import { ScreenHeader } from './parts';

type Line = { key: string; start: string; end: string; title: string; block?: DayBlock };

/**
 * La journée en liste, dans l'ordre : les blocs (à marquer faits) et, entre eux, les cours, rendez-vous,
 * examens et événements Google à heure fixe. Les blocs se posent et se déplacent sur le PC.
 */
export function DayScreen() {
  const today = useToday();
  const minutes = useMinutesOfDay();
  const [day, setDay] = useState(today);
  const range = useMemo(() => ({ from: day, to: addDaysISO(day, 1) }), [day]);
  const { data: blocks = [] } = useBlocks(range);
  const { data: agenda = [] } = useAgenda(range);
  const update = useUpdateBlock();
  const fromMinutes = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

  const lines: Line[] = [
    ...blocks.map((block) => ({ key: `block:${block.id}`, start: block.startsAt, end: block.endsAt, title: block.title, block })),
    ...busyItemsOn(agenda, day).map((item) => ({ key: item.key, start: fromMinutes(item.start), end: fromMinutes(Math.min(item.end, 24 * 60)), title: item.title })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const started = (block: DayBlock) => day < today || (day === today && toMinutes(block.startsAt) <= minutes);

  return (
    <>
      <ScreenHeader
        title={day === today ? 'Journée' : format(new Date(`${day}T12:00:00`), 'EEEE d MMMM', { locale: fr })}
        subtitle={day === today ? format(new Date(`${day}T12:00:00`), 'EEEE d MMMM', { locale: fr }) : undefined}
        actions={
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="lg" icon={ChevronLeft} aria-label="Jour précédent" onClick={() => setDay(addDaysISO(day, -1))} />
            <Button variant="ghost" size="lg" icon={ChevronRight} aria-label="Jour suivant" onClick={() => setDay(addDaysISO(day, 1))} />
          </div>
        }
      />
      {lines.length === 0 ? (
        <p className="px-5 text-ink-3">Rien de prévu ce jour-là. Les blocs se posent depuis la page Journée du PC.</p>
      ) : (
        <ul className="px-5">
          {lines.map((line) => {
            const block = line.block;
            const Icon = block ? moduleIcon(block.icon) : null;
            const now = day === today && toMinutes(line.start) <= minutes && minutes < toMinutes(line.end);
            return (
              <li key={line.key} className={`flex min-h-14 items-center gap-3 border-b border-line/60 py-2 ${block?.status === 'done' ? 'text-ink-3' : ''}`}>
                <span className={`tnum w-[92px] shrink-0 text-meta ${now ? 'font-medium text-accent' : 'text-ink-3'}`}>
                  {line.start} – {line.end === '24:00' ? '24:00' : line.end}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {Icon && block && <Icon className="size-4 shrink-0" strokeWidth={1.75} style={{ color: `var(--p-${block.color})` }} />}
                  <span className="truncate">{line.title}</span>
                </span>
                {block && block.status !== 'planned' && <span className="text-meta text-ink-3">{BLOCK_STATUS_LABELS[block.status]}</span>}
                {block && block.status === 'planned' && started(block) && (
                  <Button variant="secondary" icon={Check} onClick={() => update.mutate({ block, patch: { status: 'done' } })}>
                    Fait
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="h-24" />
    </>
  );
}
