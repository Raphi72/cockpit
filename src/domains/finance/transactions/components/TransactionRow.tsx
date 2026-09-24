import { memo } from 'react';
import { formatShortDate } from '@/core/dates';
import { formatMoney, formatSignedMoney } from '@/core/money';
import { ColorDot } from '@/ui/data/ColorDot';
import type { TransactionListItem } from '../model';

type TransactionRowProps = {
  item: TransactionListItem;
  today: string;
  /** Liste filtrée sur un compte : la colonne compte devient inutile, on voit le sens des virements. */
  accountFiltered: boolean;
  onOpen: (item: TransactionListItem) => void;
};

/** Compte(s) concerné(s) : « Compte pro → Compte perso » pour un virement. */
function accountLabel(item: TransactionListItem, accountFiltered: boolean): string | null {
  if (item.kind === 'transfer') {
    if (accountFiltered) return item.amountCents < 0 ? `vers ${item.peerAccountName}` : `depuis ${item.peerAccountName}`;
    return `${item.accountName} → ${item.peerAccountName}`;
  }
  return accountFiltered ? null : item.accountName;
}

/** Montant signé ; un virement vu de haut (sans filtre de compte) n'est ni une entrée ni une sortie. */
function Amount({ item, accountFiltered }: { item: TransactionListItem; accountFiltered: boolean }) {
  if (item.kind === 'transfer' && !accountFiltered) {
    return <span className="text-ink-2">{formatMoney(Math.abs(item.amountCents))}</span>;
  }
  const tone = item.kind === 'income' ? 'text-success' : item.kind === 'expense' ? '' : 'text-ink-2';
  return <span className={tone}>{formatSignedMoney(item.amountCents)}</span>;
}

/** Ligne de transaction : date, libellé (catégorie, projet), compte, montant signé. */
export const TransactionRow = memo(function TransactionRow({ item, today, accountFiltered, onOpen }: TransactionRowProps) {
  const account = accountLabel(item, accountFiltered);
  // Un ajustement s'appelle déjà « Ajustement » ; « Solde initial » gagne à être précisé.
  const meta = item.kind === 'adjustment' ? (item.label === 'Ajustement' ? null : 'Ajustement de solde') : item.categoryName;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === 'Enter') onOpen(item);
      }}
      className={
        '-mx-2.5 grid min-h-11 cursor-default grid-cols-[56px_minmax(0,1fr)_auto_110px] items-center gap-4 rounded-md px-2.5 outline-none ' +
        'transition-colors duration-[120ms] ease-soft hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-soft'
      }
    >
      <span className="tnum text-meta text-ink-3">{formatShortDate(item.date, today)}</span>
      <span className="flex min-w-0 items-baseline gap-2.5">
        <span className="truncate">{item.label}</span>
        {(meta || item.projectName) && (
          <span className="flex min-w-0 items-center gap-2 self-center text-meta text-ink-3">
            {meta && <span className="shrink-0">{meta}</span>}
            {item.projectName && (
              <span className="flex min-w-0 items-center gap-1.5">
                {item.projectColor && <ColorDot color={item.projectColor} />}
                <span className="truncate">{item.projectName}</span>
              </span>
            )}
          </span>
        )}
      </span>
      <span className="max-w-[260px] truncate text-meta text-ink-3">{account}</span>
      <span className="tnum text-right font-medium">
        <Amount item={item} accountFiltered={accountFiltered} />
      </span>
    </div>
  );
});
