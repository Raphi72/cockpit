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

function minutesOfDay(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** Minutes écoulées depuis minuit, mises à jour chaque minute (ligne « maintenant » du calendrier). */
export function useMinutesOfDay(): number {
  const [minutes, setMinutes] = useState(minutesOfDay);

  useEffect(() => {
    const timer = setInterval(() => setMinutes(minutesOfDay()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return minutes;
}
