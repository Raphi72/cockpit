import { useState, type FormEvent } from 'react';
import { parseMoneyInput } from '@/core/money';
import { AmountField } from '@/ui/primitives/AmountField';
import { Button } from '@/ui/primitives/Button';
import { useAccounts, useSaveInitialBalances } from '../hooks';

/**
 * Tant qu'aucun solde n'est saisi : « Quel est le solde actuel de tes comptes ? ».
 * Chaque réponse crée un ajustement « Solde initial » ; les transactions font ensuite évoluer le solde.
 */
export function InitialBalances({ onLater }: { onLater: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const save = useSaveInitialBalances();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const entries: { accountId: string; targetCents: number }[] = [];
    for (const account of accounts) {
      const cents = parseMoneyInput(values[account.id] ?? '', { signed: true });
      if (cents === undefined) return setError(`Montant invalide pour ${account.name}.`);
      if (cents !== null) entries.push({ accountId: account.id, targetCents: cents });
    }
    if (entries.length === 0) return setError('Indique au moins un solde, ou choisis « Plus tard ».');
    setError(null);
    save.mutate(entries);
  };

  return (
    <section className="mb-16">
      <h2 className="font-semibold">Quel est le solde actuel de tes comptes ?</h2>
      <p className="mt-1 text-ink-2">Ensuite, tes transactions feront évoluer les soldes toutes seules.</p>
      <form onSubmit={submit} className="mt-5 flex flex-wrap items-end gap-4">
        {accounts.map((account, index) => (
          <label key={account.id} className="w-[200px]">
            <span className="mb-1.5 block text-meta text-ink-3">{account.name}</span>
            <AmountField
              autoFocus={index === 0}
              value={values[account.id] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [account.id]: e.target.value }))}
              placeholder="0"
              aria-label={`Solde actuel de ${account.name}`}
            />
          </label>
        ))}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            Enregistrer les soldes
          </Button>
          <Button variant="ghost" onClick={onLater}>
            Plus tard
          </Button>
        </div>
      </form>
      {error && <p className="mt-2 text-meta text-danger">{error}</p>}
    </section>
  );
}
