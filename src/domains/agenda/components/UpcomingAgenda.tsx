import { Link } from '@tanstack/react-router';
import { formatMoney } from '@/core/money';
import { AgendaMarker } from '../calendar/AgendaChip';
import {
  UPCOMING_AGENDA_DAYS,
  agendaTooltip,
  itemTime,
  upcomingDayLabel,
  upcomingDays,
  upcomingDetail,
  type AgendaItem,
} from '../model';
import { useOpenAgendaItem } from '../open-item';

function UpcomingRow({
  item,
  today,
  withTimes,
  onOpen,
}: {
  item: AgendaItem;
  today: string;
  withTimes: boolean;
  onOpen: (item: AgendaItem) => void;
}) {
  const detail = upcomingDetail(item, today);
  return (
    <button
      type="button"
      title={agendaTooltip(item)}
      onClick={() => onOpen(item)}
      className={
        '-mx-2.5 grid min-h-10 w-[calc(100%+20px)] items-center gap-2.5 rounded-md px-2.5 text-left ' +
        'transition-colors duration-[120ms] ease-soft hover:bg-hover ' +
        (withTimes ? 'grid-cols-[12px_40px_minmax(0,1fr)_auto]' : 'grid-cols-[12px_minmax(0,1fr)_auto]')
      }
    >
      <AgendaMarker item={item} late={false} />
      {withTimes && <span className="tnum text-meta text-ink-3">{itemTime(item)}</span>}
      <span className="truncate">
        <span className={item.kind === 'project_deadline' ? 'font-medium' : ''}>{item.title}</span>
        {detail && <span className="ml-2 text-meta text-ink-3">{detail}</span>}
      </span>
      <span className="tnum font-medium">{item.amountCents !== null && formatMoney(item.amountCents)}</span>
    </button>
  );
}

/**
 * « Prochains jours » du dashboard : rendez-vous, deadlines et débuts de projet, encaissements
 * attendus, groupés par jour. Seuls les jours qui ont quelque chose sont montrés, chacun sous
 * un petit intitulé : la liste tient dans la colonne étroite du dashboard.
 */
export function UpcomingAgenda({ items, today }: { items: AgendaItem[]; today: string }) {
  const open = useOpenAgendaItem();
  const days = upcomingDays(items, today);
  // La colonne des heures n'apparaît que si un élément en a une.
  const withTimes = days.some((group) => group.items.some((item) => itemTime(item) !== null));

  return (
    <section>
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-semibold">Prochains jours</h2>
        <Link to="/calendar" className="ml-auto text-meta text-ink-3 hover:text-ink">
          Calendrier →
        </Link>
      </div>
      {days.length === 0 ? (
        <p className="pt-2 text-ink-3">Rien de prévu dans les {UPCOMING_AGENDA_DAYS} prochains jours.</p>
      ) : (
        days.map(({ day, items: dayItems }) => {
          const { label, date } = upcomingDayLabel(day, today);
          return (
            <div key={day}>
              <h3
                className={`flex items-baseline gap-2 pt-3.5 pb-0.5 text-meta font-medium ${day === today ? 'text-accent' : 'text-ink-2'}`}
              >
                {label}
                {date && <span className="font-normal text-ink-3">{date}</span>}
              </h3>
              {dayItems.map((item) => (
                <UpcomingRow key={item.key} item={item} today={today} withTimes={withTimes} onOpen={open} />
              ))}
            </div>
          );
        })
      )}
    </section>
  );
}
