import { useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { todayISO } from '@/core/dates';
import { defaultsFromPath, useCreateStore } from './create-store';
import { mainNav } from './navigation';
import { useUiStore } from './ui-store';

/** Caractères produits par les touches 1 à 6 en AZERTY (sans Maj). */
const AZERTY_DIGITS: Record<string, string> = { '&': '1', é: '2', '"': '3', "'": '4', '(': '5', '-': '6' };

/**
 * Chiffre de la rangée du haut, quelle que soit la disposition du clavier :
 * d'abord la touche physique (event.code), puis le caractère (claviers virtuels, bureau à distance).
 */
export function digitFromEvent(event: Pick<KeyboardEvent, 'code' | 'key'>): string | null {
  const physical = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
  if (physical) return physical[1] ?? null;
  if (/^\d$/.test(event.key)) return event.key;
  return AZERTY_DIGITS[event.key] ?? null;
}

/** Vrai si une fenêtre ou un menu est ouvert. */
function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="menu"]') !== null;
}

/** Vrai si l'utilisateur tape du texte ou si une fenêtre / un menu est ouvert. */
function isBusy(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (element?.closest('input, textarea, select, [contenteditable="true"]')) return true;
  return overlayOpen();
}

/**
 * Raccourcis disponibles partout :
 * Ctrl+1…6 pour les pages, Ctrl+B pour la barre latérale, N (ou Ctrl+N) pour une nouvelle tâche,
 * C pour le menu « Nouveau ».
 */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate();
  const router = useRouter();
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setNewMenuOpen = useUiStore((state) => state.setNewMenuOpen);
  const openCreate = useCreateStore((state) => state.openCreate);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.metaKey) {
        // Ctrl+1 et Ctrl+Maj+1 fonctionnent tous les deux (en AZERTY, « 1 » demande Maj).
        const digit = digitFromEvent(event);
        const target = digit ? mainNav.find((item) => item.shortcut === digit) : undefined;
        if (target) {
          event.preventDefault();
          void navigate({ to: target.to });
          return;
        }
        const letter = event.key.toLowerCase();
        if (!event.shiftKey && letter === 'b') {
          event.preventDefault();
          toggleSidebar();
        }
        // Ctrl+N : toujours, même en tapant du texte (sauf si une fenêtre est déjà ouverte).
        if (!event.shiftKey && letter === 'n') {
          event.preventDefault();
          if (!overlayOpen()) openCreate('task', defaultsFromPath(router.state.location.pathname, todayISO()));
        }
        return;
      }

      if (event.altKey || event.metaKey || event.shiftKey || isBusy(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'c') {
        event.preventDefault();
        setNewMenuOpen(true);
      }
      // N : nouvelle tâche. Ctrl+N reste disponible, mais certains navigateurs le réservent.
      if (key === 'n') {
        event.preventDefault();
        openCreate('task', defaultsFromPath(router.state.location.pathname, todayISO()));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, router, toggleSidebar, setNewMenuOpen, openCreate]);
}

/**
 * Raccourcis propres à une page : des touches seules (`event.key` en minuscules : 't', 'arrowleft'…),
 * inactives pendant la saisie ou quand une fenêtre / un menu est ouvert.
 * Les lettres sont lues comme caractères : elles suivent la disposition du clavier (AZERTY).
 */
export function usePageShortcuts(handlers: Record<string, () => void>): void {
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || isBusy(event.target)) return;
      const handler = latest.current[event.key.toLowerCase()];
      if (handler) {
        event.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
