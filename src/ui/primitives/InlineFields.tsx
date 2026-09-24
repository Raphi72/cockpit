import { useEffect, useState, type KeyboardEvent } from 'react';
import { DATE_INPUT_BOUNDS, isISODate, isTime } from '@/core/dates';
import { formatMoney, moneyToInput, parseMoneyInput } from '@/core/money';
import { toast } from '../overlays/toast';

/**
 * Champs « éditables sur place » : ils ressemblent à du texte, deviennent un champ au clic,
 * enregistrent en quittant le champ (ou avec Entrée) et annulent avec Échap.
 */

const inlineClass =
  'w-full rounded-md bg-transparent px-2 -mx-2 outline-none transition-colors duration-[120ms] ease-soft ' +
  'placeholder:text-ink-3 hover:bg-hover focus:bg-elevated focus:ring-2 focus:ring-accent-soft';

function blurOnEnterOrEscape(event: KeyboardEvent<HTMLElement>, reset: () => void, multiline = false) {
  if (event.key === 'Escape') {
    reset();
    requestAnimationFrame(() => (event.target as HTMLElement).blur());
    event.stopPropagation();
  } else if (event.key === 'Enter' && (!multiline || event.ctrlKey)) {
    event.preventDefault();
    (event.target as HTMLElement).blur();
  }
}

type InlineTextProps = {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  'aria-label': string;
};

export function InlineText({ value, onSave, placeholder, required = false, className = '', ...aria }: InlineTextProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.trim();
    if (required && next === '') return setDraft(value);
    if (next !== value) onSave(next);
  };

  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => blurOnEnterOrEscape(e, () => setDraft(value))}
      className={`h-9 ${inlineClass} ${className}`}
      {...aria}
    />
  );
}

type InlineTextareaProps = {
  value: string | null;
  onSave: (value: string | null) => void;
  placeholder?: string;
  className?: string;
  'aria-label': string;
};

export function InlineTextarea({ value, onSave, placeholder, className = '', ...aria }: InlineTextareaProps) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);

  const commit = () => {
    const next = draft.trim() === '' ? null : draft.trim();
    if (next !== value) onSave(next);
  };

  return (
    <textarea
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => blurOnEnterOrEscape(e, () => setDraft(value ?? ''), true)}
      rows={1}
      className={`resize-none py-1.5 [field-sizing:content] ${inlineClass} ${className}`}
      {...aria}
    />
  );
}

type InlineAmountProps = {
  value: number | null;
  onSave: (cents: number | null) => void;
  placeholder?: string;
  /** Accepte un montant négatif (un solde à découvert). */
  signed?: boolean;
  className?: string;
  title?: string;
  'aria-label': string;
};

export function InlineAmount({
  value,
  onSave,
  placeholder = 'Ajouter',
  signed = false,
  className = 'h-8',
  ...aria
}: InlineAmountProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(moneyToInput(value));

  const commit = () => {
    setFocused(false);
    const cents = parseMoneyInput(draft, { signed });
    if (cents === undefined) {
      toast('Montant invalide : écris par exemple 1500 ou 1 234,50.', { tone: 'danger' });
      return;
    }
    if (cents !== value) onSave(cents);
  };

  return (
    <input
      inputMode="decimal"
      value={focused ? draft : value === null ? '' : formatMoney(value)}
      placeholder={placeholder}
      onFocus={(e) => {
        setDraft(moneyToInput(value));
        setFocused(true);
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => blurOnEnterOrEscape(e, () => setDraft(moneyToInput(value)))}
      className={`tnum ${inlineClass} ${className}`}
      {...aria}
    />
  );
}

type InlineDateProps = {
  value: string | null;
  onSave: (value: string | null) => void;
  'aria-label': string;
};

type InlineTimeProps = {
  value: string | null;
  /** Renvoie `false` si la valeur est refusée : le champ revient alors à l'heure enregistrée. */
  onSave: (value: string | null) => boolean | void;
  'aria-label': string;
};

/**
 * Heure 'HH:MM' habillée comme du texte, enregistrée en quittant le champ (ou avec Entrée) :
 * les heures intermédiaires tapées au clavier ne sont jamais enregistrées.
 * Sans marge négative, pour pouvoir en aligner deux (« 14:00 – 15:00 »).
 */
export function InlineTime({ value, onSave, ...aria }: InlineTimeProps) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const reset = () => setDraft(value ?? '');

  const commit = () => {
    const next = draft === '' ? null : draft;
    if (next === value) return;
    if (next !== null && !isTime(next)) return reset();
    if (onSave(next) === false) reset();
  };

  return (
    <input
      type="time"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => blurOnEnterOrEscape(e, reset)}
      className={
        'date-quiet tnum h-8 w-[88px] rounded-md bg-transparent px-2 outline-none transition-colors duration-[120ms] ease-soft ' +
        `hover:bg-hover focus:bg-elevated focus:ring-2 focus:ring-accent-soft ${draft ? '' : 'text-ink-3'}`
      }
      {...aria}
    />
  );
}

/** Sélecteur de date natif, habillé comme du texte. */
export function InlineDate({ value, onSave, ...aria }: InlineDateProps) {
  return (
    <input
      type="date"
      {...DATE_INPUT_BOUNDS}
      value={value ?? ''}
      onChange={(e) => {
        const next = e.target.value || null;
        // Une date incomplète ou hors bornes n'est jamais enregistrée.
        if (next !== null && !isISODate(next)) return;
        if (next !== value) onSave(next);
      }}
      className={`date-quiet tnum h-8 ${inlineClass} ${value ? '' : 'text-ink-3'}`}
      {...aria}
    />
  );
}
