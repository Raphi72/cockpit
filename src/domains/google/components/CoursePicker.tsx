import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDaysISO, formatDateField } from '@/core/dates';
import { useToday } from '@/core/use-today';
import { ColorDot } from '@/ui/data/ColorDot';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/overlays/Popover';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useCourse, useCoursesBetween } from '../hooks';
import type { CourseOnDay } from '../repository';

/** On choisit le cours d'un devoir parmi les 4 prochaines semaines. */
const PICKER_DAYS = 28;

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** « Machine Learning », ou « Comptabilité · Examen » quand la séance n'est pas un simple cours. */
export function courseLabel(course: { title: string; course?: string | null; courseKind?: string | null }): string {
  const name = course.course ?? course.title;
  return course.courseKind && normalize(course.courseKind) !== 'cours' ? `${name} · ${course.courseKind}` : name;
}

/** « jeu. 3 déc., 9:00 » */
export function courseWhen(course: Pick<CourseOnDay, 'startsAt'>, today: string): string {
  return `${formatDateField(course.startsAt.slice(0, 10), today)}, ${course.startsAt.slice(11, 16)}`;
}

const dayTitle = (day: string) => format(parseISO(day), 'EEEE d MMMM', { locale: fr });

/**
 * Le cours pour lequel un devoir est à rendre : une séance précise de l'agenda des cours, parmi les
 * 4 prochaines semaines, groupées par jour, avec un filtre sur le nom. « Sans cours précis » repasse à
 * une matière et une date. Pour un examen : un horizon plus long, et pas de « sans cours ».
 */
export function CoursePicker(props: {
  value: string | null;
  onChange: (course: CourseOnDay | null) => void;
  variant?: 'field' | 'inline';
  /** Jusqu'où chercher les séances (4 semaines par défaut). */
  horizonDays?: number;
  label?: string;
  /** Le choix « sans cours » ; `null` : pas proposé. */
  noneLabel?: string | null;
}) {
  const today = useToday();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const horizon = props.horizonDays ?? PICKER_DAYS;
  const noneLabel = props.noneLabel === undefined ? 'Sans cours précis (une matière et une date)' : props.noneLabel;
  const { data: courses = [] } = useCoursesBetween(today, addDaysISO(today, horizon));
  const { data: selected } = useCourse(props.value);

  const days = useMemo(() => {
    const wanted = normalize(filter.trim());
    const groups = new Map<string, CourseOnDay[]>();
    for (const course of courses) {
      if (wanted && !normalize(courseLabel(course)).includes(wanted)) continue;
      const day = course.startsAt.slice(0, 10);
      groups.set(day, [...(groups.get(day) ?? []), course]);
    }
    return [...groups.entries()];
  }, [courses, filter]);

  const choose = (course: CourseOnDay | null) => {
    props.onChange(course);
    setOpen(false);
    setFilter('');
  };

  return (
    // `modal` : la liste a son propre droit de défiler. Sans lui, dans une fenêtre (nouveau devoir), la
    // fenêtre bloque la molette sur ce qui est posé par-dessus, et seule la barre de défilement marche.
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PropertyButton variant={props.variant} aria-label={props.label ?? 'Cours du devoir'}>
          {selected ? (
            <>
              <ColorDot color={selected.subjectColor ?? 'slate'} />
              <span className="truncate">{courseLabel(selected)}</span>
              <span className="tnum shrink-0 text-ink-3">{courseWhen(selected, today)}</span>
            </>
          ) : props.value ? (
            <span className="text-ink-3">Un cours qui n’est plus dans ton agenda</span>
          ) : (
            <span className="text-ink-3">Choisir le cours</span>
          )}
        </PropertyButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] p-0">
        <div className="border-b border-line p-2">
          <input
            autoFocus
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              const first = days[0]?.[1][0];
              if (event.key === 'Enter' && first) {
                event.preventDefault();
                choose(first);
              }
            }}
            placeholder="Filtrer les cours…"
            aria-label="Filtrer les cours"
            className="h-8 w-full rounded-md bg-transparent px-2 text-body outline-none placeholder:text-ink-3"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {days.length === 0 && (
            <p className="px-2.5 py-2 text-meta text-ink-3">
              {courses.length === 0 ? 'Aucun cours à venir dans ton agenda des cours.' : 'Aucun cours de ce nom.'}
            </p>
          )}
          {days.map(([day, list]) => (
            <div key={day} className="mb-1">
              <p className="px-2.5 pt-2 pb-1 text-meta text-ink-3 first-letter:uppercase">{day === today ? 'Aujourd’hui' : dayTitle(day)}</p>
              {list.map((course) => (
                <button
                  key={course.itemId}
                  type="button"
                  onClick={() => choose(course)}
                  className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors duration-[120ms] ease-soft hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
                >
                  <span className="tnum w-10 shrink-0 text-meta text-ink-3">{course.startsAt.slice(11, 16)}</span>
                  <ColorDot color={course.subjectColor ?? 'slate'} />
                  <span className="min-w-0 flex-1 truncate">{courseLabel(course)}</span>
                  {course.itemId === props.value && <Check className="size-4 shrink-0 text-accent" strokeWidth={2} />}
                </button>
              ))}
            </div>
          ))}
        </div>
        {noneLabel && (
          <div className="border-t border-line p-1">
            <button
              type="button"
              onClick={() => choose(null)}
              className="flex h-8 w-full items-center rounded-md px-2.5 text-left text-meta text-ink-2 transition-colors duration-[120ms] ease-soft hover:bg-hover"
            >
              {noneLabel}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
