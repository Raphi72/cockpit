import { useEffect, useState } from 'react';
import { todayISO } from './dates';

/** Date du jour ('YYYY-MM-DD'), mise à jour automatiquement à minuit si l'app reste ouverte. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(() => setToday(todayISO()), nextMidnight.getTime() - now.getTime() + 1000);
    return () => clearTimeout(timer);
  }, [today]);

  return today;
}
